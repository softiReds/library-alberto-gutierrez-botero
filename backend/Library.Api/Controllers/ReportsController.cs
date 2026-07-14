using Library.Api.Common;
using Library.Api.Data;
using Library.Api.Domain.Enums;
using Library.Api.Reports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Controllers;

[ApiController]
[Route("api/v1/reports")]
[Authorize]
public class ReportsController(LibraryDbContext db) : ControllerBase
{
    private static readonly (string Label, int MaxAge)[] AgeRanges =
    [
        ("0-5", 5),
        ("6-15", 15),
        ("16-30", 30),
        ("31-50", 50),
        ("51-99", 99)
    ];

    [HttpGet("catalog")]
    public async Task<ActionResult<CatalogReportDto>> GetCatalogReport(
        [FromQuery] int? month,
        [FromQuery] int? year)
    {
        var today = LibraryClock.Today;
        var m = month ?? today.Month;
        var y = year ?? today.Year;

        if (m is < 1 or > 12)
        {
            return BadRequest(Common.ErrorResponse.Create("validation_error", "month debe estar entre 1 y 12."));
        }

        // Keeps "currently overdue" accurate even if nobody has hit GET /loans recently.
        await LoanMaintenance.MarkOverdueLoansAsync(db);

        var loansCount = await CountLoansInMonthAsync(m, y);

        var lostBooksCount = await db.Books.CountAsync(b => b.Status == BookStatus.Perdido);

        var returnedOnTimeCount = await db.Loans.CountAsync(l =>
            l.ReturnDate != null &&
            l.ReturnDate.Value.Month == m && l.ReturnDate.Value.Year == y &&
            l.ReturnDate <= l.DueDate);

        var returnedLateCount = await db.Loans.CountAsync(l =>
            l.ReturnDate != null &&
            l.ReturnDate.Value.Month == m && l.ReturnDate.Value.Year == y &&
            l.ReturnDate > l.DueDate);

        var currentlyOverdueCount = await db.Loans.CountAsync(l => l.Status == LoanStatus.Vencido);

        return Ok(new CatalogReportDto
        {
            Month = m,
            Year = y,
            LoansCount = loansCount,
            LostBooksCount = lostBooksCount,
            ReturnedOnTimeCount = returnedOnTimeCount,
            ReturnedLateCount = returnedLateCount,
            CurrentlyOverdueCount = currentlyOverdueCount
        });
    }

    [HttpGet("attendance")]
    public async Task<ActionResult<AttendanceReportDto>> GetAttendanceReport(
        [FromQuery] int? month,
        [FromQuery] int? year)
    {
        var today = LibraryClock.Today;
        var m = month ?? today.Month;
        var y = year ?? today.Year;

        if (m is < 1 or > 12)
        {
            return BadRequest(Common.ErrorResponse.Create("validation_error", "month debe estar entre 1 y 12."));
        }

        var attendanceThisMonth = db.Attendance.Where(a => a.VisitDate.Month == m && a.VisitDate.Year == y);

        var totalVisits = await attendanceThisMonth.CountAsync();

        var byGenderRows = await attendanceThisMonth
            .GroupBy(a => a.Gender)
            .Select(g => new { Gender = g.Key, Count = g.Count() })
            .ToListAsync();
        var byGender = byGenderRows.ToDictionary(r => r.Gender, r => r.Count);

        var byAgeRangeRows = await attendanceThisMonth
            .GroupBy(a =>
                a.Age <= 5 ? "0-5" :
                a.Age <= 15 ? "6-15" :
                a.Age <= 30 ? "16-30" :
                a.Age <= 50 ? "31-50" : "51-99")
            .Select(g => new { Range = g.Key, Count = g.Count() })
            .ToListAsync();

        // Always report all 5 fixed buckets (matching the coordinator's existing Excel
        // report), even the ones with zero visits this month — unlike by_gender, which only
        // lists whatever values actually occur in the data.
        var byAgeRange = AgeRanges.ToDictionary(r => r.Label, _ => 0);
        foreach (var row in byAgeRangeRows)
        {
            byAgeRange[row.Range] = row.Count;
        }

        var inHouseReadingCount = await db.InHouseReadings
            .CountAsync(r => r.ReadingDate.Month == m && r.ReadingDate.Year == y);

        var loansCount = await CountLoansInMonthAsync(m, y);

        return Ok(new AttendanceReportDto
        {
            Month = m,
            Year = y,
            TotalVisits = totalVisits,
            ByGender = byGender,
            ByAgeRange = byAgeRange,
            InHouseReadingCount = inHouseReadingCount,
            LoansCount = loansCount
        });
    }

    private Task<int> CountLoansInMonthAsync(int month, int year) =>
        db.Loans.CountAsync(l => l.LoanDate.Month == month && l.LoanDate.Year == year);
}
