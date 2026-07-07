using Library.Api.Domain.Entities;

namespace Library.Api.Common;

public class MemberSummaryDto
{
    public Guid Id { get; set; }
    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public required string DocumentNumber { get; set; }

    public static MemberSummaryDto FromEntity(Member member) => new()
    {
        Id = member.Id,
        FirstName = member.FirstName,
        LastName = member.LastName,
        DocumentNumber = member.DocumentNumber
    };
}
