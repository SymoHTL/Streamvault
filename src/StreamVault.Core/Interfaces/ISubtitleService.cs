namespace StreamVault.Core.Interfaces;

public interface ISubtitleService
{
    Task<IReadOnlyList<SubtitleSearchResult>> SearchSubtitlesAsync(
        string? imdbId, string? fileHash, string language, CancellationToken ct = default);
    Task DownloadSubtitleAsync(string downloadUrl, Guid mediaFileId, string language, CancellationToken ct = default);
    Task AutoFetchSubtitlesAsync(Guid mediaFileId, CancellationToken ct = default);
}

public record SubtitleSearchResult(
    string Id,
    string Language,
    string FileName,
    string DownloadUrl,
    double? Rating
);
