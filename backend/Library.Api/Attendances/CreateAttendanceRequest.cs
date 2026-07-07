using System.ComponentModel.DataAnnotations;

namespace Library.Api.Attendances;

public class CreateAttendanceRequest
{
    /// <summary>Defaults to today when not provided.</summary>
    public DateOnly? VisitDate { get; set; }

    public required int Age { get; set; }

    [Required(AllowEmptyStrings = false)]
    public required string Gender { get; set; }

    public string? VisitorName { get; set; }
    public string? VisitorPhone { get; set; }
}
