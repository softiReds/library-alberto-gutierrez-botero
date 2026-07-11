using Library.Api.Domain.Entities;

namespace Library.Api.Gallery;

public class GalleryPhotoDto
{
    public Guid Id { get; set; }
    public required string ImageUrl { get; set; }
    public DateTimeOffset UploadedAt { get; set; }

    public static GalleryPhotoDto FromEntity(GalleryPhoto photo) => new()
    {
        Id = photo.Id,
        ImageUrl = $"/gallery/{photo.Id}/image",
        UploadedAt = photo.UploadedAt
    };
}
