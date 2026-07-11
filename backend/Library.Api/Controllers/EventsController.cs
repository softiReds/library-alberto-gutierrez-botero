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

    // Tope duro de ocurrencias generadas por una sola serie recurrente — evita que un
    // rango de fechas mal puesto cree miles de filas por accidente.
    private const int MaxRecurrenceOccurrences = 104;

    [HttpPost]
    [Authorize]
    public async Task<ActionResult<EventDto>> CreateEvent(EventCreateRequest request)
    {
        var timeError = ValidateTimes(request.StartTime, request.EndTime);
        if (timeError is not null)
        {
            return BadRequest(ErrorResponse.Create("validation_error", timeError));
        }

        IReadOnlyList<DateOnly> occurrenceDates;
        if (request.Recurring)
        {
            var recurrenceError = ValidateRecurrence(request, out occurrenceDates);
            if (recurrenceError is not null)
            {
                return BadRequest(ErrorResponse.Create("validation_error", recurrenceError));
            }
        }
        else
        {
            occurrenceDates = [request.EventDate];
        }

        var recurrenceGroupId = request.Recurring ? Guid.NewGuid() : (Guid?)null;

        var events = occurrenceDates.Select(date => new Event
        {
            Title = request.Title,
            Description = request.Description,
            EventDate = date,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            Featured = request.Featured,
            RecurrenceGroupId = recurrenceGroupId
        }).ToList();

        db.Events.AddRange(events);
        await db.SaveChangesAsync();

        // La respuesta siempre representa la primera ocurrencia — el resto se ve al
        // recargar el listado, igual que ya hace el panel admin tras cualquier alta.
        var first = events[0];
        return CreatedAtAction(nameof(GetEvent), new { id = first.Id }, EventDto.FromEntity(first));
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

    /// <summary>Valida los campos de recurrencia y genera la lista de fechas de ocurrencia
    /// (incluida la fecha inicial). Devuelve un mensaje de error si algo no es válido.</summary>
    private static string? ValidateRecurrence(EventCreateRequest request, out IReadOnlyList<DateOnly> occurrenceDates)
    {
        occurrenceDates = [];

        if (request.RecurrenceFrequency is null)
        {
            return "Debe indicar recurrence_frequency (weekly o monthly) para un evento recurrente.";
        }

        var hasEndDate = request.RecurrenceEndDate is not null;
        var hasCount = request.RecurrenceCount is not null;

        if (hasEndDate == hasCount)
        {
            return "Debe indicar exactamente uno: recurrence_end_date o recurrence_count.";
        }

        if (hasEndDate && request.RecurrenceEndDate <= request.EventDate)
        {
            return "recurrence_end_date debe ser posterior a event_date.";
        }

        if (hasCount && request.RecurrenceCount is < 2 or > MaxRecurrenceOccurrences)
        {
            return $"recurrence_count debe estar entre 2 y {MaxRecurrenceOccurrences}.";
        }

        var dates = new List<DateOnly> { request.EventDate };
        var frequency = request.RecurrenceFrequency.Value;

        if (hasCount)
        {
            for (var i = 1; i < request.RecurrenceCount!.Value; i++)
            {
                dates.Add(NextOccurrence(request.EventDate, frequency, i));
            }
        }
        else
        {
            var i = 1;
            while (true)
            {
                var next = NextOccurrence(request.EventDate, frequency, i);
                if (next > request.RecurrenceEndDate) break;

                if (dates.Count >= MaxRecurrenceOccurrences)
                {
                    return $"Ese rango genera más de {MaxRecurrenceOccurrences} eventos — acorta recurrence_end_date o usa recurrence_count.";
                }

                dates.Add(next);
                i++;
            }
        }

        occurrenceDates = dates;
        return null;
    }

    /// <summary>Fecha de la ocurrencia número `step` a partir de `start` (step=0 es `start`
    /// mismo). Mensual conserva el mismo día del mes, ajustado al último día válido si el
    /// mes destino es más corto (ej. 31 de enero -> 28/29 de febrero).</summary>
    private static DateOnly NextOccurrence(DateOnly start, RecurrenceFrequency frequency, int step)
    {
        if (frequency == RecurrenceFrequency.Weekly)
        {
            return start.AddDays(7 * step);
        }

        var totalMonths = start.Month - 1 + step;
        var year = start.Year + totalMonths / 12;
        var month = totalMonths % 12 + 1;
        var day = Math.Min(start.Day, DateTime.DaysInMonth(year, month));
        return new DateOnly(year, month, day);
    }
}
