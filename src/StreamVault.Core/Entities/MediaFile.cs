namespace StreamVault.Core.Entities;

public class MediaFile : BaseEntity
{
    public string S3Key { get; set; } = string.Empty;
    public string Container { get; set; } = string.Empty; // mkv, mp4, avi, etc.
    public string? VideoCodec { get; set; }
    public string? AudioCodec { get; set; }
    public string? Resolution { get; set; } // 1920x1080
    public int? VideoBitrate { get; set; }
    public long? FileSize { get; set; }
    public double? DurationSeconds { get; set; }

    public Guid? MediaItemId { get; set; }
    public MediaItem? MediaItem { get; set; }

    public Guid? EpisodeId { get; set; }
    public Episode? Episode { get; set; }

    public ICollection<Subtitle> Subtitles { get; set; } = [];
    public ICollection<WatchProgress> WatchProgresses { get; set; } = [];
}
