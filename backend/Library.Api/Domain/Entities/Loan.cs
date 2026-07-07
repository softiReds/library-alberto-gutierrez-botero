using Library.Api.Domain.Enums;

namespace Library.Api.Domain.Entities;

public class Loan
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid BookId { get; set; }
    public Book? Book { get; set; }

    public Guid MemberId { get; set; }
    public Member? Member { get; set; }

    public DateOnly LoanDate { get; set; }
    public DateOnly DueDate { get; set; }
    public DateOnly? ReturnDate { get; set; }
    public LoanStatus Status { get; set; } = LoanStatus.Prestado;
    public string? ConditionAtReturn { get; set; }
}
