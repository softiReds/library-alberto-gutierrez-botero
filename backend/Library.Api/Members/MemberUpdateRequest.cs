using System.ComponentModel.DataAnnotations;

namespace Library.Api.Members;

/// <summary>Replaces every editable field (everything except id and created_at).</summary>
public class MemberUpdateRequest
{
    [Required(AllowEmptyStrings = false)]
    public required string DocumentType { get; set; }

    [Required(AllowEmptyStrings = false)]
    public required string DocumentNumber { get; set; }

    public DateOnly? BirthDate { get; set; }
    public string? NationalityCountry { get; set; }

    [Required(AllowEmptyStrings = false)]
    [EmailAddress]
    public required string Email { get; set; }

    public string? Gender { get; set; }

    [Required(AllowEmptyStrings = false)]
    public required string FirstName { get; set; }

    [Required(AllowEmptyStrings = false)]
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
}
