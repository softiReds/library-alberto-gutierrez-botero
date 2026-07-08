using Library.Api.Domain.Entities;

namespace Library.Api.Events;

public class EventDto
{
    public Guid Id { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }
    public DateOnly EventDate { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public bool Featured { get; set; }

    public static EventDto FromEntity(Event ev) => new()
    {
        Id = ev.Id,
        Title = ev.Title,
        Description = ev.Description,
        EventDate = ev.EventDate,
        StartTime = ev.StartTime,
        EndTime = ev.EndTime,
        Featured = ev.Featured
    };
}
