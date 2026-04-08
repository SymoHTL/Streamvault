namespace StreamVault.Core.Entities;

public class Season : BaseEntity
{
    public int SeasonNumber { get; set; }
    public string? Name { get; set; }

    public Guid MediaItemId { get; set; }
    public MediaItem MediaItem { get; set; } = null!;

    public ICollection<Episode> Episodes { get; set; } = [];
}
