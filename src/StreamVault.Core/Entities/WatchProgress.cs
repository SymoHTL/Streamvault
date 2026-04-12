namespace StreamVault.Core.Entities;

public class WatchProgress : BaseEntity
{
    public long PositionTicks { get; set; }
    public bool Completed { get; set; }
    public DateTime LastWatchedAt { get; set; } = DateTime.UtcNow;

    public Guid ProfileId { get; set; }
    public Profile Profile { get; set; } = null!;

    public Guid MediaFileId { get; set; }
    public MediaFile MediaFile { get; set; } = null!;
}
