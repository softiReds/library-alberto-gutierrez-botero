using Library.Api.Domain.Entities;

namespace Library.Api.Attendances;

public class AttendanceDto
{
    public Guid Id { get; set; }
    public DateOnly VisitDate { get; set; }
    public int Age { get; set; }
    public required string Gender { get; set; }
    public string? VisitorName { get; set; }
    public string? VisitorPhone { get; set; }

    public static AttendanceDto FromEntity(Attendance attendance) => new()
    {
        Id = attendance.Id,
        VisitDate = attendance.VisitDate,
        Age = attendance.Age,
        Gender = attendance.Gender,
        VisitorName = attendance.VisitorName,
        VisitorPhone = attendance.VisitorPhone
    };
}
