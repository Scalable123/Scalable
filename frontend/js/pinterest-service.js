// Application requests use the GraphQL backend's authenticated browser session.
export class PinterestApiError extends Error {
  constructor(message, code = "unavailable", retryAfter = null) {
    super(message);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
export class ApiPinterestService {
  constructor({ fetcher = (...args) => fetch(...args) } = {}) {
    this.fetcher = fetcher;
    this.baseUrl = new URL(
      "/api/integrations/pinterest",
      window.GRAPHQL_ENDPOINT || "http://localhost:5078/graphql",
    ).href;
    this.isLive = true;
  }
  async available(signal) {
    try {
      const response = await this.fetcher(`${this.baseUrl}/availability`, {
        signal,
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return false;
      return (await response.json()).available === true;
    } catch (error) {
      if (error.name === "AbortError") throw error;
      return false;
    }
  }
  async request(path = "", { signal, ...options } = {}) {
    signal?.throwIfAborted();
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...options,
      signal,
      credentials: "include",
      cache: "no-store",
      headers: { ...options.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new PinterestApiError(
        body.message || (response.status === 401 ? "Your session expired. Log in or reconnect Pinterest." : "Pinterest is unavailable. Please retry."),
        body.error || (response.status === 401 ? "expired" : "unavailable"),
        response.headers.get("retry-after"),
      );
    }
    return response.status === 204 ? null : response.json();
  }
  status(signal) { return this.request("", { signal }); }
  authorize(signal) { return this.request("/authorize", { method: "POST", signal }); }
  disconnect(signal) { return this.request("", { method: "DELETE", signal }); }
  async pages(path, signal, onProgress = () => {}) {
    const items = new Map();
    const seen = new Set();
    let bookmark = null;
    for (let page = 0; page < 1000; page += 1) {
      const data = await this.request(path + (bookmark ? `?bookmark=${encodeURIComponent(bookmark)}` : ""), { signal });
      if (!Array.isArray(data.items) || (data.bookmark != null && typeof data.bookmark !== "string"))
        throw new PinterestApiError("Pinterest returned an unreadable page. Nothing has been imported.");
      for (const item of data.items) {
        if (typeof item.id !== "string" || !/^\d{1,40}$/.test(item.id)) throw new PinterestApiError("Pinterest returned an invalid item.");
        items.set(item.id, item);
      }
      onProgress(items.size);
      bookmark = data.bookmark;
      if (!bookmark) return [...items.values()];
      if (seen.has(bookmark) || items.size > 50000) break;
      seen.add(bookmark);
    }
    throw new PinterestApiError("This library is too large or pagination could not finish. Nothing has been imported. Select fewer boards or retry.", "incomplete");
  }
  async listBoards(signal, onProgress) {
    return (await this.pages("/boards", signal, onProgress)).map(board => ({ ...board, imageUrl: safePinterestImage(board.imageUrl), pins: null }));
  }
  listPins(id, signal, onProgress) {
    if (!/^\d{1,40}$/.test(id)) throw new PinterestApiError("Invalid Pinterest board ID.");
    return this.pages(`/boards/${encodeURIComponent(id)}/pins`, signal, onProgress);
  }
  toBoardItems(boards, selectedPinIds) {
    const selected = new Set(selectedPinIds);
    const items = new Map();
    for (const board of boards) {
      for (const pin of board.pins) {
        if (!selected.has(pin.id) || !pin.supported || !safePinterestImage(pin.imageUrl)) continue;
        const sourceBoard = { id: board.id, title: board.title, url: null };
        if (items.has(pin.id)) {
          items.get(pin.id).sourceBoards.push(sourceBoard);
          continue;
        }
        const originalPinUrl = `https://www.pinterest.com/pin/${pin.id}/`;
        items.set(pin.id, {
          id: crypto.randomUUID(), type: "image", title: pin.title || "Pinterest pin", description: pin.description || "",
          url: pin.imageUrl, sourceUrl: originalPinUrl, originalPinUrl,
          creatorSourceUrl: safeHttps(pin.imageSourceUrl),
          sourceLabel: "Pinterest · original Pin and creator attribution; reuse rights not granted",
          position: "pinterest", pinned: false, imported: true, provider: "pinterest", sourceKind: "pinterest-api",
          sourceKey: `pinterest:${pin.id}`, externalPinId: pin.id, sourceBoard, sourceBoards: [sourceBoard],
          isSample: false, researchAllowed: false, license: "unknown", importedAt: new Date().toISOString(),
        });
      }
    }
    return [...items.values()];
  }
}
function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
export function safePinterestImage(value) {
  const href = safeHttps(value);
  if (!href) return null;
  const host = new URL(href).hostname;
  return host === "pinimg.com" || host.endsWith(".pinimg.com") ? href : null;
}
export function validatePinterestAuthorization(value) {
  const url = new URL(value);
  if (url.origin !== "https://www.pinterest.com" || url.pathname !== "/oauth/" || url.username || url.password)
    throw new PinterestApiError("The service returned an invalid Pinterest sign-in address.");
  return url.href;
}
