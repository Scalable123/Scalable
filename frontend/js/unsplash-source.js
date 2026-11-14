// Same-origin backend only. Credentials and the shared quota never enter browser storage.
const endpoint = new URL("../../api/image-sources/unsplash", import.meta.url);
export const sourceMessages = {
  available: "One Unsplash photo added. Other content is curated sample material; no live AI.",
  rate_limited: "Unsplash’s hourly request budget is used up. Sample images are shown; try again later.",
  no_results: "Unsplash found no matching photo. Sample images are shown.",
  not_configured: "Unsplash is not configured on this server. Sample images are shown.",
  unavailable: "Unsplash is unavailable. Sample images are shown; you can try another prompt later.",
};
function validUrl(value, host) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === host && !url.port && !url.username && !url.password;
  } catch { return false; }
}
export async function searchUnsplash(prompt) {
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
    if (!Object.hasOwn(sourceMessages, result.status)) return { status: "unavailable" };
    if (result.status !== "available") return { status: result.status };
    const image = result.image;
    if (!image || image.provider !== "unsplash" || image.type !== "image" ||
        typeof image.externalPhotoId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(image.externalPhotoId) ||
        image.id !== `unsplash-${image.externalPhotoId}` ||
        !validUrl(image.url, "images.unsplash.com") || !validUrl(image.sourceUrl, "unsplash.com") ||
        !validUrl(image.creatorUrl, "unsplash.com") || typeof image.creatorName !== "string" || !image.creatorName.trim() ||
        typeof image.description !== "string" || typeof image.title !== "string")
      return { status: "unavailable" };
    return { status: "available", image: { ...image, position: "hero", pinned: false, imported: false } };
  } catch { return { status: "unavailable" }; }
}
