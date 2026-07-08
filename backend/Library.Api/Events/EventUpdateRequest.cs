using System.ComponentModel.DataAnnotations;

namespace Library.Api.Events;

/// <summary>Replaces every editable field.</summary>
public class EventUpdateRequest
{
    [Required(AllowEmptyStrings = false)]
    public required string Title { get; set; }

    public string? Description { get; set; }
    public required DateOnly EventDate { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public bool Featured { get; set; }
}
