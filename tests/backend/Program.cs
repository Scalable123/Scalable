using System.Diagnostics;
using System.Net;
using System.Text.Json;
using Scalable.Api;

if (args.Length > 0)
{
    if (args.Length != 2 || args[0] != "reserve") throw new ArgumentException("Invalid worker arguments.");
    var budget = new RequestBudget(args[1], TimeProvider.System);
    Console.WriteLine(Enumerable.Range(0, 20).Count(_ => budget.TryReservePair()));
    return;
}
var root = Path.Combine(Path.GetTempPath(), "scalable-checks-" + Guid.NewGuid());
Directory.CreateDirectory(root);
var assertions = 0;
void Check(bool value, string message) { assertions++; if (!value) throw new Exception(message); }
string FreshPath() => Path.Combine(root, Guid.NewGuid() + ".json");
var clock = new ManualClock();
var shared = FreshPath();
var wins = 0;
Parallel.For(0, 100, _ => { if (new RequestBudget(shared, clock).TryReservePair()) Interlocked.Increment(ref wins); });
Check(wins == 25, "100 concurrent attempts must reserve exactly 50 calls");
Check(!new RequestBudget(shared, clock).TryReservePair(), "restart must retain spent quota");
clock.Now = clock.Now.AddMinutes(59);
Check(!new RequestBudget(shared, clock).TryReservePair(), "must remain blocked before rolling expiry");
clock.Now = clock.Now.AddMinutes(1);
Check(new RequestBudget(shared, clock).TryReservePair(), "budget must reopen at one hour");
clock.Now = clock.Now.AddHours(-2);
var afterClockRollback = Enumerable.Range(0, 30).Count(_ => new RequestBudget(shared, clock).TryReservePair());
Check(afterClockRollback == 24, "backward clock must retain future reservations and stop at 50");

var crossProcessPath = FreshPath();
var workers = Enumerable.Range(0, 4).Select(_ =>
{
    var start = new ProcessStartInfo(Environment.ProcessPath!)
    {
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
    };
    if (Path.GetFileNameWithoutExtension(Environment.ProcessPath) == "dotnet")
        start.ArgumentList.Add(typeof(ManualClock).Assembly.Location);
    start.ArgumentList.Add("reserve");
    start.ArgumentList.Add(crossProcessPath);
    return Process.Start(start)!;
}).ToArray();
var total = 0;
foreach (var worker in workers)
{
    var output = await worker.StandardOutput.ReadToEndAsync();
    await worker.WaitForExitAsync();
    Check(worker.ExitCode == 0, "quota worker failed: " + await worker.StandardError.ReadToEndAsync());
    total += int.Parse(output.Trim());
    worker.Dispose();
}
Check(total == 25, "separate processes must share the 50-call ceiling");

