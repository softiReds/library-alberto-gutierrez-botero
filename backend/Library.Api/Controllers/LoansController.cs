using Library.Api.Common;
using Library.Api.Data;
using Library.Api.Domain.Enums;
using Library.Api.Loans;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Controllers;

[ApiController]
[Route("api/v1/loans")]
[Authorize]
public class LoansController(LibraryDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<LoanDto>>> GetLoans(
        [FromQuery] LoanStatus? status,
        [FromQuery(Name = "member_id")] Guid? memberId,
        [FromQuery(Name = "book_id")] Guid? bookId,
        [FromQuery] int page = 1,
        [FromQuery(Name = "page_size")] int pageSize = 20)
    {
        await LoanMaintenance.MarkOverdueLoansAsync(db);

        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        var query = db.Loans.Include(l => l.Book).Include(l => l.Member).AsQueryable();

        if (status is not null)
        {
            query = query.Where(l => l.Status == status);
        }

        if (memberId is not null)
        {
            query = query.Where(l => l.MemberId == memberId);
        }

        if (bookId is not null)
        {
            query = query.Where(l => l.BookId == bookId);
        }

        var total = await query.CountAsync();

        var loans = await query
            .OrderByDescending(l => l.LoanDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new PagedResult<LoanDto>
        {
            Data = loans.Select(LoanDto.FromEntity).ToList(),
            Page = page,
            PageSize = pageSize,
            Total = total
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<LoanDto>> GetLoan(Guid id)
    {
        await LoanMaintenance.MarkOverdueLoansAsync(db);

        var loan = await db.Loans.Include(l => l.Book).Include(l => l.Member).FirstOrDefaultAsync(l => l.Id == id);
        if (loan is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "El préstamo solicitado no existe."));
        }

        return Ok(LoanDto.FromEntity(loan));
    }

    [HttpPost]
    public async Task<ActionResult<LoanDto>> CreateLoan(CreateLoanRequest request)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        if (request.DueDate <= today)
        {
            return BadRequest(ErrorResponse.Create(
                "validation_error", "La fecha de vencimiento (due_date) debe ser posterior a la fecha actual."));
        }

        var book = await db.Books.FirstOrDefaultAsync(b => b.Id == request.BookId);
        if (book is null)
        {
            return BadRequest(ErrorResponse.Create("validation_error", "El libro indicado no existe."));
        }

        if (book.Status != BookStatus.Disponible)
        {
            return BadRequest(ErrorResponse.Create(
                "validation_error",
                $"El libro no está disponible para préstamo (estado actual: '{book.Status.ToSpanishLabel()}')."));
        }

        var member = await db.Members.FirstOrDefaultAsync(m => m.Id == request.MemberId);
        if (member is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "El afiliado indicado no existe."));
        }

        var entity = new Domain.Entities.Loan
        {
            BookId = book.Id,
            MemberId = member.Id,
            LoanDate = today,
            DueDate = request.DueDate,
            Status = LoanStatus.Prestado
        };

        book.Status = BookStatus.Prestado;

        db.Loans.Add(entity);

        // Single SaveChangesAsync call = one implicit transaction: the loan insert and the
        // book status update commit (or roll back) together.
        await db.SaveChangesAsync();

        entity.Book = book;
        entity.Member = member;

        return CreatedAtAction(nameof(GetLoan), new { id = entity.Id }, LoanDto.FromEntity(entity));
    }

    [HttpPatch("{id:guid}/return")]
    public async Task<ActionResult<LoanDto>> ReturnLoan(Guid id, ReturnLoanRequest request)
    {
        var loan = await db.Loans.Include(l => l.Book).Include(l => l.Member).FirstOrDefaultAsync(l => l.Id == id);
        if (loan is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "El préstamo solicitado no existe."));
        }

        if (loan.Status != LoanStatus.Prestado)
        {
            return BadRequest(ErrorResponse.Create(
                "validation_error",
                $"Este préstamo ya figura como '{loan.Status.ToSpanishLabel()}' y no puede devolverse de nuevo."));
        }

        loan.ReturnDate = DateOnly.FromDateTime(DateTime.UtcNow);
        loan.Status = LoanStatus.Devuelto;
        loan.ConditionAtReturn = request.ConditionAtReturn;
        loan.Book!.Status = BookStatus.Disponible;

        // Single SaveChangesAsync call = one implicit transaction, same as CreateLoan above.
        await db.SaveChangesAsync();

        return Ok(LoanDto.FromEntity(loan));
    }
}
