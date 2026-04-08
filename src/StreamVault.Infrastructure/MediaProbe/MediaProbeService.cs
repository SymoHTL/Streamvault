using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StreamVault.Core.Configuration;
using StreamVault.Core.Interfaces;
using Xabe.FFmpeg;

namespace StreamVault.Infrastructure.MediaProbe;

public class MediaProbeService : IMediaProbeService
{
    private readonly ILogger<MediaProbeService> _logger;

    public MediaProbeService(IOptions<StreamVaultSettings> settings, ILogger<MediaProbeService> logger)
    {
        _logger = logger;
        FFmpeg.SetExecutablesPath(Path.GetDirectoryName(settings.Value.Transcoding.FfmpegPath) ?? "");
    }

    public async Task<MediaProbeResult> ProbeAsync(string filePath, CancellationToken ct = default)
    {
        try
        {
            var info = await FFmpeg.GetMediaInfo(filePath, ct);
            return MapResult(info);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to probe file: {FilePath}", filePath);
            return new MediaProbeResult(null, null, null, null, null, null, [], []);
        }
    }

    public Task<MediaProbeResult> ProbeStreamAsync(Stream stream, CancellationToken ct = default)
    {
        // Xabe.FFmpeg doesn't support stream input for probing directly.
        // We'd need to save to temp file first. For now, use ProbeAsync with a file path.
        throw new NotSupportedException("Use ProbeAsync with a file path instead. Download to temp first.");
    }

    private static MediaProbeResult MapResult(IMediaInfo info)
    {
        var videoStream = info.VideoStreams.FirstOrDefault();
        var audioStream = info.AudioStreams.FirstOrDefault();

        var subtitles = info.SubtitleStreams.Select((s, i) => new EmbeddedSubtitleInfo(
            i, s.Language ?? "und", s.Title, s.Codec
        )).ToList();

        var audioTracks = info.AudioStreams.Select((a, i) => new AudioTrackInfo(
            i, a.Language ?? "und", a.Title, a.Codec, a.Channels
        )).ToList();

        return new MediaProbeResult(
            VideoCodec: videoStream?.Codec,
            AudioCodec: audioStream?.Codec,
            Resolution: videoStream != null ? $"{videoStream.Width}x{videoStream.Height}" : null,
            VideoBitrate: (int?)(videoStream?.Bitrate / 1000), // Convert to kbps
            DurationSeconds: info.Duration.TotalSeconds,
            FileSize: null, // Not available from FFprobe
            Subtitles: subtitles,
            AudioTracks: audioTracks
        );
    }
}
