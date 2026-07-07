using Library.Api.Domain.Entities;

namespace Library.Api.Common;

public class BookSummaryDto
{
    public Guid Id { get; set; }
    public required string Title { get; set; }
    public required string Author { get; set; }
    public required string Barcode { get; set; }

    public static BookSummaryDto FromEntity(Book book) => new()
    {
        Id = book.Id,
        Title = book.Title,
        Author = book.Author,
        Barcode = book.Barcode
    };
}
