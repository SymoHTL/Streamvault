using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using StreamVault.Core.Configuration;
using StreamVault.Core.Entities;
using StreamVault.Core.Interfaces;

namespace StreamVault.Infrastructure.Auth;

public class TokenService : ITokenService
{
    private readonly JwtSettings _jwt;

    public TokenService(IOptions<StreamVaultSettings> settings)
    {
        _jwt = settings.Value.Jwt;
    }

    public string GenerateAccessToken(User user, Profile? profile = null)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Role, user.Role.ToString())
        };

        if (profile != null)
        {
            claims.Add(new Claim("ProfileId", profile.Id.ToString()));
            claims.Add(new Claim("ProfileName", profile.Name));
        }

        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: _jwt.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_jwt.AccessTokenExpiryMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public RefreshToken GenerateRefreshToken(Guid userId)
    {
        var randomBytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);

        return new RefreshToken
        {
            Token = Convert.ToBase64String(randomBytes),
            ExpiresAt = DateTime.UtcNow.AddDays(_jwt.RefreshTokenExpiryDays),
            UserId = userId
        };
    }
}
