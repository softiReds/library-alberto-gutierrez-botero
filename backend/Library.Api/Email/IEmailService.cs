namespace Library.Api.Email;

public interface IEmailService
{
    /// <summary>
    /// Sends a plain-text email to the configured coordinator inbox. Never throws — failures
    /// are logged and swallowed, since a notification email failing must not affect whatever
    /// database write it's reporting on.
    /// </summary>
    Task SendAsync(string subject, string body);
}
