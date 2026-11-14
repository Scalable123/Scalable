const browserWindow = globalThis.window;
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function apiOrigin() {
  const configured = browserWindow?.SCALABLE_API_ORIGIN;
  if (typeof configured === "string" && configured.trim()) return configured.trim().replace(/\/$/, "");
  if (localHosts.has(browserWindow?.location?.hostname)) {
    return browserWindow.location.port === "5079" ? browserWindow.location.origin : "http://127.0.0.1:5079";
  }
  return "https://scalable-5rgd.onrender.com";
}
