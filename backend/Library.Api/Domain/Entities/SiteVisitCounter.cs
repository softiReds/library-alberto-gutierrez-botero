namespace Library.Api.Domain.Entities;

/// <summary>Single-row table holding the running total of site visits.</summary>
public class SiteVisitCounter
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int TotalVisits { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
