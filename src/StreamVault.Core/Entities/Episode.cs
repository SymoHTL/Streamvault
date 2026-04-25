namespace StreamVault.Core.Entities;

public class Episode : BaseEntity
{
    public int EpisodeNumber { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Overview { get; set; }
    public string S3Key { get; set; } = string.Empty;
    public int? RuntimeMinutes { get; set; }
    public string? StillUrl { get; set; }

    public Guid SeasonId { get; set; }
    public Season Season { get; set; } = null!;

    public ICollection<MediaFile> MediaFiles { get; set; } = [];
}
