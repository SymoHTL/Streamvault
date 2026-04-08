using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StreamVault.Core.Configuration;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;
using Xabe.FFmpeg;

namespace StreamVault.Infrastructure.Transcoding;

public class TranscodeService : ITranscodeService
{
    private readonly IDbContextFactory<StreamVaultDbContext> _dbFactory;
    private readonly IS3StorageService _s3;
    private readonly TranscodingSettings _settings;
    private readonly ILogger<TranscodeService> _logger;
    private readonly ConcurrentDictionary<string, TranscodeSessionState> _sessions = new();

    public TranscodeService(
        IDbContextFactory<StreamVaultDbContext> dbFactory,
        IS3StorageService s3,
        IOptions<StreamVaultSettings> settings,
        ILogger<TranscodeService> logger)
    {
        _dbFactory = dbFactory;
        _s3 = s3;
        _settings = settings.Value.Transcoding;
        _logger = logger;

        FFmpeg.SetExecutablesPath(Path.GetDirectoryName(_settings.FfmpegPath) ?? "");
    }

    public async Task<TranscodeSession> StartTranscodeAsync(Guid mediaFileId, string profileName, CancellationToken ct = default)
    {
        if (_sessions.Count >= _settings.MaxConcurrentTranscodes)
            throw new InvalidOperationException("Maximum concurrent transcode limit reached");

        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var mediaFile = await db.MediaFiles
            .Include(mf => mf.MediaItem)
            .ThenInclude(mi => mi!.Library)
            .Include(mf => mf.Episode)
            .ThenInclude(e => e!.Season)
            .ThenInclude(s => s.MediaItem)
            .ThenInclude(mi => mi.Library)
            .FirstOrDefaultAsync(mf => mf.Id == mediaFileId, ct)
            ?? throw new InvalidOperationException("Media file not found");

        var profile = await db.TranscodeProfiles
            .FirstOrDefaultAsync(p => p.Name == profileName, ct)
            ?? throw new InvalidOperationException($"Transcode profile '{profileName}' not found");

        var library = mediaFile.MediaItem?.Library ?? mediaFile.Episode?.Season.MediaItem.Library
            ?? throw new InvalidOperationException("Cannot determine library for media file");

        var sessionId = Guid.NewGuid().ToString("N");
        var outputDir = Path.Combine(_settings.FfmpegPath, "..", "transcode", sessionId);
        Directory.CreateDirectory(outputDir);

        var session = new TranscodeSession(sessionId, mediaFileId, profileName, DateTime.UtcNow, outputDir);

        // Download source to temp
        var tempInput = Path.Combine(outputDir, $"input{Path.GetExtension(mediaFile.S3Key)}");
        await _s3.DownloadToFileAsync(library.S3ConnectionId, mediaFile.S3Key, tempInput, ct);

        // Start HLS transcoding
        var hlsOutput = Path.Combine(outputDir, "stream.m3u8");
        _ = Task.Run(async () =>
        {
            try
            {
                var conversion = FFmpeg.Conversions.New()
                    .AddParameter($"-i \"{tempInput}\"")
                    .AddParameter($"-c:v {profile.VideoCodec}")
                    .AddParameter($"-c:a {profile.AudioCodec}")
                    .AddParameter($"-vf scale=-2:{profile.MaxHeight}")
                    .AddParameter($"-b:v {profile.MaxBitrate}k")
                    .AddParameter($"-hls_time {_settings.SegmentDurationSeconds}")
                    .AddParameter("-hls_list_size 0")
                    .AddParameter("-hls_segment_type mpegts")
                    .AddParameter($"-hls_segment_filename \"{Path.Combine(outputDir, "segment_%03d.ts")}\"")
                    .AddParameter($"\"{hlsOutput}\"");

                _sessions[sessionId] = new TranscodeSessionState(session, conversion);

                await conversion.Start(CancellationToken.None);

                _logger.LogInformation("Transcode completed for session {SessionId}", sessionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Transcode failed for session {SessionId}", sessionId);
            }
        }, CancellationToken.None);

        return session;
    }

    public Task<string?> GetManifestPathAsync(string sessionId, string format, CancellationToken ct = default)
    {
        if (!_sessions.TryGetValue(sessionId, out var state)) return Task.FromResult<string?>(null);

        var manifestPath = format.ToLowerInvariant() switch
        {
            "hls" => Path.Combine(state.Session.OutputDirectory, "stream.m3u8"),
            "dash" => Path.Combine(state.Session.OutputDirectory, "stream.mpd"),
            _ => null
        };

        if (manifestPath != null && File.Exists(manifestPath))
            return Task.FromResult<string?>(manifestPath);

        return Task.FromResult<string?>(null);
    }

    public Task<string?> GetSegmentPathAsync(string sessionId, string segmentName, CancellationToken ct = default)
    {
        if (!_sessions.TryGetValue(sessionId, out var state)) return Task.FromResult<string?>(null);

        // Validate segment name to prevent path traversal
        if (segmentName.Contains("..") || Path.IsPathRooted(segmentName))
            return Task.FromResult<string?>(null);

        var segmentPath = Path.Combine(state.Session.OutputDirectory, segmentName);
        return Task.FromResult(File.Exists(segmentPath) ? segmentPath : null);
    }

    public Task StopTranscodeAsync(string sessionId, CancellationToken ct = default)
    {
        if (_sessions.TryRemove(sessionId, out var state))
        {
            try
            {
                // Cleanup output directory
                if (Directory.Exists(state.Session.OutputDirectory))
                    Directory.Delete(state.Session.OutputDirectory, recursive: true);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to cleanup transcode session {SessionId}", sessionId);
            }
        }
        return Task.CompletedTask;
    }

    public IReadOnlyList<TranscodeSession> GetActiveSessions() =>
        _sessions.Values.Select(s => s.Session).ToList();

    private record TranscodeSessionState(TranscodeSession Session, IConversion Conversion);
}
