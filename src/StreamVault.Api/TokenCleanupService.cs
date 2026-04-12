using Hangfire;
using Microsoft.EntityFrameworkCore;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api;

public class TokenCleanupService
{
    private readonly StreamVaultDbContext _db;

    public TokenCleanupService(StreamVaultDbContext db)
    {
        _db = db;
    }

    [AutomaticRetry(Attempts = 1)]
    public async Task CleanupExpiredRefreshTokens()
    {
        var cutoff = DateTime.UtcNow;
        var expired = await _db.RefreshTokens
            .Where(rt => rt.ExpiresAt < cutoff || rt.IsRevoked)
            .Where(rt => rt.UpdatedAt < cutoff.AddDays(-7))
            .ToListAsync();
        _db.RefreshTokens.RemoveRange(expired);
        await _db.SaveChangesAsync();
    }

    [AutomaticRetry(Attempts = 1)]
    public async Task CleanupExpiredDeviceCodes()
    {
        var cutoff = DateTime.UtcNow;
        var expired = await _db.DeviceCodes
            .Where(dc => dc.ExpiresAt < cutoff)
            .ToListAsync();
        _db.DeviceCodes.RemoveRange(expired);
        await _db.SaveChangesAsync();
    }
}
