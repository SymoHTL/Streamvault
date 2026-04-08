namespace StreamVault.Core.Entities;

public class Genre : BaseEntity
{
    public string Name { get; set; } = string.Empty;

    public ICollection<MediaGenre> MediaGenres { get; set; } = [];
}
