// Keep Pinterest imports separate from every research adapter.
// Future server research workers must enforce this exclusion before following redirects or calling tools.
const pinterestAddress = /\b(?:[a-z0-9-]+\.)*(?:pinterest\.[a-z.]+|pinimg\.com|pin\.it)\b/i;
export function assertResearchInputAllowed(value, seen = new Set()) {
  if (typeof value === "string") {
    if (pinterestAddress.test(value)) throw new Error("Pinterest links and media cannot be used for AI research. Import your own boards through the Pinterest importer.");
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (value.provider === "pinterest" || value.researchAllowed === false)
    throw new Error("Pinterest references are excluded from AI research and analysis.");
  for (const item of Object.values(value)) assertResearchInputAllowed(item, seen);
}
