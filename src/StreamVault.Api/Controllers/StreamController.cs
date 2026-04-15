using System.Diagnostics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using StreamVault.Core.Configuration;
using StreamVault.Core.DTOs;
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
    private readonly IMediaProbeService _probe;
    private readonly string _ffmpegPath;
    private readonly ILogger<StreamController> _logger;

    public StreamController(StreamVaultDbContext db, IS3StorageService s3, ITranscodeService transcode,
        IMediaProbeService probe, IOptions<StreamVaultSettings> settings, ILogger<StreamController> logger)
    {
        _db = db;
        _s3 = s3;
        _transcode = transcode;
        _probe = probe;
        _ffmpegPath = settings.Value.Transcoding.FfmpegPath;
        _logger = logger;
    }

    [HttpGet("{mediaFileId:guid}/direct")]
    public async Task<IActionResult> DirectPlay(Guid mediaFileId)
    {
        var mediaFile = await _db.MediaFiles
            .Include(mf => mf.Subtitles)
            .Include(mf => mf.Episode).ThenInclude(e => e!.Season).ThenInclude(s => s.MediaItem).ThenInclude(mi => mi.Library)
            .Include(mf => mf.MediaItem).ThenInclude(mi => mi!.Library)
            .FirstOrDefaultAsync(mf => mf.Id == mediaFileId);

        if (mediaFile == null) return NotFound();

        var library = mediaFile.MediaItem?.Library ?? mediaFile.Episode?.Season.MediaItem.Library;
        if (library == null) return NotFound();

        var url = await _s3.GetPreSignedUrlAsync(library.S3ConnectionId, mediaFile.S3Key, TimeSpan.FromMinutes(55));
        var title = mediaFile.MediaItem?.Title ?? mediaFile.Episode?.Season.MediaItem.Title;
        return Ok(new
        {
            url,
            title,
            container = mediaFile.Container,
            durationSeconds = mediaFile.DurationSeconds,
            videoCodec = mediaFile.VideoCodec,
            audioCodec = mediaFile.AudioCodec,
            resolution = mediaFile.Resolution,
            subtitles = mediaFile.Subtitles.Select(s => new SubtitleResponse(s.Id, s.Language, s.Format.ToString(), s.IsExternal, s.IsForced)).ToList()
        });
    }

    /// <summary>
    /// Returns available audio tracks for a media file.
    /// Checks DB cache first, probes the file via ffprobe if not cached.
    /// </summary>
    [HttpGet("{mediaFileId:guid}/audio-tracks")]
    public async Task<IActionResult> GetAudioTracks(Guid mediaFileId)
    {
        var mediaFile = await _db.MediaFiles
            .Include(mf => mf.AudioTracks)
            .Include(mf => mf.Episode).ThenInclude(e => e!.Season).ThenInclude(s => s.MediaItem).ThenInclude(mi => mi.Library)
            .Include(mf => mf.MediaItem).ThenInclude(mi => mi!.Library)
            .FirstOrDefaultAsync(mf => mf.Id == mediaFileId);

        if (mediaFile == null) return NotFound();

        // Return cached tracks if available
        if (mediaFile.AudioTracks.Count > 0)
        {
            return Ok(mediaFile.AudioTracks
                .OrderBy(at => at.StreamIndex)
                .Select(at => new { at.StreamIndex, at.Language, at.Title, at.Codec, at.Channels })
                .ToList());
        }

        // Probe the file to discover audio tracks
        var library = mediaFile.MediaItem?.Library ?? mediaFile.Episode?.Season.MediaItem.Library;
        if (library == null) return NotFound();

        try
        {
            var presignedUrl = await _s3.GetPreSignedUrlAsync(library.S3ConnectionId, mediaFile.S3Key, TimeSpan.FromMinutes(5));
            var probeResult = await _probe.ProbeAsync(presignedUrl);

            foreach (var track in probeResult.AudioTracks)
            {
                var audioTrack = new Core.Entities.AudioTrack
                {
                    StreamIndex = track.StreamIndex,
                    Language = track.Language,
                    Title = track.Title,
                    Codec = track.Codec,
                    Channels = track.Channels,
                    MediaFileId = mediaFile.Id
                };
                _db.AudioTracks.Add(audioTrack);
            }

            // Also update file-level codec info if missing
            if (string.IsNullOrEmpty(mediaFile.VideoCodec) && probeResult.VideoCodec != null)
                mediaFile.VideoCodec = probeResult.VideoCodec;
            if (string.IsNullOrEmpty(mediaFile.AudioCodec) && probeResult.AudioCodec != null)
                mediaFile.AudioCodec = probeResult.AudioCodec;
            if (string.IsNullOrEmpty(mediaFile.Resolution) && probeResult.Resolution != null)
                mediaFile.Resolution = probeResult.Resolution;
            if (mediaFile.DurationSeconds == null && probeResult.DurationSeconds != null)
                mediaFile.DurationSeconds = probeResult.DurationSeconds;

            await _db.SaveChangesAsync();

            return Ok(probeResult.AudioTracks.Select(at => new { at.StreamIndex, at.Language, at.Title, at.Codec, at.Channels }).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to probe audio tracks for media file {MediaFileId}", mediaFileId);
            return Ok(Array.Empty<object>());
        }
    }

    /// <summary>
    /// Proxy streaming endpoint with proper Range request support for seeking.
    /// The browser sends Range headers and this endpoint proxies them to S3.
    /// </summary>
    [HttpGet("{mediaFileId:guid}/proxy")]
    public async Task<IActionResult> ProxyStream(Guid mediaFileId)
    {
        var mediaFile = await _db.MediaFiles
            .Include(mf => mf.Episode).ThenInclude(e => e!.Season).ThenInclude(s => s.MediaItem).ThenInclude(mi => mi.Library)
            .Include(mf => mf.MediaItem).ThenInclude(mi => mi!.Library)
            .FirstOrDefaultAsync(mf => mf.Id == mediaFileId);

        if (mediaFile == null) return NotFound();

        var library = mediaFile.MediaItem?.Library ?? mediaFile.Episode?.Season.MediaItem.Library;
        if (library == null) return NotFound();

        var meta = await _s3.HeadObjectAsync(library.S3ConnectionId, mediaFile.S3Key);
        var totalLength = meta.ContentLength;

        var contentType = mediaFile.Container.ToLowerInvariant() switch
        {
            "mp4" or "m4v" => "video/mp4",
            "mkv" => "video/x-matroska",
            "webm" => "video/webm",
            "avi" => "video/x-msvideo",
            "mov" => "video/quicktime",
            _ => "video/mp4"
        };

        var rangeHeader = Request.Headers.Range.FirstOrDefault();
        if (!string.IsNullOrEmpty(rangeHeader))
        {
            // Parse Range: bytes=start-end
            var rangeStr = rangeHeader.Replace("bytes=", "");
            var parts = rangeStr.Split('-');
            var start = long.Parse(parts[0]);
            var end = parts.Length > 1 && !string.IsNullOrEmpty(parts[1])
                ? long.Parse(parts[1])
                : totalLength - 1;

            if (start >= totalLength)
                return StatusCode(416); // Range Not Satisfiable

            end = Math.Min(end, totalLength - 1);
            var chunkSize = end - start + 1;

            await using var stream = await _s3.GetObjectStreamAsync(library.S3ConnectionId, mediaFile.S3Key, rangeHeader);

            // Write directly to response to avoid FileStreamResult overriding the 206 status
            Response.StatusCode = 206;
            Response.Headers.Append("Content-Range", $"bytes {start}-{end}/{totalLength}");
            Response.Headers.Append("Accept-Ranges", "bytes");
            Response.ContentType = contentType;
            Response.ContentLength = chunkSize;

            await stream.CopyToAsync(Response.Body);
            return new EmptyResult();
        }

        // No range requested - return full file with Accept-Ranges header
        await using var fullStream = await _s3.GetObjectStreamAsync(library.S3ConnectionId, mediaFile.S3Key);

        Response.Headers.Append("Accept-Ranges", "bytes");
        Response.ContentType = contentType;
        Response.ContentLength = totalLength;

        await fullStream.CopyToAsync(Response.Body);
        return new EmptyResult();
    }

    /// <summary>
    /// Remux streaming endpoint - transcodes audio to AAC (browser-compatible) while copying video.
    /// Used for MKV files with AC3/DTS audio that browsers can't play natively.
    /// Outputs fragmented MP4 for browser streaming.
    /// </summary>
    [HttpGet("{mediaFileId:guid}/remux")]
    public async Task<IActionResult> RemuxStream(Guid mediaFileId, [FromQuery] double start = 0, [FromQuery] int? audioTrack = null)
    {
        var mediaFile = await _db.MediaFiles
            .Include(mf => mf.Episode).ThenInclude(e => e!.Season).ThenInclude(s => s.MediaItem).ThenInclude(mi => mi.Library)
            .Include(mf => mf.MediaItem).ThenInclude(mi => mi!.Library)
            .FirstOrDefaultAsync(mf => mf.Id == mediaFileId);

        if (mediaFile == null) return NotFound();

        var library = mediaFile.MediaItem?.Library ?? mediaFile.Episode?.Season.MediaItem.Library;
        if (library == null) return NotFound();

        // Try pre-signed URL for fast input seeking, fall back to stdin pipe
        string? presignedUrl = null;
        try
        {
            presignedUrl = await _s3.GetPreSignedUrlAsync(library.S3ConnectionId, mediaFile.S3Key, TimeSpan.FromHours(1));
        }
        catch
        {
            _logger.LogWarning("Failed to get pre-signed URL for {Key}, falling back to pipe", mediaFile.S3Key);
        }

        var mapArgs = audioTrack.HasValue
            ? $"-map 0:v:0 -map 0:a:{audioTrack.Value}"
            : "";

        string args;
        bool usePipe;

        if (presignedUrl != null)
        {
            // Pre-signed URL: -ss before -i for fast keyframe-accurate seeking
            var seekArgs = start > 0 ? $"-ss {start:F2}" : "";
            args = $"{seekArgs} -fflags +genpts -i \"{presignedUrl}\" {mapArgs} -c:v copy -c:a aac -b:a 192k -ac 2 -avoid_negative_ts make_zero -af aresample=async=1:first_pts=0 -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof pipe:1";
            usePipe = false;
        }
        else
        {
            // Pipe: -ss after -i (output seeking, slower)
            var seekArgs = start > 0 ? $"-ss {start:F2}" : "";
            args = $"-fflags +genpts -i pipe:0 {seekArgs} {mapArgs} -c:v copy -c:a aac -b:a 192k -ac 2 -avoid_negative_ts make_zero -af aresample=async=1:first_pts=0 -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof pipe:1";
            usePipe = true;
        }

        var psi = new ProcessStartInfo
        {
            FileName = _ffmpegPath,
            Arguments = args,
            RedirectStandardInput = usePipe,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        var process = Process.Start(psi);
        if (process == null)
        {
            _logger.LogError("Failed to start ffmpeg process");
            return StatusCode(500, "Failed to start transcoding");
        }

        // Log ffmpeg stderr in background (for diagnostics)
        _ = Task.Run(async () =>
        {
            try
            {
                var stderr = await process.StandardError.ReadToEndAsync();
                if (!string.IsNullOrWhiteSpace(stderr))
                    _logger.LogWarning("ffmpeg remux stderr: {Stderr}", stderr[..Math.Min(stderr.Length, 2000)]);
            }
            catch { /* ignore */ }
        });

        Response.StatusCode = 200;
        Response.ContentType = "video/mp4";
        Response.Headers.Append("Accept-Ranges", "none");

        // Pipe S3 stream to ffmpeg stdin if using pipe mode
        if (usePipe)
        {
            var s3Stream = await _s3.GetObjectStreamAsync(library.S3ConnectionId, mediaFile.S3Key);
            _ = Task.Run(async () =>
            {
                try
                {
                    await s3Stream.CopyToAsync(process.StandardInput.BaseStream);
                    process.StandardInput.BaseStream.Close();
                }
                catch { /* S3 or ffmpeg stdin closed */ }
                finally
                {
                    await s3Stream.DisposeAsync();
                }
            });
        }

        try
        {
            await process.StandardOutput.BaseStream.CopyToAsync(Response.Body, HttpContext.RequestAborted);
        }
        catch (OperationCanceledException)
        {
            // Client disconnected
        }
        finally
        {
            if (!process.HasExited)
            {
                try { process.Kill(entireProcessTree: true); } catch { /* ignore */ }
            }
            process.Dispose();
        }

        return new EmptyResult();
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

            var url = await _s3.GetPreSignedUrlAsync(library.S3ConnectionId, subtitle.S3Key, TimeSpan.FromMinutes(55));
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

    [HttpGet("{mediaFileId:guid}/chapters")]
    public async Task<IActionResult> GetChapters(Guid mediaFileId)
    {
        var mediaFile = await _db.MediaFiles
            .Include(mf => mf.Chapters)
            .Include(mf => mf.Episode).ThenInclude(e => e!.Season).ThenInclude(s => s.MediaItem).ThenInclude(mi => mi.Library)
            .Include(mf => mf.MediaItem).ThenInclude(mi => mi!.Library)
            .FirstOrDefaultAsync(mf => mf.Id == mediaFileId);

        if (mediaFile == null) return NotFound();

        // Return cached chapters if available
        if (mediaFile.Chapters.Count > 0)
        {
            return Ok(mediaFile.Chapters
                .OrderBy(c => c.StartSeconds)
                .Select(c => new ChapterResponse(c.Id, c.Title, c.StartSeconds, c.EndSeconds, c.ChapterType))
                .ToList());
        }

        // Probe the file for chapters
        var library = mediaFile.MediaItem?.Library ?? mediaFile.Episode?.Season.MediaItem.Library;
        if (library == null) return NotFound();

        try
        {
            var presignedUrl = await _s3.GetPreSignedUrlAsync(library.S3ConnectionId, mediaFile.S3Key, TimeSpan.FromMinutes(5));
            var probeResult = await _probe.ProbeAsync(presignedUrl);

            if (probeResult.Chapters.Count == 0)
                return Ok(Array.Empty<ChapterResponse>());

            var introPatterns = new[] { "intro", "opening", "op" };
            var recapPatterns = new[] { "recap", "previously" };
            var creditsPatterns = new[] { "credits", "ending", "ed" };

            foreach (var ch in probeResult.Chapters)
            {
                var titleLower = ch.Title?.ToLowerInvariant() ?? "";
                var chapterType = introPatterns.Any(p => titleLower.Contains(p)) ? "intro"
                    : recapPatterns.Any(p => titleLower.Contains(p)) ? "recap"
                    : creditsPatterns.Any(p => titleLower.Contains(p)) ? "credits"
                    : "other";

                _db.ChapterInfos.Add(new Core.Entities.ChapterInfo
                {
                    Title = ch.Title,
                    StartSeconds = ch.StartSeconds,
                    EndSeconds = ch.EndSeconds,
                    ChapterType = chapterType,
                    MediaFileId = mediaFile.Id
                });
            }

            await _db.SaveChangesAsync();

            return Ok(probeResult.Chapters.Select(ch =>
            {
                var titleLower = ch.Title?.ToLowerInvariant() ?? "";
                var chapterType = introPatterns.Any(p => titleLower.Contains(p)) ? "intro"
                    : recapPatterns.Any(p => titleLower.Contains(p)) ? "recap"
                    : creditsPatterns.Any(p => titleLower.Contains(p)) ? "credits"
                    : "other";
                return new ChapterResponse(Guid.NewGuid(), ch.Title, ch.StartSeconds, ch.EndSeconds, chapterType);
            }).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to probe chapters for media file {MediaFileId}", mediaFileId);
            return Ok(Array.Empty<ChapterResponse>());
        }
    }

    /// <summary>
    /// Returns episode context (show name, season/episode numbers, previous/next episode)
    /// for player navigation. Returns 404 for non-episode media files.
    /// </summary>
    [HttpGet("{mediaFileId:guid}/episode-context")]
    public async Task<IActionResult> GetEpisodeContext(Guid mediaFileId)
    {
        var mediaFile = await _db.MediaFiles
            .Include(mf => mf.Episode).ThenInclude(e => e!.Season).ThenInclude(s => s.MediaItem)
            .FirstOrDefaultAsync(mf => mf.Id == mediaFileId);

        if (mediaFile?.Episode == null) return NotFound();

        var episode = mediaFile.Episode;
        var season = episode.Season;
        var show = season.MediaItem;

        // Load all seasons with episodes and their media files for this show
        var allSeasons = await _db.Seasons
            .Where(s => s.MediaItemId == show.Id)
            .Include(s => s.Episodes).ThenInclude(e => e.MediaFiles)
            .OrderBy(s => s.SeasonNumber)
            .ToListAsync();

        // Build flat ordered list of all episodes
        var allEpisodes = allSeasons
            .SelectMany(s => s.Episodes.OrderBy(e => e.EpisodeNumber).Select(e => new { Season = s, Episode = e }))
            .ToList();

        var currentIndex = allEpisodes.FindIndex(x => x.Episode.Id == episode.Id);

        EpisodeNavResponse? prev = null;
        EpisodeNavResponse? next = null;

        if (currentIndex > 0)
        {
            var p = allEpisodes[currentIndex - 1];
            var pFile = p.Episode.MediaFiles.FirstOrDefault();
            if (pFile != null)
                prev = new EpisodeNavResponse(pFile.Id, p.Season.SeasonNumber, p.Episode.EpisodeNumber, p.Episode.Title);
        }

        if (currentIndex >= 0 && currentIndex < allEpisodes.Count - 1)
        {
            var n = allEpisodes[currentIndex + 1];
            var nFile = n.Episode.MediaFiles.FirstOrDefault();
            if (nFile != null)
                next = new EpisodeNavResponse(nFile.Id, n.Season.SeasonNumber, n.Episode.EpisodeNumber, n.Episode.Title);
        }

        return Ok(new EpisodeContextResponse(
            show.Title,
            show.Id,
            season.SeasonNumber,
            episode.EpisodeNumber,
            episode.Title,
            prev,
            next
        ));
    }
}
