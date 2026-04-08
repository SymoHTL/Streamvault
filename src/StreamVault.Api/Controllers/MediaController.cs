using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Core.Enums;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
[Authorize]
public class MediaController : BaseController
{
    private readonly StreamVaultDbContext _db;
    private readonly ITmdbService _tmdb;

    public MediaController(StreamVaultDbContext db, ITmdbService tmdb)
    {
        _db = db;
        _tmdb = tmdb;
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<MediaItemResponse>> GetById(Guid id)
    {
        var userId = GetUserId();
        var item = await _db.MediaItems
            .Include(m => m.MediaFiles).ThenInclude(mf => mf.Subtitles)
            .Include(m => m.MediaGenres).ThenInclude(mg => mg.Genre)
            .Include(m => m.MediaPersons).ThenInclude(mp => mp.Person)
            .Include(m => m.Images)
            .Include(m => m.ExternalIds)
            .FirstOrDefaultAsync(m => m.Id == id);

        if (item == null) return NotFound();

        var isInWatchlist = await _db.WatchlistItems
            .AnyAsync(wi => wi.UserId == userId && wi.MediaItemId == id);

        return Ok(new MediaItemResponse(
            item.Id, item.Title, item.SortTitle, item.Year, item.Overview,
            item.CommunityRating, item.RuntimeMinutes, item.MediaType.ToString(), item.AddedAt, item.LibraryId,
            item.MediaGenres.Select(mg => mg.Genre.Name).ToList(),
            item.MediaFiles.Select(mf => new MediaFileResponse(
                mf.Id, mf.S3Key, mf.Container, mf.VideoCodec, mf.AudioCodec, mf.Resolution, mf.DurationSeconds,
                mf.Subtitles.Select(s => new SubtitleResponse(s.Id, s.Language, s.Format.ToString(), s.IsExternal, s.IsForced)).ToList()
            )).ToList(),
            item.Images.Select(i => new MediaImageResponse(i.Id, i.Type.ToString(), i.SourceUrl ?? $"/api/images/{i.Id}")).ToList(),
            item.MediaPersons.OrderBy(mp => mp.Order).Select(mp => new PersonResponse(
                mp.PersonId, mp.Person.Name, mp.Role.ToString(), mp.Character, mp.Order
            )).ToList(),
            item.ExternalIds.Select(e => new ExternalIdResponse(e.Provider.ToString(), e.ExternalKey)).ToList(),
            isInWatchlist
        ));
    }

    [HttpGet("{id:guid}/tvshow")]
    public async Task<ActionResult<TvShowDetailResponse>> GetTvShow(Guid id)
    {
        var userId = GetUserId();
        var item = await _db.MediaItems
            .Include(m => m.Seasons).ThenInclude(s => s.Episodes).ThenInclude(e => e.MediaFiles).ThenInclude(mf => mf.Subtitles)
            .Include(m => m.MediaGenres).ThenInclude(mg => mg.Genre)
            .Include(m => m.MediaPersons).ThenInclude(mp => mp.Person)
            .Include(m => m.Images)
            .FirstOrDefaultAsync(m => m.Id == id && m.MediaType == MediaType.TvShow);

        if (item == null) return NotFound();

        var isInWatchlist = await _db.WatchlistItems
            .AnyAsync(wi => wi.UserId == userId && wi.MediaItemId == id);

        var posterPath = item.Images.FirstOrDefault(i => i.Type == ImageType.Poster)?.SourceUrl;
        var backdropPath = item.Images.FirstOrDefault(i => i.Type == ImageType.Backdrop)?.SourceUrl;

        return Ok(new TvShowDetailResponse(
            item.Id, item.Title, item.Year, item.Overview, item.CommunityRating,
            posterPath, backdropPath,
            item.MediaGenres.Select(mg => mg.Genre.Name).ToList(),
            item.Seasons.OrderBy(s => s.SeasonNumber).Select(s => new SeasonResponse(
                s.Id, s.SeasonNumber, s.Name,
                s.Episodes.OrderBy(e => e.EpisodeNumber).Select(e =>
                {
                    var mf = e.MediaFiles.FirstOrDefault();
                    var progress = mf != null
                        ? _db.WatchProgresses.FirstOrDefault(wp => wp.UserId == userId && wp.MediaFileId == mf.Id)
                        : null;

                    return new EpisodeResponse(
                        e.Id, e.EpisodeNumber, e.Title, e.Overview, e.RuntimeMinutes,
                        e.MediaFiles.Select(mf2 => new MediaFileResponse(
                            mf2.Id, mf2.S3Key, mf2.Container, mf2.VideoCodec, mf2.AudioCodec,
                            mf2.Resolution, mf2.DurationSeconds,
                            mf2.Subtitles.Select(sub => new SubtitleResponse(sub.Id, sub.Language, sub.Format.ToString(), sub.IsExternal, sub.IsForced)).ToList()
                        )).ToList(),
                        progress != null ? new WatchProgressResponse(progress.MediaFileId, progress.PositionTicks, progress.Completed, progress.LastWatchedAt, mf?.DurationSeconds) : null
                    );
                }).ToList()
            )).ToList(),
            item.MediaPersons.OrderBy(mp => mp.Order).Select(mp => new PersonResponse(
                mp.PersonId, mp.Person.Name, mp.Role.ToString(), mp.Character, mp.Order
            )).ToList(),
            isInWatchlist
        ));
    }

    [HttpPost("{id:guid}/identify/search")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IReadOnlyList<TmdbSearchResult>>> IdentifySearch(Guid id, [FromBody] IdentifySearchRequest request)
    {
        var results = await _tmdb.SearchMultiAsync(request.Query);
        return Ok(results);
    }

    [HttpPost("{id:guid}/identify")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Identify(Guid id, [FromBody] IdentifyRequest request)
    {
        await _tmdb.ApplyMetadataAsync(id, request.TmdbId, request.IsMovie);
        return Ok();
    }

    [HttpGet("search")]
    public async Task<ActionResult<SearchResponse>> Search([FromQuery] string q, [FromQuery] int limit = 20)
    {
        if (string.IsNullOrWhiteSpace(q)) return Ok(new SearchResponse([], [], 0));

        var movies = await _db.MediaItems
            .Include(m => m.Images)
            .Where(m => m.MediaType == MediaType.Movie && m.Title.Contains(q))
            .Take(limit)
            .Select(m => new MediaItemSummaryResponse(
                m.Id, m.Title, m.Year, m.CommunityRating, m.MediaType.ToString(),
                m.Images.Where(i => i.Type == ImageType.Poster).Select(i => i.SourceUrl).FirstOrDefault(),
                m.AddedAt, null
            ))
            .ToListAsync();

        var tvShows = await _db.MediaItems
            .Include(m => m.Images)
            .Where(m => m.MediaType == MediaType.TvShow && m.Title.Contains(q))
            .Take(limit)
            .Select(m => new MediaItemSummaryResponse(
                m.Id, m.Title, m.Year, m.CommunityRating, m.MediaType.ToString(),
                m.Images.Where(i => i.Type == ImageType.Poster).Select(i => i.SourceUrl).FirstOrDefault(),
                m.AddedAt, null
            ))
            .ToListAsync();

        return Ok(new SearchResponse(movies, tvShows, movies.Count + tvShows.Count));
    }
}
