namespace Library.Api.Domain.Entities;

public class GalleryPhoto
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required byte[] ImageData { get; set; }
    public required string ContentType { get; set; }
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
}
