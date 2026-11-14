// Apply the theme before styles paint. This script has no dependencies on page controls.
(() => {
  let preference = "system";
  try {
    const saved = JSON.parse(localStorage.getItem("scalable.appearance.v1"));
    if (["system", "light", "dark"].includes(saved?.theme))
      preference = saved.theme;
  } catch {
    /* Device preference remains the default if storage is unavailable. */
  }
  const deviceDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme =
    preference === "system" ? (deviceDark ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
