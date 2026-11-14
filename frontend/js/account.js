import { iconify } from "./icons.js";
import {
  onAppearanceChange,
  updateAppearance,
  resetAppearance,
  setupThemeControls,
} from "./appearance.js";
iconify(document.body);
const $ = (selector) => document.querySelector(selector);
const sessionKey = "scalable.demoSession";
const profileKey = "scalable.profile.v1";
onAppearanceChange((preferences) => {
  if ($("#appearance-form")) {
    for (const field of [
      "theme",
      "density",
      "corners",
      "typography",
      "layout",
      "canvas",
      "textSize",
    ])
      $("#appearance-form").elements[field].value = preferences[field];
    $("#appearance-form").elements.accent.value = preferences.accent;
  }
});
setupThemeControls((saved) => {
  if (!saved) {
    const status =
      $("#login-status") || $("#profile-status") || $("#recovery-status");
    status.textContent =
      "Theme applied for this visit. Browser storage is unavailable.";
  }
});
function startDemo() {
  try {
    sessionStorage.setItem(sessionKey, "preview");
  } catch {
    /* The account remains a preview when storage is blocked. */
  }
  location.assign("account.html");
}
if (document.body.dataset.page === "login") {
  $("#login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!$("#login-email").value.trim()) return;
    // Never persist, send, log, or copy the password/email entered in this mock form.
    event.target.reset();
    startDemo();
  });
  $("#demo-account").addEventListener("click", (event) => {
    event.preventDefault();
    startDemo();
  });
  $("#show-password").hidden = false;
  $("#show-password").addEventListener("click", () => {
    const show = $("#login-password").type === "password";
    $("#login-password").type = show ? "text" : "password";
    $("#show-password").textContent = show ? "Hide" : "Show";
    $("#show-password").setAttribute("aria-pressed", String(show));
    $("#show-password").setAttribute(
      "aria-label",
      show ? "Hide sample password" : "Show sample password",
    );
  });
} else if (document.body.dataset.page === "recovery") {
  $("#recovery-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!$("#recovery-email").value.trim()) return;
    event.target.reset();
    $("#recovery-result").hidden = false;
    $("#recovery-result").focus();
  });
} else {
  const defaults = { name: "Your creative space", email: "you@example.com" };
  let profile = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(profileKey));
    if (
      typeof saved?.name === "string" &&
      saved.name.trim() &&
      saved.name.length <= 80
    )
      profile.name = saved.name;
    if (typeof saved?.email === "string" && saved.email.length <= 254)
      profile.email = saved.email;
  } catch {
    /* Defaults support blocked/corrupt storage. */
  }
  function showProfile() {
    $("#profile-name").value = profile.name;
    $("#profile-email").value = profile.email;
    $("#profile-display-name").textContent = profile.name;
    $("#profile-avatar").textContent =
      Array.from(profile.name.trim())[0]?.toUpperCase() || "Y";
  }
  showProfile();
  try {
    const boards = JSON.parse(
      localStorage.getItem("scalable.boards.v1") || "[]",
    );
    $("#account-board-count").textContent = Array.isArray(boards)
      ? boards.length
      : "—";
  } catch {
    $("#account-board-count").textContent = "—";
  }
  try {
    if (sessionStorage.getItem(sessionKey))
      $("#account-session").textContent = "Demo session · not authenticated";
  } catch {
    /* No authenticated state is inferred. */
  }
  const titles = {
    profile: "profile-title",
    appearance: "account-appearance-title",
    connections: "connections-title",
    security: "security-title",
  };
  function showPanel(focus = false) {
    const key = Object.hasOwn(titles, location.hash.slice(1))
      ? location.hash.slice(1)
      : "profile";
    document.querySelectorAll("[data-account-section]").forEach((section) => {
      section.hidden = section.dataset.accountSection !== key;
    });
    document.querySelectorAll("[data-account-panel]").forEach((link) => {
      if (link.dataset.accountPanel === key)
        link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (focus) $(`#${titles[key]}`).focus();
  }
  window.addEventListener("hashchange", () => showPanel(true));
  showPanel();
  $("#profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#profile-name").value.trim();
    if (!name) {
      $("#profile-status").textContent = "Add a display name before saving.";
      $("#profile-name").focus();
      return;
    }
    profile = { name, email: $("#profile-email").value.trim() };
    showProfile();
    try {
      localStorage.setItem(profileKey, JSON.stringify(profile));
      $("#profile-status").textContent =
        "Local profile saved. No login identity or cloud account was changed.";
    } catch {
      $("#profile-status").textContent =
        "Applied for this visit. Browser storage is unavailable; the profile could not be saved.";
    }
  });
  const appearanceStatus = (saved) => {
    $("#appearance-status").textContent = saved
      ? "Preferences saved in this browser."
      : "Applied for this visit. Browser storage is unavailable.";
  };
  $("#appearance-form").addEventListener("submit", (event) =>
    event.preventDefault(),
  );
  $("#appearance-form").addEventListener("change", (event) =>
    appearanceStatus(
      updateAppearance({ [event.target.name]: event.target.value }),
    ),
  );
  $("#reset-appearance").addEventListener("click", () =>
    appearanceStatus(resetAppearance()),
  );
  $("#account-appearance-done").addEventListener("click", () => {
    location.hash = "profile";
  });
  for (const [name, target, description] of [
    ["Pinterest", "pinterest", "Import full sample boards or individual pins."],
    ["Spotify", "audio", "Preview music library selection or paste a link."],
    ["Amazon Music", "audio", "Explore a candidate music integration."],
    ["Apple Music", "audio", "Collect links or preview a sample library."],
    ["SoundCloud", "audio", "Add independent music and sound references."],
    ["YouTube", "video", "Save video references; load players on demand."],
  ]) {
    const row = document.createElement("article");
    row.className = "account-connection";
    const copy = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = name;
    const text = document.createElement("p");
    text.textContent = description;
    const status = document.createElement("small");
    status.textContent = "Not connected";
    copy.append(heading, text, status);
    const link = document.createElement("a");
    link.className = "toolbar-button";
    link.href = `index.html?import=${target}`;
    link.textContent = "Open preview ↗";
    link.setAttribute("aria-label", `Open ${name} import preview`);
    row.append(copy, link);
    iconify(row);
    $("#account-connections").append(row);
  }
  $("#password-preview").addEventListener("click", () => {
    $("#security-status").textContent =
      "Password changes are not active in this preview. No password or account settings were changed.";
  });
  $("#demo-signout").addEventListener("click", () => {
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      /* There may be no stored preview flag. */
    }
    location.assign("login.html");
  });
}
