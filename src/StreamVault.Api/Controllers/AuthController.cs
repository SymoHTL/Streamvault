using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Core.Entities;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
public class AuthController : BaseController
{
    private readonly StreamVaultDbContext _db;
    private readonly ITokenService _tokenService;

    public AuthController(StreamVaultDbContext db, ITokenService tokenService)
    {
        _db = db;
        _tokenService = tokenService;
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
    {
        var user = await _db.Users
            .Include(u => u.Profiles)
            .FirstOrDefaultAsync(u => u.Username == request.Username);
        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new { error = "Invalid username or password" });

        var accessToken = _tokenService.GenerateAccessToken(user);
        var refreshToken = _tokenService.GenerateRefreshToken(user.Id);

        _db.RefreshTokens.Add(refreshToken);
        await _db.SaveChangesAsync();

        var profiles = user.Profiles
            .OrderBy(p => p.CreatedAt)
            .Select(p => new ProfileResponse(p.Id, p.Name, p.AvatarUrl, p.PinHash != null, p.IsDefault))
            .ToList();

        return Ok(new AuthResponse(
            accessToken,
            refreshToken.Token,
            DateTime.UtcNow.AddMinutes(15),
            new UserResponse(user.Id, user.Username, user.Email, user.Role.ToString(), user.CreatedAt),
            null,
            profiles
        ));
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh([FromBody] RefreshTokenRequest request)
    {
        var storedToken = await _db.RefreshTokens
            .Include(rt => rt.User)
                .ThenInclude(u => u.Profiles)
            .FirstOrDefaultAsync(rt => rt.Token == request.RefreshToken);

        if (storedToken == null || storedToken.IsRevoked || storedToken.ExpiresAt < DateTime.UtcNow)
            return Unauthorized(new { error = "Invalid refresh token" });

        // Revoke old token
        storedToken.IsRevoked = true;

        // Preserve profile from the current request's JWT if present, or from request body
        Profile? profile = null;
        var profileIdClaim = User.FindFirst("ProfileId")?.Value;
        if (profileIdClaim != null && Guid.TryParse(profileIdClaim, out var profileId))
        {
            profile = storedToken.User.Profiles.FirstOrDefault(p => p.Id == profileId);
        }
        // Fallback: use profileId from request body (for when JWT is expired)
        if (profile == null && request.ProfileId.HasValue)
        {
            profile = storedToken.User.Profiles.FirstOrDefault(p => p.Id == request.ProfileId.Value);
        }

        // Generate new tokens
        var newAccessToken = _tokenService.GenerateAccessToken(storedToken.User, profile);
        var newRefreshToken = _tokenService.GenerateRefreshToken(storedToken.User.Id);

        storedToken.ReplacedByToken = newRefreshToken.Token;
        _db.RefreshTokens.Add(newRefreshToken);
        await _db.SaveChangesAsync();

        var profileResponse = profile != null
            ? new ProfileResponse(profile.Id, profile.Name, profile.AvatarUrl, profile.PinHash != null, profile.IsDefault)
            : null;

        return Ok(new AuthResponse(
            newAccessToken,
            newRefreshToken.Token,
            DateTime.UtcNow.AddMinutes(15),
            new UserResponse(storedToken.User.Id, storedToken.User.Username, storedToken.User.Email,
                storedToken.User.Role.ToString(), storedToken.User.CreatedAt),
            profileResponse,
            null
        ));
    }

    [HttpPost("logout")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<IActionResult> Logout([FromBody] RefreshTokenRequest request)
    {
        var token = await _db.RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == request.RefreshToken);
        if (token != null)
        {
            token.IsRevoked = true;
            await _db.SaveChangesAsync();
        }
        return Ok();
    }
}
