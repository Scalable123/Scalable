/** Public Commons read API. No key, OAuth, scraping, or automatic retries. */
const API_URL = "https://commons.wikimedia.org/w/api.php";
const AGENT = "ScalableStudio/1.0 (https://github.com/Scalable123/Scalable)";
const BUDGET_KEY = "scalable.wikimedia.nextRequestAt.v1";
const REQUEST_INTERVAL = 6100; // Below even the 10/min unidentified-client ceiling.
const CACHE_TTL = 10 * 60 * 1000;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const STOP_WORDS = new Set(
  "a an and are as at be board by for from i in is it little mood my of on or that the this to with your".split(" "),
);

function plainText(value) {
  if (typeof value !== "string" || value.length > 10000) return "";
  // Template contents are inert and are never inserted into the document.
  const template = document.createElement("template");
  template.innerHTML = value;
  template.content.querySelectorAll("script,style,iframe,object").forEach((node) => node.remove());
  return template.content.textContent.replace(/\s+/g, " ").trim();
}

function trustedUrl(value, host, pathPrefix) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === host &&
      !url.username && !url.password && !url.port &&
      url.pathname.startsWith(pathPrefix) ? url : null;
  } catch {
    return null;
  }
}

function hasMetadataValue(value) {
  if (value === undefined || value === null || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" ? Boolean(plainText(value)) : true;
}

export function wikimediaCreditUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, "https://commons.wikimedia.org");
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

function creditLinks(metadata) {
  const links = new Map();
  for (const key of ["Artist", "Credit", "Attribution", "Copyright"]) {
    const value = metadata[key]?.value;
    // Skip an image rather than silently dropping an excessive required credit.
    if (value !== undefined && (typeof value !== "string" || value.length > 10000)) return null;
    const template = document.createElement("template");
    template.innerHTML = value || "";
    for (const anchor of template.content.querySelectorAll("a[href]")) {
      const url = wikimediaCreditUrl(anchor.getAttribute("href"));
      if (url) links.set(url, { label: plainText(anchor.textContent) || url, url });
    }
  }
  return links.size > 20 ? null : [...links.values()];
}

// Revalidate persisted provider records before giving URLs to DOM elements.
export function validWikimediaImage(item) {
  const license = trustedUrl(item?.license?.url, "creativecommons.org", "/");
  return Boolean(
    item?.provider === "wikimedia" &&
    trustedUrl(item.url, "upload.wikimedia.org", "/wikipedia/commons/") &&
    trustedUrl(item.sourceUrl, "commons.wikimedia.org", "/wiki/File:") &&
    license && /^\/(?:licenses\/(?:by|by-sa)\/(?:1\.0|2\.0|2\.5|3\.0|4\.0)|publicdomain\/(?:zero|mark)\/1\.0)\/$/.test(license.pathname) &&
    typeof item.creator === "string" && item.creator.trim() &&
    typeof item.license.name === "string" && item.license.name.trim(),
  );
}

function toImage(page, retrievedAt) {
  const info = page?.imageinfo?.[0];
  const metadata = info?.extmetadata;
  if (!Number.isSafeInteger(page?.pageid) || page.pageid <= 0 || page.ns !== 6 ||
      !MIME_TYPES.has(info?.mime) || !metadata ||
      (info.badfile !== undefined && info.badfile !== false) ||
      !Number.isFinite(info.width) || info.width <= 0 ||
      !Number.isFinite(info.height) || info.height <= 0 ||
      (info.thumbmime && !MIME_TYPES.has(info.thumbmime)) ||
      hasMetadataValue(metadata.Restrictions?.value) ||
      hasMetadataValue(metadata.LicenseRestrictions?.value) ||
      hasMetadataValue(metadata.DeletionReason?.value) ||
      /^(true|1)$/i.test(String(metadata.NonFree?.value))) return null;

  const title = plainText(metadata.ObjectName?.value) ||
    plainText(typeof page.title === "string" ? page.title.replace(/^File:/, "").replace(/\.[^.]+$/, "") : "");
  const attributionLinks = creditLinks(metadata);
  if (!attributionLinks) return null;
  const item = {
    id: `wikimedia-${page.pageid}`,
    type: "image",
    provider: "wikimedia",
    sourceKind: "wikimedia-commons",
    sourceKey: `wikimedia:${page.pageid}`,
    externalId: String(page.pageid),
    url: info.thumburl,
    sourceUrl: info.descriptionurl,
    sourceLabel: "Wikimedia Commons",
    title,
    description: plainText(metadata.ImageDescription?.value) || title,
    creator: plainText(metadata.Artist?.value),
    credit: plainText(metadata.Credit?.value),
    attribution: plainText(metadata.Attribution?.value),
    copyright: plainText(metadata.Copyright?.value),
    attributionLinks,
    license: {
      name: plainText(metadata.LicenseShortName?.value),
      url: metadata.LicenseUrl?.value,
    },
    width: info.width,
    height: info.height,
    retrievedAt,
    position: "wikimedia",
    pinned: false,
    isSample: false,
  };
  return title && validWikimediaImage(item) ? item : null;
}

