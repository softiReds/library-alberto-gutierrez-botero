using System.ComponentModel.DataAnnotations;

namespace Library.Api.Suggestions;

public class CreateSuggestionRequest
{
    [Required(AllowEmptyStrings = false)]
    public required string Message { get; set; }

    public string? VisitorName { get; set; }
    public string? VisitorEmail { get; set; }
}
