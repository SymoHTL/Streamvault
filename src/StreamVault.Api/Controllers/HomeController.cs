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
        var userId = GetUserId();

        // Continue watching: items with progress but not completed
        var continueWatchingProgress = await _db.WatchProgresses
            .Where(wp => wp.UserId == userId && !wp.Completed)
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

        var continueWatchingItems = await _db.MediaItems
            .Include(m => m.Images)
            .Where(m => continueWatchingIds.Contains(m.Id))
            .Select(m => new MediaItemSummaryResponse(
                m.Id, m.Title, m.Year, m.CommunityRating, m.MediaType.ToString(),
                m.Images.Where(i => i.Type == ImageType.Poster).Select(i => i.SourceUrl).FirstOrDefault(),
                m.AddedAt, null
            ))
            .ToListAsync();

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
            .Where(wp => wp.UserId == userId && wp.Completed)
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

        return Ok(new HomeResponse(continueWatchingItems, recentlyAdded, recentlyWatchedItems, featured));
    }
}
