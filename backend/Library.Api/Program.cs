using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Library.Api.Auth;
using Library.Api.Common;
using Library.Api.Data;
using Library.Api.Email;
using Library.Api.Domain.Enums;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

// --- Options ---
builder.Services.AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddOptions<AuthCredentialsOptions>()
    .Bind(builder.Configuration.GetSection(AuthCredentialsOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? throw new InvalidOperationException("Missing 'Jwt' configuration section.");

builder.Services.AddSingleton<TokenService>();

builder.Services.AddOptions<EmailOptions>()
    .Bind(builder.Configuration.GetSection(EmailOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddSingleton<IEmailService, EmailService>();

// --- Database (Postgres, snake_case columns, native Spanish-labeled enums) ---
var connectionString = builder.Configuration.GetConnectionString("LibraryDb")
    ?? throw new InvalidOperationException("Missing 'ConnectionStrings:LibraryDb' configuration value.");

var enumNameTranslator = new SpanishEnumLabelNameTranslator();

// NOTE: MapEnum must be called *inside* the UseNpgsql npgsqlOptions delegate, not on an
// externally built NpgsqlDataSource passed to UseNpgsql(dataSource) — the latter is a known
// bug (npgsql/efcore.pg#2603) where the enum never gets wired into the EF Core type mapping,
// silently falling back to plain int and breaking every read/write against the column.
builder.Services.AddDbContext<LibraryDbContext>(options =>
    options.UseNpgsql(connectionString, npgsqlOptions =>
        {
            npgsqlOptions.MapEnum<BookStatus>(nameTranslator: enumNameTranslator);
            npgsqlOptions.MapEnum<LoanStatus>(nameTranslator: enumNameTranslator);
        })
        .UseSnakeCaseNamingConvention());

// --- Auth (single shared login, JWT bearer, no roles) ---
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key))
        };

        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsJsonAsync(
                    ErrorResponse.Create("unauthorized", "Se requiere un token de acceso válido."));
            },
            OnForbidden = async context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsJsonAsync(
                    ErrorResponse.Create("forbidden", "No tiene permisos para acceder a este recurso."));
            }
        };
    });

builder.Services.AddAuthorization();

// --- Controllers with snake_case JSON + error envelope for validation failures ---
builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    options.JsonSerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower;
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
});

builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var message = string.Join(
            " ",
            context.ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage));

        return new BadRequestObjectResult(
            ErrorResponse.Create("validation_error", string.IsNullOrWhiteSpace(message) ? "Solicitud inválida." : message));
    };
});

// --- Swagger ---
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "Library API", Version = "v1" });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Ingrese el token JWT obtenido en /api/v1/auth/login."
    });

    options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        { new OpenApiSecuritySchemeReference("Bearer", document), new List<string>() }
    });
});

var app = builder.Build();

// --- Error envelope for unhandled exceptions ---
app.UseExceptionHandler(exceptionHandlerApp =>
{
    exceptionHandlerApp.Run(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(
            ErrorResponse.Create("internal_error", "Ocurrió un error inesperado."));
    });
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options => options.SwaggerEndpoint("/swagger/v1/swagger.json", "Library API v1"));
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
