namespace StreamVault.Core.Entities;

public class TranscodeProfile : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string VideoCodec { get; set; } = "libx264";
    public string AudioCodec { get; set; } = "aac";
    public int MaxHeight { get; set; } = 1080;
    public int MaxBitrate { get; set; } = 8000; // kbps
}
