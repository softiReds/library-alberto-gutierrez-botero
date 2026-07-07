namespace Library.Api.Domain.Entities;

public class Member
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string DocumentType { get; set; }
    public required string DocumentNumber { get; set; }
    public DateOnly BirthDate { get; set; }
    public required string NationalityCountry { get; set; }
    public required string Email { get; set; }
    public required string Gender { get; set; }
    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public string? Occupation { get; set; }
    public string? EducationLevel { get; set; }
    public string? Locality { get; set; }
    public string? Neighborhood { get; set; }
    public string? Address { get; set; }
    public string? ContactPhone { get; set; }
    public string? ContactName { get; set; }
    public string? EmergencyContactName { get; set; }
    public string? EmergencyContactPhone { get; set; }
    public bool WantsCulturalAgenda { get; set; }
    public bool AgreementAccepted { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Loan> Loans { get; set; } = new List<Loan>();
}
