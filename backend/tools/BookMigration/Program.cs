// =====================================================================
// Herramienta de migración de catálogo (Excel -> Postgres), de un solo
// uso. No se despliega, no es parte de Library.Api en producción — se
// corre localmente contra la base de datos (local o Aiven, vía la
// misma resolución de connection string que usa el backend).
//
// Uso:
//   dotnet run --                                  (dry-run, no escribe nada)
//   dotnet run -- --apply                          (escribe en la BD real)
//   dotnet run -- --file /ruta/a/inventory.xlsx
//   dotnet run -- --report /ruta/al/reporte.csv
//
// La conexión a la base de datos se resuelve igual que en Library.Api:
// variable de entorno DATABASE_URL (Aiven/producción) si está presente,
// si no, LIBRARY_DB_CONNECTION, si no, el default de desarrollo local
// (el mismo de docker-compose/appsettings.Development.json).
// =====================================================================

using System.Globalization;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using Library.Api.Data;
using Library.Api.Domain.Entities;
using Library.Api.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Npgsql;

var excelPath = GetArg(args, "--file") ?? Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "inventory.xlsx");
var apply = args.Contains("--apply");
var reportPath = GetArg(args, "--report") ?? $"migration-report-{DateTime.Now:yyyyMMdd-HHmmss}.csv";

Console.WriteLine($"Excel: {excelPath}");
Console.WriteLine(apply
    ? "MODO: --apply — esto va a escribir libros reales en la base de datos."
    : "MODO: dry-run — no se escribe nada, solo se genera el reporte.");
Console.WriteLine();

if (!File.Exists(excelPath))
{
    Console.Error.WriteLine($"No se encontró el archivo: {excelPath}");
    return 1;
}

var connectionString = ResolveConnectionString();
var enumNameTranslator = new SpanishEnumLabelNameTranslator();

var optionsBuilder = new DbContextOptionsBuilder<LibraryDbContext>();
optionsBuilder.UseNpgsql(connectionString, npgsqlOptions =>
    {
        npgsqlOptions.MapEnum<BookStatus>(nameTranslator: enumNameTranslator);
        npgsqlOptions.MapEnum<LoanStatus>(nameTranslator: enumNameTranslator);
    })
    .UseSnakeCaseNamingConvention();

await using var db = new LibraryDbContext(optionsBuilder.Options);

Console.WriteLine("Conectando y cargando codigos de barras existentes...");
var existingBarcodes = new HashSet<string>(await db.Books.Select(b => b.Barcode).ToListAsync());
Console.WriteLine($"  {existingBarcodes.Count} libros ya existen en la base de datos.");
Console.WriteLine();

var usedBarcodes = new HashSet<string>(existingBarcodes);
var results = new List<RowResult>();
var toInsert = new List<Book>();

using (var workbook = new XLWorkbook(excelPath))
{
    ProcessMainCatalog(workbook.Worksheet("catalogo "), results, toInsert, existingBarcodes, usedBarcodes);
    ProcessUncatalogued(workbook.Worksheet("inventario sin catalogar"), results, toInsert, existingBarcodes, usedBarcodes);
}

WriteReport(reportPath, results);

var created = results.Count(r => r.Outcome == Outcome.Created);
var withWarning = results.Count(r => r.Outcome == Outcome.Created && r.Warnings.Count > 0);
var errors = results.Count(r => r.Outcome == Outcome.Error);
var duplicates = results.Count(r => r.Outcome == Outcome.SkippedDuplicate);
var pendingBarcodes = results.Count(r => r.GeneratedBarcode is not null);

Console.WriteLine();
Console.WriteLine("===== RESUMEN =====");
Console.WriteLine($"Filas procesadas:              {results.Count}");
Console.WriteLine($"Libros a crear / creados:      {created}");
Console.WriteLine($"  de esos, con advertencia:     {withWarning}");
Console.WriteLine($"  de esos, con barcode PENDIENTE-*: {pendingBarcodes}");
Console.WriteLine($"Excluidos por error:           {errors}");
Console.WriteLine($"Omitidos (barcode ya existía): {duplicates}");
Console.WriteLine($"Reporte: {Path.GetFullPath(reportPath)}");

