namespace StreamVault.Core.Entities;

public class CollectionItem : BaseEntity
{
    public Guid CollectionId { get; set; }
    public Collection Collection { get; set; } = null!;

    public Guid MediaItemId { get; set; }
    public MediaItem MediaItem { get; set; } = null!;

    public int SortOrder { get; set; }
}
