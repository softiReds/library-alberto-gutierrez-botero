namespace Library.Api.Domain.Entities;

public class Suggestion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Message { get; set; }
    public DateTimeOffset SubmittedAt { get; set; } = DateTimeOffset.UtcNow;
    public string? VisitorName { get; set; }
    public string? VisitorEmail { get; set; }

    /// <summary>Plain string on purpose ("nueva"/"leída") — no native enum needed for this field.</summary>
    public string Status { get; set; } = "nueva";
}