if (apply)
{
    Console.WriteLine();
    Console.WriteLine($"Insertando {toInsert.Count} libros en la base de datos...");
    foreach (var chunk in toInsert.Chunk(500))
    {
        db.Books.AddRange(chunk);
        await db.SaveChangesAsync();
        Console.WriteLine($"  ...{chunk.Length} insertados.");
    }
    Console.WriteLine("Listo.");
}
else
{
    Console.WriteLine();
    Console.WriteLine("Dry-run: no se escribió nada. Corre con --apply para aplicar de verdad.");
}

return 0;

// =====================================================================
// Procesamiento: hoja principal "catalogo "
// =====================================================================
static void ProcessMainCatalog(
    IXLWorksheet sheet, List<RowResult> results, List<Book> toInsert,
    HashSet<string> existingBarcodes, HashSet<string> usedBarcodes)
{
    const string sheetName = "catalogo";
    var lastRow = sheet.LastRowUsed()!.RowNumber();

    // Columnas (1-indexadas): 2=TITULO 3=Autor 4=Clasificación 5=Editor
    // 6=Fecha_publicación 7=ISBN 9=Cod_barras 14=Tipo_de_material
    // 15=Público_objetivo 16=Localización 17=Estado_de_Proceso
    // 18=Fecha_creación 19=Materia
    for (var r = 2; r <= lastRow; r++)
    {
        var row = sheet.Row(r);
        var title = row.Cell(2).GetString().Trim();

        if (string.IsNullOrWhiteSpace(title))
        {
            continue; // fila vacía, no es un error, se ignora
        }

        var result = new RowResult { Sheet = sheetName, RowNumber = r, Title = title };

        var author = row.Cell(3).GetString().Trim();
        if (string.IsNullOrWhiteSpace(author))
        {
            author = "Autor no registrado";
            result.Warnings.Add("Autor no registrado en el Excel");
        }

        var classification = NullIfEmpty(row.Cell(4).GetString());
        var publisher = NullIfEmpty(row.Cell(5).GetString());
        var publicationDate = ParsePublicationYear(row.Cell(6));

        var isbnRaw = ReadIdentifierRaw(row.Cell(7));
        var isbns = SplitIsbns(isbnRaw);

        var realBarcode = NullIfEmpty(ReadIdentifierRaw(row.Cell(9)) ?? "");

        var materialType = ValidateStandard(row.Cell(14).GetString(), StandardValues.MaterialTypes, result, "Tipo_de_material");
        var targetAudience = ValidateStandard(row.Cell(15).GetString(), StandardValues.TargetAudiences, result, "Público_objetivo");
        var location = ValidateStandard(row.Cell(16).GetString(), StandardValues.Locations, result, "Localización");
        var status = MapStatus(row.Cell(17).GetString(), result);
        var createdAt = ParseCreatedAt(row.Cell(18)) ?? DateTimeOffset.UtcNow;
        var subject = NullIfEmpty(row.Cell(19).GetString());

        CreateBooksForRow(
            results, toInsert, existingBarcodes, usedBarcodes, result,
            sheetName, r, title, author, classification, publisher, publicationDate,
            isbns, realBarcode, materialType, targetAudience, location, status, createdAt, subject);
    }
}

