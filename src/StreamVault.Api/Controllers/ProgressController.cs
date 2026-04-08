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
        var userId = GetUserId();
        var progress = await _db.WatchProgresses
            .Where(wp => wp.UserId == userId)
            .Include(wp => wp.MediaFile)
            .OrderByDescending(wp => wp.LastWatchedAt)
            .Select(wp => new WatchProgressResponse(
                wp.MediaFileId, wp.PositionTicks, wp.Completed, wp.LastWatchedAt, wp.MediaFile.DurationSeconds
            ))
            .ToListAsync();

        return Ok(progress);
    }

    [HttpPut("{mediaFileId:guid}")]
    public async Task<IActionResult> Update(Guid mediaFileId, [FromBody] UpdateProgressRequest request)
    {
        var userId = GetUserId();
        var mediaFile = await _db.MediaFiles.FindAsync(mediaFileId);
        if (mediaFile == null) return NotFound();

        var progress = await _db.WatchProgresses
            .FirstOrDefaultAsync(wp => wp.UserId == userId && wp.MediaFileId == mediaFileId);

        if (progress == null)
        {
            progress = new Core.Entities.WatchProgress
            {
                UserId = userId,
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
        var userId = GetUserId();
        var progress = await _db.WatchProgresses
            .FirstOrDefaultAsync(wp => wp.UserId == userId && wp.MediaFileId == mediaFileId);

        if (progress == null) return NotFound();

        _db.WatchProgresses.Remove(progress);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
