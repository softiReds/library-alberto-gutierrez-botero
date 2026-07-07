using Library.Api.Auth;
using Library.Api.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Library.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController(TokenService tokenService, IOptions<AuthCredentialsOptions> authOptions) : ControllerBase
{
    private readonly AuthCredentialsOptions _authOptions = authOptions.Value;

    [HttpPost("login")]
    public ActionResult<LoginResponse> Login(LoginRequest request)
    {
        if (request.Username != _authOptions.Username || request.Password != _authOptions.Password)
        {
            return Unauthorized(ErrorResponse.Create("invalid_credentials", "Usuario o contraseña incorrectos."));
        }

        var (token, expiresAt) = tokenService.GenerateToken(request.Username);
        return Ok(new LoginResponse { Token = token, ExpiresAt = expiresAt });
    }
}
