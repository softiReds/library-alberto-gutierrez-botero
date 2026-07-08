using Library.Api.Domain.Entities;

namespace Library.Api.Suggestions;

public class SuggestionDto
{
    public Guid Id { get; set; }
    public required string Message { get; set; }
    public DateTimeOffset SubmittedAt { get; set; }
    public string? VisitorName { get; set; }
    public string? VisitorEmail { get; set; }
    public required string Status { get; set; }

    public static SuggestionDto FromEntity(Suggestion suggestion) => new()
    {
        Id = suggestion.Id,
        Message = suggestion.Message,
        SubmittedAt = suggestion.SubmittedAt,
        VisitorName = suggestion.VisitorName,
        VisitorEmail = suggestion.VisitorEmail,
        Status = suggestion.Status
    };
}
