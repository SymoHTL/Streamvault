using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Core.Entities;
using StreamVault.Core.Enums;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
public class SetupController : BaseController
{
    private readonly StreamVaultDbContext _db;
    private readonly ITokenService _tokenService;
    private readonly IDataProtector _protector;

    public SetupController(StreamVaultDbContext db, ITokenService tokenService, IDataProtectionProvider protectionProvider)
    {
        _db = db;
        _tokenService = tokenService;
        _protector = protectionProvider.CreateProtector("S3Credentials");
    }

    [HttpGet("status")]
    public async Task<ActionResult<SetupStatusResponse>> GetStatus()
    {
        var hasAdmin = await _db.Users.AnyAsync(u => u.Role == UserRole.Admin);
        return Ok(new SetupStatusResponse(!hasAdmin));
    }

    [HttpPost("complete")]
    public async Task<ActionResult<AuthResponse>> Complete([FromBody] SetupRequest request)
    {
        if (await _db.Users.AnyAsync(u => u.Role == UserRole.Admin))
            return BadRequest(new { error = "Setup has already been completed" });

        // Create admin user
        var admin = new User
        {
            Username = request.AdminUsername,
            Email = request.AdminEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.AdminPassword),
            Role = UserRole.Admin
        };
        _db.Users.Add(admin);

        // Create S3 connection
        var s3Conn = new S3Connection
        {
            Name = request.S3Connection.Name,
            Endpoint = request.S3Connection.Endpoint,
            Bucket = request.S3Connection.Bucket,
            AccessKey = request.S3Connection.AccessKey,
            SecretKeyEncrypted = _protector.Protect(request.S3Connection.SecretKey),
            Region = request.S3Connection.Region,
            ForcePathStyle = request.S3Connection.ForcePathStyle
        };
        _db.S3Connections.Add(s3Conn);

        // Create initial library
        if (!Enum.TryParse<MediaType>(request.InitialLibrary.Type, true, out var mediaType))
            mediaType = MediaType.Movie;

        var library = new Library
        {
            Name = request.InitialLibrary.Name,
            Type = mediaType,
            S3ConnectionId = s3Conn.Id,
            S3Prefix = request.InitialLibrary.S3Prefix ?? "",
            ScanScheduleCron = request.InitialLibrary.ScanScheduleCron
        };
        _db.Libraries.Add(library);

        // Create default profile for admin
        var defaultProfile = new Profile
        {
            Name = admin.Username,
            IsDefault = true,
            UserId = admin.Id
        };
        _db.Profiles.Add(defaultProfile);

        await _db.SaveChangesAsync();

        // Generate tokens and return auth response
        var accessToken = _tokenService.GenerateAccessToken(admin);
        var refreshToken = _tokenService.GenerateRefreshToken(admin.Id);
        _db.RefreshTokens.Add(refreshToken);
        await _db.SaveChangesAsync();

        var profileResponse = new ProfileResponse(defaultProfile.Id, defaultProfile.Name, defaultProfile.AvatarUrl, false, defaultProfile.IsDefault);

        return Ok(new AuthResponse(
            accessToken,
            refreshToken.Token,
            DateTime.UtcNow.AddMinutes(15),
            new UserResponse(admin.Id, admin.Username, admin.Email, admin.Role.ToString(), admin.CreatedAt),
            profileResponse,
            new List<ProfileResponse> { profileResponse }
        ));
    }
}
