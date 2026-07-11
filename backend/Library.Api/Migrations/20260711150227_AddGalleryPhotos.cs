using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Library.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGalleryPhotos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "gallery_photos",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    image_data = table.Column<byte[]>(type: "bytea", nullable: false),
                    content_type = table.Column<string>(type: "text", nullable: false),
                    uploaded_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_gallery_photos", x => x.id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "gallery_photos");
        }
    }
}
