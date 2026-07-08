using System.ComponentModel.DataAnnotations;

namespace Library.Api.Auth;

/// <summary>Single shared login for the management API — there are no per-user accounts or roles.</summary>
public class AuthCredentialsOptions
{
    public const string SectionName = "Auth";

    [Required(AllowEmptyStrings = false)]
    public required string Username { get; set; }

    [Required(AllowEmptyStrings = false)]
    public required string Password { get; set; }
}