function searchQuery(prompt) {
  // Treat prompt text as words, never as executable CirrusSearch operators.
  const words = [...new Set((prompt.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .filter((word) => !STOP_WORDS.has(word)))].slice(0, 8);
  return words.length ? `(${words.map((word) => `"${word}"`).join(" OR ")}) filetype:bitmap` : "";
}

function retryAt(value, now) {
  if (!value) return now + 60000;
  const seconds = Number(value);
  const deadline = /^\d+(?:\.\d+)?$/.test(value.trim())
    ? now + seconds * 1000 : Date.parse(value);
  return Number.isFinite(deadline)
    ? Math.max(now + REQUEST_INTERVAL, Math.min(deadline, 8e15)) : now + 60000;
}

export class WikimediaImageSource {
  constructor({ fetchImpl = (...args) => fetch(...args), now = Date.now, timeoutMs = 8000 } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
    this.nextRequestAt = 0;
  }

  async search(prompt, { signal } = {}) {
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2000)
      return { status: "skipped" };
    if (signal?.aborted) return { status: "cancelled" };
    const query = searchQuery(prompt);
    if (!query) return { status: "no-results" };
    const cached = this.cache.get(query);
    if (cached && cached.expiresAt > this.now())
      return { ...structuredClone(cached.result), cached: true };

    // Fail closed if this browser cannot coordinate its tabs or persist a cooldown.
    if (!navigator.locks) return { status: "unavailable" };
    try {
      return await navigator.locks.request("scalable.wikimedia.request", { ifAvailable: true }, async (lock) => {
        if (!lock) return { status: "busy" };
        if (signal?.aborted) return { status: "cancelled" };
        const stored = localStorage.getItem(BUDGET_KEY);
        const savedDeadline = stored === null ? 0 : Number(stored);
        if (!Number.isFinite(savedDeadline) || savedDeadline < 0)
          return { status: "unavailable" };
        this.nextRequestAt = Math.max(this.nextRequestAt, savedDeadline);
        if (this.nextRequestAt > this.now())
          return { status: "rate-limited", retryAt: this.nextRequestAt };
        this.deferUntil(this.now() + REQUEST_INTERVAL);
        return this.request(query, signal);
      });
    } catch {
      return { status: "unavailable" };
    }
  }

  deferUntil(deadline) {
    this.nextRequestAt = Math.max(this.nextRequestAt, deadline);
    localStorage.setItem(BUDGET_KEY, String(this.nextRequestAt));
  }

  async request(query, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const params = new URLSearchParams({
        action: "query", format: "json", formatversion: "2", origin: "*",
        generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "3",
        prop: "imageinfo", iiprop: "url|size|mime|thumbmime|extmetadata|badfile",
        iiurlwidth: "960", iiextmetadatalanguage: "en", maxlag: "5",
      });
      const response = await this.fetchImpl(`${API_URL}?${params}`, {
        method: "GET", credentials: "omit", referrerPolicy: "no-referrer",
        headers: { "Api-User-Agent": AGENT }, signal: controller.signal,
      });
      if (response.status === 429 || response.status === 503) {
        this.deferUntil(retryAt(response.headers.get("Retry-After"), this.now()));
        return { status: "rate-limited", retryAt: this.nextRequestAt };
      }
      if (!response.ok) return { status: "unavailable" };
      const data = await response.json();
      if (controller.signal.aborted)
        return { status: timedOut ? "timeout" : "cancelled" };
      if (data.error || data.errors) {
        const code = data.error?.code || data.errors?.[0]?.code;
        if (["maxlag", "ratelimited", "readonly"].includes(code)) {
          this.deferUntil(retryAt(response.headers.get("Retry-After"), this.now()));
          return { status: "rate-limited", retryAt: this.nextRequestAt };
        }
        return { status: "unavailable" };
      }
      const pages = data.query?.pages;
      if (pages !== undefined && !Array.isArray(pages)) return { status: "unavailable" };
      const candidates = (pages || []).slice(0, 3).sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));
      let image;
      for (const page of candidates) {
        image = toImage(page, new Date(this.now()).toISOString());
        if (image) break;
      }
      const result = image ? { status: "found", image } : { status: "no-results" };
      if (this.cache.size >= 20) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(query, { result: structuredClone(result), expiresAt: this.now() + CACHE_TTL });
      return result;
    } catch {
      return { status: timedOut ? "timeout" : signal?.aborted ? "cancelled" : "unavailable" };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}

export function wikimediaStatus(result) {
  if (!result) return "Explore your brief to find up to one image from Wikimedia Commons.";
  if (result.status === "found")
    return `One Wikimedia Commons image ${result.cached ? "reused from the recent search" : "found"}. Credit and license appear on the card.`;
  if (result.status === "rate-limited")
    return "Wikimedia is paused to respect request limits. Sample content is available; try a later prompt.";
  if (result.status === "no-results")
    return "No suitable Wikimedia image with supported license and credit metadata was found. Sample content is available.";
  if (result.status === "busy")
    return "Another Wikimedia lookup is running. Sample content is available; try a later prompt.";
  if (result.status === "timeout")
    return "Wikimedia took too long to respond. Sample content is available; try a later prompt.";
  return "Wikimedia is unavailable for this prompt. Sample content is available.";
}
