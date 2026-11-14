import { iconify } from "./icons.js";
import { setupCustomization } from "./customize.js";
import { ApiPinterestService } from "./pinterest-service.js";
import { graphqlRequest } from "./config/graphqlClient.js";
iconify(document.body);
const $ = (selector) => document.querySelector(selector);
const sessionKey = "scalable.demoSession";
const profileKey = "scalable.profile.v1";
setupCustomization();
function startDemo() {
  try {
    sessionStorage.setItem(sessionKey, "preview");
  } catch {
    /* The account remains a preview when storage is blocked. */
  }
  location.assign("index.html");
}
function setupPasswordToggle(inputSelector, buttonSelector, label) {
  const input = $(inputSelector);
  const button = $(buttonSelector);
  button.hidden = false;
  button.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Hide" : "Show";
    button.setAttribute("aria-pressed", String(show));
    button.setAttribute("aria-label", `${show ? "Hide" : "Show"} ${label}`);
  });
}
if (document.body.dataset.page === "login") {
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    const status = $("#login-status");
    if (!email || !password) return;
    status.textContent = "Signing in…";
    let result;
    try {
      result = await graphqlRequest(
        `mutation Login($input: LoginInput!) {
          login(input: $input) { succeeded message user { id username email displayName } }
        }`,
        { input: { identifier: email, password } },
      );
    } catch {
      status.textContent =
        "Sign-in is temporarily unavailable. Please try again later, or continue without an account.";
      return;
    }
    if (!result.login.succeeded) {
      status.textContent = result.login.message;
      return;
    }
    event.target.reset();
    location.assign("account.html");
  });
  $("#demo-account").addEventListener("click", (event) => {
    event.preventDefault();
    startDemo();
  });
  setupPasswordToggle("#login-password", "#show-password", "password");
  $("#forgot-password").addEventListener("click", async (event) => {
    event.preventDefault();
    const email = $("#login-email").value.trim();
    const status = $("#login-status");
    if (!email) {
      status.textContent =
        "Enter your email address, then choose Forgot password.";
      $("#login-email").focus();
      return;
    }
    status.textContent = "Sending recovery instructions…";
    let result;
    try {
      result = await graphqlRequest(
        `mutation RequestPasswordReset($input: PasswordResetRequestInput!) {
          requestPasswordReset(input: $input) { succeeded message }
        }`,
        { input: { email } },
      );
    } catch {
      status.textContent =
        "Recovery is temporarily unavailable. Please try again later.";
      return;
    }
    status.textContent = result.requestPasswordReset.message;
  });
} else if (document.body.dataset.page === "signup") {
  const form = $("#signup-form");
  const password = $("#signup-password");
  const confirmation = $("#signup-confirm");
  setupPasswordToggle(
    "#signup-password",
    "#show-signup-password",
    "sample password",
  );
  setupPasswordToggle(
    "#signup-confirm",
    "#show-signup-confirm",
    "sample password confirmation",
  );
  function validateConfirmation() {
    const mismatch =
      Boolean(confirmation.value) && confirmation.value !== password.value;
    const message = mismatch ? "Your passwords do not match yet." : "";
    confirmation.setCustomValidity(message);
    confirmation.setAttribute("aria-invalid", String(mismatch));
    $("#signup-match-error").textContent = message;
  }
  for (const input of [password, confirmation])
    input.addEventListener("input", validateConfirmation);
  $("#signup-name").addEventListener("input", () => {
    const input = $("#signup-name");
    input.setCustomValidity(
      input.value && !input.value.trim()
        ? "Add a display name with at least one non-space character."
        : "",
    );
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    validateConfirmation();
    if (!$("#signup-name").value.trim()) {
      $("#signup-name").setCustomValidity("Add a display name.");
    }
    if (!form.reportValidity()) return;
    const status = $("#signup-status");
    status.textContent = "Creating your account…";
    let result;
    try {
      result = await graphqlRequest(
        `mutation Register($input: RegisterInput!) {
          register(input: $input) { succeeded message user { id username email displayName } }
        }`,
        {
          input: {
            username: $("#signup-username").value.trim(),
            email: $("#signup-email").value.trim(),
            displayName: $("#signup-name").value.trim(),
            password: password.value,
          },
        },
      );
    } catch {
      status.textContent = "Registration is temporarily unavailable. Please try again.";
      return;
    }
    if (!result.register.succeeded) {
      status.textContent = result.register.message;
      return;
    }
    form.reset();
    password.type = "password";
    confirmation.type = "password";
    for (const id of ["show-signup-password", "show-signup-confirm"]) {
      const button = $("#" + id);
      button.textContent = "Show";
      button.setAttribute("aria-pressed", "false");
    }
    $("#show-signup-password").setAttribute(
      "aria-label",
      "Show sample password",
    );
    $("#show-signup-confirm").setAttribute(
      "aria-label",
      "Show sample password confirmation",
    );
    validateConfirmation();
    form.hidden = true;
    status.textContent = "Account created. You are now signed in.";
    location.assign("account.html");
  });
  $("#signup-again").addEventListener("click", () => {
    $("#signup-result").hidden = true;
    form.hidden = false;
    $("#signup-name").focus();
  });
  $("#signup-submit").disabled = false;
} else if (document.body.dataset.page === "recovery") {
  $("#recovery-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#recovery-email").value.trim();
    if (!email) return;
    const status = $("#recovery-status");
    status.textContent = "Sending recovery instructions…";
    try {
      const { requestPasswordReset } = await graphqlRequest(
        `mutation RequestPasswordReset($input: PasswordResetRequestInput!) {
          requestPasswordReset(input: $input) { succeeded message }
        }`,
        { input: { email } },
      );
      event.target.reset();
      $("#recovery-result").hidden = false;
      $("#recovery-result").focus();
      status.textContent = requestPasswordReset.message;
    } catch {
      status.textContent =
        "Recovery is temporarily unavailable. Please try again later.";
    }
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
  graphqlRequest(`query { me { id username email displayName } }`)
    .then(({ me }) => {
      if (me) {
        $("#account-session").textContent = "Authenticated session";
        profile.email = me.email;
        profile.name = me.displayName || me.username;
        showProfile();
      }
    })
    .catch(() => {
      $("#account-session").textContent =
        "Local preview · authentication unavailable";
    });
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
  for (const [name, target, description] of [
    ["Pinterest", "pinterest", "Link your account and import your boards. Pinterest is excluded from AI research."],
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
    if (target === "pinterest") {
      const api = new ApiPinterestService();
      void (async () => {
        if (!await api.available()) return;
        link.textContent = "Manage Pinterest ↗";
        link.setAttribute("aria-label", "Manage Pinterest connection and board imports");
        try {
          const connection = await api.status();
          status.textContent = ({ connected: "Connected · board import only", expired: "Expired · reconnect to import", disconnected: "Not connected", unavailable: "Unavailable" })[connection.status] || "Unavailable";
        } catch (error) {
          status.textContent = error.code === "signed_out" ? "Log in to link Pinterest" : "Connection unavailable · retry in importer";
        }
      })();
    }
    if (target === "pinterest") {
      const api = new ApiPinterestService();
      void (async () => {
        if (!await api.available()) return;
        link.textContent = "Manage Pinterest ↗";
        link.setAttribute("aria-label", "Manage Pinterest connection and board imports");
        try {
          const connection = await api.status();
          status.textContent = ({ connected: "Connected · board import only", expired: "Expired · reconnect to import", disconnected: "Not connected", unavailable: "Unavailable" })[connection.status] || "Unavailable";
        } catch (error) {
          status.textContent = error.code === "signed_out" ? "Log in to link Pinterest" : "Connection unavailable · retry in importer";
        }
      })();
    }
  }
  $("#password-preview").addEventListener("click", () => {
    $("#security-status").textContent =
      "Password changes are not active in this preview. No password or account settings were changed.";
  });
  $("#demo-signout").addEventListener("click", async () => {
    try {
      await graphqlRequest(`mutation { logout }`);
    } catch {
      $("#security-status").textContent =
        "Could not sign out of the authenticated session. Check your connection and try again.";
      return;
    }
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      /* There may be no stored preview flag. */
    }
    location.assign("login.html");
  });
}