object Photo(string id = "photo-1", string imageHost = "images.unsplash.com", string downloadHost = "api.unsplash.com") => new
{
    id, alt_description = "Quiet coast <script>",
    urls = new { regular = $"https://{imageHost}/photo-1?ixid=keep-me" },
    links = new { html = "https://unsplash.com/photos/photo-1", download_location = $"https://{downloadHost}/photos/{id}/download?ixid=keep-me" },
    user = new { name = "Artist <b>", links = new { html = "https://unsplash.com/@artist" } },
};
HttpResponseMessage Reply(object value, HttpStatusCode code = HttpStatusCode.OK, string? remaining = null)
{
    var response = new HttpResponseMessage(code) { Content = new StringContent(JsonSerializer.Serialize(value)) };
    if (remaining is not null) response.Headers.Add("X-Ratelimit-Remaining", remaining);
    return response;
}
async Task<(SourceResult Result, FakeHandler Handler, string Path)> Search(HttpResponseMessage[] responses, string? key = "test-key", string? path = null)
{
    path ??= FreshPath();
    var handler = new FakeHandler(responses);
    var source = new UnsplashSource(new HttpClient(handler), new RequestBudget(path, clock), key);
    return (await source.Search("quiet & wild café", default), handler, path);
}
var success = await Search([Reply(new { results = new[] { Photo() } }), Reply(new { url = "unused" }, remaining: "0")]);
Check(success.Result.Status == "available", "last successful tracking call must still return the selected photo");
Check(success.Handler.Urls.Count == 2, "one search and one tracking request only");
Check(success.Handler.Urls[0].Query.Contains("per_page=1") && success.Handler.Urls[0].Query.Contains("content_filter=high"), "one safe-filtered candidate");
Check(success.Handler.Urls[1].Query.Contains("ixid=keep-me"), "tracking ixid must survive");
Check(success.Handler.Auth.All(value => value == "Client-ID test-key"), "key must be in auth header only");
Check(success.Handler.Urls.All(url => !url.ToString().Contains("test-key")), "key must not appear in URL");
Check(success.Result.Image?.Url.EndsWith("ixid=keep-me") == true, "use hotlinked image unmodified");
Check(success.Result.Image?.CreatorUrl.Contains("utm_source=scalable") == true && success.Result.Image.SourceUrl.Contains("utm_medium=referral"), "referral attribution links");
Check(!new RequestBudget(success.Path, clock).TryReservePair(), "upstream zero must block future requests");
var missing = await Search([], key: null);
Check(missing.Result.Status == "not_configured" && missing.Handler.Urls.Count == 0 && !File.Exists(missing.Path), "missing key must not spend budget");
var empty = await Search([Reply(new { results = Array.Empty<object>() })]);
Check(empty.Result.Status == "no_results" && empty.Handler.Urls.Count == 1, "no results must not trigger tracking/retry");
foreach (var code in new[] { HttpStatusCode.TooManyRequests, HttpStatusCode.Forbidden, HttpStatusCode.InternalServerError, HttpStatusCode.Redirect })
{
    var failure = await Search([Reply(new { error = "private upstream detail" }, code)]);
    Check(failure.Result.Status == (code == HttpStatusCode.TooManyRequests ? "rate_limited" : "unavailable") && failure.Handler.Urls.Count == 1, "provider error must not retry or leak details");
    if (code == HttpStatusCode.TooManyRequests) Check(!new RequestBudget(failure.Path, clock).TryReservePair(), "429 must block subsequent calls");
}
var zero = await Search([Reply(new { results = new[] { Photo() } }, remaining: "0")]);
Check(zero.Result.Status == "rate_limited" && zero.Handler.Urls.Count == 1, "zero remaining must stop before tracking");
foreach (var photo in new[] { Photo(imageHost: "evil.test"), Photo(downloadHost: "evil.test"), Photo(id: "../bad") })
{
    var invalid = await Search([Reply(new { results = new[] { photo } })]);
    Check(invalid.Result.Status == "unavailable" && invalid.Handler.Urls.Count == 1, "untrusted provider URLs and IDs must not be fetched");
}
var trackingFailure = await Search([Reply(new { results = new[] { Photo() } }), Reply(new { }, HttpStatusCode.BadGateway)]);
Check(trackingFailure.Result.Status == "unavailable" && trackingFailure.Handler.Urls.Count == 2, "do not use untracked photos");
var malformed = await Search([new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("not JSON") }]);
Check(malformed.Result.Status == "unavailable", "invalid JSON must preserve fallback");
var corruptPath = FreshPath();
File.WriteAllText(corruptPath, "broken");
var corrupt = await Search([], path: corruptPath);
Check(corrupt.Result.Status == "unavailable" && corrupt.Handler.Urls.Count == 0, "corrupt budget fails closed before API call");
var deniedPath = FreshPath();
Directory.CreateDirectory(deniedPath);
var denied = await Search([], path: deniedPath);
Check(denied.Result.Status == "unavailable" && denied.Handler.Urls.Count == 0, "unwritable budget fails closed");
var fullPath = FreshPath();
var full = new RequestBudget(fullPath, clock);
for (var i = 0; i < 25; i++) full.TryReservePair();
var limited = await Search([], path: fullPath);
Check(limited.Result.Status == "rate_limited" && limited.Handler.Urls.Count == 0, "full budget sends no provider request");
var lonePath = FreshPath();
File.WriteAllText(lonePath, JsonSerializer.Serialize(new { Requests = Enumerable.Repeat(clock.Now, 49).ToArray(), BlockedUntil = (DateTimeOffset?)null }));
var lone = await Search([], path: lonePath);
Check(lone.Result.Status == "rate_limited" && lone.Handler.Urls.Count == 0, "a lone remaining call cannot fund a tracked selection");
var trackingLimited = await Search([Reply(new { results = new[] { Photo() } }), Reply(new { }, HttpStatusCode.TooManyRequests)]);
Check(trackingLimited.Result.Status == "rate_limited" && !new RequestBudget(trackingLimited.Path, clock).TryReservePair(), "tracking quota errors block subsequent searches");
var timeoutHandler = new FakeHandler([]) { ThrowTimeout = true };
var timeoutSource = new UnsplashSource(new HttpClient(timeoutHandler), new RequestBudget(FreshPath(), clock), "test");
Check((await timeoutSource.Search("coast", default)).Status == "unavailable" && timeoutHandler.Urls.Count == 1, "timeouts fail gracefully without retries");
Directory.Delete(root, true);
Console.WriteLine($"Backend checks passed ({assertions} assertions).");

sealed class ManualClock : TimeProvider
{
    public DateTimeOffset Now = DateTimeOffset.Parse("2026-11-14T12:00:00Z");
    public override DateTimeOffset GetUtcNow() => Now;
}
sealed class FakeHandler(HttpResponseMessage[] responses) : HttpMessageHandler
{
    public List<Uri> Urls { get; } = [];
    public List<string> Auth { get; } = [];
    public bool ThrowTimeout { get; init; }
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
    {
        Urls.Add(request.RequestUri!);
        Auth.Add(request.Headers.Authorization!.ToString());
        if (ThrowTimeout) throw new TaskCanceledException();
        if (Urls.Count > responses.Length) throw new Exception("Unexpected extra provider request");
        return Task.FromResult(responses[Urls.Count - 1]);
    }
}
