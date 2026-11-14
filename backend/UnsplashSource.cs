using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Scalable.Api;

public sealed record PhotoItem(
    string Id, string Type, string Provider, string ExternalPhotoId, string Url,
    string Title, string Description, string SourceUrl, string SourceLabel,
    string CreatorName, string CreatorUrl, string Position = "hero", bool Pinned = false,
    bool IsSample = false, string? LicenseName = null);
public sealed record SourceResult(string Status, PhotoItem? Image = null);

public sealed class UnsplashSource(HttpClient http, RequestBudget budget, string? accessKey)
{
    public async Task<SourceResult> Search(string prompt, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(accessKey)) return new("not_configured");
        try
        {
            if (!budget.TryReservePair()) return new("rate_limited");
            using var response = await Send(new Uri("https://api.unsplash.com/search/photos?per_page=1&content_filter=high&query="
                + Uri.EscapeDataString(prompt)), cancellationToken);
            if (Exhausted(response)) return new("rate_limited");
            if (!response.IsSuccessStatusCode) return new("unavailable");
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            var results = json.RootElement.GetProperty("results");
            if (results.GetArrayLength() == 0) return new("no_results");
            var photo = results[0];
            var id = photo.GetProperty("id").GetString()!;
            if (!Regex.IsMatch(id, "^[A-Za-z0-9_-]{1,100}$")) return new("unavailable");
            var links = photo.GetProperty("links");
            var url = SafeUrl(photo.GetProperty("urls").GetProperty("regular").GetString(), "images.unsplash.com");
            var source = Referral(SafeUrl(links.GetProperty("html").GetString(), "unsplash.com"));
            var creator = photo.GetProperty("user");
            var creatorName = creator.GetProperty("name").GetString();
            var creatorUrl = Referral(SafeUrl(creator.GetProperty("links").GetProperty("html").GetString(), "unsplash.com"));
            var download = new Uri(SafeUrl(links.GetProperty("download_location").GetString(), "api.unsplash.com"));
            if (download.AbsolutePath != $"/photos/{id}/download" || string.IsNullOrWhiteSpace(creatorName))
                return new("unavailable");
            // A board selection is a download-like use under Unsplash's API guidelines.
            // Use the provider's ixid query intact, but never follow redirects or fetch image bytes.
            using var tracked = await Send(download, cancellationToken);
            var trackingExhausted = Exhausted(tracked);
            if (!tracked.IsSuccessStatusCode) return new(trackingExhausted ? "rate_limited" : "unavailable");
            var description = Text(photo, "alt_description") ?? Text(photo, "description") ?? "Unsplash photograph";
            return new("available", new PhotoItem($"unsplash-{id}", "image", "unsplash", id,
                url, description, description, source, $"Photo by {creatorName} on Unsplash", creatorName, creatorUrl));
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException
            or KeyNotFoundException or InvalidOperationException or ArgumentException or FormatException or IOException or UnauthorizedAccessException)
        {
            // No credentials, upstream bodies, or prompt text in errors. Reservations are never refunded.
            return new("unavailable");
        }
    }

    private async Task<HttpResponseMessage> Send(Uri url, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Client-ID", accessKey);
        request.Headers.Add("Accept-Version", "v1");
        return await http.SendAsync(request, cancellationToken);
    }

    private bool Exhausted(HttpResponseMessage response)
    {
        var exhausted = response.StatusCode == HttpStatusCode.TooManyRequests ||
            response.Headers.TryGetValues("X-Ratelimit-Remaining", out var values)
                && values.Any(value => value == "0");
        if (exhausted) budget.BlockForHour();
        return exhausted;
    }

    private static string? Text(JsonElement value, string name) =>
        value.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString() : null;

    private static string SafeUrl(string? value, string host)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var url) || url.Scheme != "https" ||
            url.Host != host || !url.IsDefaultPort || url.UserInfo != "")
            throw new ArgumentException("Invalid provider URL.");
        return url.AbsoluteUri;
    }

    private static string Referral(string value)
    {
        var url = new UriBuilder(value);
        url.Query = (url.Query.Length > 1 ? url.Query[1..] + "&" : "")
            + "utm_source=scalable&utm_medium=referral";
        return url.Uri.AbsoluteUri;
    }
}
