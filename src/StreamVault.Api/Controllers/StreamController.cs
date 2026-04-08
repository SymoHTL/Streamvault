using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
[Authorize]
public class StreamController : BaseController
{
    private readonly StreamVaultDbContext _db;
    private readonly IS3StorageService _s3;
    private readonly ITranscodeService _transcode;

    public StreamController(StreamVaultDbContext db, IS3StorageService s3, ITranscodeService transcode)
    {
        _db = db;
        _s3 = s3;
        _transcode = transcode;
    }

    [HttpGet("{mediaFileId:guid}/direct")]
    public async Task<IActionResult> DirectPlay(Guid mediaFileId)
    {
        var mediaFile = await _db.MediaFiles
            .Include(mf => mf.Episode).ThenInclude(e => e!.Season).ThenInclude(s => s.MediaItem).ThenInclude(mi => mi.Library)
            .Include(mf => mf.MediaItem).ThenInclude(mi => mi!.Library)
            .FirstOrDefaultAsync(mf => mf.Id == mediaFileId);

        if (mediaFile == null) return NotFound();

        var library = mediaFile.MediaItem?.Library ?? mediaFile.Episode?.Season.MediaItem.Library;
        if (library == null) return NotFound();

        var url = await _s3.GetPreSignedUrlAsync(library.S3ConnectionId, mediaFile.S3Key, TimeSpan.FromHours(4));
        return Redirect(url);
    }

    [HttpGet("{mediaFileId:guid}/transcode/{profileName}")]
    public async Task<IActionResult> Transcode(Guid mediaFileId, string profileName)
    {
        var mediaFile = await _db.MediaFiles.FindAsync(mediaFileId);
        if (mediaFile == null) return NotFound();

        var session = await _transcode.StartTranscodeAsync(mediaFileId, profileName);
        return Ok(new { session.SessionId, session.OutputDirectory, session.ProfileName });
    }

    [HttpGet("transcode/{sessionId}/status")]
    public IActionResult TranscodeStatus(string sessionId)
    {
        var sessions = _transcode.GetActiveSessions();
        var session = sessions.FirstOrDefault(s => s.SessionId == sessionId);
        if (session == null) return NotFound();
        return Ok(session);
    }

    [HttpGet("transcode/{sessionId}/manifest")]
    public async Task<IActionResult> TranscodeManifest(string sessionId, [FromQuery] string format = "hls")
    {
        var path = await _transcode.GetManifestPathAsync(sessionId, format);
        if (path == null || !System.IO.File.Exists(path)) return NotFound();

        var contentType = format == "dash" ? "application/dash+xml" : "application/vnd.apple.mpegurl";
        return PhysicalFile(path, contentType);
    }

    [HttpGet("transcode/{sessionId}/segment/{segmentName}")]
    [AllowAnonymous]
    public async Task<IActionResult> TranscodeSegment(string sessionId, string segmentName)
    {
        var path = await _transcode.GetSegmentPathAsync(sessionId, segmentName);
        if (path == null || !System.IO.File.Exists(path)) return NotFound();

        var contentType = segmentName.EndsWith(".ts") ? "video/mp2t"
            : segmentName.EndsWith(".m4s") ? "video/mp4"
            : "application/octet-stream";

        return PhysicalFile(path, contentType);
    }

    [HttpDelete("transcode/{sessionId}")]
    public async Task<IActionResult> StopTranscode(string sessionId)
    {
        await _transcode.StopTranscodeAsync(sessionId);
        return NoContent();
    }

    [HttpGet("{mediaFileId:guid}/subtitles/{subtitleId:guid}")]
    public async Task<IActionResult> GetSubtitle(Guid mediaFileId, Guid subtitleId)
    {
        var subtitle = await _db.Subtitles
            .Include(s => s.MediaFile).ThenInclude(mf => mf.MediaItem).ThenInclude(mi => mi!.Library)
            .Include(s => s.MediaFile).ThenInclude(mf => mf.Episode).ThenInclude(e => e!.Season).ThenInclude(se => se.MediaItem).ThenInclude(mi => mi.Library)
            .FirstOrDefaultAsync(s => s.Id == subtitleId && s.MediaFileId == mediaFileId);

        if (subtitle == null) return NotFound();

        if (!subtitle.IsExternal && !string.IsNullOrEmpty(subtitle.S3Key))
        {
            var library = subtitle.MediaFile.MediaItem?.Library ?? subtitle.MediaFile.Episode?.Season.MediaItem.Library;
            if (library == null) return NotFound();

            var url = await _s3.GetPreSignedUrlAsync(library.S3ConnectionId, subtitle.S3Key, TimeSpan.FromHours(4));
            return Redirect(url);
        }

        if (!string.IsNullOrEmpty(subtitle.LocalPath) && System.IO.File.Exists(subtitle.LocalPath))
        {
            var contentType = subtitle.Format switch
            {
                Core.Enums.SubtitleFormat.Srt => "application/x-subrip",
                Core.Enums.SubtitleFormat.Vtt => "text/vtt",
                Core.Enums.SubtitleFormat.Ass or Core.Enums.SubtitleFormat.Ssa => "text/x-ssa",
                _ => "application/octet-stream"
            };
            return PhysicalFile(subtitle.LocalPath, contentType);
        }

        return NotFound();
    }
}
