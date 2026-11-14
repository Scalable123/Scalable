// Wikimedia credentials are not required for this read-only Commons search.
// The server owns the User-Agent, shared quota, URL validation, and attribution metadata.
const endpoint = new URL("../../api/image-sources/wikimedia", import.meta.url);
export const wikimediaSourceMessages = {
  available: "One Wikimedia Commons image added.",
  rate_limited: "Wikimedia Commons is rate limited. Sample images are shown; try again later.",
  no_results: "Wikimedia Commons found no matching image. Sample images are shown.",
  not_configured: "Wikimedia Commons is not configured on this server. Sample images are shown.",
  unavailable: "Wikimedia Commons is unavailable. Sample images are shown; you can try another prompt later.",
};
function validUrl(value, host) {
  try {
    const url = new URL(value);
    const hosts = Array.isArray(host) ? host : [host];
    return url.protocol === "https:" && hosts.includes(url.hostname) && !url.port && !url.username && !url.password;
  } catch { return false; }
}
export async function searchWikimedia(prompt) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return { status: response.status === 429 ? "rate_limited" : "unavailable" };
    const result = await response.json();
    if (!Object.hasOwn(wikimediaSourceMessages, result.status)) return { status: "unavailable" };
    if (result.status !== "available") return { status: result.status };
    const image = result.image;
    if (!image || image.provider !== "wikimedia" || image.type !== "image" ||
        typeof image.externalPhotoId !== "string" || !/^\d{1,30}$/.test(image.externalPhotoId) ||
        image.id !== `wikimedia-${image.externalPhotoId}` ||
        !validUrl(image.url, ["upload.wikimedia.org", "thumb.wikimedia.org"]) || !validUrl(image.sourceUrl, "commons.wikimedia.org") ||
        !validUrl(image.creatorUrl, "commons.wikimedia.org") || typeof image.creatorName !== "string" ||
        !image.creatorName.trim() || typeof image.licenseName !== "string" || !image.licenseName.trim() ||
        typeof image.description !== "string" || typeof image.title !== "string")
      return { status: "unavailable" };
    return { status: "available", image: { ...image, position: "detail", pinned: false, imported: false } };
  } catch { return { status: "unavailable" }; }
}
