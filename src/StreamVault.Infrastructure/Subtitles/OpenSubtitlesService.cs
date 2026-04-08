using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StreamVault.Core.Configuration;
using StreamVault.Core.Entities;
using StreamVault.Core.Enums;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Infrastructure.Subtitles;

public class OpenSubtitlesService : ISubtitleService
{
    private readonly IDbContextFactory<StreamVaultDbContext> _dbFactory;
    private readonly IS3StorageService _s3;
    private readonly IHttpClientFactory _httpFactory;
    private readonly OpenSubtitlesSettings _settings;
    private readonly ILogger<OpenSubtitlesService> _logger;

    private const string BaseUrl = "https://api.opensubtitles.com/api/v1";

    public OpenSubtitlesService(
        IDbContextFactory<StreamVaultDbContext> dbFactory,
        IS3StorageService s3,
        IHttpClientFactory httpFactory,
        IOptions<StreamVaultSettings> settings,
        ILogger<OpenSubtitlesService> logger)
    {
        _dbFactory = dbFactory;
        _s3 = s3;
        _httpFactory = httpFactory;
        _settings = settings.Value.OpenSubtitles;
        _logger = logger;
    }

    private HttpClient CreateClient()
    {
        var client = _httpFactory.CreateClient("OpenSubtitles");
        client.BaseAddress = new Uri(BaseUrl);
        client.DefaultRequestHeaders.Add("Api-Key", _settings.ApiKey);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return client;
    }

    public async Task<IReadOnlyList<SubtitleSearchResult>> SearchSubtitlesAsync(
        string? imdbId, string? fileHash, string language, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(_settings.ApiKey)) return [];

        using var client = CreateClient();
        var queryParams = new List<string> { $"languages={language}" };
        if (!string.IsNullOrEmpty(imdbId)) queryParams.Add($"imdb_id={imdbId}");
        if (!string.IsNullOrEmpty(fileHash)) queryParams.Add($"moviehash={fileHash}");

        var response = await client.GetAsync($"/subtitles?{string.Join("&", queryParams)}", ct);
        if (!response.IsSuccessStatusCode) return [];

        var result = await response.Content.ReadFromJsonAsync<OpenSubtitlesSearchResponse>(ct);
        if (result?.Data == null) return [];

        return result.Data.Select(d => new SubtitleSearchResult(
            d.Id,
            d.Attributes?.Language ?? language,
            d.Attributes?.FeatureDetails?.FeatureTitle ?? "Unknown",
            d.Attributes?.Files?.FirstOrDefault()?.FileId.ToString() ?? "",
            d.Attributes?.Ratings
        )).ToList();
    }

    public async Task DownloadSubtitleAsync(string fileId, Guid mediaFileId, string language, CancellationToken ct = default)
    {
        using var client = CreateClient();

        // Request download link
        var downloadResponse = await client.PostAsJsonAsync("/download", new { file_id = int.Parse(fileId) }, ct);
        if (!downloadResponse.IsSuccessStatusCode) return;

        var downloadResult = await downloadResponse.Content.ReadFromJsonAsync<OpenSubtitlesDownloadResponse>(ct);
        if (string.IsNullOrEmpty(downloadResult?.Link)) return;

        // Download the subtitle file
        using var subtitleClient = _httpFactory.CreateClient();
        var subtitleContent = await subtitleClient.GetStringAsync(downloadResult.Link, ct);

        // Save locally and convert to VTT
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var mediaFile = await db.MediaFiles.FindAsync([mediaFileId], ct);
        if (mediaFile == null) return;

        var subtitle = new Subtitle
        {
            MediaFileId = mediaFileId,
            Language = language,
            Format = SubtitleFormat.Srt,
            IsExternal = true,
            IsForced = false,
            S3Key = $"{Path.GetDirectoryName(mediaFile.S3Key)?.Replace('\\', '/')}/{Path.GetFileNameWithoutExtension(mediaFile.S3Key)}.{language}.srt"
        };

        db.Subtitles.Add(subtitle);
        await db.SaveChangesAsync(ct);

        _logger.LogInformation("Downloaded subtitle {Language} for media file {MediaFileId}", language, mediaFileId);
    }

    public async Task AutoFetchSubtitlesAsync(Guid mediaFileId, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(_settings.ApiKey)) return;

        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var mediaFile = await db.MediaFiles
            .Include(mf => mf.Subtitles)
            .Include(mf => mf.MediaItem)
            .ThenInclude(mi => mi!.ExternalIds)
            .FirstOrDefaultAsync(mf => mf.Id == mediaFileId, ct);

        if (mediaFile == null) return;

        var imdbId = mediaFile.MediaItem?.ExternalIds
            .FirstOrDefault(e => e.Provider == ExternalIdProvider.Imdb)?.ExternalKey;

        foreach (var lang in _settings.PreferredLanguages)
        {
            if (mediaFile.Subtitles.Any(s => s.Language == lang)) continue;

            var results = await SearchSubtitlesAsync(imdbId, null, lang, ct);
            if (results.Count > 0)
            {
                await DownloadSubtitleAsync(results[0].DownloadUrl, mediaFileId, lang, ct);
            }
        }
    }
}

// OpenSubtitles API response models
internal class OpenSubtitlesSearchResponse
{
    public List<OpenSubtitlesData>? Data { get; set; }
}

internal class OpenSubtitlesData
{
    public string Id { get; set; } = "";
    public OpenSubtitlesAttributes? Attributes { get; set; }
}

internal class OpenSubtitlesAttributes
{
    public string? Language { get; set; }
    public double? Ratings { get; set; }
    public OpenSubtitlesFeatureDetails? FeatureDetails { get; set; }
    public List<OpenSubtitlesFile>? Files { get; set; }
}

internal class OpenSubtitlesFeatureDetails
{
    public string? FeatureTitle { get; set; }
}

internal class OpenSubtitlesFile
{
    public int FileId { get; set; }
    public string? FileName { get; set; }
}

internal class OpenSubtitlesDownloadResponse
{
    public string? Link { get; set; }
}
