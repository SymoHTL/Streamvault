using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StreamVault.Core.Configuration;
using StreamVault.Core.Entities;
using StreamVault.Core.Enums;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;
using TMDbLib.Client;
using TMDbLib.Objects.Search;

namespace StreamVault.Infrastructure.Metadata;

public class TmdbService : ITmdbService
{
    private readonly IDbContextFactory<StreamVaultDbContext> _dbFactory;
    private readonly ILogger<TmdbService> _logger;
    private readonly TmdbSettings _settings;
    private TMDbClient? _client;

    public TmdbService(
        IDbContextFactory<StreamVaultDbContext> dbFactory,
        IOptions<StreamVaultSettings> settings,
        ILogger<TmdbService> logger)
    {
        _dbFactory = dbFactory;
        _settings = settings.Value.Tmdb;
        _logger = logger;
    }

    private TMDbClient GetClient()
    {
        if (_client == null && !string.IsNullOrEmpty(_settings.ApiKey))
        {
            _client = new TMDbClient(_settings.ApiKey);
        }
        return _client ?? throw new InvalidOperationException("TMDB API key is not configured");
    }

    public async Task<TmdbSearchResult?> SearchMovieAsync(string title, int? year, CancellationToken ct = default)
    {
        try
        {
            var client = GetClient();
            var results = await client.SearchMovieAsync(title, language: _settings.Language, year: year ?? 0, cancellationToken: ct);
            var first = results.Results.FirstOrDefault();
            if (first == null) return null;

            return MapMovie(first);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "TMDB search failed for movie: {Title}", title);
            return null;
        }
    }

    public async Task<TmdbSearchResult?> SearchTvShowAsync(string title, int? year, CancellationToken ct = default)
    {
        try
        {
            var client = GetClient();
            var results = await client.SearchTvShowAsync(title, language: _settings.Language, cancellationToken: ct);
            var first = results.Results.FirstOrDefault();
            if (first == null) return null;

            return MapTvShow(first);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "TMDB search failed for TV show: {Title}", title);
            return null;
        }
    }

    public async Task<IReadOnlyList<TmdbSearchResult>> SearchMultiAsync(string query, CancellationToken ct = default)
    {
        try
        {
            var client = GetClient();
            var results = await client.SearchMultiAsync(query, language: _settings.Language, cancellationToken: ct);
            var mapped = new List<TmdbSearchResult>();

            foreach (var result in results.Results)
            {
                if (result is SearchMovie movie)
                    mapped.Add(MapMovie(movie));
                else if (result is SearchTv tv)
                    mapped.Add(MapTvShow(tv));
            }

            return mapped;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "TMDB multi search failed for: {Query}", query);
            return [];
        }
    }

    public async Task ApplyMetadataAsync(Guid mediaItemId, int tmdbId, bool isMovie, CancellationToken ct = default)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var mediaItem = await db.MediaItems
            .Include(m => m.ExternalIds)
            .Include(m => m.MediaGenres)
            .Include(m => m.Images)
            .FirstOrDefaultAsync(m => m.Id == mediaItemId, ct);

        if (mediaItem == null) return;

        var client = GetClient();

        try
        {
            if (isMovie)
            {
                var movie = await client.GetMovieAsync(tmdbId, _settings.Language, cancellationToken: ct);
                if (movie == null) return;

                mediaItem.Title = movie.Title;
                mediaItem.SortTitle = GetSortTitle(movie.Title);
                mediaItem.Year = movie.ReleaseDate?.Year;
                mediaItem.Overview = movie.Overview;
                mediaItem.CommunityRating = movie.VoteAverage;
                mediaItem.RuntimeMinutes = movie.Runtime;

                // External IDs
                SetExternalId(db, mediaItem, ExternalIdProvider.Tmdb, tmdbId.ToString());
                if (!string.IsNullOrEmpty(movie.ImdbId))
                    SetExternalId(db, mediaItem, ExternalIdProvider.Imdb, movie.ImdbId);

                // Genres
                mediaItem.MediaGenres.Clear();
                foreach (var genre in movie.Genres)
                {
                    var dbGenre = await GetOrCreateGenreAsync(db, genre.Name, ct);
                    db.MediaGenres.Add(new MediaGenre { MediaItemId = mediaItem.Id, GenreId = dbGenre.Id });
                }

                // Images
                if (!string.IsNullOrEmpty(movie.PosterPath))
                    await SaveImageAsync(db, mediaItem, ImageType.Poster, $"https://image.tmdb.org/t/p/w500{movie.PosterPath}", ct);
                if (!string.IsNullOrEmpty(movie.BackdropPath))
                    await SaveImageAsync(db, mediaItem, ImageType.Backdrop, $"https://image.tmdb.org/t/p/w1280{movie.BackdropPath}", ct);
            }
            else
            {
                var show = await client.GetTvShowAsync(tmdbId, TMDbLib.Objects.TvShows.TvShowMethods.Undefined, _settings.Language, cancellationToken: ct);
                if (show == null) return;

                mediaItem.Title = show.Name;
                mediaItem.SortTitle = GetSortTitle(show.Name);
                mediaItem.Year = show.FirstAirDate?.Year;
                mediaItem.Overview = show.Overview;
                mediaItem.CommunityRating = show.VoteAverage;

                SetExternalId(db, mediaItem, ExternalIdProvider.Tmdb, tmdbId.ToString());

                mediaItem.MediaGenres.Clear();
                foreach (var genre in show.Genres)
                {
                    var dbGenre = await GetOrCreateGenreAsync(db, genre.Name, ct);
                    db.MediaGenres.Add(new MediaGenre { MediaItemId = mediaItem.Id, GenreId = dbGenre.Id });
                }

                if (!string.IsNullOrEmpty(show.PosterPath))
                    await SaveImageAsync(db, mediaItem, ImageType.Poster, $"https://image.tmdb.org/t/p/w500{show.PosterPath}", ct);
                if (!string.IsNullOrEmpty(show.BackdropPath))
                    await SaveImageAsync(db, mediaItem, ImageType.Backdrop, $"https://image.tmdb.org/t/p/w1280{show.BackdropPath}", ct);
            }

            await db.SaveChangesAsync(ct);
            _logger.LogInformation("Applied TMDB metadata ({TmdbId}) to media item {MediaItemId}", tmdbId, mediaItemId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to apply TMDB metadata for {TmdbId}", tmdbId);
            throw;
        }
    }

    private static void SetExternalId(StreamVaultDbContext db, MediaItem mediaItem, ExternalIdProvider provider, string key)
    {
        var existing = mediaItem.ExternalIds.FirstOrDefault(e => e.Provider == provider);
        if (existing != null)
        {
            existing.ExternalKey = key;
        }
        else
        {
            db.ExternalIds.Add(new ExternalId
            {
                MediaItemId = mediaItem.Id,
                Provider = provider,
                ExternalKey = key
            });
        }
    }

    private static async Task<Genre> GetOrCreateGenreAsync(StreamVaultDbContext db, string name, CancellationToken ct)
    {
        var genre = await db.Genres.FirstOrDefaultAsync(g => g.Name == name, ct);
        if (genre == null)
        {
            genre = new Genre { Name = name };
            db.Genres.Add(genre);
        }
        return genre;
    }

    private static Task SaveImageAsync(StreamVaultDbContext db, MediaItem mediaItem, ImageType type, string sourceUrl, CancellationToken ct)
    {
        var existing = mediaItem.Images.FirstOrDefault(i => i.Type == type);
        if (existing != null)
        {
            existing.SourceUrl = sourceUrl;
        }
        else
        {
            db.MediaImages.Add(new MediaImage
            {
                MediaItemId = mediaItem.Id,
                Type = type,
                SourceUrl = sourceUrl,
                LocalPath = "" // Will be populated when downloaded
            });
        }
        return Task.CompletedTask;
    }

    private static TmdbSearchResult MapMovie(SearchMovie m) => new(
        m.Id, m.Title, m.Overview, m.ReleaseDate?.Year, m.VoteAverage,
        m.PosterPath != null ? $"https://image.tmdb.org/t/p/w500{m.PosterPath}" : null,
        m.BackdropPath != null ? $"https://image.tmdb.org/t/p/w1280{m.BackdropPath}" : null
    );

    private static TmdbSearchResult MapTvShow(SearchTv t) => new(
        t.Id, t.Name, t.Overview, t.FirstAirDate?.Year, t.VoteAverage,
        t.PosterPath != null ? $"https://image.tmdb.org/t/p/w500{t.PosterPath}" : null,
        t.BackdropPath != null ? $"https://image.tmdb.org/t/p/w1280{t.BackdropPath}" : null
    );

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
