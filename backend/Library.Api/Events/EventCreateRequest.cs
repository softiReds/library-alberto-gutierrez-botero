using System.ComponentModel.DataAnnotations;

namespace Library.Api.Events;

public class EventCreateRequest
{
    [Required(AllowEmptyStrings = false)]
    public required string Title { get; set; }

    public string? Description { get; set; }
    public required DateOnly EventDate { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public bool Featured { get; set; }

    /// <summary>When true, RecurrenceFrequency and exactly one of RecurrenceEndDate /
    /// RecurrenceCount are required — see EventsController.CreateEvent.</summary>
    public bool Recurring { get; set; }
    public RecurrenceFrequency? RecurrenceFrequency { get; set; }
    public DateOnly? RecurrenceEndDate { get; set; }
    public int? RecurrenceCount { get; set; }
}
