namespace Library.Api.Reports;

public class AttendanceReportDto
{
    public int Month { get; set; }
    public int Year { get; set; }
    public int TotalVisits { get; set; }

    /// <summary>Keyed by whatever gender values actually exist in the data for the month.</summary>
    public required Dictionary<string, int> ByGender { get; set; }

    /// <summary>Fixed buckets (0-5, 6-15, 16-30, 31-50, 51-99) matching the coordinator's existing Excel report.</summary>
    public required Dictionary<string, int> ByAgeRange { get; set; }

    public int InHouseReadingCount { get; set; }

    /// <summary>Same value as CatalogReportDto.LoansCount, for the "in-house vs. loaned" comparison.</summary>
    public int LoansCount { get; set; }
}
