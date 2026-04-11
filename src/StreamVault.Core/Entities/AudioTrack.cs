namespace StreamVault.Core.Entities;

public class AudioTrack : BaseEntity
{
    public int StreamIndex { get; set; }
    public string Language { get; set; } = "und";
    public string? Title { get; set; }
    public string Codec { get; set; } = string.Empty;
    public int Channels { get; set; }

    public Guid MediaFileId { get; set; }
    public MediaFile MediaFile { get; set; } = null!;
}