// =====================================================================
// Procesamiento: hoja "inventario sin catalogar"
// (sin Tipo_de_material/Público_objetivo/Localización/Estado_de_Proceso
// en el Excel -> quedan null / Disponible por defecto)
// =====================================================================
static void ProcessUncatalogued(
    IXLWorksheet sheet, List<RowResult> results, List<Book> toInsert,
    HashSet<string> existingBarcodes, HashSet<string> usedBarcodes)
{
    const string sheetName = "inventario_sin_catalogar";
    var lastRow = sheet.LastRowUsed()!.RowNumber();

    // Columnas (1-indexadas): 1=Título (header mal puesto) 2=Clasificación
    // 3=Autor 4=Editorial 7=Fecha_publicación 8=ISBN 9=Descripción(=Materia) 10=Cod_barras
    for (var r = 2; r <= lastRow; r++)
    {
        var row = sheet.Row(r);
        var title = row.Cell(1).GetString().Trim();

        if (string.IsNullOrWhiteSpace(title))
        {
            continue; // la gran mayoría de las 4997 filas están vacías
        }

        var result = new RowResult { Sheet = sheetName, RowNumber = r, Title = title };

        var author = row.Cell(3).GetString().Trim();
        if (string.IsNullOrWhiteSpace(author))
        {
            author = "Autor no registrado";
            result.Warnings.Add("Autor no registrado en el Excel");
        }

        var classification = NullIfEmpty(row.Cell(2).GetString());
        var publisher = NullIfEmpty(row.Cell(4).GetString());
        var publicationDate = ParsePublicationYear(row.Cell(7));

        var isbnRaw = ReadIdentifierRaw(row.Cell(8));
        var isbns = SplitIsbns(isbnRaw);

        var realBarcode = NullIfEmpty(ReadIdentifierRaw(row.Cell(10)) ?? "");
        var subject = NullIfEmpty(row.Cell(9).GetString());

        // Esta hoja no tiene estas columnas — quedan sin clasificar.
        string? materialType = null;
        string? targetAudience = null;
        string? location = null;
        var status = BookStatus.Disponible;
        var createdAt = DateTimeOffset.UtcNow;

        CreateBooksForRow(
            results, toInsert, existingBarcodes, usedBarcodes, result,
            sheetName, r, title, author, classification, publisher, publicationDate,
            isbns, realBarcode, materialType, targetAudience, location, status, createdAt, subject);
    }
}

// =====================================================================
// Compartido: dado los datos ya extraídos/normalizados de una fila,
// crea uno o varios Book (uno por ISBN si hay varios separados por ";").
// =====================================================================
static void CreateBooksForRow(
    List<RowResult> results, List<Book> toInsert, HashSet<string> existingBarcodes, HashSet<string> usedBarcodes,
    RowResult baseResult, string sheetName, int rowNumber, string title, string author,
    string? classification, string? publisher, DateOnly? publicationDate,
    IReadOnlyList<string?> isbns, string? realBarcode, string? materialType, string? targetAudience,
    string? location, BookStatus status, DateTimeOffset createdAt, string? subject)
{
    for (var i = 0; i < isbns.Count; i++)
    {
        var isbn = isbns[i];
        var result = i == 0
            ? baseResult
            : new RowResult { Sheet = sheetName, RowNumber = rowNumber, Title = title, Warnings = [.. baseResult.Warnings] };

        if (i > 0)
        {
            result.Warnings.Add($"Copia adicional generada por ISBN múltiple en la misma fila (ISBN #{i + 1})");
        }

        // Solo el primer ISBN de la fila puede quedarse con el código de
        // barras real; los siguientes son copias físicas sin barcode propio.
        var barcodeCandidate = i == 0 ? realBarcode : null;

        string barcode;
        if (!string.IsNullOrWhiteSpace(barcodeCandidate) && existingBarcodes.Contains(barcodeCandidate))
        {
            // El barcode real ya existe en la BD -> esta fila ya fue migrada antes, se omite.
            result.Outcome = Outcome.SkippedDuplicate;
            result.Detail = $"El barcode '{barcodeCandidate}' ya existe en la base de datos.";
            results.Add(result);
            continue;
        }

        if (!string.IsNullOrWhiteSpace(barcodeCandidate) && !usedBarcodes.Contains(barcodeCandidate))
        {
            barcode = barcodeCandidate;
            usedBarcodes.Add(barcode);
        }
        else
        {
            barcode = GenerateBarcode(isbn, sheetName, rowNumber, i, usedBarcodes);
            result.GeneratedBarcode = barcode;
            result.Warnings.Add($"Sin código de barras en el Excel — se generó '{barcode}', pendiente de asignar uno físico.");
        }

        var book = new Book
        {
            Barcode = barcode,
            Title = title,
            Author = author,
            Classification = classification,
            Subject = subject,
            MaterialType = materialType,
            TargetAudience = targetAudience,
            Publisher = publisher,
            PublicationDate = publicationDate,
            Isbn = isbn,
            Status = status,
            Location = location,
            Featured = false,
            CreatedAt = createdAt
        };

        toInsert.Add(book);
        result.Outcome = Outcome.Created;
        results.Add(result);
    }
}

