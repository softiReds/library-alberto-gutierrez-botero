using Library.Api.Attendances;
using Library.Api.Common;
using Library.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Controllers;

[ApiController]
[Route("api/v1/attendance")]
[Authorize]
public class AttendanceController(LibraryDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<AttendanceDto>>> GetAttendance(
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] string? gender,
        [FromQuery] int page = 1,
        [FromQuery(Name = "page_size")] int pageSize = 20)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        var query = db.Attendance.AsQueryable();

        if (from is not null)
        {
            query = query.Where(a => a.VisitDate >= from);
        }

        if (to is not null)
        {
            query = query.Where(a => a.VisitDate <= to);
        }

        if (!string.IsNullOrWhiteSpace(gender))
        {
            query = query.Where(a => a.Gender == gender);
        }

        var total = await query.CountAsync();

        var records = await query
            .OrderByDescending(a => a.VisitDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new PagedResult<AttendanceDto>
        {
            Data = records.Select(AttendanceDto.FromEntity).ToList(),
            Page = page,
            PageSize = pageSize,
            Total = total
        });
    }

    // Pública: la usa el kiosco de auto-registro de asistencia en recepción,
    // sin sesión de la coordinadora.
    [HttpPost]
    [AllowAnonymous]
    public async Task<ActionResult<AttendanceDto>> CreateAttendance(CreateAttendanceRequest request)
    {
        var attendance = new Domain.Entities.Attendance
        {
            VisitDate = request.VisitDate ?? DateOnly.FromDateTime(DateTime.UtcNow),
            Age = request.Age,
            Gender = request.Gender,
            VisitorName = request.VisitorName,
            VisitorPhone = request.VisitorPhone
        };

        db.Attendance.Add(attendance);
        await db.SaveChangesAsync();

        return Created(
            $"/api/v1/attendance/{attendance.Id}",
            AttendanceDto.FromEntity(attendance));
    }
}
