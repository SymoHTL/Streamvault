namespace StreamVault.Core.Entities;

public class Person : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }

    public ICollection<MediaPerson> MediaPersons { get; set; } = [];
}
