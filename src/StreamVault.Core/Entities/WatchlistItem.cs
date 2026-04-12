namespace StreamVault.Core.Entities;

public class WatchlistItem : BaseEntity
{
    public Guid ProfileId { get; set; }
    public Profile Profile { get; set; } = null!;

    public Guid MediaItemId { get; set; }
    public MediaItem MediaItem { get; set; } = null!;
}
