using Library.Api.Domain.Entities;

namespace Library.Api.Members;

public class MemberDto
{
    public Guid Id { get; set; }
    public required string DocumentType { get; set; }
    public required string DocumentNumber { get; set; }
    public DateOnly? BirthDate { get; set; }
    public string? NationalityCountry { get; set; }
    public required string Email { get; set; }
    public string? Gender { get; set; }
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
    public DateTimeOffset CreatedAt { get; set; }

    public static MemberDto FromEntity(Member member) => new()
    {
        Id = member.Id,
        DocumentType = member.DocumentType,
        DocumentNumber = member.DocumentNumber,
        BirthDate = member.BirthDate,
        NationalityCountry = member.NationalityCountry,
        Email = member.Email,
        Gender = member.Gender,
        FirstName = member.FirstName,
        LastName = member.LastName,
        Occupation = member.Occupation,
        EducationLevel = member.EducationLevel,
        Locality = member.Locality,
        Neighborhood = member.Neighborhood,
        Address = member.Address,
        ContactPhone = member.ContactPhone,
        ContactName = member.ContactName,
        EmergencyContactName = member.EmergencyContactName,
        EmergencyContactPhone = member.EmergencyContactPhone,
        WantsCulturalAgenda = member.WantsCulturalAgenda,
        AgreementAccepted = member.AgreementAccepted,
        CreatedAt = member.CreatedAt
    };
}
