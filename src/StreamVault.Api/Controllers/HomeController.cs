using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Core.Enums;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
[Authorize]
public class HomeController : BaseController
{
    private readonly StreamVaultDbContext _db;

    public HomeController(StreamVaultDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<HomeResponse>> Get()
    {
        var profileId = GetProfileId();

        // Continue watching: items with progress but not completed
        var continueWatchingProgress = await _db.WatchProgresses
            .Where(wp => wp.ProfileId == profileId && !wp.Completed)
            .OrderByDescending(wp => wp.LastWatchedAt)
            .Take(20)
            .Include(wp => wp.MediaFile).ThenInclude(mf => mf.Episode!).ThenInclude(e => e.Season)
            .ToListAsync();

        var continueWatchingIds = continueWatchingProgress
            .Select(wp => wp.MediaFile.MediaItemId ?? wp.MediaFile.Episode?.Season.MediaItemId)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();

        // Build a lookup of the latest progress per media item
        var progressByMediaItemId = continueWatchingProgress
            .GroupBy(wp => wp.MediaFile.MediaItemId ?? wp.MediaFile.Episode?.Season.MediaItemId)
            .Where(g => g.Key.HasValue)
            .ToDictionary(
                g => g.Key!.Value,
                g => g.OrderByDescending(wp => wp.LastWatchedAt).First()
            );

        var continueWatchingItems = await _db.MediaItems
            .Include(m => m.Images)
            .Where(m => continueWatchingIds.Contains(m.Id))
            .ToListAsync();

        // Preserve order from progress query and include progress data
        var continueWatching = continueWatchingIds
            .Where(id => continueWatchingItems.Any(m => m.Id == id))
            .Select(id =>
            {
                var m = continueWatchingItems.First(mi => mi.Id == id);
                var wp = progressByMediaItemId.GetValueOrDefault(id);
                ContinueWatchingEpisodeInfo? episodeInfo = null;
                if (wp?.MediaFile.Episode != null)
                {
                    var ep = wp.MediaFile.Episode;
                    episodeInfo = new ContinueWatchingEpisodeInfo(
                        ep.Season.SeasonNumber,
                        ep.EpisodeNumber,
                        ep.Title,
                        wp.MediaFileId
                    );
                }
                else if (wp != null)
                {
                    episodeInfo = new ContinueWatchingEpisodeInfo(0, 0, "", wp.MediaFileId);
                }
                return new MediaItemSummaryResponse(
                    m.Id, m.Title, m.Year, m.CommunityRating, m.MediaType.ToString(),
                    m.Images.Where(i => i.Type == ImageType.Poster).Select(i => i.SourceUrl).FirstOrDefault(),
                    m.AddedAt,
                    wp != null ? new WatchProgressResponse(wp.MediaFileId, wp.PositionTicks, wp.Completed, wp.LastWatchedAt, wp.MediaFile.DurationSeconds) : null,
                    episodeInfo
                );
            })
            .ToList();

        // Recently added
        var recentlyAdded = await _db.MediaItems
            .Include(m => m.Images)
            .OrderByDescending(m => m.AddedAt)
            .Take(20)
            .Select(m => new MediaItemSummaryResponse(
                m.Id, m.Title, m.Year, m.CommunityRating, m.MediaType.ToString(),
                m.Images.Where(i => i.Type == ImageType.Poster).Select(i => i.SourceUrl).FirstOrDefault(),
                m.AddedAt, null
            ))
            .ToListAsync();

        // Recently watched (completed)
        var recentlyWatchedProgress = await _db.WatchProgresses
            .Where(wp => wp.ProfileId == profileId && wp.Completed)
            .OrderByDescending(wp => wp.LastWatchedAt)
            .Take(20)
            .Include(wp => wp.MediaFile).ThenInclude(mf => mf.Episode!).ThenInclude(e => e.Season)
            .ToListAsync();

        var recentlyWatchedIds = recentlyWatchedProgress
            .Select(wp => wp.MediaFile.MediaItemId ?? wp.MediaFile.Episode?.Season.MediaItemId)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();

        var recentlyWatchedItems = await _db.MediaItems
            .Include(m => m.Images)
            .Where(m => recentlyWatchedIds.Contains(m.Id))
            .Select(m => new MediaItemSummaryResponse(
                m.Id, m.Title, m.Year, m.CommunityRating, m.MediaType.ToString(),
                m.Images.Where(i => i.Type == ImageType.Poster).Select(i => i.SourceUrl).FirstOrDefault(),
                m.AddedAt, null
            ))
            .ToListAsync();

        // Featured item (random)
        var totalItems = await _db.MediaItems.CountAsync();
        MediaItemSummaryResponse? featured = null;
        if (totalItems > 0)
        {
            var skip = Random.Shared.Next(0, totalItems);
            featured = await _db.MediaItems
                .Include(m => m.Images)
                .Skip(skip)
                .Take(1)
                .Select(m => new MediaItemSummaryResponse(
                    m.Id, m.Title, m.Year, m.CommunityRating, m.MediaType.ToString(),
                    m.Images.Where(i => i.Type == ImageType.Backdrop).Select(i => i.SourceUrl).FirstOrDefault()
                        ?? m.Images.Where(i => i.Type == ImageType.Poster).Select(i => i.SourceUrl).FirstOrDefault(),
                    m.AddedAt, null
                ))
                .FirstOrDefaultAsync();
        }

        return Ok(new HomeResponse(continueWatching, recentlyAdded, recentlyWatchedItems, featured));
    }
}
