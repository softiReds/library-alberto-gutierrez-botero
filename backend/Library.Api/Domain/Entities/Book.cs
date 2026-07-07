using Library.Api.Domain.Enums;

namespace Library.Api.Domain.Entities;

public class Book
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Barcode { get; set; }
    public required string Title { get; set; }
    public required string Author { get; set; }
    public string? Classification { get; set; }
    public string? Subject { get; set; }
    public string? MaterialType { get; set; }
    public string? TargetAudience { get; set; }
    public string? Publisher { get; set; }
    public DateOnly? PublicationDate { get; set; }
    public string? Isbn { get; set; }
    public BookStatus Status { get; set; } = BookStatus.Disponible;
    public string? Location { get; set; }
    public bool Featured { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Loan> Loans { get; set; } = new List<Loan>();
    public ICollection<InHouseReading> InHouseReadings { get; set; } = new List<InHouseReading>();
}
