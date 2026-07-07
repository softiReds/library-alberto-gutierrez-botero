using Library.Api.Common;
using Library.Api.Domain.Entities;

namespace Library.Api.InHouseReadings;

public class InHouseReadingDto
{
    public Guid Id { get; set; }
    public BookSummaryDto? Book { get; set; }
    public string? BookTitleFallback { get; set; }
    public DateOnly ReadingDate { get; set; }

    public static InHouseReadingDto FromEntity(InHouseReading reading) => new()
    {
        Id = reading.Id,
        Book = reading.Book is null ? null : BookSummaryDto.FromEntity(reading.Book),
        BookTitleFallback = reading.BookTitleFallback,
        ReadingDate = reading.ReadingDate
    };
}
