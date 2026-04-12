using Hangfire;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Core.Entities;
using StreamVault.Core.Enums;
using StreamVault.Core.Interfaces;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
[Authorize]
public class LibrariesController : BaseController
{
    private readonly StreamVaultDbContext _db;
    private readonly ILibraryScanner _scanner;

    public LibrariesController(StreamVaultDbContext db, ILibraryScanner scanner)
    {
        _db = db;
        _scanner = scanner;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<LibraryResponse>>> GetAll()
    {
        var libraries = await _db.Libraries
            .Include(l => l.MediaItems)
            .Select(l => new LibraryResponse(
                l.Id, l.Name, l.Type.ToString(), l.S3Prefix, l.ScanScheduleCron,
                l.ScanStatus.ToString(), l.LastScannedAt, l.S3ConnectionId,
                l.MediaItems.Count, l.CreatedAt
            ))
            .ToListAsync();
        return Ok(libraries);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<LibraryResponse>> GetById(Guid id)
    {
        var l = await _db.Libraries.Include(l => l.MediaItems).FirstOrDefaultAsync(l => l.Id == id);
        if (l == null) return NotFound();

        return Ok(new LibraryResponse(
            l.Id, l.Name, l.Type.ToString(), l.S3Prefix, l.ScanScheduleCron,
            l.ScanStatus.ToString(), l.LastScannedAt, l.S3ConnectionId,
            l.MediaItems.Count, l.CreatedAt
        ));
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<LibraryResponse>> Create([FromBody] LibraryRequest request)
    {
        if (!Enum.TryParse<MediaType>(request.Type, true, out var mediaType))
            return BadRequest(new { error = "Invalid library type" });

        var library = new Library
        {
            Name = request.Name,
            Type = mediaType,
            S3ConnectionId = request.S3ConnectionId,
            S3Prefix = request.S3Prefix ?? "",
            ScanScheduleCron = request.ScanScheduleCron
        };

        _db.Libraries.Add(library);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = library.Id },
            new LibraryResponse(library.Id, library.Name, library.Type.ToString(), library.S3Prefix,
                library.ScanScheduleCron, library.ScanStatus.ToString(), library.LastScannedAt,
                library.S3ConnectionId, 0, library.CreatedAt));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<LibraryResponse>> Update(Guid id, [FromBody] LibraryRequest request)
    {
        var library = await _db.Libraries.FindAsync(id);
        if (library == null) return NotFound();

        library.Name = request.Name;
        if (Enum.TryParse<MediaType>(request.Type, true, out var mediaType)) library.Type = mediaType;
        library.S3ConnectionId = request.S3ConnectionId;
        library.S3Prefix = request.S3Prefix ?? "";
        library.ScanScheduleCron = request.ScanScheduleCron;

        await _db.SaveChangesAsync();

        var itemCount = await _db.MediaItems.CountAsync(m => m.LibraryId == id);
        return Ok(new LibraryResponse(library.Id, library.Name, library.Type.ToString(), library.S3Prefix,
            library.ScanScheduleCron, library.ScanStatus.ToString(), library.LastScannedAt,
            library.S3ConnectionId, itemCount, library.CreatedAt));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var library = await _db.Libraries.FindAsync(id);
        if (library == null) return NotFound();

        _db.Libraries.Remove(library);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/scan")]
    [Authorize(Roles = "Admin")]
    public IActionResult TriggerScan(Guid id)
    {
        BackgroundJob.Enqueue<ILibraryScanner>(scanner => scanner.ScanLibraryAsync(id, CancellationToken.None));
        return Accepted();
    }

    [HttpGet("{id:guid}/items")]
    public async Task<ActionResult<PaginatedResponse<MediaItemSummaryResponse>>> GetItems(
        Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 24,
        [FromQuery] string? genre = null, [FromQuery] int? year = null,
        [FromQuery] string? sort = "title", [FromQuery] string? search = null)
    {
        var query = _db.MediaItems
            .Include(m => m.Images)
            .Include(m => m.MediaGenres).ThenInclude(mg => mg.Genre)
            .Where(m => m.LibraryId == id);

        if (!string.IsNullOrEmpty(search))
            query = query.Where(m => EF.Functions.Like(m.Title, $"%{search}%"));
        if (!string.IsNullOrEmpty(genre))
            query = query.Where(m => m.MediaGenres.Any(mg => mg.Genre.Name == genre));
        if (year.HasValue)
            query = query.Where(m => m.Year == year);

        query = sort?.ToLowerInvariant() switch
        {
            "year" => query.OrderByDescending(m => m.Year),
            "rating" => query.OrderByDescending(m => m.CommunityRating),
            "added" => query.OrderByDescending(m => m.AddedAt),
            _ => query.OrderBy(m => m.SortTitle)
        };

        var totalCount = await query.CountAsync();
        var profileId = GetProfileId();

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(m => new MediaItemSummaryResponse(
                m.Id, m.Title, m.Year, m.CommunityRating,
                m.MediaType.ToString(),
                m.Images.Where(i => i.Type == ImageType.Poster).Select(i => i.SourceUrl ?? $"/api/images/{i.Id}").FirstOrDefault(),
                m.AddedAt,
                _db.WatchProgresses
                    .Where(wp => wp.ProfileId == profileId && wp.MediaFile.MediaItemId == m.Id)
                    .OrderByDescending(wp => wp.LastWatchedAt)
                    .Select(wp => new WatchProgressResponse(wp.MediaFileId, wp.PositionTicks, wp.Completed, wp.LastWatchedAt, wp.MediaFile.DurationSeconds))
                    .FirstOrDefault()
            ))
            .ToListAsync();

        return Ok(new PaginatedResponse<MediaItemSummaryResponse>(items, totalCount, page, pageSize));
    }
}
