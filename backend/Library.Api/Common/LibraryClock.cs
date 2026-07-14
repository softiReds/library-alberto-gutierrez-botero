namespace Library.Api.Common;

/// <summary>The library operates in Bogotá time, but the server clock (DateTime.UtcNow) is
/// UTC — Bogotá is a fixed UTC-5 (Colombia has no DST), so from ~7 p.m. to midnight local
/// time, UTC has already rolled over to the next calendar day. Any "what day is it"
/// business logic (overdue loans, default visit/reading dates, event date ranges, default
/// report month/year) must use this instead of DateOnly.FromDateTime(DateTime.UtcNow),
/// or it misclassifies "today" as "yesterday"/"next month" during that window. Audit
/// timestamps (CreatedAt, UpdatedAt, etc.) are a different concern and should stay UTC.</summary>
public static class LibraryClock
{
    private static readonly TimeSpan BogotaOffset = TimeSpan.FromHours(-5);

    public static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow + BogotaOffset);
}