// =====================================================================
// Utilidades de lectura/parseo
// =====================================================================

static string? NullIfEmpty(string value)
{
    var trimmed = value.Trim();
    return string.IsNullOrEmpty(trimmed) ? null : trimmed;
}

// Lee ISBN/Cod_barras preservando toda la precisión aunque Excel los
// muestre en notación científica (ej. "9.78959E+12" en pantalla, pero
// el valor real de la celda es 9789587434484 completo).
static string? ReadIdentifierRaw(IXLCell cell)
{
    if (cell.IsEmpty()) return null;

    if (cell.DataType == XLDataType.Number)
    {
        var value = cell.GetValue<double>();
        return ((long)value).ToString(CultureInfo.InvariantCulture);
    }

    return NullIfEmpty(cell.GetString());
}

static List<string?> SplitIsbns(string? raw)
{
    if (string.IsNullOrWhiteSpace(raw)) return [null];

    if (raw.Contains(';'))
    {
        var parts = raw.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length > 0 ? parts.Cast<string?>().ToList() : [null];
    }

    return [raw];
}

// Fecha_publicación: si es un año limpio (o una fecha real, o texto con
// un año reconocible tipo "October 2015"), se guarda como AAAA-01-01.
// Si el valor tiene la forma de un código de barras mal ubicado (número
// gigante, >= 1,000,000), se trata como corrupto y se deja null.
static DateOnly? ParsePublicationYear(IXLCell cell)
{
    if (cell.IsEmpty()) return null;

    if (cell.DataType == XLDataType.DateTime)
    {
        var dt = cell.GetDateTime();
        return new DateOnly(dt.Year, 1, 1);
    }

    if (cell.DataType == XLDataType.Number)
    {
        var value = cell.GetValue<double>();
        if (value >= 1_000_000) return null; // código de barras mal ubicado
        var year = (int)value;
        return year is >= 1000 and <= 2100 ? new DateOnly(year, 1, 1) : null;
    }

    var text = cell.GetString().Trim();
    if (string.IsNullOrEmpty(text)) return null;

    var match = Regex.Match(text, @"\b(1[0-9]{3}|20[0-9]{2})\b");
    return match.Success ? new DateOnly(int.Parse(match.Value, CultureInfo.InvariantCulture), 1, 1) : null;
}

static DateTimeOffset? ParseCreatedAt(IXLCell cell)
{
    if (cell.IsEmpty()) return null;

    if (cell.DataType == XLDataType.DateTime)
    {
        return new DateTimeOffset(cell.GetDateTime(), TimeSpan.Zero);
    }

    var text = cell.GetString().Trim();
    if (string.IsNullOrEmpty(text)) return null;

    string[] formats = ["d/M/yyyy", "dd/MM/yyyy", "d/M/yyyy H:mm:ss"];
    return DateTime.TryParseExact(text, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt)
        ? new DateTimeOffset(dt, TimeSpan.Zero)
        : null;
}

static string? ValidateStandard(string raw, string[] allowed, RowResult result, string fieldLabel)
{
    var value = raw.Trim();
    if (string.IsNullOrEmpty(value)) return null;

    if (allowed.Contains(value)) return value;

    result.Warnings.Add($"{fieldLabel}: valor '{value}' no está en la lista estándar, se dejó sin clasificar.");
    return null;
}

static BookStatus MapStatus(string raw, RowResult result)
{
    var value = raw.Trim();
    switch (value)
    {
        case "Disponible": return BookStatus.Disponible;
        case "Prestado": return BookStatus.Prestado;
        case "Consulta en sala": return BookStatus.ConsultaEnSala;
        case "Perdido": return BookStatus.Perdido;
        case "Baja": return BookStatus.Baja;
        default:
            result.Warnings.Add(string.IsNullOrEmpty(value)
                ? "Estado_de_Proceso vacío, se asumió Disponible."
                : $"Estado_de_Proceso '{value}' no reconocido, se asumió Disponible.");
            return BookStatus.Disponible;
    }
}

