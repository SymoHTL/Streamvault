namespace StreamVault.Core.Interfaces;

public interface IMediaProbeService
{
    Task<MediaProbeResult> ProbeAsync(string filePath, CancellationToken ct = default);
    Task<MediaProbeResult> ProbeStreamAsync(Stream stream, CancellationToken ct = default);
}

public record MediaProbeResult(
    string? VideoCodec,
    string? AudioCodec,
    string? Resolution,
    int? VideoBitrate,
    double? DurationSeconds,
    long? FileSize,
    IReadOnlyList<EmbeddedSubtitleInfo> Subtitles,
    IReadOnlyList<AudioTrackInfo> AudioTracks
);

public record EmbeddedSubtitleInfo(int StreamIndex, string Language, string? Title, string Codec);
public record AudioTrackInfo(int StreamIndex, string Language, string? Title, string Codec, int Channels);
