using StreamVault.Core.Enums;

namespace StreamVault.Core.Entities;

public class Library : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public MediaType Type { get; set; }
    public string S3Prefix { get; set; } = string.Empty;
    public string ScanScheduleCron { get; set; } = "0 */6 * * *"; // every 6 hours
    public LibraryScanStatus ScanStatus { get; set; } = LibraryScanStatus.Idle;
    public DateTime? LastScannedAt { get; set; }

    public Guid S3ConnectionId { get; set; }
    public S3Connection S3Connection { get; set; } = null!;

    public ICollection<MediaItem> MediaItems { get; set; } = [];
}
