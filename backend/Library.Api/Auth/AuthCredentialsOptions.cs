namespace Library.Api.Auth;

/// <summary>Single shared login for the management API — there are no per-user accounts or roles.</summary>
public class AuthCredentialsOptions
{
    public const string SectionName = "Auth";

    public required string Username { get; set; }
    public required string Password { get; set; }
}
