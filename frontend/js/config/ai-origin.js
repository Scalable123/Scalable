const browserWindow = globalThis.window;

export function aiOrigin() {
  const configured = browserWindow?.SCALABLE_AI_ORIGIN;
  if (typeof configured === "string" && configured.trim()) return configured.trim().replace(/\/$/, "");
  return browserWindow?.location?.origin || "";
}
