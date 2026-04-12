using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Core.Entities;
using StreamVault.Core.Enums;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
[Authorize]
public class UsersController : BaseController
{
    private readonly StreamVaultDbContext _db;

    public UsersController(StreamVaultDbContext db) => _db = db;

    [HttpGet]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IReadOnlyList<UserResponse>>> GetAll()
    {
        var users = await _db.Users
            .Select(u => new UserResponse(u.Id, u.Username, u.Email, u.Role.ToString(), u.CreatedAt))
            .ToListAsync();
        return Ok(users);
    }

    [HttpGet("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<UserResponse>> GetById(Guid id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound();
        return Ok(new UserResponse(user.Id, user.Username, user.Email, user.Role.ToString(), user.CreatedAt));
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<UserResponse>> Create([FromBody] CreateUserRequest request)
    {
        if (await _db.Users.AnyAsync(u => u.Username == request.Username))
            return Conflict(new { error = "Username already exists" });
        if (await _db.Users.AnyAsync(u => u.Email == request.Email))
            return Conflict(new { error = "Email already exists" });

        var user = new User
        {
            Username = request.Username,
            Email = request.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Role = Enum.TryParse<UserRole>(request.Role, true, out var role) ? role : UserRole.User
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = user.Id },
            new UserResponse(user.Id, user.Username, user.Email, user.Role.ToString(), user.CreatedAt));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<UserResponse>> Update(Guid id, [FromBody] UpdateUserRequest request)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound();

        if (request.Username != null) user.Username = request.Username;
        if (request.Email != null) user.Email = request.Email;
        if (request.Password != null) user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        if (request.Role != null && Enum.TryParse<UserRole>(request.Role, true, out var role)) user.Role = role;

        await _db.SaveChangesAsync();
        return Ok(new UserResponse(user.Id, user.Username, user.Email, user.Role.ToString(), user.CreatedAt));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound();

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("me")]
    public async Task<ActionResult<UserResponse>> GetMe()
    {
        var user = await _db.Users.FindAsync(GetUserId());
        if (user == null) return NotFound();
        return Ok(new UserResponse(user.Id, user.Username, user.Email, user.Role.ToString(), user.CreatedAt));
    }

    [HttpPut("me")]
    public async Task<ActionResult<UserResponse>> UpdateMe([FromBody] UpdateAccountRequest request)
    {
        var user = await _db.Users.FindAsync(GetUserId());
        if (user == null) return NotFound();

        if (request.Email != null) user.Email = request.Email;
        if (request.Password != null) user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        if (request.PreferencesJson != null) user.PreferencesJson = request.PreferencesJson;

        await _db.SaveChangesAsync();
        return Ok(new UserResponse(user.Id, user.Username, user.Email, user.Role.ToString(), user.CreatedAt));
    }
}
