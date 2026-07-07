namespace Library.Api.Common;

public class ErrorResponse
{
    public required ErrorDetail Error { get; set; }

    public static ErrorResponse Create(string code, string message) => new()
    {
        Error = new ErrorDetail { Code = code, Message = message }
    };
}

public class ErrorDetail
{
    public required string Code { get; set; }
    public required string Message { get; set; }
}
