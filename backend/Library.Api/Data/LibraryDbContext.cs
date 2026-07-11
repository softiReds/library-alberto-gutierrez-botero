using Library.Api.Domain.Entities;
using Library.Api.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Data;

public class LibraryDbContext(DbContextOptions<LibraryDbContext> options) : DbContext(options)
{
    public DbSet<Member> Members => Set<Member>();
    public DbSet<Book> Books => Set<Book>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<Loan> Loans => Set<Loan>();
    public DbSet<InHouseReading> InHouseReadings => Set<InHouseReading>();
    public DbSet<Attendance> Attendance => Set<Attendance>();
    public DbSet<Suggestion> Suggestions => Set<Suggestion>();
    public DbSet<SiteVisitCounter> SiteVisitCounters => Set<SiteVisitCounter>();
    public DbSet<GalleryPhoto> GalleryPhotos => Set<GalleryPhoto>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var enumNameTranslator = new SpanishEnumLabelNameTranslator();
        modelBuilder.HasPostgresEnum<BookStatus>(nameTranslator: enumNameTranslator);
        modelBuilder.HasPostgresEnum<LoanStatus>(nameTranslator: enumNameTranslator);

        modelBuilder.Entity<Member>(entity =>
        {
            entity.HasIndex(m => m.DocumentNumber).IsUnique();
        });

        modelBuilder.Entity<Book>(entity =>
        {
            entity.HasIndex(b => b.Barcode).IsUnique();
            entity.Property(b => b.Status).HasColumnType("book_status");
        });

        modelBuilder.Entity<Loan>(entity =>
        {
            entity.Property(l => l.Status).HasColumnType("loan_status");

            entity.HasOne(l => l.Book)
                .WithMany(b => b.Loans)
                .HasForeignKey(l => l.BookId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(l => l.Member)
                .WithMany(m => m.Loans)
                .HasForeignKey(l => l.MemberId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<InHouseReading>(entity =>
        {
            entity.HasOne(r => r.Book)
                .WithMany(b => b.InHouseReadings)
                .HasForeignKey(r => r.BookId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
