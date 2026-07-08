using Library.Api.Common;
using Library.Api.Data;
using Library.Api.Domain.Entities;
using Library.Api.Events;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Controllers;

[ApiController]
[Route("api/v1/events")]
public class EventsController(LibraryDbContext db) : ControllerBase
{
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<EventDto>>> GetUpcomingEvents()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var events = await db.Events
            .Where(e => e.EventDate >= today)
            .OrderBy(e => e.EventDate)
            .ToListAsync();

        return Ok(events.Select(EventDto.FromEntity).ToList());
    }

    [HttpGet("featured")]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<EventDto>>> GetFeaturedEvents()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var events = await db.Events
            .Where(e => e.Featured && e.EventDate >= today)
            .OrderBy(e => e.EventDate)
            .ToListAsync();

        return Ok(events.Select(EventDto.FromEntity).ToList());
    }

    [HttpGet("all")]
    [Authorize]
    public async Task<ActionResult<PagedResult<EventDto>>> GetAllEvents(
        [FromQuery] int page = 1,
        [FromQuery(Name = "page_size")] int pageSize = 20)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        var query = db.Events.AsQueryable();

        var total = await query.CountAsync();

        var events = await query
            .OrderByDescending(e => e.EventDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new PagedResult<EventDto>
        {
            Data = events.Select(EventDto.FromEntity).ToList(),
            Page = page,
            PageSize = pageSize,
            Total = total
        });
    }

    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<EventDto>> GetEvent(Guid id)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "El evento solicitado no existe."));
        }

        return Ok(EventDto.FromEntity(ev));
    }

    [HttpPost]
    [Authorize]
    public async Task<ActionResult<EventDto>> CreateEvent(EventCreateRequest request)
    {
        var timeError = ValidateTimes(request.StartTime, request.EndTime);
        if (timeError is not null)
        {
            return BadRequest(ErrorResponse.Create("validation_error", timeError));
        }

        var ev = new Event
        {
            Title = request.Title,
            Description = request.Description,
            EventDate = request.EventDate,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            Featured = request.Featured
        };

        db.Events.Add(ev);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetEvent), new { id = ev.Id }, EventDto.FromEntity(ev));
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<EventDto>> UpdateEvent(Guid id, EventUpdateRequest request)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "El evento solicitado no existe."));
        }

        var timeError = ValidateTimes(request.StartTime, request.EndTime);
        if (timeError is not null)
        {
            return BadRequest(ErrorResponse.Create("validation_error", timeError));
        }

        ev.Title = request.Title;
        ev.Description = request.Description;
        ev.EventDate = request.EventDate;
        ev.StartTime = request.StartTime;
        ev.EndTime = request.EndTime;
        ev.Featured = request.Featured;

        await db.SaveChangesAsync();

        return Ok(EventDto.FromEntity(ev));
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> DeleteEvent(Guid id)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "El evento solicitado no existe."));
        }

        db.Events.Remove(ev);
        await db.SaveChangesAsync();

        return NoContent();
    }

    private static string? ValidateTimes(TimeOnly? start, TimeOnly? end)
    {
        if (start is not null && end is not null && end <= start)
        {
            return "end_time debe ser posterior a start_time.";
        }

        return null;
    }
}
