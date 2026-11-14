import {
  onAppearanceChange,
  updateAppearance,
  resetAppearance,
} from "./appearance.js";
import { iconify } from "./icons.js";

// Login/signup/recovery share one dialog instead of separate navbar theme controls.
const fields = [
  [
    "theme",
    "theme-preference",
    "Appearance",
    [
      ["system", "System — follow device"],
      ["light", "Light — warm paper"],
      ["dark", "Dark — evening studio"],
    ],
  ],
  [
    "density",
    "density-preference",
    "Canvas spacing",
    [
      ["comfortable", "Comfortable"],
      ["compact", "Compact"],
    ],
  ],
  [
    "corners",
    "corners-preference",
    "Card edges",
    [
      ["soft", "Soft corners"],
      ["square", "Square corners"],
    ],
  ],
  [
    "typography",
    "typography-preference",
    "Typography",
    [
      ["editorial", "Editorial — expressive serif"],
      ["modern", "Modern — clean sans serif"],
    ],
  ],
  [
    "layout",
    "layout-preference",
    "Board arrangement",
    [
      ["collage", "Editorial collage"],
      ["grid", "Even grid"],
    ],
  ],
  [
    "canvas",
    "canvas-preference",
    "Canvas background",
    [
      ["plain", "Plain paper"],
      ["dotted", "Subtle dot grid"],
    ],
  ],
  [
    "textSize",
    "text-size-preference",
    "Reading size",
    [
      ["standard", "Standard"],
      ["large", "Larger text"],
    ],
  ],
];
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}
function createDialog() {
  const dialog = node("dialog");
  dialog.id = "appearance-dialog";
  dialog.setAttribute("aria-labelledby", "appearance-title");
  const header = node("div", "dialog-header");
  const title = node("h2", "", "Make yourself at home.");
  title.id = "appearance-title";
  const close = node("button", "", "×");
  close.id = "close-appearance";
  close.type = "button";
  close.setAttribute("aria-label", "Close customization");
  header.append(title, close);
  const intro = node(
    "p",
    "dialog-copy",
    "Make the Studio yours. Preferences apply across pages and stay in this browser.",
  );
  const form = node("form", "appearance-form");
  form.id = "appearance-form";
  for (const [name, id, label, options] of fields) {
    const group = node("div", "appearance-field");
    const caption = node("label", "", label);
    caption.htmlFor = id;
    const select = node("select");
    select.name = name;
    select.id = id;
    if (name === "theme") select.dataset.themeControl = "";
    for (const [value, text] of options) {
      const option = node("option", "", text);
      option.value = value;
      select.append(option);
    }
    group.append(caption, select);
    form.append(group);
    if (name === "theme") {
      const accents = node("fieldset", "accent-options");
      accents.append(node("legend", "", "Accent color"));
      for (const [value, text, color] of [
        ["terracotta", "Terracotta", "#a64b35"],
        ["olive", "Olive", "#576a36"],
        ["plum", "Plum", "#775077"],
      ]) {
        const label = node("label");
        const input = node("input");
        input.type = "radio";
        input.name = "accent";
        input.value = value;
        const dot = node("span", "accent-dot");
        dot.style.setProperty("--preview", color);
        label.append(input, dot, document.createTextNode(text));
        accents.append(label);
      }
      form.append(accents);
    }
  }
  const footer = node("div", "appearance-footer");
  const reset = node("button", "toolbar-button", "Reset to defaults");
  reset.type = "button";
  reset.id = "reset-appearance";
  const done = node("button", "done-button", "Done ↗");
  done.type = "button";
  done.id = "done-appearance";
  footer.append(reset, done);
  const status = node("p", "settings-status");
  status.id = "appearance-status";
  status.setAttribute("role", "status");
  form.append(footer, status);
  dialog.append(header, intro, form);
  iconify(dialog);
  document.body.append(dialog);
  return dialog;
}
export function setupCustomization() {
  const trigger = document.querySelector("[data-customize-trigger]");
  let form = document.querySelector("#appearance-form");
  const dialog =
    document.querySelector("#appearance-dialog") ||
    (trigger ? createDialog() : null);
  form ||= document.querySelector("#appearance-form");
  if (!form) return;
  const status = document.querySelector("#appearance-status");
  const report = (saved) => {
    status.textContent = saved
      ? "Preferences saved in this browser."
      : "Applied for this visit. Browser storage is unavailable; preferences could not be saved.";
  };
  onAppearanceChange((preferences) => {
    for (const [field] of fields)
      form.elements[field].value = preferences[field];
    form.elements.accent.value = preferences.accent;
  });
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("change", (event) => {
    if (event.target.name)
      report(updateAppearance({ [event.target.name]: event.target.value }));
  });
  document
    .querySelector("#reset-appearance")
    .addEventListener("click", () => report(resetAppearance()));
  if (dialog) {
    trigger?.addEventListener("click", (event) => {
      event.preventDefault();
      dialog.showModal();
    });
    for (const id of ["close-appearance", "done-appearance"])
      document
        .querySelector("#" + id)
        .addEventListener("click", () => dialog.close());
  }
}
