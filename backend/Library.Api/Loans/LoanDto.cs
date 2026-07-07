using Library.Api.Common;
using Library.Api.Domain.Entities;
using Library.Api.Domain.Enums;

namespace Library.Api.Loans;

public class LoanDto
{
    public Guid Id { get; set; }
    public required BookSummaryDto Book { get; set; }
    public required MemberSummaryDto Member { get; set; }
    public DateOnly LoanDate { get; set; }
    public DateOnly DueDate { get; set; }
    public DateOnly? ReturnDate { get; set; }
    public LoanStatus Status { get; set; }
    public string? ConditionAtReturn { get; set; }

    public static LoanDto FromEntity(Loan loan) => new()
    {
        Id = loan.Id,
        Book = BookSummaryDto.FromEntity(loan.Book!),
        Member = MemberSummaryDto.FromEntity(loan.Member!),
        LoanDate = loan.LoanDate,
        DueDate = loan.DueDate,
        ReturnDate = loan.ReturnDate,
        Status = loan.Status,
        ConditionAtReturn = loan.ConditionAtReturn
    };
}
