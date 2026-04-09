using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StreamVault.Core.Entities;
using StreamVault.Core.Enums;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Infrastructure.Scanner;

public class LibraryScannerService : ILibraryScanner
{
    private readonly IDbContextFactory<StreamVaultDbContext> _dbFactory;
    private readonly IS3StorageService _s3;
    private readonly ILogger<LibraryScannerService> _logger;

    public LibraryScannerService(
        IDbContextFactory<StreamVaultDbContext> dbFactory,
        IS3StorageService s3,
        ILogger<LibraryScannerService> logger)
    {
        _dbFactory = dbFactory;
        _s3 = s3;
        _logger = logger;
    }

    public async Task ScanLibraryAsync(Guid libraryId, CancellationToken ct = default)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var library = await db.Libraries
            .Include(l => l.S3Connection)
            .FirstOrDefaultAsync(l => l.Id == libraryId, ct);

        if (library == null)
        {
            _logger.LogWarning("Library {LibraryId} not found", libraryId);
            return;
        }

        library.ScanStatus = LibraryScanStatus.Scanning;
        await db.SaveChangesAsync(ct);

        try
        {
            _logger.LogInformation("Starting scan for library {LibraryName} ({LibraryId})", library.Name, library.Id);

            var allKeys = await _s3.ListObjectKeysAsync(library.S3ConnectionId, library.S3Prefix, ct);

            switch (library.Type)
            {
                case MediaType.Movie:
                    await ScanMoviesAsync(db, library, allKeys, ct);
                    break;
                case MediaType.TvShow:
                    await ScanTvShowsAsync(db, library, allKeys, ct);
                    break;
            }

            library.ScanStatus = LibraryScanStatus.Idle;
            library.LastScannedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);

            // Enqueue metadata fetch for items that don't have TMDB data yet
            var unmatchedItems = await db.MediaItems
                .Where(m => m.LibraryId == library.Id && m.CommunityRating == null)
                .Select(m => new { m.Id, m.Title, m.Year, m.MediaType })
                .ToListAsync(ct);

            foreach (var item in unmatchedItems)
            {
                var isMovie = item.MediaType == MediaType.Movie;
                BackgroundJob.Enqueue<ITmdbService>(
                    tmdb => tmdb.SearchAndApplyAsync(item.Id, item.Title, item.Year, isMovie, CancellationToken.None));
            }

