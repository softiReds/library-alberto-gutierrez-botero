using System.ComponentModel.DataAnnotations;

namespace Library.Api.Loans;

public class ReturnLoanRequest
{
    [Required(AllowEmptyStrings = false)]
    public required string ConditionAtReturn { get; set; }
}
