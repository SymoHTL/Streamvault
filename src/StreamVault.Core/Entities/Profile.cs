namespace StreamVault.Core.Entities;

public class Profile : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string? PinHash { get; set; }
    public bool IsDefault { get; set; }
    public string? PreferencesJson { get; set; }

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public ICollection<WatchProgress> WatchProgresses { get; set; } = [];
    public ICollection<WatchlistItem> WatchlistItems { get; set; } = [];
    public ICollection<UserMediaList> MediaLists { get; set; } = [];
    public ICollection<Collection> Collections { get; set; } = [];
}
