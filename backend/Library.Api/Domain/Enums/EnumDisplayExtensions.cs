using System.Text.RegularExpressions;

namespace Library.Api.Domain.Enums;

/// <summary>
/// Renders enum values for user-facing messages using the same "Consulta en sala"-style
/// Spanish label as the native Postgres enum (see SpanishEnumLabelNameTranslator), instead
/// of the raw C# member name (e.g. "ConsultaEnSala").
/// </summary>
public static class EnumDisplayExtensions
{
    public static string ToSpanishLabel(this Enum value)
    {
        var words = Regex.Split(value.ToString(), "(?<!^)(?=[A-Z])");
        for (var i = 1; i < words.Length; i++)
        {
            words[i] = words[i].ToLowerInvariant();
        }

        return string.Join(' ', words);
    }
}
