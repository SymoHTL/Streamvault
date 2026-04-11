using System.Text;
using Hangfire;
using Hangfire.InMemory;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using StreamVault.Api.Hubs;
using StreamVault.Api.Middleware;
using StreamVault.Core.Configuration;
using StreamVault.Infrastructure;
using StreamVault.Infrastructure.Data;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // Serilog
    builder.Host.UseSerilog((context, services, config) => config
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .WriteTo.Console()
        .WriteTo.File(
            Path.Combine(context.Configuration.GetValue<string>("DataDirectory") ?? "/data", "logs", "streamvault-.log"),
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 14));

    // Configuration
    var settings = builder.Configuration.Get<StreamVaultSettings>() ?? new StreamVaultSettings();
    builder.Services.Configure<StreamVaultSettings>(builder.Configuration);

    // Infrastructure (EF Core, S3, services)
    builder.Services.AddInfrastructure(builder.Configuration);

    // Data Protection (encrypts S3 secrets at rest)
    var keysDir = Path.Combine(settings.DataDirectory, "keys");
    Directory.CreateDirectory(keysDir);
    builder.Services.AddDataProtection()
        .PersistKeysToFileSystem(new DirectoryInfo(keysDir))
        .SetApplicationName("StreamVault");

    // Authentication
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = settings.Jwt.Issuer,
                ValidAudience = settings.Jwt.Audience,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
                    settings.Jwt.Secret.Length >= 32 ? settings.Jwt.Secret : settings.Jwt.Secret.PadRight(32, '!')))
            };

            // Support JWT in SignalR and stream proxy query string
            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = context =>
                {
                    var accessToken = context.Request.Query["access_token"];
                    var path = context.HttpContext.Request.Path;
                    if (!string.IsNullOrEmpty(accessToken) &&
                        (path.StartsWithSegments("/hubs") || path.Value?.Contains("/api/stream") == true))
                    {
                        context.Token = accessToken;
                    }
                    return Task.CompletedTask;
                }
            };
        });

    builder.Services.AddAuthorization();

    // Controllers
    builder.Services.AddControllers();

    // OpenAPI
    builder.Services.AddOpenApi();

    // SignalR
    builder.Services.AddSignalR();

    // Hangfire
    builder.Services.AddHangfire(config => config
        .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
        .UseSimpleAssemblyNameTypeSerializer()
        .UseRecommendedSerializerSettings()
        .UseInMemoryStorage());
    builder.Services.AddHangfireServer(options =>
    {
        options.WorkerCount = 2;
    });

    // Redis caching
    var redisUrl = builder.Configuration.GetValue<string>("Redis:ConnectionString");
    if (!string.IsNullOrEmpty(redisUrl))
    {
        builder.Services.AddStackExchangeRedisCache(options =>
        {
            options.Configuration = redisUrl;
            options.InstanceName = "StreamVault:";
        });
    }
    else
    {
        builder.Services.AddDistributedMemoryCache();
    }

    // CORS
    builder.Services.AddCors(options =>
    {
        options.AddDefaultPolicy(policy =>
        {
            policy.WithOrigins(settings.CorsOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
        });
    });

    // Health checks
    builder.Services.AddHealthChecks()
        .AddDbContextCheck<StreamVaultDbContext>("database");

    var app = builder.Build();

    // Apply migrations
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<StreamVaultDbContext>();
        await db.Database.EnsureCreatedAsync();

        // Add tables for new features (Lists, Collections) to existing databases
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS UserMediaLists (
                Id TEXT NOT NULL PRIMARY KEY,
                UserId TEXT NOT NULL,
                MediaItemId TEXT NOT NULL,
                Status INTEGER NOT NULL DEFAULT 0,
                Rating INTEGER NULL,
                Notes TEXT NULL,
                CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (UserId) REFERENCES Users(Id),
                FOREIGN KEY (MediaItemId) REFERENCES MediaItems(Id)
            );
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE UNIQUE INDEX IF NOT EXISTS IX_UserMediaLists_UserId_MediaItemId
            ON UserMediaLists (UserId, MediaItemId);
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS Collections (
                Id TEXT NOT NULL PRIMARY KEY,
                Name TEXT NOT NULL,
                Description TEXT NULL,
                PosterUrl TEXT NULL,
                BackdropUrl TEXT NULL,
                SortOrder INTEGER NOT NULL DEFAULT 0,
                TmdbCollectionId INTEGER NULL,
                CreatedByUserId TEXT NULL,
                CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (CreatedByUserId) REFERENCES Users(Id)
            );
            """);
        // Migrate existing Collections table: make CreatedByUserId nullable, add TmdbCollectionId
        try
        {
            await db.Database.ExecuteSqlRawAsync(
                "ALTER TABLE Collections ADD COLUMN TmdbCollectionId INTEGER NULL;");
        }
        catch { /* Column already exists */ }
        // SQLite can't ALTER NOT NULL -> NULL, so rebuild the table if needed
        {
            var hasNotNull = await db.Database.SqlQueryRaw<int>(
                "SELECT COUNT(*) AS \"Value\" FROM pragma_table_info('Collections') WHERE name='CreatedByUserId' AND \"notnull\"=1"
            ).FirstOrDefaultAsync();
            if (hasNotNull > 0)
            {
                await db.Database.ExecuteSqlRawAsync("""
                    CREATE TABLE Collections_new (
                        Id TEXT NOT NULL PRIMARY KEY,
                        Name TEXT NOT NULL,
                        Description TEXT NULL,
                        PosterUrl TEXT NULL,
                        BackdropUrl TEXT NULL,
                        SortOrder INTEGER NOT NULL DEFAULT 0,
                        TmdbCollectionId INTEGER NULL,
                        CreatedByUserId TEXT NULL,
                        CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                        UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                        FOREIGN KEY (CreatedByUserId) REFERENCES Users(Id)
                    );
                    """);
                await db.Database.ExecuteSqlRawAsync("""
                    INSERT INTO Collections_new (Id, Name, Description, PosterUrl, BackdropUrl, SortOrder, TmdbCollectionId, CreatedByUserId, CreatedAt, UpdatedAt)
                    SELECT Id, Name, Description, PosterUrl, BackdropUrl, SortOrder, TmdbCollectionId, CreatedByUserId, CreatedAt, UpdatedAt
                    FROM Collections;
                    """);
                await db.Database.ExecuteSqlRawAsync("DROP TABLE Collections;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE Collections_new RENAME TO Collections;");
            }
        }
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS CollectionItems (
                Id TEXT NOT NULL PRIMARY KEY,
                CollectionId TEXT NOT NULL,
                MediaItemId TEXT NOT NULL,
                SortOrder INTEGER NOT NULL DEFAULT 0,
                CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (CollectionId) REFERENCES Collections(Id) ON DELETE CASCADE,
                FOREIGN KEY (MediaItemId) REFERENCES MediaItems(Id)
            );
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE UNIQUE INDEX IF NOT EXISTS IX_CollectionItems_CollectionId_MediaItemId
            ON CollectionItems (CollectionId, MediaItemId);
            """);

        // AudioTracks table for audio track switching
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS AudioTracks (
                Id TEXT NOT NULL PRIMARY KEY,
                StreamIndex INTEGER NOT NULL,
                Language TEXT NOT NULL DEFAULT 'und',
                Title TEXT NULL,
                Codec TEXT NOT NULL DEFAULT '',
                Channels INTEGER NOT NULL DEFAULT 2,
                MediaFileId TEXT NOT NULL,
                CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (MediaFileId) REFERENCES MediaFiles(Id) ON DELETE CASCADE
            );
            """);

    }

    // Middleware pipeline
    app.UseMiddleware<ExceptionHandlingMiddleware>();

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
    }

    app.UseSerilogRequestLogging();
    app.UseCors();

    // Serve SPA static files (production)
    app.UseDefaultFiles();
    app.UseStaticFiles();

    app.UseAuthentication();
    app.UseAuthorization();

    app.MapControllers();
    app.MapHub<NotificationHub>("/hubs/notifications");
    app.MapHealthChecks("/health");
    app.MapHangfireDashboard("/admin/jobs");

    // SPA fallback — return index.html for unmatched routes
    app.MapFallbackToFile("index.html");

    Log.Information("StreamVault starting on {Urls}", string.Join(", ", app.Urls));
    await app.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "StreamVault terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}
