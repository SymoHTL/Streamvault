using StreamVault.Core.Entities;

namespace StreamVault.Core.Interfaces;

public interface ITmdbService
{
    Task<TmdbSearchResult?> SearchMovieAsync(string title, int? year, CancellationToken ct = default);
    Task<TmdbSearchResult?> SearchTvShowAsync(string title, int? year, CancellationToken ct = default);
    Task<IReadOnlyList<TmdbSearchResult>> SearchMultiAsync(string query, CancellationToken ct = default);
    Task ApplyMetadataAsync(Guid mediaItemId, int tmdbId, bool isMovie, CancellationToken ct = default);
    Task SearchAndApplyAsync(Guid mediaItemId, string title, int? year, bool isMovie, CancellationToken ct = default);
}

public record TmdbSearchResult(
    int TmdbId,
    string Title,
    string? Overview,
    int? Year,
    double? Rating,
    string? PosterPath,
    string? BackdropPath
);
