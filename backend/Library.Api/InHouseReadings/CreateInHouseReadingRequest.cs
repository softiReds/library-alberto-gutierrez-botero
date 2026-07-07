namespace Library.Api.InHouseReadings;

public class CreateInHouseReadingRequest
{
    public Guid? BookId { get; set; }

    /// <summary>Used for books without a barcode that can't be linked via BookId.</summary>
    public string? BookTitleFallback { get; set; }

    /// <summary>Defaults to today when not provided.</summary>
    public DateOnly? ReadingDate { get; set; }
}
