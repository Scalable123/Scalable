using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Scalable.Api;

public sealed record WikimediaImage(
    string Id, string Type, string Provider, string ExternalPhotoId, string Url,
    string Title, string Description, string SourceUrl, string SourceLabel,
    string CreatorName, string CreatorUrl, string Position = "hero", bool Pinned = false,
    bool IsSample = false, string? LicenseName = null);

public sealed record WikimediaResult(string Status, WikimediaImage? Image = null);

public sealed class WikimediaSource(HttpClient http, ProviderRequestBudget budget, string userAgent)
{
    public async Task<WikimediaResult> Search(string prompt, CancellationToken cancellationToken)
    {
        try
        {
            if (!budget.TryReserve(TimeSpan.FromMinutes(1), 180)) return new("rate_limited");
            var query = "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2" +
                "&generator=search&gsrnamespace=6&gsrlimit=1&gsrsearch=" + Uri.EscapeDataString(prompt) +
                "&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=1200";
            using var response = await Send(new Uri(query), cancellationToken);
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
            {
                budget.BlockFor(TimeSpan.FromMinutes(1));
                return new("rate_limited");
            }
            if (!response.IsSuccessStatusCode) return new("unavailable");
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            if (!json.RootElement.TryGetProperty("query", out var queryValue) ||
                !queryValue.TryGetProperty("pages", out var pages) || pages.GetArrayLength() == 0)
                return new("no_results");
            var page = pages[0];
            var title = Text(page, "title");
            var imageInfo = page.GetProperty("imageinfo")[0];
            var imageUrl = SafeImageUrl(Text(imageInfo, "thumburl") ?? Text(imageInfo, "url"));
            var sourceUrl = SafeUrl(Text(imageInfo, "descriptionurl"), "commons.wikimedia.org");
            var metadata = imageInfo.GetProperty("extmetadata");
            var license = Clean(MetadataText(metadata, "LicenseShortName") ?? MetadataText(metadata, "UsageTerms"));
            if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(license)) return new("unavailable");
            var creator = Clean(MetadataText(metadata, "Artist")) ?? "Unknown creator";
            var description = Clean(MetadataText(metadata, "ImageDescription")) ?? title;
            var id = page.GetProperty("pageid").GetInt64().ToString(System.Globalization.CultureInfo.InvariantCulture);
            return new("available", new WikimediaImage($"wikimedia-{id}", "image", "wikimedia", id,
                imageUrl, title, description, sourceUrl, $"{creator} · {license}", creator, sourceUrl,
                LicenseName: license));
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException
            or System.Collections.Generic.KeyNotFoundException or InvalidOperationException or ArgumentException or FormatException or IOException)
        {
            return new("unavailable");
        }
    }

    private async Task<HttpResponseMessage> Send(Uri url, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.UserAgent.ParseAdd(userAgent);
        return await http.SendAsync(request, cancellationToken);
    }

    private static string? Text(JsonElement value, string name) =>
        value.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.String ? property.GetString() : null;

    private static string? MetadataText(JsonElement metadata, string name) =>
        metadata.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.Object ? Text(property, "value") : null;

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value)
        ? null
        : Regex.Replace(Regex.Replace(value, "<[^>]*>", " "), "\\s+", " ").Trim();

    private static string SafeUrl(string? value, string host)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var url) || url.Scheme != "https" || url.Host != host || !url.IsDefaultPort || url.UserInfo != "")
            throw new ArgumentException("Invalid Wikimedia URL.");
        return url.AbsoluteUri;
    }

    private static string SafeImageUrl(string? value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var url) || url.Scheme != "https" ||
            (url.Host != "upload.wikimedia.org" && url.Host != "thumb.wikimedia.org") || !url.IsDefaultPort || url.UserInfo != "")
            throw new ArgumentException("Invalid Wikimedia image URL.");
        return url.AbsoluteUri;
    }
}
