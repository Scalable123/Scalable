// Development-only browser checks. Requires Playwright and Chromium, not app dependencies.
const { chromium } = require("playwright");
const mockSupabase = require("./helpers/mock-supabase.cjs");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "..");
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".jpg": "image/jpeg",
  };
  const server = http.createServer(async (req, res) => {
    let pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (pathname.startsWith("/Scalable/"))
      pathname = pathname.slice("/Scalable".length);
    if (pathname === "/Scalable") {
      res.writeHead(302, { Location: "/Scalable/" }).end();
      return;
    }
    const file = path.resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      res.setHeader(
        "Content-Type",
        mime[path.extname(file)] || "application/octet-stream",
      );
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const base = `http://127.0.0.1:${server.address().port}/Scalable/`;
    const context = await browser.newContext({
      colorScheme: "dark",
      viewport: { width: 1440, height: 1100 },
    });
    await mockSupabase(context);
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    const watch = (p) => {
      p.on("pageerror", (error) => errors.push(error.message));
      p.on("request", (request) => requests.push(request));
    };
    watch(page);
    await page.goto(base);
    await page.waitForURL(base + "frontend/login.html");
    await page.locator("[data-theme-control]:not([disabled])").waitFor();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    assert.equal(
      await page.locator("[data-theme-control]").inputValue(),
      "system",
    );
    const logo = await page.locator(".brand").evaluate((logo) => ({
      text: logo.textContent.replace(/\s+/g, " ").trim(),
      star: logo.querySelector("svg path").getAttribute("d"),
      font: getComputedStyle(logo).fontSize,
    }));
    await page.locator("#show-password").click();
    assert.equal(
      await page.locator("#login-password").getAttribute("type"),
      "text",
    );
    await page.locator("#show-password").click();
    await page.locator("#forgot-password").click();
    await page
      .getByText("Enter your email address, then choose Forgot password.", {
        exact: true,
      })
      .waitFor();
    await page.locator("#login-email").fill("recovery@example.test");
    await page.locator("#forgot-password").click();
    await page
      .getByText(
        "If an account exists for that email, recovery instructions are on the way.",
        { exact: true },
      )
      .waitFor();
    const recoveryCall = await page.evaluate(() =>
      window.__authCalls.find(
        (call) => call.method === "resetPasswordForEmail",
      ),
    );
    assert.equal(
      recoveryCall.redirectTo,
      base + "frontend/update-password.html",
    );
    await page.goto(base + "frontend/recover.html");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.locator("#recovery-email").fill("sample@example.test");
    await page.locator("#recovery-form [type=submit]").click();
    await page.locator("#recovery-result").waitFor();
    await page
      .getByRole("link", { name: "Return to login", exact: false })
      .click();
    await page.waitForURL(base + "frontend/login.html");
    await page.locator("[data-theme-control]").selectOption("light");
    await page.locator("#demo-account").click();
    await page.waitForURL(base + "frontend/account.html");
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "light",
    );
    assert.equal(
      await page.locator("[data-theme-control]").inputValue(),
      "light",
    );
    assert.deepEqual(
      await page.locator(".brand").evaluate((logo) => ({
        text: logo.textContent.replace(/\s+/g, " ").trim(),
        star: logo.querySelector("svg path").getAttribute("d"),
        font: getComputedStyle(logo).fontSize,
      })),
      logo,
    );
    await page.locator(".brand").click();
    await page.waitForURL(base + "frontend/index.html");
    await page.locator("#import-audio:not([disabled])").waitFor();
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "light",
    );
    assert.deepEqual(
      await page.locator(".brand").evaluate((logo) => ({
        text: logo.textContent.replace(/\s+/g, " ").trim(),
        star: logo.querySelector("svg path").getAttribute("d"),
        font: getComputedStyle(logo).fontSize,
      })),
      logo,
    );
    await page.locator("[data-theme-control]").selectOption("system");
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    const other = await context.newPage();
    watch(other);
    await other.goto(base + "frontend/login.html");
    await other.locator("[data-theme-control]:not([disabled])").waitFor();
    await other.locator("[data-theme-control]").selectOption("light");
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    assert.equal(
      await page.locator("[data-theme-control]").inputValue(),
      "light",
    );
    await other.locator("[data-theme-control]").selectOption("system");
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    // A page restored from back/forward cache must re-read the shared preference.
    await page.evaluate(() => {
      localStorage.setItem(
        "scalable.appearance.v1",
        JSON.stringify({ theme: "light" }),
      );
      dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "light",
    );
    for (const pathname of [
      "login.html",
      "recover.html",
      "account.html",
      "index.html",
    ]) {
      await page.goto(base + "frontend/" + pathname);
      await page.locator("[data-theme-control]:not([disabled])").waitFor();
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        assert(
          !(await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )),
          `${pathname} overflow at ${width}`,
        );
        assert(await page.locator("[data-theme-control]").isVisible());
      }
    }
    // Registration is a validation-only frontend flow, reached through real links.
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(base + "frontend/login.html");
    await page.locator("#create-account-link").click();
    await page.waitForURL(base + "frontend/signup.html");
    await page.locator("#signup-submit:not([disabled])").waitFor();
    assert.deepEqual(
      await page.locator(".brand").evaluate((logo) => ({
        text: logo.textContent.replace(/\s+/g, " ").trim(),
        star: logo.querySelector("svg path").getAttribute("d"),
        font: getComputedStyle(logo).fontSize,
      })),
      logo,
    );
    await page.locator("#signup-submit").click();
    assert(await page.locator("#signup-result").isHidden());
    await page.locator("#signup-name").fill("   ");
    assert.equal(
      await page
        .locator("#signup-name")
        .evaluate((input) => input.validity.valid),
      false,
    );
    await page.locator("#signup-name").fill("Sample Creative");
    await page.locator("#signup-email").fill("invalid-email");
    assert.equal(
      await page
        .locator("#signup-email")
        .evaluate((input) => input.validity.valid),
      false,
    );
    await page.locator("#signup-email").fill("signup@example.test");
    await page.locator("#signup-password").fill("short");
    await page.locator("#signup-confirm").fill("short");
    await page.locator("#signup-submit").click();
    assert(await page.locator("#signup-result").isHidden());
    await page.locator("#signup-password").fill("sample-signup-only-42");
    await page.locator("#signup-confirm").fill("different-password");
    await page
      .getByText("Your passwords do not match yet.", { exact: true })
      .waitFor();
    await page.locator("#signup-submit").click();
    assert(await page.locator("#signup-result").isHidden());
    assert.equal(
      await page.locator("#signup-confirm").getAttribute("aria-invalid"),
      "true",
    );
    await page.locator("#show-signup-password").click();
    assert.equal(
      await page.locator("#signup-password").getAttribute("type"),
      "text",
    );
    await page.locator("#show-signup-confirm").click();
    assert.equal(
      await page.locator("#signup-confirm").getAttribute("type"),
      "text",
    );
    await page.locator("#signup-confirm").fill("sample-signup-only-42");
    assert.equal(
      await page.locator("#signup-confirm").getAttribute("aria-invalid"),
      "false",
    );
    const beforeRegistration = await page.evaluate(() => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
    }));
    await page.locator("#signup-submit").click();
    await page.locator("#signup-result").waitFor();
    assert(await page.locator("#signup-form").isHidden());
    assert.equal(await page.locator("#signup-password").inputValue(), "");
    assert.equal(await page.locator("#signup-confirm").inputValue(), "");
    assert.equal(
      await page.locator("#signup-password").getAttribute("type"),
      "password",
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        local: JSON.stringify({ ...localStorage }),
        session: JSON.stringify({ ...sessionStorage }),
      })),
      beforeRegistration,
    );
    assert(!page.url().includes("signup@example.test"));
    assert(!page.url().includes("sample-signup-only-42"));
    await page.locator("#signup-again").click();
    assert(await page.locator("#signup-result").isHidden());
    assert.equal(await page.locator("#signup-name").inputValue(), "");
    for (const theme of ["light", "dark"]) {
      await page.locator("[data-theme-control]").selectOption(theme);
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        assert(
          !(await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )),
          `Signup overflows at ${width}/${theme}`,
        );
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator("[data-theme-control]").selectOption("system");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    await page.locator(".auth-switch a").click();
    await page.waitForURL(base + "frontend/login.html");
    await page.locator("#create-account-link").click();
    await page.waitForURL(base + "frontend/signup.html");
    await page.locator("#signup-name").fill("Sample Creative");
    await page.locator("#signup-email").fill("signup@example.test");
    await page.locator("#signup-password").fill("sample-signup-only-42");
    await page.locator("#signup-confirm").fill("sample-signup-only-42");
    await page.locator("#signup-submit").click();
    await page.locator("#signup-result a").click();
    await page.waitForURL(base + "frontend/account.html");
    assert.match(
      await page.locator("#account-session").textContent(),
      /not authenticated/,
    );
    await page.locator("[data-account-panel=security]").click();
    await page
      .getByRole("link", { name: "Create account preview", exact: false })
      .click();
    await page.waitForURL(base + "frontend/signup.html");
    const blockedRegistration = await browser.newContext({
      colorScheme: "dark",
    });
    await blockedRegistration.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("Blocked", "SecurityError");
      };
    });
    await mockSupabase(blockedRegistration);
    const blockedSignup = await blockedRegistration.newPage();
    watch(blockedSignup);
    await blockedSignup.goto(base + "frontend/signup.html");
    await blockedSignup.locator("#signup-submit:not([disabled])").waitFor();
    await blockedSignup.locator("[data-theme-control]").selectOption("light");
    await blockedSignup
      .getByText("Theme applied for this visit.", { exact: false })
      .waitFor();
    await blockedSignup.locator("#signup-name").fill("Blocked browser");
    await blockedSignup.locator("#signup-email").fill("blocked@example.test");
    await blockedSignup
      .locator("#signup-password")
      .fill("sample-signup-only-42");
    await blockedSignup
      .locator("#signup-confirm")
      .fill("sample-signup-only-42");
    await blockedSignup.locator("#signup-submit").click();
    assert(await blockedSignup.locator("#signup-result").isVisible());

    const legacy = await browser.newContext({ colorScheme: "light" });
    await legacy.addInitScript(() => {
      const native = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        const media = native(query);
        return {
          get matches() {
            return media.matches;
          },
          media: media.media,
          addListener: (listener) => media.addEventListener("change", listener),
          removeListener: (listener) =>
            media.removeEventListener("change", listener),
        };
      };
    });
    await mockSupabase(legacy);
    const legacyPage = await legacy.newPage();
    watch(legacyPage);
    await legacyPage.goto(base + "frontend/login.html");
    await legacyPage.locator("[data-theme-control]:not([disabled])").waitFor();
    await legacyPage.emulateMedia({ colorScheme: "dark" });
    await legacyPage.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    await legacyPage.locator("#demo-account").click();
    await legacyPage.waitForURL(base + "frontend/account.html");
    const noJs = await browser.newContext({
      javaScriptEnabled: false,
      colorScheme: "dark",
    });
    const fallback = await noJs.newPage();
    watch(fallback);
    await fallback.goto(base);
    await fallback.waitForURL(base + "frontend/login.html");
    assert.equal(
      await fallback
        .locator("body")
        .evaluate((body) => getComputedStyle(body).backgroundColor),
      "rgb(28, 33, 30)",
    );
    await fallback.locator("#forgot-password").click();
    await fallback.waitForURL(base + "frontend/recover.html");
    await fallback
      .getByRole("link", { name: "Return to login", exact: false })
      .click();
    await fallback.locator("#demo-account").click();
    await fallback.waitForURL(base + "frontend/account.html");
    await fallback.locator(".brand").click();
    await fallback.waitForURL(base + "frontend/index.html");
    await fallback.goto(base + "frontend/login.html");
    await fallback.locator("#login-email").fill("example@example.test");
    await fallback.locator("#login-password").fill("sample-only-42");
    await fallback.locator("#login-form [type=submit]").click();
    await fallback.waitForURL((url) =>
      url.pathname.endsWith("/frontend/account.html"),
    );
    assert(!fallback.url().includes("example@example.test"));
    assert(!fallback.url().includes("sample-only-42"));
    await fallback.goto(base + "frontend/login.html");
    await fallback.locator("#create-account-link").click();
    await fallback.waitForURL(base + "frontend/signup.html");
    assert(await fallback.locator("#signup-submit").isDisabled());
    await fallback.locator(".auth-switch a").click();
    await fallback.waitForURL(base + "frontend/login.html");
    assert(requests.every((request) => request.method() === "GET"));
    assert(
      !requests.some((request) =>
        /signup@example|sample-signup-only/.test(request.url()),
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "Passed: matching logos, login/recovery/demo navigation, shared device-default theme and overrides, OS changes, cross-tab sync, cached-page refresh, legacy MediaQueryList API, no-JavaScript navigation/device styling, responsive pages, and GitHub Pages project paths. Signup: required fields, whitespace/email/length/mismatch validation, password visibility/reset, navigation and success state, no form-data persistence or transmission, 10 viewport/theme combinations, and blocked storage. No credential transmission or browser errors.",
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
