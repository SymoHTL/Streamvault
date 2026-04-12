using StreamVault.Core.Enums;

namespace StreamVault.Core.Entities;

public class DeviceCode : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string UserCode { get; set; } = string.Empty;
    public DeviceCodeStatus Status { get; set; } = DeviceCodeStatus.Pending;
    public DateTime ExpiresAt { get; set; }

    public Guid? UserId { get; set; }
    public User? User { get; set; }
}
