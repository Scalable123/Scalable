using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Scalable.Api;
using Xunit;

namespace Scalable.Api.Tests;

public sealed class PinterestTests
{
    private const string Root = "/api/integrations/pinterest";
    [Fact] public async Task Requires_verified_application_session_and_approved_configuration() {
        await using var app = new TestApp(); using var client = app.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Root)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", "forged");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync(Root + "/authorize", null)).StatusCode);
        app.Services.GetRequiredService<IConfiguration>()["Pinterest:ImportUseApproved"] = "false";
        client.DefaultRequestHeaders.Authorization = new("Bearer", "user-a");
        Assert.Contains("unavailable", await client.GetStringAsync(Root));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PostAsync(Root + "/authorize", null)).StatusCode);
        Assert.Empty(app.Upstream.ProviderCalls);
    }
    [Fact] public async Task OAuth_is_browser_bound_single_use_and_encrypted_with_no_credentials_in_responses() {
        await using var app = new TestApp(); using var client = app.Client("user-a");
        var state = await Begin(client);
        using var otherBrowser = app.Client("user-a");
        Assert.Equal(HttpStatusCode.BadRequest, (await otherBrowser.GetAsync(Root + $"/callback?state={state}&code=ok")).StatusCode);
        var callback = await client.GetAsync(Root + $"/callback?state={state}&code=ok");
        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        Assert.Equal("https://app.example/frontend/index.html?import=pinterest&pinterest=connected", callback.Headers.Location!.AbsoluteUri);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(Root + $"/callback?state={state}&code=ok")).StatusCode);
        var status = await client.GetStringAsync(Root);
        Assert.Contains("connected", status); Assert.DoesNotContain("secret-access", status);
        var stored = app.Services.GetRequiredService<PinterestStore>().Read(TestUpstream.UserA)!;
        Assert.DoesNotContain("secret-access", stored); Assert.DoesNotContain("secret-refresh", stored);
        Assert.DoesNotContain("secret-client", status);
        Assert.Equal("no-store", (await client.GetAsync(Root)).Headers.CacheControl!.ToString());
        Assert.All(app.Upstream.ProviderCalls, path => Assert.DoesNotContain("search", path));
    }
    [Fact] public async Task Denial_expiry_and_disconnect_invalidate_authorization() {
        await using var app = new TestApp(); using var client = app.Client("user-a");
        var state = await Begin(client);
        var denial = await client.GetAsync(Root + $"/callback?state={state}&error=access_denied");
        Assert.Contains("pinterest=denied", denial.Headers.Location!.Query);
        Assert.Empty(app.Upstream.ProviderCalls);
        state = await Begin(client); app.Clock.Advance(TimeSpan.FromMinutes(11));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(Root + $"/callback?state={state}&code=ok")).StatusCode);
        state = await Begin(client); await client.DeleteAsync(Root);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(Root + $"/callback?state={state}&code=ok")).StatusCode);
    }
    [Fact] public async Task Board_and_pin_pages_enforce_ownership_and_bind_bookmarks_to_owner_and_resource() {
        await using var app = new TestApp(); using var client = app.Client("user-a"); await Link(client);
        using var other = app.Client("user-b");
        Assert.Equal(HttpStatusCode.Conflict, (await other.GetAsync(Root + "/boards")).StatusCode);
        var first = await client.GetFromJsonAsync<JsonElement>(Root + "/boards");
        Assert.Single(first.GetProperty("items").EnumerateArray());
        var cursor = first.GetProperty("bookmark").GetString()!;
        var second = await client.GetFromJsonAsync<JsonElement>(Root + "/boards?bookmark=" + Uri.EscapeDataString(cursor));
        Assert.Equal("12", second.GetProperty("items")[0].GetProperty("id").GetString());
        Assert.Equal(JsonValueKind.Null, second.GetProperty("bookmark").ValueKind);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(Root + "/boards/11/pins?bookmark=" + Uri.EscapeDataString(cursor))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(Root + "/boards/99/pins")).StatusCode);
        Assert.DoesNotContain("/v5/boards/99/pins?page_size=100", app.Upstream.ProviderCalls);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(Root + "/boards/evil/pins")).StatusCode);
        var pins = await client.GetFromJsonAsync<JsonElement>(Root + "/boards/11/pins");
        Assert.True(pins.GetProperty("items")[0].GetProperty("supported").GetBoolean());
        var next = pins.GetProperty("bookmark").GetString()!;
        pins = await client.GetFromJsonAsync<JsonElement>(Root + "/boards/11/pins?bookmark=" + Uri.EscapeDataString(next));
        Assert.False(pins.GetProperty("items")[0].GetProperty("supported").GetBoolean());
        Assert.Equal(JsonValueKind.Null, pins.GetProperty("items")[0].GetProperty("imageUrl").ValueKind);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Root + "/search?q=flowers")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/api/research-runs", null)).StatusCode);
    }
    [Fact] public async Task Refresh_rate_limit_and_disconnect_report_real_outcomes_without_scraping() {
        await using var app = new TestApp(); using var client = app.Client("user-a"); await Link(client);
        app.Clock.Advance(TimeSpan.FromHours(2));
        await client.GetAsync(Root + "/boards"); Assert.Equal(1, app.Upstream.Refreshes);
        app.Upstream.RateLimited = true;
        var limited = await client.GetAsync(Root + "/boards");
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.Equal("90", limited.Headers.RetryAfter!.ToString());
        var disconnect = await client.DeleteAsync(Root);
        Assert.True((await disconnect.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("providerRevocationRequired").GetBoolean());
        Assert.Null(app.Services.GetRequiredService<PinterestStore>().Read(TestUpstream.UserA));
        Assert.DoesNotContain(app.Upstream.ProviderCalls, path => path.Contains("revoke"));
        Assert.Equal(HttpStatusCode.Conflict, (await client.GetAsync(Root + "/boards")).StatusCode);
    }
    [Fact] public async Task Missing_scopes_and_provider_auth_failures_never_create_a_connection() {
        await using var app = new TestApp(); using var client = app.Client("user-a");
        app.Upstream.Scope = "boards:read";
        var state = await Begin(client);
        var callback = await client.GetAsync(Root + $"/callback?state={state}&code=ok");
        Assert.Contains("pinterest=failed", callback.Headers.Location!.Query);
        Assert.Null(app.Services.GetRequiredService<PinterestStore>().Read(TestUpstream.UserA));
        app.Upstream.Scope = PinterestIntegration.Scopes; await Link(client);
        app.Clock.Advance(TimeSpan.FromHours(2)); app.Upstream.RejectRefresh = true;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Root + "/boards")).StatusCode);
        Assert.Null(app.Services.GetRequiredService<PinterestStore>().Read(TestUpstream.UserA));
    }
    [Fact] public async Task Provider_revocation_changes_connection_status_to_expired() {
        await using var app = new TestApp(); using var client = app.Client("user-a"); await Link(client);
        app.Upstream.RejectAccess = true;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Root + "/boards")).StatusCode);
        var status = await client.GetFromJsonAsync<JsonElement>(Root);
        Assert.Equal("expired", status.GetProperty("status").GetString());
        Assert.False(status.GetProperty("canImport").GetBoolean());
    }
    private static async Task<string> Begin(HttpClient client) {
        var response = await client.PostAsync(Root + "/authorize", null); response.EnsureSuccessStatusCode();
        var url = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("authorizationUrl").GetString()!;
        Assert.StartsWith("https://www.pinterest.com/oauth/", url);
        var query = QueryHelpers.ParseQuery(new Uri(url).Query);
        Assert.Equal(PinterestIntegration.Scopes, query["scope"].ToString());
        Assert.Contains("httponly", string.Join(" ", response.Headers.GetValues("Set-Cookie")).ToLowerInvariant());
        return query["state"].ToString();
    }
    private static async Task Link(HttpClient client) {
        var state = await Begin(client);
        var result = await client.GetAsync(Root + $"/callback?state={state}&code=ok");
        Assert.Contains("pinterest=connected", result.Headers.Location!.Query);
    }
}
public sealed class TestApp : WebApplicationFactory<Program>
{
    public TestUpstream Upstream { get; } = new();
    public TestClock Clock { get; } = new();
    private readonly string data = Path.Combine(Path.GetTempPath(), "scalable-pinterest-test-" + Guid.NewGuid());
    protected override void ConfigureWebHost(IWebHostBuilder builder) {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> {
            ["DataPath"] = data, ["PublicOrigin"] = "https://app.example", ["AllowedHosts"] = "*",
            ["Pinterest:Enabled"] = "true", ["Pinterest:ImportUseApproved"] = "true", ["Pinterest:ClientId"] = "test-client",
            ["Pinterest:ClientSecret"] = "secret-client", ["Supabase:Url"] = "https://identity.example", ["Supabase:PublishableKey"] = "public-test"
        }));
        builder.ConfigureServices(services => {
            services.AddSingleton<TimeProvider>(Clock);
            services.AddHttpClient("Pinterest").ConfigurePrimaryHttpMessageHandler(() => new ForwardHandler(Upstream));
            services.AddHttpClient("Supabase").ConfigurePrimaryHttpMessageHandler(() => new ForwardHandler(Upstream));
        });
    }
    public HttpClient Client(string? user = null) {
        var client = CreateClient(new() { AllowAutoRedirect = false, HandleCookies = true, BaseAddress = new Uri("https://app.example") });
        if (user is not null) client.DefaultRequestHeaders.Authorization = new("Bearer", user);
        return client;
    }
    public override async ValueTask DisposeAsync() {
        await base.DisposeAsync();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        if (Directory.Exists(data)) Directory.Delete(data, true);
    }
}
public sealed class TestClock : TimeProvider {
    private DateTimeOffset current = DateTimeOffset.UtcNow;
    public override DateTimeOffset GetUtcNow() => current;
    public void Advance(TimeSpan duration) => current += duration;
}
public sealed class ForwardHandler(TestUpstream upstream) : HttpMessageHandler {
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => upstream.Send(request, cancellationToken);
}
public sealed class TestUpstream
{
    public const string UserA = "11111111-1111-1111-1111-111111111111";
    public List<string> ProviderCalls { get; } = [];
    public int Refreshes { get; private set; }
    public bool RateLimited { get; set; }
    public bool RejectRefresh { get; set; }
    public bool RejectAccess { get; set; }
    public string Scope { get; set; } = PinterestIntegration.Scopes;
    public async Task<HttpResponseMessage> Send(HttpRequestMessage request, CancellationToken cancel) {
        var uri = request.RequestUri!;
        if (uri.Host == "identity.example") return request.Headers.Authorization?.Parameter switch {
            "user-a" => Json(new { id = UserA }), "user-b" => Json(new { id = "22222222-2222-2222-2222-222222222222" }),
            _ => new(HttpStatusCode.Unauthorized)
        };
        Assert.Equal("api.pinterest.com", uri.Host); ProviderCalls.Add(uri.PathAndQuery);
        if (uri.AbsolutePath == "/v5/oauth/token") {
            Assert.Equal("Basic", request.Headers.Authorization!.Scheme);
            var body = await request.Content!.ReadAsStringAsync(cancel);
            Assert.Contains("continuous_refresh=true", body);
            if (body.Contains("grant_type=refresh_token")) { Refreshes++; if (RejectRefresh) return new(HttpStatusCode.Unauthorized); }
            return Json(new { access_token = "secret-access", refresh_token = "secret-refresh", expires_in = 3600, refresh_token_expires_in = 86400, token_type = "bearer", scope = Scope });
        }
        Assert.Equal(HttpMethod.Get, request.Method); Assert.Equal("secret-access", request.Headers.Authorization!.Parameter);
        if (RejectAccess) return new(HttpStatusCode.Unauthorized);
        if (uri.AbsolutePath == "/v5/user_account") return Json(new { username = "owner" });
        if (RateLimited) { var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests); response.Headers.RetryAfter = new(TimeSpan.FromSeconds(90)); return response; }
        if (uri.AbsolutePath == "/v5/boards") return uri.Query.Contains("bookmark=") ?
            Json(new { items = new[] { Board("12", "owner") }, bookmark = (string?)null }) :
            Json(new { items = new[] { Board("11", "owner"), Board("99", "someone-else") }, bookmark = "next-boards" });
        if (uri.AbsolutePath == "/v5/boards/11") return Json(Board("11", "owner"));
        if (uri.AbsolutePath == "/v5/boards/99") return Json(Board("99", "someone-else"));
        if (uri.AbsolutePath == "/v5/boards/11/pins") return uri.Query.Contains("bookmark=") ?
            Json(new { items = new[] { Pin("102", "https://evil.example/image.jpg") }, bookmark = (string?)null }) :
            Json(new { items = new[] { Pin("101", "https://i.pinimg.com/test.jpg") }, bookmark = "next-pins" });
        throw new InvalidOperationException("Unexpected provider path: " + uri.PathAndQuery);
    }
    private static object Board(string id, string owner) => new { id, name = "Board " + id, description = "Owned board", owner = new { username = owner }, pin_count = 2 };
    private static object Pin(string id, string image) => new { id, title = "Pin " + id, description = "Reference", link = "https://creator.example/work", media = new { media_type = "image", images = new Dictionary<string, object> { ["600x"] = new { url = image } } } };
    private static HttpResponseMessage Json(object value) => new(HttpStatusCode.OK) { Content = JsonContent.Create(value) };
}
