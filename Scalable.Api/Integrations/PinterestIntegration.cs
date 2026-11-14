using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebUtilities;

namespace Scalable.Api;

public sealed class IntegrationException(int status, string code, string message, string? retryAfter = null) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public string? RetryAfter { get; } = retryAfter;
}
public sealed record PinterestCredential(string AccessToken, string? RefreshToken, long Expires, long? RefreshExpires, string Username, string Scope);
public sealed record PinterestBoard(string Id, string Title, string Description, int PinCount, string? ImageUrl);
public sealed record PinterestPin(string Id, string Title, string Description, string? ImageUrl, string? ImageSourceUrl, string OriginalPinUrl, bool Supported);
public sealed record ProviderPage<T>(IReadOnlyList<T> Items, string? Bookmark);

// This service exposes account linking and explicitly selected board reads only.
// There is no discovery/search/AI API, arbitrary URL fetch, or media download.
public sealed class PinterestIntegration(PinterestStore store, IDataProtectionProvider protection,
    IHttpClientFactory clients, IConfiguration config, IWebHostEnvironment environment, TimeProvider clock)
{
    private const string CookieName = "scalable.pinterest.oauth";
    private const string CallbackPath = "/api/integrations/pinterest/callback";
    public const string Scopes = "boards:read,pins:read,user_accounts:read";
    private readonly SemaphoreSlim gate = new(1, 1);
    private long Now => clock.GetUtcNow().ToUnixTimeSeconds();
    private bool Enabled => config.GetValue<bool>("Pinterest:Enabled") && config.GetValue<bool>("Pinterest:ImportUseApproved") &&
        !string.IsNullOrWhiteSpace(config["Pinterest:ClientId"]) && !string.IsNullOrWhiteSpace(config["Pinterest:ClientSecret"]);
    public bool Available => Enabled;
    private Uri Origin {
        get {
            if (!Uri.TryCreate(config["PublicOrigin"], UriKind.Absolute, out var value) || value.AbsolutePath != "/" ||
                !string.IsNullOrEmpty(value.UserInfo) || !string.IsNullOrEmpty(value.Query) || !string.IsNullOrEmpty(value.Fragment) ||
                (value.Scheme != "https" && !(environment.IsDevelopment() && value.Scheme == "http" && value.IsLoopback)))
                throw new IntegrationException(503, "unavailable", "The Pinterest service origin is not configured.");
            return value;
        }
    }
    private string CallbackUrl => new Uri(Origin, CallbackPath).AbsoluteUri;
    private Uri FrontendOrigin {
        get {
            var value = config["App:FrontendOrigin"];
            if (string.IsNullOrWhiteSpace(value)) return Origin;
            if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.AbsolutePath != "/" ||
                !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) ||
                !string.IsNullOrEmpty(uri.Fragment) ||
                (uri.Scheme != "https" && !(environment.IsDevelopment() && uri.Scheme == "http" && uri.IsLoopback)))
                throw new IntegrationException(503, "unavailable", "The Pinterest frontend origin is not configured.");
            return uri;
        }
    }
    private CookieOptions Cookie => new() { HttpOnly = true, Secure = Origin.Scheme == "https", SameSite = SameSiteMode.Lax, Path = CallbackPath, MaxAge = TimeSpan.FromMinutes(10), IsEssential = true };
    private void RequireEnabled() {
        if (!Enabled) throw new IntegrationException(503, "unavailable", "Pinterest account import is not configured. You can use the sample preview.");
    }
    private static string Random() => WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    private IDataProtector Protector(string owner) => protection.CreateProtector("Pinterest.Credentials.v1", owner);
    private PinterestCredential? Read(string owner) {
        var secret = store.Read(owner);
        if (secret is null) return null;
        try { return JsonSerializer.Deserialize<PinterestCredential>(Protector(owner).Unprotect(secret)); }
        catch (CryptographicException) { throw new IntegrationException(401, "expired", "Reconnect your Pinterest account."); }
    }
    private void Save(string owner, PinterestCredential value) => store.Save(owner, Protector(owner).Protect(JsonSerializer.Serialize(value)));
    public async Task<object> Status(string owner, CancellationToken cancel) {
        if (!Enabled) return new { status = "unavailable", canImport = false, researchAllowed = false };
        await gate.WaitAsync(cancel);
        try {
            var value = Read(owner);
            var status = value is null ? "disconnected" : value.Expires <= Now + 60 &&
                (value.RefreshToken is null || value.RefreshExpires <= Now) ? "expired" : "connected";
            return new { status, username = value?.Username, canImport = status == "connected", researchAllowed = false };
        }
        finally { gate.Release(); }
    }
    public async Task<object> Authorize(HttpContext context, string owner) {
        RequireEnabled();
        var browser = Random(); var state = Random();
        await gate.WaitAsync(context.RequestAborted);
        try { store.Begin(Hash(state), owner, Hash(browser), Now + 600, Now); }
        finally { gate.Release(); }
        context.Response.Cookies.Append(CookieName, browser, Cookie);
        return new { authorizationUrl = QueryHelpers.AddQueryString("https://www.pinterest.com/oauth/", new Dictionary<string, string?> {
            ["client_id"] = config["Pinterest:ClientId"], ["redirect_uri"] = CallbackUrl,
            ["response_type"] = "code", ["scope"] = Scopes, ["state"] = state
        }) };
    }
    public async Task<IResult> Callback(HttpContext context) {
        RequireEnabled();
        string? owner = null;
        var state = context.Request.Query["state"].ToString();
        var browser = context.Request.Cookies[CookieName];
        if (state.Length is < 32 or > 200 || browser is null || browser.Length > 200)
            throw new IntegrationException(400, "invalid_state", "Pinterest authorization expired or could not be verified. Start again.");
        await gate.WaitAsync(context.RequestAborted);
        try {
            owner = store.Consume(Hash(state), Hash(browser), Now);
            if (owner is null) throw new IntegrationException(400, "invalid_state", "Pinterest authorization expired or was already used. Start again.");
            context.Response.Cookies.Delete(CookieName, Cookie);
            var outcome = "denied";
            var code = context.Request.Query["code"].ToString();
            if (!context.Request.Query.ContainsKey("error") && code.Length is > 0 and <= 4096) {
                try {
                    var token = await Token(new() { ["grant_type"] = "authorization_code", ["code"] = code, ["redirect_uri"] = CallbackUrl }, null, context.RequestAborted);
                    using var account = await Get("user_account", token.AccessToken, context.RequestAborted);
                    var username = Text(account.RootElement, "username");
                    if (string.IsNullOrWhiteSpace(username)) throw new JsonException("Missing provider identity.");
                    Save(owner, token with { Username = username }); outcome = "connected";
                }
                catch (Exception e) when (e is IntegrationException or HttpRequestException or JsonException or TaskCanceledException) {
                    outcome = "failed";
                }
            }
            // Fixed redirect, no caller-supplied return URL and no tokens/codes in the destination.
            return Results.Redirect(new Uri(FrontendOrigin, $"/index.html?import=pinterest&pinterest={outcome}").AbsoluteUri);
        }
        finally { gate.Release(); }
    }
    public async Task Disconnect(string owner, CancellationToken cancel) {
        await gate.WaitAsync(cancel);
        try { store.Delete(owner); } finally { gate.Release(); }
        // Pinterest's documented revoke endpoint supports system-user tokens only.
        // Remove all local credentials and pending authorizations; do not claim provider revocation.
    }
    private async Task<PinterestCredential> Credential(string owner, CancellationToken cancel) {
        RequireEnabled(); await gate.WaitAsync(cancel);
        try {
            var value = Read(owner) ?? throw new IntegrationException(409, "not_connected", "Link your Pinterest account first.");
            if (value.Expires > Now + 60) return value;
            if (value.RefreshToken is null || value.RefreshExpires <= Now) throw new IntegrationException(401, "expired", "Reconnect your Pinterest account.");
            try {
                var fresh = await Token(new() { ["grant_type"] = "refresh_token", ["refresh_token"] = value.RefreshToken }, value, cancel);
                Save(owner, fresh); return fresh;
            }
            catch (IntegrationException e) when (e.Status is 400 or 401 or 403) {
                store.Delete(owner); throw new IntegrationException(401, "expired", "Reconnect your Pinterest account.");
            }
        }
        finally { gate.Release(); }
    }
    private async Task<PinterestCredential> Token(Dictionary<string, string> form, PinterestCredential? previous, CancellationToken cancel) {
        form["continuous_refresh"] = "true";
        using var request = new HttpRequestMessage(HttpMethod.Post, "oauth/token") { Content = new FormUrlEncodedContent(form) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{config["Pinterest:ClientId"]}:{config["Pinterest:ClientSecret"]}")));
        using var response = await clients.CreateClient("Pinterest").SendAsync(request, cancel);
        Check(response);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancel));
        var root = json.RootElement;
        var access = Text(root, "access_token");
        var scope = Text(root, "scope") ?? previous?.Scope ?? "";
        var granted = scope.Split([',', ' '], StringSplitOptions.RemoveEmptyEntries);
        if (string.IsNullOrWhiteSpace(access) || !string.Equals(Text(root, "token_type"), "bearer", StringComparison.OrdinalIgnoreCase) ||
            !Scopes.Split(',').All(s => granted.Contains(s)) || granted.Any(s => s.EndsWith(":write", StringComparison.Ordinal)))
            throw new IntegrationException(403, "missing_permissions", "Pinterest did not grant the required read-only permissions.");
        var expires = root.GetProperty("expires_in").GetInt64();
        if (expires <= 0 || expires > 366L * 24 * 3600) throw new JsonException("Invalid token expiration.");
        long? refreshExpires = previous?.RefreshExpires;
        if (root.TryGetProperty("refresh_token_expires_in", out var relative) && relative.TryGetInt64(out var seconds)) refreshExpires = Now + seconds;
        if (root.TryGetProperty("refresh_token_expires_at", out var absolute) && absolute.TryGetInt64(out var timestamp)) refreshExpires = timestamp;
        return new(access, Text(root, "refresh_token") ?? previous?.RefreshToken, Now + expires, refreshExpires, previous?.Username ?? "", scope);
    }
    private async Task<JsonDocument> Get(string path, string access, CancellationToken cancel) {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
        using var response = await clients.CreateClient("Pinterest").SendAsync(request, cancel);
        Check(response);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancel));
    }
    private async Task<JsonDocument> AuthorizedGet(string owner, string path, PinterestCredential credential, CancellationToken cancel) {
        try { return await Get(path, credential.AccessToken, cancel); }
        catch (IntegrationException error) when (error.Status == 401) {
            await gate.WaitAsync(cancel);
            try {
                var current = Read(owner);
                if (current?.AccessToken == credential.AccessToken)
                    Save(owner, current with { Expires = 0, RefreshToken = null, RefreshExpires = 0 });
            }
            finally { gate.Release(); }
            throw;
        }
    }
    private static void Check(HttpResponseMessage response) {
        if (response.IsSuccessStatusCode) return;
        var status = (int)response.StatusCode;
        throw status switch {
            400 => new IntegrationException(400, "provider_rejected", "Pinterest rejected the request. Restart the connection or board selection."),
            401 => new IntegrationException(401, "expired", "Pinterest access expired. Reconnect your account."),
            403 => new IntegrationException(403, "forbidden", "Pinterest has not permitted access to this resource."),
            404 => new IntegrationException(404, "not_found", "This Pinterest board is no longer accessible."),
            429 => new IntegrationException(429, "rate_limited", "Pinterest's request limit was reached. Wait before retrying.",
                response.Headers.RetryAfter?.ToString() ?? "60"),
            _ => new IntegrationException(502, "provider_unavailable", "Pinterest is unavailable. Please retry.")
        };
    }
    private static string? Text(JsonElement value, string key) => value.ValueKind == JsonValueKind.Object && value.TryGetProperty(key, out var field) && field.ValueKind == JsonValueKind.String ? field.GetString() : null;
    private static string? Url(string? value, bool image = false) {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "https" || !string.IsNullOrEmpty(uri.UserInfo) || !uri.IsDefaultPort) return null;
        if (image && uri.Host != "pinimg.com" && !uri.Host.EndsWith(".pinimg.com", StringComparison.OrdinalIgnoreCase)) return null;
        return uri.AbsoluteUri;
    }
    private static void Id(string id) {
        if (!Regex.IsMatch(id, "^[0-9]{1,40}$", RegexOptions.CultureInvariant)) throw new IntegrationException(400, "invalid_id", "Invalid Pinterest board ID.");
    }
    private string? Cursor(string? value, string owner, string resource, bool encode) {
        if (string.IsNullOrEmpty(value)) return null;
        try {
            if (value.Length > 8192) throw new CryptographicException();
            var protector = protection.CreateProtector("Pinterest.Cursor.v1", owner, resource);
            return encode ? protector.Protect(value) : protector.Unprotect(value);
        }
        catch (CryptographicException) { throw new IntegrationException(400, "invalid_cursor", "Reload the board list to continue."); }
    }
    private string PagePath(string resource, string owner, string? bookmark) {
        var cursor = Cursor(bookmark, owner, resource, false);
        return resource + "?page_size=100" + (cursor is null ? "" : "&bookmark=" + Uri.EscapeDataString(cursor));
    }
    private static bool Owned(JsonElement board, string username) => board.TryGetProperty("owner", out var owner) &&
        string.Equals(Text(owner, "username"), username, StringComparison.OrdinalIgnoreCase);
    public async Task<ProviderPage<PinterestBoard>> Boards(string owner, string? bookmark, CancellationToken cancel) {
        var credential = await Credential(owner, cancel);
        using var page = await AuthorizedGet(owner, PagePath("boards", owner, bookmark), credential, cancel);
        var result = new List<PinterestBoard>();
        foreach (var board in page.RootElement.GetProperty("items").EnumerateArray()) {
            if (!Owned(board, credential.Username)) continue;
            var id = Text(board, "id"); if (id is null) continue; Id(id);
            string? cover = null;
            if (board.TryGetProperty("media", out var media)) cover = Url(Text(media, "image_cover_url"), true);
            result.Add(new(id, Text(board, "name") ?? "Untitled board", Text(board, "description") ?? "",
                board.TryGetProperty("pin_count", out var count) && count.TryGetInt32(out var total) ? total : 0, cover));
        }
        return new(result, Cursor(Text(page.RootElement, "bookmark"), owner, "boards", true));
    }
    public async Task<ProviderPage<PinterestPin>> Pins(string owner, string id, string? bookmark, CancellationToken cancel) {
        Id(id); var credential = await Credential(owner, cancel);
        // Do not trust a browser-supplied board ID. Verify the provider's ownership on every page.
        using var board = await AuthorizedGet(owner, $"boards/{id}", credential, cancel);
        if (!Owned(board.RootElement, credential.Username)) throw new IntegrationException(403, "forbidden", "Only boards owned by your linked Pinterest account can be imported.");
        var resource = $"boards/{id}/pins";
        using var page = await AuthorizedGet(owner, PagePath(resource, owner, bookmark), credential, cancel);
        var result = new List<PinterestPin>();
        foreach (var pin in page.RootElement.GetProperty("items").EnumerateArray()) {
            var pinId = Text(pin, "id");
            if (pinId is null || !Regex.IsMatch(pinId, "^[0-9]{1,40}$")) throw new JsonException("Invalid pin identity.");
            string? image = null;
            if (pin.TryGetProperty("media", out var media) && Text(media, "media_type") == "image" && media.TryGetProperty("images", out var images)) {
                foreach (var variant in images.EnumerateObject().OrderBy(x => x.Name == "600x" ? 0 : 1)) {
                    image = Url(Text(variant.Value, "url"), true); if (image is not null) break;
                }
            }
            result.Add(new(pinId, Text(pin, "title") ?? "Pinterest pin", Text(pin, "description") ?? Text(pin, "alt_text") ?? "",
                image, Url(Text(pin, "link")), $"https://www.pinterest.com/pin/{pinId}/", image is not null));
        }
        return new(result, Cursor(Text(page.RootElement, "bookmark"), owner, resource, true));
    }
}