            _logger.LogInformation("Scan complete for library {LibraryName}. Enqueued {Count} metadata lookups.",
                library.Name, unmatchedItems.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Scan failed for library {LibraryName}", library.Name);
            library.ScanStatus = LibraryScanStatus.Failed;
            await db.SaveChangesAsync(ct);
            throw;
        }
    }

    private async Task ScanMoviesAsync(StreamVaultDbContext db, Library library, IReadOnlyList<string> allKeys, CancellationToken ct)
    {
        var existingKeys = await db.MediaFiles
            .Where(mf => mf.MediaItem != null && mf.MediaItem.LibraryId == library.Id)
            .Select(mf => mf.S3Key)
            .ToHashSetAsync(ct);

        var videoKeys = allKeys.Where(NamingConventionParser.IsVideoFile).ToList();
        var subtitleKeys = allKeys.Where(NamingConventionParser.IsSubtitleFile).ToList();

        foreach (var videoKey in videoKeys)
        {
            if (existingKeys.Contains(videoKey)) continue;

            var parsed = NamingConventionParser.ParseMoviePath(videoKey, library.S3Prefix);
            if (parsed == null)
            {
                _logger.LogWarning("Could not parse movie path: {Key}", videoKey);
                continue;
            }

            // Check if we already have a MediaItem with this title+year
            var mediaItem = await db.MediaItems
                .FirstOrDefaultAsync(m => m.LibraryId == library.Id
                    && m.Title == parsed.Title
                    && m.Year == parsed.Year, ct);

            if (mediaItem == null)
            {
                mediaItem = new MediaItem
                {
                    Title = parsed.Title,
                    SortTitle = GetSortTitle(parsed.Title),
                    Year = parsed.Year,
                    MediaType = MediaType.Movie,
                    LibraryId = library.Id,
                    S3Key = videoKey
                };
                db.MediaItems.Add(mediaItem);
            }

            var mediaFile = new MediaFile
            {
                S3Key = videoKey,
                Container = Path.GetExtension(videoKey).TrimStart('.').ToLowerInvariant(),
                MediaItemId = mediaItem.Id
            };
            db.MediaFiles.Add(mediaFile);

            // Find associated subtitles
            var videoBaseName = Path.GetFileNameWithoutExtension(videoKey);
            var videoDir = Path.GetDirectoryName(videoKey)?.Replace('\\', '/') ?? "";
            foreach (var subKey in subtitleKeys.Where(sk =>
                sk.StartsWith(videoDir, StringComparison.OrdinalIgnoreCase) &&
                Path.GetFileNameWithoutExtension(Path.GetFileNameWithoutExtension(sk))
                    .StartsWith(videoBaseName, StringComparison.OrdinalIgnoreCase)))
            {
                var subParsed = NamingConventionParser.ParseSubtitlePath(subKey);
                if (subParsed == null) continue;

                db.Subtitles.Add(new Subtitle
                {
                    S3Key = subKey,
                    Language = subParsed.Language,
                    Format = Enum.TryParse<SubtitleFormat>(subParsed.Format, true, out var fmt) ? fmt : SubtitleFormat.Srt,
                    IsExternal = true,
                    IsForced = subParsed.IsForced,
                    MediaFileId = mediaFile.Id
                });
            }

            _logger.LogInformation("Found movie: {Title} ({Year}) - {Key}", parsed.Title, parsed.Year, videoKey);
        }

        // Remove media files that no longer exist in S3
        var allVideoKeys = videoKeys.ToHashSet();
        var orphanedFiles = await db.MediaFiles
            .Where(mf => mf.MediaItem != null && mf.MediaItem.LibraryId == library.Id && !allVideoKeys.Contains(mf.S3Key))
            .ToListAsync(ct);

        if (orphanedFiles.Count > 0)
        {
            db.MediaFiles.RemoveRange(orphanedFiles);
            _logger.LogInformation("Removed {Count} orphaned media files", orphanedFiles.Count);
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task ScanTvShowsAsync(StreamVaultDbContext db, Library library, IReadOnlyList<string> allKeys, CancellationToken ct)
    {
        var existingKeys = await db.MediaFiles
            .Where(mf => mf.Episode != null && mf.Episode.Season.MediaItem.LibraryId == library.Id)
            .Select(mf => mf.S3Key)
            .ToHashSetAsync(ct);

        var videoKeys = allKeys.Where(NamingConventionParser.IsVideoFile).ToList();

        // Local cache to avoid re-querying DB for shows added in this scan pass
        var showCache = new Dictionary<string, MediaItem>(StringComparer.OrdinalIgnoreCase);

        // Pre-load existing shows into cache
        var existingShows = await db.MediaItems
            .Include(m => m.Seasons)
            .ThenInclude(s => s.Episodes)
            .Where(m => m.LibraryId == library.Id && m.MediaType == MediaType.TvShow)
            .ToListAsync(ct);
        foreach (var s in existingShows)
            showCache[s.Title] = s;

        foreach (var videoKey in videoKeys)
        {
            if (existingKeys.Contains(videoKey)) continue;

            var parsed = NamingConventionParser.ParseTvShowPath(videoKey, library.S3Prefix);
            if (parsed == null)
            {
                _logger.LogWarning("Could not parse TV show path: {Key}", videoKey);
                continue;
            }

            // Find or create TV show using local cache
            if (!showCache.TryGetValue(parsed.ShowTitle, out var show))
            {
                show = new MediaItem
                {
                    Title = parsed.ShowTitle,
                    SortTitle = GetSortTitle(parsed.ShowTitle),
                    Year = parsed.ShowYear,
                    MediaType = MediaType.TvShow,
                    LibraryId = library.Id
                };
                db.MediaItems.Add(show);
                showCache[parsed.ShowTitle] = show;
            }

            // Find or create season
            var season = show.Seasons.FirstOrDefault(s => s.SeasonNumber == parsed.SeasonNumber);
            if (season == null)
            {
                season = new Season
                {
                    SeasonNumber = parsed.SeasonNumber,
                    Name = $"Season {parsed.SeasonNumber}",
                    MediaItemId = show.Id
                };
                db.Seasons.Add(season);
                show.Seasons.Add(season);
            }

            // Find or create episode
            var episode = season.Episodes.FirstOrDefault(e => e.EpisodeNumber == parsed.EpisodeNumber);
            if (episode == null)
            {
                episode = new Episode
                {
                    EpisodeNumber = parsed.EpisodeNumber,
                    Title = parsed.EpisodeTitle ?? $"Episode {parsed.EpisodeNumber}",
                    S3Key = videoKey,
                    SeasonId = season.Id
                };
                db.Episodes.Add(episode);
                season.Episodes.Add(episode);
            }

            var mediaFile = new MediaFile
            {
                S3Key = videoKey,
                Container = Path.GetExtension(videoKey).TrimStart('.').ToLowerInvariant(),
                EpisodeId = episode.Id
            };
            db.MediaFiles.Add(mediaFile);

            _logger.LogInformation("Found TV: {Show} S{Season:D2}E{Episode:D2} - {Key}",
                parsed.ShowTitle, parsed.SeasonNumber, parsed.EpisodeNumber, videoKey);
        }

        await db.SaveChangesAsync(ct);
    }

    private static string GetSortTitle(string title)
    {
        var prefixes = new[] { "The ", "A ", "An " };
        foreach (var prefix in prefixes)
        {
            if (title.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                return title[prefix.Length..].Trim();
        }
        return title;
    }
}
