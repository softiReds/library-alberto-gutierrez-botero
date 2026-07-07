using System.Text.RegularExpressions;
using Npgsql;
using Npgsql.NameTranslation;

namespace Library.Api.Data;

/// <summary>
/// C# enum members cannot contain spaces (e.g. "ConsultaEnSala"), but the Postgres enum
/// labels must read naturally in Spanish (e.g. "Consulta en sala"). This translator splits
/// the PascalCase member name into words and joins them with spaces, keeping only the first
/// word capitalized, while type names still fall back to standard snake_case.
/// </summary>
public sealed class SpanishEnumLabelNameTranslator : INpgsqlNameTranslator
{
    private static readonly NpgsqlSnakeCaseNameTranslator SnakeCaseTranslator = new();

    public string TranslateTypeName(string clrName) => SnakeCaseTranslator.TranslateTypeName(clrName);

    public string TranslateMemberName(string clrName)
    {
        var words = Regex.Split(clrName, "(?<!^)(?=[A-Z])");
        for (var i = 1; i < words.Length; i++)
        {
            words[i] = words[i].ToLowerInvariant();
        }

        return string.Join(' ', words);
    }
}
