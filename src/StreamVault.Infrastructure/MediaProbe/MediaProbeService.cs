using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StreamVault.Core.Configuration;
using StreamVault.Core.Interfaces;
using Xabe.FFmpeg;

namespace StreamVault.Infrastructure.MediaProbe;

public class MediaProbeService : IMediaProbeService
{
    private readonly ILogger<MediaProbeService> _logger;
    private readonly string _ffprobePath;

    public MediaProbeService(IOptions<StreamVaultSettings> settings, ILogger<MediaProbeService> logger)
    {
        _logger = logger;
        var dir = Path.GetDirectoryName(settings.Value.Transcoding.FfmpegPath) ?? "";
        FFmpeg.SetExecutablesPath(dir);
        _ffprobePath = settings.Value.Transcoding.FfprobePath;
    }

    public async Task<MediaProbeResult> ProbeAsync(string filePath, CancellationToken ct = default)
    {
        try
        {
            var info = await FFmpeg.GetMediaInfo(filePath, ct);
            var chapters = await ProbeChaptersAsync(filePath, ct);
            return MapResult(info, chapters);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to probe file: {FilePath}", filePath);
            return new MediaProbeResult(null, null, null, null, null, null, [], [], []);
        }
    }

    public Task<MediaProbeResult> ProbeStreamAsync(Stream stream, CancellationToken ct = default)
    {
        throw new NotSupportedException("Use ProbeAsync with a file path instead. Download to temp first.");
    }

    private async Task<List<ChapterProbeInfo>> ProbeChaptersAsync(string filePath, CancellationToken ct)
    {
        var chapters = new List<ChapterProbeInfo>();
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = _ffprobePath,
                Arguments = $"-v quiet -print_format json -show_chapters \"{filePath}\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null) return chapters;

            var json = await process.StandardOutput.ReadToEndAsync(ct);
            await process.WaitForExitAsync(ct);

            if (string.IsNullOrWhiteSpace(json)) return chapters;

            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("chapters", out var chaptersArr)) return chapters;

            foreach (var ch in chaptersArr.EnumerateArray())
            {
                var startTime = ch.TryGetProperty("start_time", out var st) ? double.TryParse(st.GetString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var sv) ? sv : 0 : 0;
                var endTime = ch.TryGetProperty("end_time", out var et) ? double.TryParse(et.GetString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var ev) ? ev : 0 : 0;

                string? title = null;
                if (ch.TryGetProperty("tags", out var tags) && tags.TryGetProperty("title", out var titleProp))
                    title = titleProp.GetString();

                chapters.Add(new ChapterProbeInfo(title, startTime, endTime));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to probe chapters for {FilePath}", filePath);
        }
        return chapters;
    }

    private static MediaProbeResult MapResult(IMediaInfo info, List<ChapterProbeInfo> chapters)
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
            VideoBitrate: (int?)(videoStream?.Bitrate / 1000),
            DurationSeconds: info.Duration.TotalSeconds,
            FileSize: null,
            Subtitles: subtitles,
            AudioTracks: audioTracks,
            Chapters: chapters
        );
    }
}
