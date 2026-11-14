// Honor research exclusions on previously saved references.
export function assertResearchInputAllowed(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (value.researchAllowed === false)
    throw new Error("This reference is excluded from AI research and analysis.");
  for (const item of Object.values(value)) assertResearchInputAllowed(item, seen);
}
