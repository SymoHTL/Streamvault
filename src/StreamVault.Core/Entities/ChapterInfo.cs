namespace StreamVault.Core.Entities;

public class ChapterInfo : BaseEntity
{
    public string? Title { get; set; }
    public double StartSeconds { get; set; }
    public double EndSeconds { get; set; }
    public string ChapterType { get; set; } = "other"; // intro, recap, credits, other

    public Guid MediaFileId { get; set; }
    public MediaFile MediaFile { get; set; } = null!;
}
