using System.ComponentModel.DataAnnotations;

namespace Library.Api.Auth;

public class JwtOptions
{
    public const string SectionName = "Jwt";

    [Required(AllowEmptyStrings = false)]
    public required string Key { get; set; }

    [Required(AllowEmptyStrings = false)]
    public required string Issuer { get; set; }

    [Required(AllowEmptyStrings = false)]
    public required string Audience { get; set; }

    public int ExpiresInMinutes { get; set; } = 480;
}
