using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Core.Entities;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;
using StreamVault.Infrastructure.S3;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class AdminController : BaseController
{
    private readonly StreamVaultDbContext _db;
    private readonly IS3StorageService _s3;
    private readonly ITranscodeService _transcode;
    private readonly IDataProtector _protector;

    public AdminController(StreamVaultDbContext db, IS3StorageService s3, ITranscodeService transcode, IDataProtectionProvider protectionProvider)
    {
        _db = db;
        _s3 = s3;
        _transcode = transcode;
        _protector = protectionProvider.CreateProtector("S3Credentials");
    }

    [HttpGet("dashboard")]
    public async Task<ActionResult<DashboardResponse>> Dashboard()
    {
        var activeSessions = _transcode.GetActiveSessions();
        var totalLibraries = await _db.Libraries.CountAsync();
        var totalMediaItems = await _db.MediaItems.CountAsync();
        var totalUsers = await _db.Users.CountAsync();

        return Ok(new DashboardResponse(
            activeSessions.Count,
            totalLibraries,
            totalMediaItems,
            totalUsers,
            []
        ));
    }

    // S3 Connections CRUD
    [HttpGet("s3-connections")]
    public async Task<ActionResult<IReadOnlyList<S3ConnectionResponse>>> GetS3Connections()
    {
        var connections = await _db.S3Connections
            .Select(c => new S3ConnectionResponse(
                c.Id, c.Name, c.Endpoint, c.Bucket, c.Region, c.ForcePathStyle, c.CreatedAt
            ))
            .ToListAsync();
        return Ok(connections);
    }

    [HttpGet("s3-connections/{id:guid}")]
    public async Task<ActionResult<S3ConnectionResponse>> GetS3Connection(Guid id)
    {
        var c = await _db.S3Connections.FindAsync(id);
        if (c == null) return NotFound();
        return Ok(new S3ConnectionResponse(c.Id, c.Name, c.Endpoint, c.Bucket, c.Region, c.ForcePathStyle, c.CreatedAt));
    }

    [HttpPost("s3-connections")]
    public async Task<ActionResult<S3ConnectionResponse>> CreateS3Connection([FromBody] S3ConnectionRequest request)
    {
        var connection = new S3Connection
        {
            Name = request.Name,
            Endpoint = request.Endpoint,
            Bucket = request.Bucket,
            AccessKey = request.AccessKey,
            SecretKeyEncrypted = _protector.Protect(request.SecretKey),
            Region = request.Region,
            ForcePathStyle = request.ForcePathStyle
        };

        _db.S3Connections.Add(connection);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetS3Connection), new { id = connection.Id },
            new S3ConnectionResponse(connection.Id, connection.Name, connection.Endpoint,
                connection.Bucket, connection.Region, connection.ForcePathStyle, connection.CreatedAt));
    }

    [HttpPut("s3-connections/{id:guid}")]
    public async Task<ActionResult<S3ConnectionResponse>> UpdateS3Connection(Guid id, [FromBody] S3ConnectionUpdateRequest request)
    {
        var connection = await _db.S3Connections.FindAsync(id);
        if (connection == null) return NotFound();

        connection.Name = request.Name;
        connection.Endpoint = request.Endpoint;
        connection.Bucket = request.Bucket;
        connection.AccessKey = request.AccessKey;
        connection.Region = request.Region;
        connection.ForcePathStyle = request.ForcePathStyle;

        if (!string.IsNullOrEmpty(request.SecretKey))
            connection.SecretKeyEncrypted = _protector.Protect(request.SecretKey);

        await _db.SaveChangesAsync();

        // Invalidate the cached S3 client so it picks up the new credentials
        if (_s3 is S3StorageService s3Service)
            s3Service.InvalidateClient(id);

        return Ok(new S3ConnectionResponse(connection.Id, connection.Name, connection.Endpoint,
            connection.Bucket, connection.Region, connection.ForcePathStyle, connection.CreatedAt));
    }

    [HttpDelete("s3-connections/{id:guid}")]
    public async Task<IActionResult> DeleteS3Connection(Guid id, [FromQuery] bool force = false)
    {
        var connection = await _db.S3Connections.FindAsync(id);
        if (connection == null) return NotFound();

        var libraries = await _db.Libraries.Where(l => l.S3ConnectionId == id).ToListAsync();
        if (libraries.Count > 0 && !force)
            return BadRequest(new { error = "Cannot delete S3 connection that is in use by libraries. Use force delete to remove libraries as well." });

        if (libraries.Count > 0)
            _db.Libraries.RemoveRange(libraries);

        _db.S3Connections.Remove(connection);
        await _db.SaveChangesAsync();

        if (_s3 is S3StorageService s3Service)
            s3Service.InvalidateClient(id);

        return NoContent();
    }

    [HttpPost("s3-connections/{id:guid}/test")]
    public async Task<IActionResult> TestS3Connection(Guid id)
    {
        var success = await _s3.TestConnectionAsync(id);
        return success ? Ok(new { status = "connected" }) : BadRequest(new { status = "failed" });
    }

    // Transcode profiles
    [HttpGet("transcode-profiles")]
    public async Task<IActionResult> GetTranscodeProfiles()
    {
        var profiles = await _db.TranscodeProfiles.OrderBy(p => p.MaxHeight).ToListAsync();
        return Ok(profiles);
    }
}
