using Library.Api.Domain.Entities;
using Library.Api.Domain.Enums;

namespace Library.Api.Books;

/// <summary>Public catalog representation — omits management-only fields (barcode, created_at).</summary>
public class BookPublicDto
{
    public Guid Id { get; set; }
    public required string Title { get; set; }
    public required string Author { get; set; }
    public string? Classification { get; set; }
    public string? Subject { get; set; }
    public string? MaterialType { get; set; }
    public string? TargetAudience { get; set; }
    public string? Publisher { get; set; }
    public DateOnly? PublicationDate { get; set; }
    public string? Isbn { get; set; }
    public BookStatus Status { get; set; }
    public string? Location { get; set; }
    public bool Featured { get; set; }

    public static BookPublicDto FromEntity(Book book) => new()
    {
        Id = book.Id,
        Title = book.Title,
        Author = book.Author,
        Classification = book.Classification,
        Subject = book.Subject,
        MaterialType = book.MaterialType,
        TargetAudience = book.TargetAudience,
        Publisher = book.Publisher,
        PublicationDate = book.PublicationDate,
        Isbn = book.Isbn,
        Status = book.Status,
        Location = book.Location,
        Featured = book.Featured
    };
}
