using Library.Api.Common;
using Library.Api.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Data;

/// <summary>
/// Shared by LoansController and ReportsController so a loan's status is always accurate
/// regardless of which endpoint is hit first — reports must not undercount overdue loans
/// just because nobody has listed /loans recently.
/// </summary>
public static class LoanMaintenance
{
    public static async Task MarkOverdueLoansAsync(LibraryDbContext db)
    {
        var today = LibraryClock.Today;
        await db.Loans
            .Where(l => l.Status == LoanStatus.Prestado && l.DueDate < today)
            .ExecuteUpdateAsync(setters => setters.SetProperty(l => l.Status, LoanStatus.Vencido));
    }
}
