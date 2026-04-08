using StreamVault.Core.Enums;

namespace StreamVault.Core.Entities;

public class MediaImage : BaseEntity
{
    public ImageType Type { get; set; }
    public string LocalPath { get; set; } = string.Empty;
    public string? SourceUrl { get; set; }

    public Guid MediaItemId { get; set; }
    public MediaItem MediaItem { get; set; } = null!;
}
