namespace Scalable.Api.GraphQL;

public sealed class Query
{
    public ServiceStatus ServiceStatus() => new(
        "Scalable API",
        "GraphQL endpoint is running",
        DateTimeOffset.UtcNow);

    public IReadOnlyList<BoardSummary> Boards() => [];
}

public sealed record ServiceStatus(
    string Name,
    string Message,
    DateTimeOffset CheckedAt);

public sealed record BoardSummary(
    Guid Id,
    string Title,
    string Description);
