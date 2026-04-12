using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
[Authorize]
public class ProgressController : BaseController
{
    private readonly StreamVaultDbContext _db;

    public ProgressController(StreamVaultDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<WatchProgressResponse>>> GetAll()
    {
        var profileId = GetProfileId();
        var progress = await _db.WatchProgresses
            .Where(wp => wp.ProfileId == profileId)
            .Include(wp => wp.MediaFile)
            .OrderByDescending(wp => wp.LastWatchedAt)
            .Select(wp => new WatchProgressResponse(
                wp.MediaFileId, wp.PositionTicks, wp.Completed, wp.LastWatchedAt, wp.MediaFile.DurationSeconds
            ))
            .ToListAsync();

        return Ok(progress);
    }

    [HttpGet("{mediaFileId:guid}")]
    public async Task<ActionResult<WatchProgressResponse>> Get(Guid mediaFileId)
    {
        var profileId = GetProfileId();
        var progress = await _db.WatchProgresses
            .Where(wp => wp.ProfileId == profileId && wp.MediaFileId == mediaFileId)
            .Include(wp => wp.MediaFile)
            .Select(wp => new WatchProgressResponse(
                wp.MediaFileId, wp.PositionTicks, wp.Completed, wp.LastWatchedAt, wp.MediaFile.DurationSeconds
            ))
            .FirstOrDefaultAsync();

        if (progress == null) return NotFound();
        return Ok(progress);
    }

    [HttpPut("{mediaFileId:guid}")]
    public async Task<IActionResult> Update(Guid mediaFileId, [FromBody] UpdateProgressRequest request)
    {
        var profileId = GetProfileId();
        var mediaFile = await _db.MediaFiles.FindAsync(mediaFileId);
        if (mediaFile == null) return NotFound();

        var progress = await _db.WatchProgresses
            .FirstOrDefaultAsync(wp => wp.ProfileId == profileId && wp.MediaFileId == mediaFileId);

        if (progress == null)
        {
            progress = new Core.Entities.WatchProgress
            {
                ProfileId = profileId,
                MediaFileId = mediaFileId,
                PositionTicks = request.PositionTicks,
                Completed = request.Completed,
                LastWatchedAt = DateTime.UtcNow
            };
            _db.WatchProgresses.Add(progress);
        }
        else
        {
            progress.PositionTicks = request.PositionTicks;
            progress.Completed = request.Completed;
            progress.LastWatchedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{mediaFileId:guid}")]
    public async Task<IActionResult> Delete(Guid mediaFileId)
    {
        var profileId = GetProfileId();
        var progress = await _db.WatchProgresses
            .FirstOrDefaultAsync(wp => wp.ProfileId == profileId && wp.MediaFileId == mediaFileId);

        if (progress == null) return NotFound();

        _db.WatchProgresses.Remove(progress);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
