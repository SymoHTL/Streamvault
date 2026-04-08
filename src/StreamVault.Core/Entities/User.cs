using StreamVault.Core.Enums;

namespace StreamVault.Core.Entities;

public class User : BaseEntity
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.User;
    public string? PreferencesJson { get; set; }

    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
    public ICollection<WatchProgress> WatchProgresses { get; set; } = [];
    public ICollection<WatchlistItem> WatchlistItems { get; set; } = [];
}
