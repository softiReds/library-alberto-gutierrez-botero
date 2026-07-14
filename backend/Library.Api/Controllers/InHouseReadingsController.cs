using Library.Api.Common;
using Library.Api.Data;
using Library.Api.Domain.Entities;
using Library.Api.InHouseReadings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Controllers;

[ApiController]
[Route("api/v1/in-house-readings")]
[Authorize]
public class InHouseReadingsController(LibraryDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<InHouseReadingDto>>> GetInHouseReadings(
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] int page = 1,
        [FromQuery(Name = "page_size")] int pageSize = 20)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        var query = db.InHouseReadings.Include(r => r.Book).AsQueryable();

        if (from is not null)
        {
            query = query.Where(r => r.ReadingDate >= from);
        }

        if (to is not null)
        {
            query = query.Where(r => r.ReadingDate <= to);
        }

        var total = await query.CountAsync();

        var readings = await query
            .OrderByDescending(r => r.ReadingDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new PagedResult<InHouseReadingDto>
        {
            Data = readings.Select(InHouseReadingDto.FromEntity).ToList(),
            Page = page,
            PageSize = pageSize,
            Total = total
        });
    }

    [HttpPost]
    public async Task<ActionResult<InHouseReadingDto>> CreateInHouseReading(CreateInHouseReadingRequest request)
    {
        if (request.BookId is null && string.IsNullOrWhiteSpace(request.BookTitleFallback))
        {
            return BadRequest(ErrorResponse.Create(
                "validation_error", "Debe indicar book_id o book_title_fallback."));
        }

        Book? book = null;
        if (request.BookId is not null)
        {
            book = await db.Books.FirstOrDefaultAsync(b => b.Id == request.BookId);
            if (book is null)
            {
                return NotFound(ErrorResponse.Create("not_found", "El libro indicado no existe."));
            }
        }

        var reading = new InHouseReading
        {
            BookId = book?.Id,
            BookTitleFallback = request.BookTitleFallback,
            ReadingDate = request.ReadingDate ?? LibraryClock.Today
        };

        db.InHouseReadings.Add(reading);
        await db.SaveChangesAsync();

        reading.Book = book;

        return Created(
            $"/api/v1/in-house-readings/{reading.Id}",
            InHouseReadingDto.FromEntity(reading));
    }
}
