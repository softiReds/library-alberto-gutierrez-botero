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
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

// Render (and similar PaaS hosts) inject a dynamic $PORT at container runtime and expect
// the app to listen on it — it's not known at image build time, so it can't be baked into
// the Dockerfile as a fixed ASPNETCORE_URLS/EXPOSE. Locally, PORT is unset and Kestrel just
// falls back to its normal default (launchSettings.json profiles).
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
{
    builder.WebHost.UseUrls($"http://+:{port}");
}

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

// No ValidateOnStart here: SMTP config is entirely optional (see EmailOptions/EmailService).
builder.Services.AddOptions<EmailOptions>()
    .Bind(builder.Configuration.GetSection(EmailOptions.SectionName));

builder.Services.AddSingleton<IEmailService, EmailService>();

// --- Database (Postgres, snake_case columns, native Spanish-labeled enums) ---
// Production (Render running the app, Aiven for the database): DATABASE_URL, a postgres://
// URI, injected as an environment variable. Local development only: ConnectionStrings:LibraryDb
// from appsettings*.json.
var connectionString = ResolveConnectionString(builder.Configuration);

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

// --- CORS: the public site is hosted on GitHub Pages (a *.github.io subdomain) ---
const string GitHubPagesCorsPolicy = "GitHubPages";
builder.Services.AddCors(options =>
{
    options.AddPolicy(GitHubPagesCorsPolicy, policy =>
        policy.SetIsOriginAllowed(origin =>
                Uri.TryCreate(origin, UriKind.Absolute, out var originUri) &&
                originUri.Host.EndsWith(".github.io", StringComparison.OrdinalIgnoreCase))
            .AllowAnyHeader()
            .AllowAnyMethod());
});

// --- Controllers with snake_case JSON + error envelope for validation failures ---
builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    // Deliberately no DictionaryKeyPolicy: the snake_case convention applies to schema
    // property names, not to dictionary keys derived from actual data (e.g. report
    // breakdowns keyed by a gender value or age range label) — those must round-trip as-is.
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

// --- Apply pending migrations at startup ---
// Logged, not silent, and not fatal: a transient DB outage at cold start shouldn't
// crash-loop the container — it should show up loudly in the log stream instead.
using (var migrationScope = app.Services.CreateScope())
{
    var dbContext = migrationScope.ServiceProvider.GetRequiredService<LibraryDbContext>();
    var startupLogger = migrationScope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    try
    {
        dbContext.Database.Migrate();
    }
    catch (Exception ex)
    {
        startupLogger.LogError(ex, "Failed to apply database migrations on startup.");
    }
}

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

app.UseCors(GitHubPagesCorsPolicy);

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

static string ResolveConnectionString(IConfiguration configuration)
{
    var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    if (!string.IsNullOrWhiteSpace(databaseUrl))
    {
        return BuildConnectionStringFromDatabaseUrl(databaseUrl);
    }

    return configuration.GetConnectionString("LibraryDb")
        ?? throw new InvalidOperationException(
            "No database connection configured. Set the DATABASE_URL environment variable " +
            "(production) or ConnectionStrings:LibraryDb in appsettings.json / " +
            "appsettings.Development.json (local development).");
}

static string BuildConnectionStringFromDatabaseUrl(string databaseUrl)
{
    // Aiven injects DATABASE_URL as a postgres:// URI, not a Npgsql-style keyword=value
    // connection string, so it needs converting.
    var uri = new Uri(databaseUrl);
    var userInfo = uri.UserInfo.Split(':', 2);

    var npgsqlBuilder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Username = Uri.UnescapeDataString(userInfo[0]),
        Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
        Database = uri.AbsolutePath.TrimStart('/'),
        // Require: Aiven's PostgreSQL always enforces SSL, so if TLS can't be negotiated for
        // any reason the connection should fail loudly here instead of silently falling back
        // to an unencrypted connection the way Prefer would.
        SslMode = SslMode.Require
    };

    return npgsqlBuilder.ConnectionString;
}
