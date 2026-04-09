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
    builder.Services.AddDataProtection()
        .PersistKeysToDbContext<StreamVaultDbContext>()
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

            // Support JWT in SignalR query string
            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = context =>
                {
                    var accessToken = context.Request.Query["access_token"];
                    var path = context.HttpContext.Request.Path;
                    if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
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
