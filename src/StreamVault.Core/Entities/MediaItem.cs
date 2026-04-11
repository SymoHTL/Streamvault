using StreamVault.Core.Enums;

namespace StreamVault.Core.Entities;

public class MediaItem : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string SortTitle { get; set; } = string.Empty;
    public int? Year { get; set; }
    public string? Overview { get; set; }
    public double? CommunityRating { get; set; }
    public int? RuntimeMinutes { get; set; }
    public MediaType MediaType { get; set; }
    public string? S3Key { get; set; }
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;

    public Guid LibraryId { get; set; }
    public Library Library { get; set; } = null!;

    public ICollection<MediaFile> MediaFiles { get; set; } = [];
    public ICollection<Season> Seasons { get; set; } = [];
    public ICollection<MediaGenre> MediaGenres { get; set; } = [];
    public ICollection<MediaPerson> MediaPersons { get; set; } = [];
    public ICollection<ExternalId> ExternalIds { get; set; } = [];
    public ICollection<MediaImage> Images { get; set; } = [];
    public ICollection<WatchlistItem> WatchlistItems { get; set; } = [];
    public ICollection<UserMediaList> UserMediaLists { get; set; } = [];
    public ICollection<CollectionItem> CollectionItems { get; set; } = [];
}
