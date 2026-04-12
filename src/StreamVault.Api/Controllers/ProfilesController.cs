using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Core.Entities;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
[Authorize]
public class ProfilesController : BaseController
{
    private readonly StreamVaultDbContext _db;
    private readonly ITokenService _tokenService;

    public ProfilesController(StreamVaultDbContext db, ITokenService tokenService)
    {
        _db = db;
        _tokenService = tokenService;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ProfileResponse>>> GetProfiles()
    {
        var userId = GetUserId();
        var profiles = await _db.Profiles
            .Where(p => p.UserId == userId)
            .OrderBy(p => p.CreatedAt)
            .Select(p => new ProfileResponse(p.Id, p.Name, p.AvatarUrl, p.PinHash != null, p.IsDefault))
            .ToListAsync();

        return Ok(profiles);
    }

    [HttpPost]
    public async Task<ActionResult<ProfileResponse>> Create([FromBody] CreateProfileRequest request)
    {
        var userId = GetUserId();

        var count = await _db.Profiles.CountAsync(p => p.UserId == userId);
        if (count >= 5)
            return BadRequest(new { error = "Maximum of 5 profiles per account" });

        if (await _db.Profiles.AnyAsync(p => p.UserId == userId && p.Name == request.Name))
            return Conflict(new { error = "Profile name already exists" });

        var profile = new Profile
        {
            Name = request.Name,
            AvatarUrl = request.AvatarUrl,
            PinHash = !string.IsNullOrEmpty(request.Pin) ? BCrypt.Net.BCrypt.HashPassword(request.Pin) : null,
            UserId = userId,
            IsDefault = false
        };

        _db.Profiles.Add(profile);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetProfiles), null,
            new ProfileResponse(profile.Id, profile.Name, profile.AvatarUrl, profile.PinHash != null, profile.IsDefault));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProfileResponse>> Update(Guid id, [FromBody] UpdateProfileRequest request)
    {
        var userId = GetUserId();
        var profile = await _db.Profiles.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
        if (profile == null) return NotFound();

        if (request.Name != null)
        {
            if (await _db.Profiles.AnyAsync(p => p.UserId == userId && p.Name == request.Name && p.Id != id))
                return Conflict(new { error = "Profile name already exists" });
            profile.Name = request.Name;
        }

        if (request.AvatarUrl != null) profile.AvatarUrl = request.AvatarUrl;
        if (!string.IsNullOrEmpty(request.Pin)) profile.PinHash = BCrypt.Net.BCrypt.HashPassword(request.Pin);
        if (request.RemovePin == true) profile.PinHash = null;

        await _db.SaveChangesAsync();

        return Ok(new ProfileResponse(profile.Id, profile.Name, profile.AvatarUrl, profile.PinHash != null, profile.IsDefault));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = GetUserId();
        var profile = await _db.Profiles.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
        if (profile == null) return NotFound();
        if (profile.IsDefault) return BadRequest(new { error = "Cannot delete the default profile" });

        var count = await _db.Profiles.CountAsync(p => p.UserId == userId);
        if (count <= 1) return BadRequest(new { error = "Cannot delete the last profile" });

        _db.Profiles.Remove(profile);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/select")]
    public async Task<ActionResult<AuthResponse>> Select(Guid id, [FromBody] SelectProfileRequest request)
    {
        var userId = GetUserId();
        var profile = await _db.Profiles
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);

        if (profile == null) return NotFound();

        if (profile.PinHash != null)
        {
            if (string.IsNullOrEmpty(request.Pin) || !BCrypt.Net.BCrypt.Verify(request.Pin, profile.PinHash))
                return Unauthorized(new { error = "Invalid PIN" });
        }

        var user = profile.User;
        var accessToken = _tokenService.GenerateAccessToken(user, profile);
        var refreshToken = _tokenService.GenerateRefreshToken(user.Id);

        _db.RefreshTokens.Add(refreshToken);
        await _db.SaveChangesAsync();

        return Ok(new AuthResponse(
            accessToken,
            refreshToken.Token,
            DateTime.UtcNow.AddMinutes(15),
            new UserResponse(user.Id, user.Username, user.Email, user.Role.ToString(), user.CreatedAt),
            new ProfileResponse(profile.Id, profile.Name, profile.AvatarUrl, profile.PinHash != null, profile.IsDefault),
            null
        ));
    }
}
