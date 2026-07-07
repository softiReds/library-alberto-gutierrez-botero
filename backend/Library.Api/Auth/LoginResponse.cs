namespace Library.Api.Auth;

public class LoginResponse
{
    public required string Token { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}