static string GenerateBarcode(string? isbn, string sheetName, int rowNumber, int isbnIndex, HashSet<string> usedBarcodes)
{
    var baseCode = !string.IsNullOrWhiteSpace(isbn)
        ? "PENDIENTE-" + Regex.Replace(isbn, "[^A-Za-z0-9]", "")
        : $"PENDIENTE-{sheetName}-ROW{rowNumber}-{isbnIndex}";

    var candidate = baseCode;
    var suffix = 1;
    while (usedBarcodes.Contains(candidate))
    {
        candidate = $"{baseCode}-{suffix}";
        suffix++;
    }

    usedBarcodes.Add(candidate);
    return candidate;
}

// =====================================================================
// Reporte CSV
// =====================================================================
static void WriteReport(string path, List<RowResult> results)
{
    using var writer = new StreamWriter(path, false, System.Text.Encoding.UTF8);
    writer.WriteLine("hoja,fila,titulo,resultado,barcode_generado,advertencias,detalle");

    foreach (var r in results)
    {
        writer.WriteLine(string.Join(",", new[]
        {
            Csv(r.Sheet),
            Csv(r.RowNumber.ToString(CultureInfo.InvariantCulture)),
            Csv(r.Title),
            Csv(r.Outcome.ToString()),
            Csv(r.GeneratedBarcode ?? ""),
            Csv(string.Join(" | ", r.Warnings)),
            Csv(r.Detail ?? "")
        }));
    }
}

static string Csv(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";

// =====================================================================
// Conexión — misma resolución que Library.Api/Program.cs
// =====================================================================
static string ResolveConnectionString()
{
    var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    if (!string.IsNullOrWhiteSpace(databaseUrl))
    {
        return BuildConnectionStringFromDatabaseUrl(databaseUrl);
    }

    var overrideConnection = Environment.GetEnvironmentVariable("LIBRARY_DB_CONNECTION");
    if (!string.IsNullOrWhiteSpace(overrideConnection))
    {
        return overrideConnection;
    }

    // Default de desarrollo local (mismas credenciales que docker-compose.yml
    // / appsettings.Development.json — no es un secreto real).
    return "Host=localhost;Port=5432;Database=library_alberto_gutierrez_botero;" +
           "Username=library_dev;Password=library_dev_password";
}

static string BuildConnectionStringFromDatabaseUrl(string databaseUrl)
{
    var uri = new Uri(databaseUrl);
    var userInfo = uri.UserInfo.Split(':', 2);

    var npgsqlBuilder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Username = Uri.UnescapeDataString(userInfo[0]),
        Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
        Database = uri.AbsolutePath.TrimStart('/'),
        SslMode = SslMode.Require
    };

    return npgsqlBuilder.ConnectionString;
}

static string? GetArg(string[] args, string name)
{
    var idx = Array.IndexOf(args, name);
    return idx >= 0 && idx + 1 < args.Length ? args[idx + 1] : null;
}

// =====================================================================
// Modelos de soporte
// =====================================================================
enum Outcome { Created, Error, SkippedDuplicate }

class RowResult
{
    public required string Sheet { get; init; }
    public required int RowNumber { get; init; }
    public required string Title { get; init; }
    public Outcome Outcome { get; set; } = Outcome.Created;
    public string? Detail { get; set; }
    public string? GeneratedBarcode { get; set; }
    public List<string> Warnings { get; set; } = [];
}

static class StandardValues
{
    public static readonly string[] MaterialTypes =
        ["CD", "DVD", "Folletos", "Libro General", "Libro Infantil", "Libro Juvenil", "Referencia"];

    public static readonly string[] TargetAudiences =
        ["Adolescente", "Adulto", "Especializada", "General", "Infantil", "Juvenil", "Preadolescente", "Preescolar", "Primaria"];

    public static readonly string[] Locations =
        ["General", "Infantil", "No disponible", "Videoteca"];
}
