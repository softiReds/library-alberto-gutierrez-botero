namespace Library.Api.Email;

/// <summary>
/// Entirely optional: the suggestion box must keep working even with no SMTP configured at
/// all (EmailService checks for that and skips sending with a logged warning instead of
/// attempting a doomed connection) — email notification is a best-effort side channel, not
/// a requirement for the app to start or for suggestions to be saved.
/// </summary>
public class EmailOptions
{
    public const string SectionName = "Smtp";

    public string? Host { get; set; }
    public int Port { get; set; }
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string? FromAddress { get; set; }
    public string? ToAddress { get; set; }
}
