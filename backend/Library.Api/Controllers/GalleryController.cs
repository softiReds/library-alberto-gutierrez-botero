using Library.Api.Common;
using Library.Api.Data;
using Library.Api.Domain.Entities;
using Library.Api.Gallery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Controllers;

[ApiController]
[Route("api/v1/gallery")]
public class GalleryController(LibraryDbContext db) : ControllerBase
{
    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp"
    };

    private const long MaxPhotoBytes = 8 * 1024 * 1024;

    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<GalleryPhotoDto>>> GetPhotos()
    {
        // Projects straight to the DTO so EF never selects the ImageData column here —
        // the list view has no use for the bytes, only the image endpoint does.
        var photos = await db.GalleryPhotos
            .OrderBy(p => p.UploadedAt)
            .Select(p => new GalleryPhotoDto
            {
                Id = p.Id,
                ImageUrl = $"/gallery/{p.Id}/image",
                UploadedAt = p.UploadedAt
            })
            .ToListAsync();

        return Ok(photos);
    }

    [HttpGet("{id:guid}/image")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPhotoImage(Guid id)
    {
        var photo = await db.GalleryPhotos
            .Where(p => p.Id == id)
            .Select(p => new { p.ImageData, p.ContentType })
            .FirstOrDefaultAsync();

        if (photo is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "La foto solicitada no existe."));
        }

        return File(photo.ImageData, photo.ContentType);
    }

    [HttpPost]
    [Authorize]
    public async Task<ActionResult<GalleryPhotoDto>> UploadPhoto(IFormFile file)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(ErrorResponse.Create("validation_error", "Debe adjuntar un archivo de imagen."));
        }

        if (!AllowedContentTypes.Contains(file.ContentType))
        {
            return BadRequest(ErrorResponse.Create("validation_error", "Solo se permiten imágenes JPEG, PNG o WebP."));
        }

        if (file.Length > MaxPhotoBytes)
        {
            return BadRequest(ErrorResponse.Create("validation_error", "La imagen no puede superar los 8 MB."));
        }

        using var memoryStream = new MemoryStream();
        await file.CopyToAsync(memoryStream);

        var photo = new GalleryPhoto
        {
            ImageData = memoryStream.ToArray(),
            ContentType = file.ContentType
        };

        db.GalleryPhotos.Add(photo);
        await db.SaveChangesAsync();

        return Created($"/api/v1/gallery/{photo.Id}/image", GalleryPhotoDto.FromEntity(photo));
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> DeletePhoto(Guid id)
    {
        var photo = await db.GalleryPhotos.FirstOrDefaultAsync(p => p.Id == id);
        if (photo is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "La foto solicitada no existe."));
        }

        db.GalleryPhotos.Remove(photo);
        await db.SaveChangesAsync();

        return NoContent();
    }
}
