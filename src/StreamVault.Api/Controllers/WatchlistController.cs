using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
[Authorize]
public class WatchlistController : BaseController
{
    private readonly StreamVaultDbContext _db;

    public WatchlistController(StreamVaultDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<WatchlistResponse>> GetAll()
    {
        var profileId = GetProfileId();
        var items = await _db.WatchlistItems
            .Where(wi => wi.ProfileId == profileId)
            .Include(wi => wi.MediaItem).ThenInclude(mi => mi.Images)
            .OrderByDescending(wi => wi.CreatedAt)
            .Select(wi => new MediaItemSummaryResponse(
                wi.MediaItem.Id,
                wi.MediaItem.Title,
                wi.MediaItem.Year,
                wi.MediaItem.CommunityRating,
                wi.MediaItem.MediaType.ToString(),
                wi.MediaItem.Images.Where(i => i.Type == Core.Enums.ImageType.Poster).Select(i => i.SourceUrl).FirstOrDefault(),
                wi.MediaItem.AddedAt,
                null
            ))
            .ToListAsync();

        return Ok(new WatchlistResponse(items, items.Count));
    }

    [HttpPost("{mediaItemId:guid}")]
    public async Task<IActionResult> Add(Guid mediaItemId)
    {
        var profileId = GetProfileId();
        var exists = await _db.WatchlistItems
            .AnyAsync(wi => wi.ProfileId == profileId && wi.MediaItemId == mediaItemId);

        if (exists) return Conflict("Already in watchlist");

        var mediaItem = await _db.MediaItems.FindAsync(mediaItemId);
        if (mediaItem == null) return NotFound();

        _db.WatchlistItems.Add(new Core.Entities.WatchlistItem
        {
            ProfileId = profileId,
            MediaItemId = mediaItemId
        });

        await _db.SaveChangesAsync();
        return Created();
    }

    [HttpDelete("{mediaItemId:guid}")]
    public async Task<IActionResult> Remove(Guid mediaItemId)
    {
        var profileId = GetProfileId();
        var item = await _db.WatchlistItems
            .FirstOrDefaultAsync(wi => wi.ProfileId == profileId && wi.MediaItemId == mediaItemId);

        if (item == null) return NotFound();

        _db.WatchlistItems.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
