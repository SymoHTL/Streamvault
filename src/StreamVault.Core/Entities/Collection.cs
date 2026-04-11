namespace StreamVault.Core.Entities;

public class Collection : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? PosterUrl { get; set; }
    public string? BackdropUrl { get; set; }
    public int SortOrder { get; set; }
    public int? TmdbCollectionId { get; set; }

    public Guid? CreatedByUserId { get; set; }
    public User? CreatedBy { get; set; }

    public ICollection<CollectionItem> Items { get; set; } = [];
}
