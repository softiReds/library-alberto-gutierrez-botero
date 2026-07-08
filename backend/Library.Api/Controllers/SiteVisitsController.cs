using Library.Api.Data;
using Library.Api.SiteVisits;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Controllers;

[ApiController]
[Route("api/v1/site-visits")]
[AllowAnonymous]
public class SiteVisitsController(LibraryDbContext db) : ControllerBase
{
    // Fixed id for the single row this table is meant to ever hold. Using a well-known id
    // (rather than "the first row found") lets both endpoints below use a single atomic
    // "INSERT ... ON CONFLICT" statement instead of a read-then-write from C#, so concurrent
    // requests — including the very first one that creates the row — can never race.
    private static readonly Guid CounterId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    [HttpGet]
    public async Task<ActionResult<SiteVisitCounterDto>> GetSiteVisits()
    {
        var now = DateTimeOffset.UtcNow;

        var results = await db.Database.SqlQueryRaw<int>(
            """
            INSERT INTO site_visit_counters (id, total_visits, updated_at)
            VALUES ({0}, 0, {1})
            ON CONFLICT (id) DO UPDATE SET id = site_visit_counters.id
            RETURNING total_visits
            """,
            CounterId, now).ToListAsync();

        var total = results.Single();

        return Ok(new SiteVisitCounterDto { TotalVisits = total });
    }

    [HttpPost("increment")]
    public async Task<ActionResult<SiteVisitCounterDto>> IncrementSiteVisits()
    {
        var now = DateTimeOffset.UtcNow;

        var results = await db.Database.SqlQueryRaw<int>(
            """
            INSERT INTO site_visit_counters (id, total_visits, updated_at)
            VALUES ({0}, 1, {1})
            ON CONFLICT (id) DO UPDATE SET
                total_visits = site_visit_counters.total_visits + 1,
                updated_at = {1}
            RETURNING total_visits
            """,
            CounterId, now).ToListAsync();

        var total = results.Single();

        return Ok(new SiteVisitCounterDto { TotalVisits = total });
    }
}
