namespace Library.Api.Domain.Entities;

public class InHouseReading
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid? BookId { get; set; }
    public Book? Book { get; set; }

    /// <summary>Used when the book has no barcode and cannot be linked to a Book row.</summary>
    public string? BookTitleFallback { get; set; }

    public DateOnly ReadingDate { get; set; }
}
