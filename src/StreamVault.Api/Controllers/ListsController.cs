using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Core.Entities;
using StreamVault.Core.Enums;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
[Authorize]
public class ListsController : BaseController
{
    private readonly StreamVaultDbContext _db;

    public ListsController(StreamVaultDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<UserMediaListDetailResponse>>> GetAll([FromQuery] string? status = null)
    {
        var profileId = GetProfileId();
        var query = _db.UserMediaLists
            .Where(uml => uml.ProfileId == profileId)
            .Include(uml => uml.MediaItem).ThenInclude(m => m.Images)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<MediaListStatus>(status, true, out var parsed))
            query = query.Where(uml => uml.Status == parsed);

        var items = await query
            .OrderByDescending(uml => uml.UpdatedAt)
            .ToListAsync();

        var result = items.Select(uml => new UserMediaListDetailResponse(
            uml.Id,
            uml.Status.ToString(),
            uml.Rating,
            uml.Notes,
            uml.CreatedAt,
            new MediaItemSummaryResponse(
                uml.MediaItem.Id, uml.MediaItem.Title, uml.MediaItem.Year, uml.MediaItem.CommunityRating,
                uml.MediaItem.MediaType.ToString(),
                uml.MediaItem.Images.Where(i => i.Type == ImageType.Poster).Select(i => i.SourceUrl).FirstOrDefault(),
                uml.MediaItem.AddedAt, null
            )
        )).ToList();

        return Ok(result);
    }

    [HttpGet("counts")]
    public async Task<ActionResult<Dictionary<string, int>>> GetCounts()
    {
        var profileId = GetProfileId();
        var counts = await _db.UserMediaLists
            .Where(uml => uml.ProfileId == profileId)
            .GroupBy(uml => uml.Status)
            .Select(g => new { Status = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count);

        return Ok(counts);
    }

    [HttpGet("{mediaItemId:guid}")]
    public async Task<ActionResult<UserMediaListResponse>> Get(Guid mediaItemId)
    {
        var profileId = GetProfileId();
        var entry = await _db.UserMediaLists
            .FirstOrDefaultAsync(uml => uml.ProfileId == profileId && uml.MediaItemId == mediaItemId);

        if (entry == null) return NoContent();

        return Ok(new UserMediaListResponse(entry.Id, entry.MediaItemId, entry.Status.ToString(), entry.Rating, entry.Notes, entry.CreatedAt, entry.UpdatedAt));
    }

    [HttpPut("{mediaItemId:guid}")]
    public async Task<IActionResult> Upsert(Guid mediaItemId, [FromBody] UserMediaListRequest request)
    {
        if (!Enum.TryParse<MediaListStatus>(request.Status, true, out var status))
            return BadRequest("Invalid status. Valid values: Watching, Completed, Dropped, Planned, OnHold");

        var profileId = GetProfileId();
        var entry = await _db.UserMediaLists
            .FirstOrDefaultAsync(uml => uml.ProfileId == profileId && uml.MediaItemId == mediaItemId);

        if (entry == null)
        {
            entry = new UserMediaList
            {
                ProfileId = profileId,
                MediaItemId = mediaItemId,
                Status = status,
                Rating = request.Rating,
                Notes = request.Notes
            };
            _db.UserMediaLists.Add(entry);
        }
        else
        {
            entry.Status = status;
            entry.Rating = request.Rating;
            entry.Notes = request.Notes;
        }

        await _db.SaveChangesAsync();
        return Ok(new UserMediaListResponse(entry.Id, entry.MediaItemId, entry.Status.ToString(), entry.Rating, entry.Notes, entry.CreatedAt, entry.UpdatedAt));
    }

    [HttpDelete("{mediaItemId:guid}")]
    public async Task<IActionResult> Remove(Guid mediaItemId)
    {
        var profileId = GetProfileId();
        var entry = await _db.UserMediaLists
            .FirstOrDefaultAsync(uml => uml.ProfileId == profileId && uml.MediaItemId == mediaItemId);

        if (entry == null) return NotFound();

        _db.UserMediaLists.Remove(entry);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
