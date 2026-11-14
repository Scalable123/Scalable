using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Scalable.Api;

// Validate with the existing identity provider, never a browser flag or an unverified JWT payload.
public sealed class SupabaseAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger, UrlEncoder encoder, IHttpClientFactory clients, IConfiguration configuration)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!AuthenticationHeaderValue.TryParse(Request.Headers.Authorization, out var auth) ||
            auth.Scheme != "Bearer" || string.IsNullOrEmpty(auth.Parameter)) return AuthenticateResult.NoResult();
        if (!Uri.TryCreate(configuration["Supabase:Url"], UriKind.Absolute, out var origin) || origin.Scheme != "https" ||
            string.IsNullOrWhiteSpace(configuration["Supabase:PublishableKey"])) return AuthenticateResult.Fail("Identity service is not configured.");
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(origin, "/auth/v1/user"));
        request.Headers.Authorization = auth;
        request.Headers.Add("apikey", configuration["Supabase:PublishableKey"]);
        try {
            using var response = await clients.CreateClient("Supabase").SendAsync(request, Context.RequestAborted);
            if (!response.IsSuccessStatusCode) return AuthenticateResult.Fail("Invalid or expired application session.");
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Context.RequestAborted));
            if (!json.RootElement.TryGetProperty("id", out var id) || !Guid.TryParse(id.GetString(), out var user))
                return AuthenticateResult.Fail("Invalid application identity.");
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user.ToString())], Scheme.Name);
            return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name));
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException) {
            return AuthenticateResult.Fail("Identity service unavailable.");
        }
    }
}
