namespace Library.Api.Common;

public class PagedResult<T>
{
    public required IReadOnlyList<T> Data { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int Total { get; set; }
}
