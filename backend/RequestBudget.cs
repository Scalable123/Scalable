using System.Text.Json;

namespace Scalable.Api;

// Every process using this key must share this directory on a filesystem with file locks.
public sealed class RequestBudget(string path, TimeProvider clock)
{
    private sealed record State(List<DateTimeOffset> Requests, DateTimeOffset? BlockedUntil);
    private readonly string statePath = Path.GetFullPath(path);

    private T Update<T>(Func<State, (State Next, T Result)> update)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(statePath)!);
        using var handle = Lock();
        var state = File.Exists(statePath)
            ? JsonSerializer.Deserialize<State>(File.ReadAllText(statePath))
                ?? throw new IOException("Invalid budget state.")
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

    public bool TryReservePair() => TryReserve(2, TimeSpan.FromHours(1), 50);

    public bool TryReserveSingle(TimeSpan window, int maximum) => TryReserve(1, window, maximum);

    private bool TryReserve(int calls, TimeSpan window, int maximum) => Update(state =>
    {
        var now = clock.GetUtcNow();
        var recent = state.Requests.Where(time => time > now - window).ToList();
        var allowed = !(state.BlockedUntil > now) && recent.Count + calls <= maximum;
        if (allowed) recent.AddRange(Enumerable.Repeat(now, calls));
        return (new State(recent, state.BlockedUntil), allowed);
    });

    public void BlockForHour() => BlockFor(TimeSpan.FromHours(1));

    public void BlockFor(TimeSpan duration) => Update(state =>
        (state with { BlockedUntil = clock.GetUtcNow().Add(duration) }, true));
}
