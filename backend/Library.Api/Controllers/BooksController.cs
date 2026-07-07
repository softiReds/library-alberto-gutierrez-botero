using Library.Api.Books;
using Library.Api.Common;
using Library.Api.Data;
using Library.Api.Domain.Entities;
using Library.Api.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Controllers;

[ApiController]
[Route("api/v1/books")]
public class BooksController(LibraryDbContext db) : ControllerBase
{
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<PagedResult<BookPublicDto>>> GetBooks(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery(Name = "page_size")] int pageSize = 20)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        var query = db.Books.Where(b => b.Status != BookStatus.Baja);

        if (!string.IsNullOrWhiteSpace(search))
        {
            query = query.Where(b =>
                EF.Functions.ILike(b.Title, $"%{search}%") ||
                EF.Functions.ILike(b.Author, $"%{search}%"));
        }

        var total = await query.CountAsync();

        var books = await query
            .OrderBy(b => b.Title)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new PagedResult<BookPublicDto>
        {
            Data = books.Select(BookPublicDto.FromEntity).ToList(),
            Page = page,
            PageSize = pageSize,
            Total = total
        });
    }

    [HttpGet("featured")]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<BookPublicDto>>> GetFeaturedBooks()
    {
        var books = await db.Books
            .Where(b => b.Featured && b.Status != BookStatus.Baja)
            .OrderBy(b => b.Title)
            .ToListAsync();

        return Ok(books.Select(BookPublicDto.FromEntity).ToList());
    }

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<ActionResult<BookPublicDto>> GetBook(Guid id)
    {
        var book = await db.Books.FirstOrDefaultAsync(b => b.Id == id && b.Status != BookStatus.Baja);

        if (book is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "El libro solicitado no existe."));
        }

        return Ok(BookPublicDto.FromEntity(book));
    }

    [HttpPost]
    [Authorize]
    public async Task<ActionResult<BookDto>> CreateBook(BookCreateRequest request)
    {
        var barcodeExists = await db.Books.AnyAsync(b => b.Barcode == request.Barcode);
        if (barcodeExists)
        {
            return Conflict(ErrorResponse.Create(
                "conflict", $"Ya existe un libro con el código de barras '{request.Barcode}'."));
        }

        var book = new Book
        {
            Barcode = request.Barcode,
            Title = request.Title,
            Author = request.Author,
            Classification = request.Classification,
            Subject = request.Subject,
            MaterialType = request.MaterialType,
            TargetAudience = request.TargetAudience,
            Publisher = request.Publisher,
            PublicationDate = request.PublicationDate,
            Isbn = request.Isbn,
            Status = request.Status ?? BookStatus.Disponible,
            Location = request.Location,
            Featured = request.Featured
        };

        db.Books.Add(book);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetBook), new { id = book.Id }, BookDto.FromEntity(book));
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<BookDto>> UpdateBook(Guid id, BookUpdateRequest request)
    {
        var book = await db.Books.FirstOrDefaultAsync(b => b.Id == id);
        if (book is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "El libro solicitado no existe."));
        }

        if (!string.Equals(book.Barcode, request.Barcode, StringComparison.Ordinal))
        {
            var barcodeTaken = await db.Books.AnyAsync(b => b.Barcode == request.Barcode && b.Id != id);
            if (barcodeTaken)
            {
                return Conflict(ErrorResponse.Create(
                    "conflict", $"Ya existe un libro con el código de barras '{request.Barcode}'."));
            }
        }

        book.Barcode = request.Barcode;
        book.Title = request.Title;
        book.Author = request.Author;
        book.Classification = request.Classification;
        book.Subject = request.Subject;
        book.MaterialType = request.MaterialType;
        book.TargetAudience = request.TargetAudience;
        book.Publisher = request.Publisher;
        book.PublicationDate = request.PublicationDate;
        book.Isbn = request.Isbn;
        book.Status = request.Status;
        book.Location = request.Location;
        book.Featured = request.Featured;

        await db.SaveChangesAsync();

        return Ok(BookDto.FromEntity(book));
    }

    [HttpPatch("{id:guid}/retire")]
    [Authorize]
    public async Task<ActionResult<BookDto>> RetireBook(Guid id)
    {
        var book = await db.Books.FirstOrDefaultAsync(b => b.Id == id);
        if (book is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "El libro solicitado no existe."));
        }

        if (book.Status == BookStatus.Prestado)
        {
            return BadRequest(ErrorResponse.Create(
                "validation_error",
                "No se puede dar de baja un libro que está actualmente prestado. Debe registrarse la devolución primero."));
        }

        book.Status = BookStatus.Baja;
        await db.SaveChangesAsync();

        return Ok(BookDto.FromEntity(book));
    }
}
