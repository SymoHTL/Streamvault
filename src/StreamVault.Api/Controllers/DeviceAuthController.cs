using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Core.Entities;
using StreamVault.Core.Enums;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/auth/device-code")]
public class DeviceAuthController : BaseController
{
    private readonly StreamVaultDbContext _db;
    private readonly ITokenService _tokenService;
    private readonly IConfiguration _config;

    public DeviceAuthController(StreamVaultDbContext db, ITokenService tokenService, IConfiguration config)
    {
        _db = db;
        _tokenService = tokenService;
        _config = config;
    }

    /// <summary>
    /// TV calls this to get a device code + QR URL to display.
    /// </summary>
    [HttpPost]
    [AllowAnonymous]
    public async Task<ActionResult<DeviceCodeResponse>> Create()
    {
        var deviceCode = GenerateSecureCode(32);
        var userCode = GenerateUserCode(6);

        var entity = new DeviceCode
        {
            Code = deviceCode,
            UserCode = userCode,
            Status = DeviceCodeStatus.Pending,
            ExpiresAt = DateTime.UtcNow.AddMinutes(10)
        };

        _db.DeviceCodes.Add(entity);
        await _db.SaveChangesAsync();

        // Build QR URL — the phone user will be directed here
        var baseUrl = _config.GetValue<string>("BaseUrl")
                      ?? $"{Request.Scheme}://{Request.Host}";
        var qrUrl = $"{baseUrl}/auth/device?code={userCode}";

        return Ok(new DeviceCodeResponse(
            deviceCode,
            userCode,
            qrUrl,
            ExpiresIn: 600, // 10 minutes
            PollInterval: 5
        ));
    }

    /// <summary>
    /// TV polls this to check if the user has authorized the device code.
    /// </summary>
    [HttpPost("poll")]
    [AllowAnonymous]
    public async Task<ActionResult<DeviceCodePollResponse>> Poll([FromBody] DeviceCodePollRequest request)
    {
        var dc = await _db.DeviceCodes
            .Include(d => d.User)
                .ThenInclude(u => u!.Profiles)
            .FirstOrDefaultAsync(d => d.Code == request.DeviceCode);

        if (dc == null)
            return NotFound(new { error = "Invalid device code" });

        if (dc.ExpiresAt < DateTime.UtcNow)
        {
            dc.Status = DeviceCodeStatus.Expired;
            await _db.SaveChangesAsync();
            return Ok(new DeviceCodePollResponse("expired", null));
        }

        if (dc.Status == DeviceCodeStatus.Denied)
            return Ok(new DeviceCodePollResponse("denied", null));

        if (dc.Status == DeviceCodeStatus.Authorized && dc.User != null)
        {
            // Generate tokens for the TV
            var accessToken = _tokenService.GenerateAccessToken(dc.User);
            var refreshToken = _tokenService.GenerateRefreshToken(dc.User.Id);
            _db.RefreshTokens.Add(refreshToken);

            // Clean up the device code
            _db.DeviceCodes.Remove(dc);
            await _db.SaveChangesAsync();

            var profiles = dc.User.Profiles
                .OrderBy(p => p.CreatedAt)
                .Select(p => new ProfileResponse(p.Id, p.Name, p.AvatarUrl, p.PinHash != null, p.IsDefault))
                .ToList();

            var auth = new AuthResponse(
                accessToken,
                refreshToken.Token,
                DateTime.UtcNow.AddMinutes(15),
                new UserResponse(dc.User.Id, dc.User.Username, dc.User.Email, dc.User.Role.ToString(), dc.User.CreatedAt),
                null,
                profiles
            );

            return Ok(new DeviceCodePollResponse("authorized", auth));
        }

        return Ok(new DeviceCodePollResponse("pending", null));
    }

    /// <summary>
    /// Phone user calls this to authorize the device code after logging in.
    /// </summary>
    [HttpPost("authorize")]
    [Authorize]
    public async Task<IActionResult> Authorize([FromBody] DeviceCodeAuthorizeRequest request)
    {
        var dc = await _db.DeviceCodes
            .FirstOrDefaultAsync(d => d.UserCode == request.UserCode && d.Status == DeviceCodeStatus.Pending);

        if (dc == null)
            return NotFound(new { error = "Invalid or expired code" });

        if (dc.ExpiresAt < DateTime.UtcNow)
        {
            dc.Status = DeviceCodeStatus.Expired;
            await _db.SaveChangesAsync();
            return BadRequest(new { error = "Code has expired" });
        }

        var userId = GetUserId();
        dc.UserId = userId;
        dc.Status = DeviceCodeStatus.Authorized;
        await _db.SaveChangesAsync();

        return Ok(new { status = "authorized" });
    }

    private static string GenerateSecureCode(int length)
    {
        var bytes = new byte[length];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes)
            .Replace("+", "")
            .Replace("/", "")
            .Replace("=", "")[..length];
    }

    private static string GenerateUserCode(int length)
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1 for readability
        var bytes = new byte[length];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return new string(bytes.Select(b => chars[b % chars.Length]).ToArray());
    }
}
