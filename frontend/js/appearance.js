// Appearance is a device preference, separate from board content and future SQL DTOs.
const key = "scalable.appearance.v1";
const defaults = {
  theme: "system",
  accent: "terracotta",
  density: "comfortable",
  corners: "soft",
  typography: "editorial",
  layout: "collage",
  canvas: "plain",
  textSize: "standard",
};
const allowed = {
  theme: ["system", "light", "dark"],
  accent: ["terracotta", "olive", "plum"],
  density: ["comfortable", "compact"],
  corners: ["soft", "square"],
  typography: ["editorial", "modern"],
  layout: ["collage", "grid"],
  canvas: ["plain", "dotted"],
  textSize: ["standard", "large"],
};
const device = window.matchMedia("(prefers-color-scheme: dark)");
let preferences = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem(key));
  for (const field of Object.keys(defaults)) {
    if (allowed[field].includes(saved?.[field]))
      preferences[field] = saved[field];
  }
} catch {
  /* Use valid defaults when storage is unavailable or corrupt. */
}
const listeners = new Set();
function apply() {
  const root = document.documentElement;
  root.dataset.theme =
    preferences.theme === "system"
      ? device.matches
        ? "dark"
        : "light"
      : preferences.theme;
  for (const field of [
    "accent",
    "density",
    "corners",
    "typography",
    "layout",
    "canvas",
    "textSize",
  ])
    root.dataset[field] = preferences[field];
  root.style.colorScheme = root.dataset.theme;
  document.querySelector('meta[name="theme-color"]').content =
    root.dataset.theme === "dark" ? "#1c211e" : "#f6f4ee";
  listeners.forEach((listener) => listener(getAppearance()));
}
export function getAppearance() {
  return { ...preferences };
}
export function updateAppearance(changes) {
  for (const [field, value] of Object.entries(changes)) {
    if (allowed[field]?.includes(value)) preferences[field] = value;
  }
  apply();
  try {
    localStorage.setItem(key, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
export function resetAppearance() {
  return updateAppearance(defaults);
}
export function onAppearanceChange(listener) {
  listeners.add(listener);
  listener(getAppearance());
}
device.addEventListener("change", () => {
  if (preferences.theme === "system") apply();
});
apply();
