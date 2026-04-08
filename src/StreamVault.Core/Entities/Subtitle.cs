using StreamVault.Core.Enums;

namespace StreamVault.Core.Entities;

public class Subtitle : BaseEntity
{
    public string Language { get; set; } = string.Empty;
    public string? S3Key { get; set; }
    public string? LocalPath { get; set; }
    public SubtitleFormat Format { get; set; }
    public bool IsExternal { get; set; }
    public bool IsForced { get; set; }

    public Guid MediaFileId { get; set; }
    public MediaFile MediaFile { get; set; } = null!;
}
