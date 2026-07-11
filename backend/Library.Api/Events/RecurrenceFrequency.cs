namespace Library.Api.Events;

/// <summary>Only used at creation time to generate individual occurrences — never persisted
/// on Event itself (see Event.RecurrenceGroupId).</summary>
public enum RecurrenceFrequency
{
    Weekly,
    Monthly
}
