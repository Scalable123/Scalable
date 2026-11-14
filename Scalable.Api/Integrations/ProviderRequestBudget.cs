using System.Text.Json;

namespace Scalable.Api;

public sealed class ProviderRequestBudget(string path, TimeProvider clock)
{
    private sealed record State(List<DateTimeOffset> Requests, DateTimeOffset? BlockedUntil);
    private readonly string statePath = System.IO.Path.GetFullPath(path);

    private T Update<T>(Func<State, (State Next, T Result)> update)
    {
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(statePath)!);
        using var handle = Lock();
        var state = File.Exists(statePath)
            ? JsonSerializer.Deserialize<State>(File.ReadAllText(statePath)) ?? throw new IOException("Invalid budget state.")
            : new State([], null);
        if (state.Requests is null) throw new IOException("Invalid budget state.");
        var (next, result) = update(state);
        var temporary = statePath + ".tmp";
        using (var file = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            JsonSerializer.Serialize(file, next);
            file.Flush(flushToDisk: true);
        }
        File.Move(temporary, statePath, overwrite: true);
        return result;
    }

    private FileStream Lock()
    {
        for (var attempt = 0; ; attempt++)
        {
            try { return new FileStream(statePath + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
            catch (IOException) when (attempt < 100) { Thread.Sleep(10); }
        }
    }

    public bool TryReserve(TimeSpan window, int maximum) => Update(state =>
    {
        var now = clock.GetUtcNow();
        var recent = state.Requests.Where(time => time > now - window).ToList();
        var allowed = !(state.BlockedUntil > now) && recent.Count < maximum;
        if (allowed) recent.Add(now);
        return (new State(recent, state.BlockedUntil), allowed);
    });

    public void BlockFor(TimeSpan duration) => Update(state =>
        (state with { BlockedUntil = clock.GetUtcNow().Add(duration) }, true));
}
