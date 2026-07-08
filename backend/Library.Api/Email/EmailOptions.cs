using System.ComponentModel.DataAnnotations;

namespace Library.Api.Email;

public class EmailOptions
{
    public const string SectionName = "Smtp";

    [Required(AllowEmptyStrings = false)]
    public required string Host { get; set; }

    public int Port { get; set; }

    [Required(AllowEmptyStrings = false)]
    public required string Username { get; set; }

    [Required(AllowEmptyStrings = false)]
    public required string Password { get; set; }

    [Required(AllowEmptyStrings = false)]
    public required string FromAddress { get; set; }

    [Required(AllowEmptyStrings = false)]
    public required string ToAddress { get; set; }
}
