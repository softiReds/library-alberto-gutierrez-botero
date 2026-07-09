using Library.Api.Common;
using Library.Api.Data;
using Library.Api.Domain.Entities;
using Library.Api.Members;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Controllers;

[ApiController]
[Route("api/v1/members")]
[Authorize]
public class MembersController(LibraryDbContext db) : ControllerBase
{
    /// <summary>
    /// With "document": exact document_number lookup (used to check for duplicates before
    /// filling out the affiliation form). Without it: paginated list, optionally filtered by
    /// "search" across first_name/last_name/document_number.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult> GetMembers(
        [FromQuery] string? document,
        [FromQuery] string? search,
        [FromQuery(Name = "document_type")] string? documentType,
        [FromQuery(Name = "education_level")] string? educationLevel,
        [FromQuery] string? occupation,
        [FromQuery] string? gender,
        [FromQuery] string? locality,
        [FromQuery] string? neighborhood,
        [FromQuery(Name = "date_from")] DateOnly? dateFrom,
        [FromQuery(Name = "date_to")] DateOnly? dateTo,
        [FromQuery] int page = 1,
        [FromQuery(Name = "page_size")] int pageSize = 20)
    {
        if (!string.IsNullOrWhiteSpace(document))
        {
            var member = await db.Members.FirstOrDefaultAsync(m => m.DocumentNumber == document);
            if (member is null)
            {
                return NotFound(ErrorResponse.Create("not_found", "No existe un afiliado con ese número de documento."));
            }

            return Ok(MemberDto.FromEntity(member));
        }

        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        var query = db.Members.AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            query = query.Where(m =>
                EF.Functions.ILike(m.FirstName, $"%{search}%") ||
                EF.Functions.ILike(m.LastName, $"%{search}%") ||
                EF.Functions.ILike(m.DocumentNumber, $"%{search}%"));
        }

        if (!string.IsNullOrWhiteSpace(documentType))
        {
            query = query.Where(m => m.DocumentType == documentType);
        }

        if (!string.IsNullOrWhiteSpace(educationLevel))
        {
            query = query.Where(m => m.EducationLevel == educationLevel);
        }

        if (!string.IsNullOrWhiteSpace(occupation))
        {
            query = query.Where(m => m.Occupation == occupation);
        }

        if (!string.IsNullOrWhiteSpace(gender))
        {
            query = query.Where(m => m.Gender == gender);
        }

        if (!string.IsNullOrWhiteSpace(locality))
        {
            query = query.Where(m => m.Locality == locality);
        }

        if (!string.IsNullOrWhiteSpace(neighborhood))
        {
            query = query.Where(m => m.Neighborhood == neighborhood);
        }

        if (dateFrom.HasValue)
        {
            var from = new DateTimeOffset(dateFrom.Value.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            query = query.Where(m => m.CreatedAt >= from);
        }

        if (dateTo.HasValue)
        {
            var to = new DateTimeOffset(dateTo.Value.ToDateTime(TimeOnly.MaxValue), TimeSpan.Zero);
            query = query.Where(m => m.CreatedAt <= to);
        }

        var total = await query.CountAsync();

        var members = await query
            .OrderBy(m => m.LastName).ThenBy(m => m.FirstName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new PagedResult<MemberDto>
        {
            Data = members.Select(MemberDto.FromEntity).ToList(),
            Page = page,
            PageSize = pageSize,
            Total = total
        });
    }

    /// <summary>Distinct values already in use, to populate the admin panel's filter dropdowns
    /// without requiring the whole (paginated) member list on the client.</summary>
    [HttpGet("filters")]
    public async Task<ActionResult> GetMemberFilters()
    {
        async Task<List<string>> Distinct(IQueryable<string?> source) =>
            (await source.Where(v => v != null).Distinct().OrderBy(v => v).ToListAsync())!;

        var documentTypes = await Distinct(db.Members.Select(m => (string?)m.DocumentType));
        var educationLevels = await Distinct(db.Members.Select(m => m.EducationLevel));
        var occupations = await Distinct(db.Members.Select(m => m.Occupation));
        var genders = await Distinct(db.Members.Select(m => m.Gender));
        var localities = await Distinct(db.Members.Select(m => m.Locality));
        var neighborhoods = await Distinct(db.Members.Select(m => m.Neighborhood));

        return Ok(new
        {
            DocumentTypes = documentTypes,
            EducationLevels = educationLevels,
            Occupations = occupations,
            Genders = genders,
            Localities = localities,
            Neighborhoods = neighborhoods
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<MemberDto>> GetMember(Guid id)
    {
        var member = await db.Members.FirstOrDefaultAsync(m => m.Id == id);
        if (member is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "El afiliado solicitado no existe."));
        }

        return Ok(MemberDto.FromEntity(member));
    }

    [HttpPost]
    public async Task<ActionResult<MemberDto>> CreateMember(MemberCreateRequest request)
    {
        if (!request.AgreementAccepted)
        {
            return BadRequest(ErrorResponse.Create(
                "validation_error", "Debe aceptar el compromiso de responsabilidad para afiliarse."));
        }

        var alreadyAffiliated = await db.Members.AnyAsync(m => m.DocumentNumber == request.DocumentNumber);
        if (alreadyAffiliated)
        {
            return Conflict(ErrorResponse.Create(
                "conflict", $"Ya existe un afiliado con el documento '{request.DocumentNumber}'."));
        }

        var member = new Member
        {
            DocumentType = request.DocumentType,
            DocumentNumber = request.DocumentNumber,
            BirthDate = request.BirthDate,
            NationalityCountry = request.NationalityCountry,
            Email = request.Email,
            Gender = request.Gender,
            FirstName = request.FirstName,
            LastName = request.LastName,
            Occupation = request.Occupation,
            EducationLevel = request.EducationLevel,
            Locality = request.Locality,
            Neighborhood = request.Neighborhood,
            Address = request.Address,
            ContactPhone = request.ContactPhone,
            ContactName = request.ContactName,
            EmergencyContactName = request.EmergencyContactName,
            EmergencyContactPhone = request.EmergencyContactPhone,
            WantsCulturalAgenda = request.WantsCulturalAgenda,
            AgreementAccepted = request.AgreementAccepted
        };

        db.Members.Add(member);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetMember), new { id = member.Id }, MemberDto.FromEntity(member));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<MemberDto>> UpdateMember(Guid id, MemberUpdateRequest request)
    {
        var member = await db.Members.FirstOrDefaultAsync(m => m.Id == id);
        if (member is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "El afiliado solicitado no existe."));
        }

        if (!request.AgreementAccepted)
        {
            return BadRequest(ErrorResponse.Create(
                "validation_error", "Debe aceptar el compromiso de responsabilidad para afiliarse."));
        }

        if (!string.Equals(member.DocumentNumber, request.DocumentNumber, StringComparison.Ordinal))
        {
            var documentTaken = await db.Members.AnyAsync(m => m.DocumentNumber == request.DocumentNumber && m.Id != id);
            if (documentTaken)
            {
                return Conflict(ErrorResponse.Create(
                    "conflict", $"Ya existe un afiliado con el documento '{request.DocumentNumber}'."));
            }
        }

        member.DocumentType = request.DocumentType;
        member.DocumentNumber = request.DocumentNumber;
        member.BirthDate = request.BirthDate;
        member.NationalityCountry = request.NationalityCountry;
        member.Email = request.Email;
        member.Gender = request.Gender;
        member.FirstName = request.FirstName;
        member.LastName = request.LastName;
        member.Occupation = request.Occupation;
        member.EducationLevel = request.EducationLevel;
        member.Locality = request.Locality;
        member.Neighborhood = request.Neighborhood;
        member.Address = request.Address;
        member.ContactPhone = request.ContactPhone;
        member.ContactName = request.ContactName;
        member.EmergencyContactName = request.EmergencyContactName;
        member.EmergencyContactPhone = request.EmergencyContactPhone;
        member.WantsCulturalAgenda = request.WantsCulturalAgenda;
        member.AgreementAccepted = request.AgreementAccepted;

        await db.SaveChangesAsync();

        return Ok(MemberDto.FromEntity(member));
    }
}
