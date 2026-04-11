using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StreamVault.Core.DTOs;
using StreamVault.Core.Entities;
using StreamVault.Core.Enums;
using StreamVault.Infrastructure.Data;

namespace StreamVault.Api.Controllers;

[Route("api/[controller]")]
[Authorize]
public class CollectionsController : BaseController
{
    private readonly StreamVaultDbContext _db;

    public CollectionsController(StreamVaultDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CollectionResponse>>> GetAll()
    {
        var userId = GetUserId();
        var collections = await _db.Collections
            .Where(c => c.CreatedByUserId == userId || c.TmdbCollectionId != null)
            .Include(c => c.Items)
            .OrderBy(c => c.Name)
            .Select(c => new CollectionResponse(
                c.Id, c.Name, c.Description, c.PosterUrl, c.BackdropUrl,
                c.Items.Count, c.CreatedAt, c.TmdbCollectionId != null
            ))
            .ToListAsync();

        return Ok(collections);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<CollectionDetailResponse>> GetById(Guid id)
    {
        var userId = GetUserId();
        var collection = await _db.Collections
            .Include(c => c.Items).ThenInclude(ci => ci.MediaItem).ThenInclude(m => m.Images)
            .FirstOrDefaultAsync(c => c.Id == id && (c.CreatedByUserId == userId || c.TmdbCollectionId != null));

        if (collection == null) return NotFound();

        var items = collection.Items
            .OrderBy(ci => ci.MediaItem.Year ?? int.MaxValue)
            .ThenBy(ci => ci.SortOrder)
            .Select(ci => new MediaItemSummaryResponse(
                ci.MediaItem.Id, ci.MediaItem.Title, ci.MediaItem.Year, ci.MediaItem.CommunityRating,
                ci.MediaItem.MediaType.ToString(),
                ci.MediaItem.Images.Where(i => i.Type == ImageType.Poster).Select(i => i.SourceUrl).FirstOrDefault(),
                ci.MediaItem.AddedAt, null
            ))
            .ToList();

        return Ok(new CollectionDetailResponse(
            collection.Id, collection.Name, collection.Description,
            collection.PosterUrl, collection.BackdropUrl, items, collection.CreatedAt
        ));
    }

    [HttpGet("for-media/{mediaItemId:guid}")]
    public async Task<ActionResult<IReadOnlyList<CollectionResponse>>> GetForMedia(Guid mediaItemId)
    {
        var collections = await _db.CollectionItems
            .Where(ci => ci.MediaItemId == mediaItemId)
            .Select(ci => ci.Collection)
            .Select(c => new CollectionResponse(
                c.Id, c.Name, c.Description, c.PosterUrl, c.BackdropUrl,
                c.Items.Count, c.CreatedAt, c.TmdbCollectionId != null
            ))
            .ToListAsync();

        return Ok(collections);
    }

    [HttpPost]
    public async Task<ActionResult<CollectionResponse>> Create([FromBody] CreateCollectionRequest request)
    {
        var userId = GetUserId();
        var collection = new Collection
        {
            Name = request.Name,
            Description = request.Description,
            CreatedByUserId = userId
        };

        _db.Collections.Add(collection);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = collection.Id },
            new CollectionResponse(collection.Id, collection.Name, collection.Description, null, null, 0, collection.CreatedAt));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCollectionRequest request)
    {
        var userId = GetUserId();
        var collection = await _db.Collections.FirstOrDefaultAsync(c => c.Id == id && c.CreatedByUserId == userId);
        if (collection == null) return NotFound();

        if (request.Name != null) collection.Name = request.Name;
        if (request.Description != null) collection.Description = request.Description;

        await _db.SaveChangesAsync();

        var itemCount = await _db.CollectionItems.CountAsync(ci => ci.CollectionId == collection.Id);
        return Ok(new CollectionResponse(collection.Id, collection.Name, collection.Description,
            collection.PosterUrl, collection.BackdropUrl, itemCount, collection.CreatedAt));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = GetUserId();
        var collection = await _db.Collections.FirstOrDefaultAsync(c => c.Id == id && c.CreatedByUserId == userId);
        if (collection == null) return NotFound();

        _db.Collections.Remove(collection);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/items/{mediaItemId:guid}")]
    public async Task<IActionResult> AddItem(Guid id, Guid mediaItemId)
    {
        var userId = GetUserId();
        var collection = await _db.Collections
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.Id == id && c.CreatedByUserId == userId);
        if (collection == null) return NotFound();

        if (collection.Items.Any(ci => ci.MediaItemId == mediaItemId))
            return Conflict("Item already in collection");

        var maxOrder = collection.Items.Any() ? collection.Items.Max(ci => ci.SortOrder) : 0;
        var item = new CollectionItem
        {
            CollectionId = id,
            MediaItemId = mediaItemId,
            SortOrder = maxOrder + 1
        };

        _db.CollectionItems.Add(item);

        // Use the first item's poster as collection poster if none set
        if (collection.PosterUrl == null)
        {
            var mediaItem = await _db.MediaItems.Include(m => m.Images).FirstOrDefaultAsync(m => m.Id == mediaItemId);
            var poster = mediaItem?.Images.FirstOrDefault(i => i.Type == ImageType.Poster);
            if (poster != null) collection.PosterUrl = poster.SourceUrl;
        }

        await _db.SaveChangesAsync();
        return Created();
    }

    [HttpDelete("{id:guid}/items/{mediaItemId:guid}")]
    public async Task<IActionResult> RemoveItem(Guid id, Guid mediaItemId)
    {
        var userId = GetUserId();
        var item = await _db.CollectionItems
            .Include(ci => ci.Collection)
            .FirstOrDefaultAsync(ci => ci.CollectionId == id && ci.MediaItemId == mediaItemId && ci.Collection.CreatedByUserId == userId);

        if (item == null) return NotFound();

        _db.CollectionItems.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
