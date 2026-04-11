using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using StreamVault.Core.Configuration;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Auth;
using StreamVault.Infrastructure.Data;
using StreamVault.Infrastructure.MediaProbe;
using StreamVault.Infrastructure.Metadata;
using StreamVault.Infrastructure.S3;
using StreamVault.Infrastructure.Scanner;
using StreamVault.Infrastructure.Subtitles;
using StreamVault.Infrastructure.Transcoding;

namespace StreamVault.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var settings = configuration.Get<StreamVaultSettings>() ?? new StreamVaultSettings();

        // Database
        var dbPath = Path.Combine(settings.DataDirectory, "streamvault.db");
        var dbDir = Path.GetDirectoryName(dbPath);
        if (!string.IsNullOrEmpty(dbDir)) Directory.CreateDirectory(dbDir);

        services.AddDbContextFactory<StreamVaultDbContext>(options =>
            options.UseSqlite($"Data Source={dbPath}"));

        // Services
        services.AddSingleton<IS3StorageService, S3StorageService>();
        services.AddScoped<ILibraryScanner, LibraryScannerService>();
        services.AddScoped<ITmdbService, TmdbService>();
        services.AddScoped<ISubtitleService, OpenSubtitlesService>();
        services.AddSingleton<ITranscodeService, TranscodeService>();
        services.AddScoped<IMediaProbeService, MediaProbeService>();
        services.AddScoped<ITokenService, TokenService>();

        // HttpClient for OpenSubtitles
        services.AddHttpClient("OpenSubtitles");

        return services;
    }
}
