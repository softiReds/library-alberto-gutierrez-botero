namespace Library.Api.Domain.Entities;

public class Event
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Title { get; set; }
    public string? Description { get; set; }
    public DateOnly EventDate { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public bool Featured { get; set; }

    /// <summary>Null for a one-off event. Shared by every occurrence generated from the same
    /// recurring series at creation time — occurrences are otherwise plain, independent rows
    /// (editing/deleting one never touches the rest of the series).</summary>
    public Guid? RecurrenceGroupId { get; set; }
}
