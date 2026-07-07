using System.ComponentModel.DataAnnotations;
using Library.Api.Domain.Enums;

namespace Library.Api.Books;

public class BookCreateRequest
{
    [Required(AllowEmptyStrings = false)]
    public required string Barcode { get; set; }

    [Required(AllowEmptyStrings = false)]
    public required string Title { get; set; }

    [Required(AllowEmptyStrings = false)]
    public required string Author { get; set; }

    public string? Classification { get; set; }
    public string? Subject { get; set; }
    public string? MaterialType { get; set; }
    public string? TargetAudience { get; set; }
    public string? Publisher { get; set; }
    public DateOnly? PublicationDate { get; set; }
    public string? Isbn { get; set; }

    /// <summary>Defaults to Disponible when not provided.</summary>
    public BookStatus? Status { get; set; }

    public string? Location { get; set; }
    public bool Featured { get; set; }
}
