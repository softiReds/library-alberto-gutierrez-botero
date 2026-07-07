namespace Library.Api.Loans;

public class CreateLoanRequest
{
    public required Guid BookId { get; set; }
    public required Guid MemberId { get; set; }
    public required DateOnly DueDate { get; set; }
}
