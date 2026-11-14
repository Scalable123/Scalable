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
HttpResponseMessage Reply(object payload, HttpStatusCode status = HttpStatusCode.OK) => new(status)
{
    Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json"),
};
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

var wikimediaPayload = new
{
    query = new
    {
        pages = new[]
        {
            new
            {
                pageid = 12345,
                title = "File:Quiet coast.jpg",
                imageinfo = new[]
                {
                    new
                    {
                        thumburl = "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Quiet.jpg/1200px-Quiet.jpg",
                        descriptionurl = "https://commons.wikimedia.org/wiki/File:Quiet_coast.jpg",
                        extmetadata = new
                        {
                            Artist = new { value = "Artist <b>" },
                            LicenseShortName = new { value = "CC BY-SA 4.0" },
                            ImageDescription = new { value = "A quiet coast" },
                        },
                    },
                },
            },
        },
    },
};
var wikimediaHandler = new WikimediaHandler([Reply(wikimediaPayload)]);
var wikimediaSource = new WikimediaSource(new HttpClient(wikimediaHandler), new RequestBudget(FreshPath(), clock), "Scalable/1.0 (https://github.com/Scalable123/Scalable)");
var wikimedia = await wikimediaSource.Search("quiet coast", default);
Check(wikimedia.Status == "available" && wikimedia.Image?.Provider == "wikimedia" && wikimedia.Image.LicenseName == "CC BY-SA 4.0", "Wikimedia result preserves creator and license metadata");
Check(wikimedia.Image?.Url.Contains("thumb.wikimedia.org") == true && wikimediaHandler.UserAgents.Single().Contains("Scalable/1.0"), "Wikimedia thumbnail and identifying User-Agent are safe");
Check(wikimediaHandler.Urls.Single().Query.Contains("gsrlimit=1"), "Wikimedia search requests one result");
var wiki429 = new WikimediaHandler([Reply(new { }, HttpStatusCode.TooManyRequests)]);
var wikiLimitedPath = FreshPath();
var wikiLimited = await new WikimediaSource(new HttpClient(wiki429), new RequestBudget(wikiLimitedPath, clock), "Scalable/1.0 (https://github.com/Scalable123/Scalable)").Search("coast", default);
Check(wikiLimited.Status == "rate_limited" && !new RequestBudget(wikiLimitedPath, clock).TryReserveSingle(TimeSpan.FromMinutes(1), 180), "Wikimedia 429 blocks the source budget");
Directory.Delete(root, true);
Console.WriteLine($"Backend checks passed ({assertions} assertions).");

sealed class ManualClock : TimeProvider
{
    public DateTimeOffset Now = DateTimeOffset.Parse("2026-11-14T12:00:00Z");
    public override DateTimeOffset GetUtcNow() => Now;
}
sealed class WikimediaHandler(HttpResponseMessage[] responses) : HttpMessageHandler
{
    public List<Uri> Urls { get; } = [];
    public List<string> UserAgents { get; } = [];
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
    {
        Urls.Add(request.RequestUri!);
        UserAgents.Add(request.Headers.UserAgent.ToString());
        if (Urls.Count > responses.Length) throw new Exception("Unexpected extra Wikimedia request");
        return Task.FromResult(responses[Urls.Count - 1]);
    }
}
