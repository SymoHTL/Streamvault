using StreamVault.Core.Enums;

namespace StreamVault.Core.Entities;

public class ExternalId : BaseEntity
{
    public ExternalIdProvider Provider { get; set; }
    public string ExternalKey { get; set; } = string.Empty;

    public Guid MediaItemId { get; set; }
    public MediaItem MediaItem { get; set; } = null!;
}
