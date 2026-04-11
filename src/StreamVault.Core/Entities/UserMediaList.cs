using StreamVault.Core.Enums;

namespace StreamVault.Core.Entities;

public class UserMediaList : BaseEntity
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public Guid MediaItemId { get; set; }
    public MediaItem MediaItem { get; set; } = null!;

    public MediaListStatus Status { get; set; }
    public int? Rating { get; set; }
    public string? Notes { get; set; }
}
