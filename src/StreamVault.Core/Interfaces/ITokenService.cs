using StreamVault.Core.Entities;

namespace StreamVault.Core.Interfaces;

public interface ITokenService
{
    string GenerateAccessToken(User user);
    RefreshToken GenerateRefreshToken(Guid userId);
}
