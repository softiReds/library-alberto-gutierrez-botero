namespace Library.Api.Email;

public class EmailOptions
{
    public const string SectionName = "Smtp";

    public required string Host { get; set; }
    public int Port { get; set; }
    public required string Username { get; set; }
    public required string Password { get; set; }
    public required string FromAddress { get; set; }
    public required string ToAddress { get; set; }
}
