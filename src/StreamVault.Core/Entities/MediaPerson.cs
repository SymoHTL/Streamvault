using StreamVault.Core.Enums;

namespace StreamVault.Core.Entities;

public class MediaPerson
{
    public Guid MediaItemId { get; set; }
    public MediaItem MediaItem { get; set; } = null!;

    public Guid PersonId { get; set; }
    public Person Person { get; set; } = null!;

    public PersonRole Role { get; set; }
    public string? Character { get; set; }
    public int Order { get; set; }
}
