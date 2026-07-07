namespace Library.Api.Domain.Entities;

/// <summary>Deliberately independent from Member — walk-in visitor attendance is not tied to a membership.</summary>
public class Attendance
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateOnly VisitDate { get; set; }
    public int Age { get; set; }
    public required string Gender { get; set; }
    public string? VisitorName { get; set; }
    public string? VisitorPhone { get; set; }
}
