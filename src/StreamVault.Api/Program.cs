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
using StreamVault.Core.Interfaces;
using StreamVault.Api;
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
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE UNIQUE INDEX IF NOT EXISTS IX_UserMediaLists_UserId_MediaItemId
                ON UserMediaLists (UserId, MediaItemId);
                """);
        }
        catch { /* Column may not exist on fresh databases with ProfileId schema */ }
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

        // --- Profile system migration: multi-profile support ---
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS Profiles (
                Id TEXT NOT NULL PRIMARY KEY,
                Name TEXT NOT NULL,
                AvatarUrl TEXT NULL,
                PinHash TEXT NULL,
                IsDefault INTEGER NOT NULL DEFAULT 0,
                UserId TEXT NOT NULL,
                CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE
            );
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE UNIQUE INDEX IF NOT EXISTS IX_Profiles_UserId_Name
            ON Profiles (UserId, Name);
            """);

        // Create a default profile for each user that doesn't have one yet
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO Profiles (Id, Name, IsDefault, UserId, CreatedAt, UpdatedAt)
            SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
                   substr(hex(randomblob(2)),2) || '-' ||
                   substr('89ab', abs(random()) % 4 + 1, 1) ||
                   substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
                   Username, 1, Id, datetime('now'), datetime('now')
            FROM Users
            WHERE Id NOT IN (SELECT UserId FROM Profiles);
            """);

        // Migrate WatchProgresses: UserId → ProfileId
        {
            var hasUserId = await db.Database.SqlQueryRaw<int>(
                "SELECT COUNT(*) AS \"Value\" FROM pragma_table_info('WatchProgresses') WHERE name='UserId'"
            ).FirstOrDefaultAsync();
            if (hasUserId > 0)
            {
                try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE WatchProgresses ADD COLUMN ProfileId TEXT NULL;"); } catch { }
                await db.Database.ExecuteSqlRawAsync("""
                    UPDATE WatchProgresses SET ProfileId = (
                        SELECT p.Id FROM Profiles p WHERE p.UserId = WatchProgresses.UserId AND p.IsDefault = 1
                    ) WHERE ProfileId IS NULL;
                    """);
                await db.Database.ExecuteSqlRawAsync("""
                    CREATE TABLE WatchProgresses_new (
                        Id TEXT NOT NULL PRIMARY KEY,
                        ProfileId TEXT NOT NULL,
                        MediaFileId TEXT NOT NULL,
                        PositionTicks INTEGER NOT NULL DEFAULT 0,
                        Completed INTEGER NOT NULL DEFAULT 0,
                        LastWatchedAt TEXT NOT NULL DEFAULT (datetime('now')),
                        CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                        UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                        FOREIGN KEY (ProfileId) REFERENCES Profiles(Id) ON DELETE CASCADE,
                        FOREIGN KEY (MediaFileId) REFERENCES MediaFiles(Id) ON DELETE CASCADE
                    );
                    """);
                await db.Database.ExecuteSqlRawAsync("""
                    INSERT INTO WatchProgresses_new (Id, ProfileId, MediaFileId, PositionTicks, Completed, LastWatchedAt, CreatedAt, UpdatedAt)
                    SELECT Id, ProfileId, MediaFileId, PositionTicks, Completed, LastWatchedAt, CreatedAt, UpdatedAt
                    FROM WatchProgresses;
                    """);
                await db.Database.ExecuteSqlRawAsync("DROP TABLE WatchProgresses;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE WatchProgresses_new RENAME TO WatchProgresses;");
                await db.Database.ExecuteSqlRawAsync("""
                    CREATE UNIQUE INDEX IF NOT EXISTS IX_WatchProgresses_ProfileId_MediaFileId
                    ON WatchProgresses (ProfileId, MediaFileId);
                    """);
            }
        }

        // Migrate WatchlistItems: UserId → ProfileId
        {
            var hasUserId = await db.Database.SqlQueryRaw<int>(
                "SELECT COUNT(*) AS \"Value\" FROM pragma_table_info('WatchlistItems') WHERE name='UserId'"
            ).FirstOrDefaultAsync();
            if (hasUserId > 0)
            {
                try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE WatchlistItems ADD COLUMN ProfileId TEXT NULL;"); } catch { }
                await db.Database.ExecuteSqlRawAsync("""
                    UPDATE WatchlistItems SET ProfileId = (
                        SELECT p.Id FROM Profiles p WHERE p.UserId = WatchlistItems.UserId AND p.IsDefault = 1
                    ) WHERE ProfileId IS NULL;
                    """);
                await db.Database.ExecuteSqlRawAsync("""
                    CREATE TABLE WatchlistItems_new (
                        Id TEXT NOT NULL PRIMARY KEY,
                        ProfileId TEXT NOT NULL,
                        MediaItemId TEXT NOT NULL,
                        CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                        UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                        FOREIGN KEY (ProfileId) REFERENCES Profiles(Id) ON DELETE CASCADE,
                        FOREIGN KEY (MediaItemId) REFERENCES MediaItems(Id) ON DELETE CASCADE
                    );
                    """);
                await db.Database.ExecuteSqlRawAsync("""
                    INSERT INTO WatchlistItems_new (Id, ProfileId, MediaItemId, CreatedAt, UpdatedAt)
                    SELECT Id, ProfileId, MediaItemId, CreatedAt, UpdatedAt
                    FROM WatchlistItems;
                    """);
                await db.Database.ExecuteSqlRawAsync("DROP TABLE WatchlistItems;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE WatchlistItems_new RENAME TO WatchlistItems;");
                await db.Database.ExecuteSqlRawAsync("""
                    CREATE UNIQUE INDEX IF NOT EXISTS IX_WatchlistItems_ProfileId_MediaItemId
                    ON WatchlistItems (ProfileId, MediaItemId);
                    """);
            }
        }

        // Migrate UserMediaLists: UserId → ProfileId
        {
            var hasUserId = await db.Database.SqlQueryRaw<int>(
                "SELECT COUNT(*) AS \"Value\" FROM pragma_table_info('UserMediaLists') WHERE name='UserId'"
            ).FirstOrDefaultAsync();
            if (hasUserId > 0)
            {
                try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE UserMediaLists ADD COLUMN ProfileId TEXT NULL;"); } catch { }
                await db.Database.ExecuteSqlRawAsync("""
                    UPDATE UserMediaLists SET ProfileId = (
                        SELECT p.Id FROM Profiles p WHERE p.UserId = UserMediaLists.UserId AND p.IsDefault = 1
                    ) WHERE ProfileId IS NULL;
                    """);
                await db.Database.ExecuteSqlRawAsync("""
                    CREATE TABLE UserMediaLists_new (
                        Id TEXT NOT NULL PRIMARY KEY,
                        ProfileId TEXT NOT NULL,
                        MediaItemId TEXT NOT NULL,
                        Status INTEGER NOT NULL DEFAULT 0,
                        Rating INTEGER NULL,
                        Notes TEXT NULL,
                        CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                        UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                        FOREIGN KEY (ProfileId) REFERENCES Profiles(Id) ON DELETE CASCADE,
                        FOREIGN KEY (MediaItemId) REFERENCES MediaItems(Id)
                    );
                    """);
                await db.Database.ExecuteSqlRawAsync("""
                    INSERT INTO UserMediaLists_new (Id, ProfileId, MediaItemId, Status, Rating, Notes, CreatedAt, UpdatedAt)
                    SELECT Id, ProfileId, MediaItemId, Status, Rating, Notes, CreatedAt, UpdatedAt
                    FROM UserMediaLists;
                    """);
                await db.Database.ExecuteSqlRawAsync("DROP TABLE UserMediaLists;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE UserMediaLists_new RENAME TO UserMediaLists;");
                await db.Database.ExecuteSqlRawAsync("""
                    CREATE UNIQUE INDEX IF NOT EXISTS IX_UserMediaLists_ProfileId_MediaItemId
                    ON UserMediaLists (ProfileId, MediaItemId);
                    """);
            }
        }

        // Migrate Collections: CreatedByUserId → CreatedByProfileId
        {
            var hasUserId = await db.Database.SqlQueryRaw<int>(
                "SELECT COUNT(*) AS \"Value\" FROM pragma_table_info('Collections') WHERE name='CreatedByUserId'"
            ).FirstOrDefaultAsync();
            if (hasUserId > 0)
            {
                try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE Collections ADD COLUMN CreatedByProfileId TEXT NULL;"); } catch { }
                await db.Database.ExecuteSqlRawAsync("""
                    UPDATE Collections SET CreatedByProfileId = (
                        SELECT p.Id FROM Profiles p WHERE p.UserId = Collections.CreatedByUserId AND p.IsDefault = 1
                    ) WHERE CreatedByProfileId IS NULL AND CreatedByUserId IS NOT NULL;
                    """);
                await db.Database.ExecuteSqlRawAsync("""
                    CREATE TABLE Collections_v2 (
                        Id TEXT NOT NULL PRIMARY KEY,
                        Name TEXT NOT NULL,
                        Description TEXT NULL,
                        PosterUrl TEXT NULL,
                        BackdropUrl TEXT NULL,
                        SortOrder INTEGER NOT NULL DEFAULT 0,
                        TmdbCollectionId INTEGER NULL,
                        CreatedByProfileId TEXT NULL,
                        CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                        UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                        FOREIGN KEY (CreatedByProfileId) REFERENCES Profiles(Id)
                    );
                    """);
                await db.Database.ExecuteSqlRawAsync("""
                    INSERT INTO Collections_v2 (Id, Name, Description, PosterUrl, BackdropUrl, SortOrder, TmdbCollectionId, CreatedByProfileId, CreatedAt, UpdatedAt)
                    SELECT Id, Name, Description, PosterUrl, BackdropUrl, SortOrder, TmdbCollectionId, CreatedByProfileId, CreatedAt, UpdatedAt
                    FROM Collections;
                    """);
                await db.Database.ExecuteSqlRawAsync("DROP TABLE Collections;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE Collections_v2 RENAME TO Collections;");
            }
        }

        // DeviceCodes table for QR code login
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS DeviceCodes (
                Id TEXT NOT NULL PRIMARY KEY,
                Code TEXT NOT NULL,
                UserCode TEXT NOT NULL,
                Status INTEGER NOT NULL DEFAULT 0,
                ExpiresAt TEXT NOT NULL,
                UserId TEXT NULL,
                CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (UserId) REFERENCES Users(Id)
            );
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE UNIQUE INDEX IF NOT EXISTS IX_DeviceCodes_Code ON DeviceCodes (Code);
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE UNIQUE INDEX IF NOT EXISTS IX_DeviceCodes_UserCode ON DeviceCodes (UserCode);
            """);

        // Profile preferences column
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE Profiles ADD COLUMN PreferencesJson TEXT NULL;"); } catch { }

        // Episode thumbnail (Netflix-style still image)
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE Episodes ADD COLUMN StillUrl TEXT NULL;"); } catch { }

        // Unique indexes that prevent the scanner from creating duplicate rows on retry/race.
        // Wrapped in try/catch because adding a unique index against existing duplicates fails
        // — the scanner now collapses any pre-existing duplicates on next scan, after which
        // these indexes will succeed. Re-attempted on every startup until they take.
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE UNIQUE INDEX IF NOT EXISTS IX_Seasons_MediaItemId_SeasonNumber
                ON Seasons (MediaItemId, SeasonNumber);
                """);
        }
        catch (Exception ex) { Log.Warning(ex, "Could not create Seasons unique index — duplicates remain. Trigger a library rescan to collapse them."); }
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE UNIQUE INDEX IF NOT EXISTS IX_Episodes_SeasonId_EpisodeNumber
                ON Episodes (SeasonId, EpisodeNumber);
                """);
        }
        catch (Exception ex) { Log.Warning(ex, "Could not create Episodes unique index — duplicates remain. Trigger a library rescan to collapse them."); }

        // ChapterInfos table
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS ChapterInfos (
                Id TEXT NOT NULL PRIMARY KEY,
                Title TEXT NULL,
                StartSeconds REAL NOT NULL DEFAULT 0,
                EndSeconds REAL NOT NULL DEFAULT 0,
                ChapterType TEXT NOT NULL DEFAULT 'other',
                MediaFileId TEXT NOT NULL,
                CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (MediaFileId) REFERENCES MediaFiles(Id) ON DELETE CASCADE
            );
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS IX_ChapterInfos_MediaFileId ON ChapterInfos (MediaFileId);
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

    // Recurring cleanup jobs (must be after Hangfire is initialized)
    RecurringJob.AddOrUpdate<TokenCleanupService>("cleanup-expired-refresh-tokens",
        svc => svc.CleanupExpiredRefreshTokens(), Cron.Daily);
    RecurringJob.AddOrUpdate<TokenCleanupService>("cleanup-expired-device-codes",
        svc => svc.CleanupExpiredDeviceCodes(), Cron.Hourly);

    // Recurring library scans — register one job per library using its ScanScheduleCron.
    // Without this, the cron field on Library is dead config; scans only run on manual trigger.
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<StreamVaultDbContext>();
        var libraries = await db.Libraries.ToListAsync();
        foreach (var lib in libraries)
        {
            if (string.IsNullOrWhiteSpace(lib.ScanScheduleCron)) continue;
            var capturedId = lib.Id;
            try
            {
                RecurringJob.AddOrUpdate<ILibraryScanner>(
                    $"scan-library-{capturedId}",
                    s => s.ScanLibraryAsync(capturedId, CancellationToken.None),
                    lib.ScanScheduleCron);
                Log.Information("Scheduled library scan {LibraryName} with cron {Cron}", lib.Name, lib.ScanScheduleCron);
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to schedule library scan for {LibraryName} — invalid cron expression {Cron}",
                    lib.Name, lib.ScanScheduleCron);
            }
        }
    }

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
