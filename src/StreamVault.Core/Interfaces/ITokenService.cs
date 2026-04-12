using StreamVault.Core.Entities;

namespace StreamVault.Core.Interfaces;

public interface ITokenService
{
    string GenerateAccessToken(User user, Profile? profile = null);
    RefreshToken GenerateRefreshToken(Guid userId);
}
