namespace Library.Api.Reports;

public class CatalogReportDto
{
    public int Month { get; set; }
    public int Year { get; set; }

    /// <summary>Loans created in the queried month (by loan_date).</summary>
    public int LoansCount { get; set; }

    /// <summary>Snapshot as of now — not scoped to the queried month.</summary>
    public int LostBooksCount { get; set; }

    /// <summary>Loans returned during the queried month (by return_date), on or before due_date.</summary>
    public int ReturnedOnTimeCount { get; set; }

    /// <summary>Loans returned during the queried month (by return_date), after due_date.</summary>
    public int ReturnedLateCount { get; set; }

    /// <summary>Snapshot as of now — not scoped to the queried month.</summary>
    public int CurrentlyOverdueCount { get; set; }
}
