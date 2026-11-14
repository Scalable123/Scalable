// Development-only browser checks. Requires Playwright and Chromium, not app dependencies.
const { chromium } = require("playwright");
const mockGraphql = require("./helpers/mock-graphql.cjs");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "../frontend");
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".jpg": "image/jpeg",
  };
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
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
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      colorScheme: "light",
    });
    await mockGraphql(context);
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) =>
      requests.push({ url: request.url(), method: request.method() }),
    );
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.locator("#import-video:not([disabled])").waitFor();
    await page.locator("[data-filter=video]").click();
    await page.getByText("No videos yet.", { exact: false }).waitFor();
    await page.locator("#import-video").click();
    await page
      .locator("#youtube-url")
      .fill("https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ");
    await page.locator("#youtube-title").fill("A video reference");
    await page.locator("#youtube-form [type=submit]").click();
    await page
      .getByText(
        "Use a YouTube watch, Shorts, or youtu.be link to a single video.",
      )
      .waitFor();
    await page
      .locator("#youtube-url")
      .fill("https://youtu.be/dQw4w9WgXcQ?t=1m30s");
    await page.locator("#youtube-title").fill("A moment in motion");
    await page.locator("#youtube-form [type=submit]").click();
    await page
      .getByText("YouTube reference added.", { exact: false })
      .waitFor();
    await page
      .locator("#youtube-url")
      .fill("https://www.youtube.com/shorts/dQw4w9WgXcQ?start=90");
    await page.locator("#youtube-title").fill("Same moment");
    await page.locator("#youtube-form [type=submit]").click();
    await page
      .getByText("This YouTube moment is already on your board.")
      .waitFor();
    await page.locator("#close-video").click();
    assert.equal(await page.locator(".video-card").count(), 1);
    assert.equal(await page.locator("iframe").count(), 0);
    assert(
      requests.every(
        (request) =>
          !/^https?:/.test(request.url) || new URL(request.url).origin === url,
      ),
    );
    // Verify the explicit player action without making a live YouTube request.
    await page.route("https://www.youtube-nocookie.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Mock player</title><p>Embed route test only.</p>",
      }),
    );
    await page
      .getByRole("button", { name: "Load YouTube player", exact: true })
      .click();
    await page.locator("iframe").waitFor();
    assert.match(
      await page.locator("iframe").getAttribute("src"),
      /youtube-nocookie.com\/embed\/dQw4w9WgXcQ\?start=90$/,
    );
    await page
      .getByRole("button", { name: "Unload player", exact: true })
      .click();
    assert.equal(await page.locator("iframe").count(), 0);
    await page.locator("#import-video").click();
    await page.locator("#local-video-tab").click();
    await page.locator("#video-file").setInputFiles({
      name: "broken.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("not a video"),
    });
    await page.locator("#add-local-video").click();
    await page
      .getByText("This video could not be decoded.", { exact: false })
      .waitFor();
    const os = require("node:os");
    const { execFileSync } = require("node:child_process");
    const fixtureRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "scalable-video-"),
    );
    const fixture = path.join(fixtureRoot, "studio-test.webm");
    try {
      execFileSync(process.env.FFMPEG_PATH || "ffmpeg", [
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x475c53:s=160x90:r=10",
        "-t",
        "0.5",
        "-an",
        "-c:v",
        "libvpx",
        "-y",
        fixture,
      ]);
      await page.locator("#video-file").setInputFiles(fixture);
      await page.locator("#video-file-title").fill("My forest clip");
      await page.locator("#add-local-video").click();
      await page.getByText("Local video added.", { exact: false }).waitFor();
      await page.locator("#close-video").click();
      const video = page.locator("video");
      await video.evaluate((video) => {
        video.muted = true;
        return video.play();
      });
      assert.equal(await video.evaluate((video) => video.videoWidth), 160);
      await page.locator("[data-filter=video]").click();
      assert.equal(await page.locator(".video-card:visible").count(), 2);
      assert(await page.locator("#board-grid").isHidden());
      await page.locator("[data-filter=all]").click();
      await page.locator("#prompt").fill("A quiet forest film");
      await page.locator("#generate").click();
      await page.waitForFunction(
        () => !document.querySelector("#generate").disabled,
      );
      assert.equal(await page.locator(".video-card").count(), 2);
      await page.locator("#save-board").click();
      await page.getByText("Saved locally", { exact: true }).waitFor();
      const stored = await page.evaluate(() =>
        localStorage.getItem("scalable.boards.v1"),
      );
      assert(!stored.includes("blob:"));
      assert(!stored.includes("data:video"));
      assert.match(stored, /studio-test.webm/);
      await page.reload();
      await page.locator("#import-video:not([disabled])").waitFor();
      await page.locator("#saved-boards").click();
      await page.getByRole("button", { name: "Open", exact: true }).click();
      assert.equal(await page.locator(".video-card").count(), 2);
      assert.equal(await page.locator("video").count(), 0);
      await page
        .getByLabel("Reattach video for My forest clip", { exact: true })
        .setInputFiles(fixture);
      await page.locator("video").waitFor();
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        assert(
          !(await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )),
          `Studio videos overflow at ${width}`,
        );
        await page.locator("#import-video").click();
        for (const tab of ["youtube", "local-video"]) {
          await page.locator(`[data-video-tab="${tab}"]`).click();
          assert(
            !(await page
              .locator("#video-dialog")
              .evaluate((e) => e.scrollWidth > e.clientWidth)),
            `Video dialog overflows at ${width}`,
          );
        }
        await page.keyboard.press("Escape");
      }
      await page
        .getByRole("button", {
          name: "Remove video My forest clip",
          exact: true,
        })
        .click();
      assert.equal(await page.locator("video").count(), 0);
      assert.equal(await page.locator(".video-card").count(), 1);
    } finally {
      await fs.rm(fixtureRoot, { recursive: true, force: true });
    }
    const parsed = await page.evaluate(async () => {
      const { parseYouTubeLink } = await import("/js/video-library.js");
      return [
        "https://www.youtube.com/playlist?list=abc",
        "javascript:alert(1)",
        "https://user:pass@youtu.be/dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ?t=-2",
      ].every((value) => {
        try {
          parseYouTubeLink(value);
          return false;
        } catch {
          return true;
        }
      });
    });
    assert(parsed);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`${url}/login.html`);
    await page.locator("#forgot-password").click();
    await page
      .getByText("Enter your email address, then choose Forgot password.", {
        exact: true,
      })
      .waitFor();
    await page.goto(`${url}/recover.html`);
    await page.locator("#recovery-email").fill("demo@example.test");
    await page.locator("#recovery-form [type=submit]").click();
    await page
      .getByText("If an account exists for that email", { exact: false })
      .waitFor();
    await page
      .getByRole("link", { name: "Return to login", exact: false })
      .click();
    await page.locator("#login-email").fill("invalid-email");
    await page.locator("#login-password").fill("sample-pass-42");
    await page.locator("#login-form [type=submit]").click();
    assert(page.url().endsWith("/login.html"));
    await page.locator("#login-email").fill("demo.login@example.test");
    await page.locator("#show-password").click();
    assert.equal(
      await page.locator("#login-password").getAttribute("type"),
      "text",
    );
    await page.locator("#show-password").click();
    await page.locator("#login-form [type=submit]").click();
    await page.waitForURL("**/account.html");
    assert.match(
      await page.locator("#account-session").textContent(),
      /not authenticated/,
    );
    const persisted = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    assert(!persisted.includes("sample-pass-42"));
    assert(!persisted.includes("demo.login@example.test"));
    await page.locator("#profile-name").fill("River Studio");
    await page.locator("#profile-email").fill("river@example.test");
    await page.locator("#profile-form [type=submit]").click();
    await page.getByText("Local profile saved.", { exact: false }).waitFor();
    await page.reload();
    assert.equal(
      await page.locator("#profile-name").inputValue(),
      "River Studio",
    );
    await page.locator("[data-account-panel=appearance]").click();
    await page.locator("#theme-preference").selectOption("dark");
    await page.locator("#layout-preference").selectOption("grid");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const panel of [
        "profile",
        "appearance",
        "connections",
        "security",
      ]) {
        await page.locator(`[data-account-panel=${panel}]`).click();
        assert(
          !(await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )),
          `Account ${panel} overflows at ${width}`,
        );
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator("[data-account-panel=connections]").click();
    assert.equal(
      await page.getByText("Not connected", { exact: true }).count(),
      6,
    );
    await page
      .getByRole("link", { name: "Open YouTube import preview", exact: true })
      .click();
    await page.locator("#video-dialog").waitFor();
    assert(!page.url().includes("import="));
    await page.locator("#close-video").click();
    await page.goto(`${url}/account.html#security`);
    await page.locator("#password-preview").click();
    await page
      .getByText("Password changes are not active in this preview.", {
        exact: false,
      })
      .waitFor();
    await page.locator("#demo-signout").click();
    await page.waitForURL("**/login.html");
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("scalable.demoSession")),
      null,
    );
    assert(
      await page.evaluate(() => !!localStorage.getItem("scalable.boards.v1")),
    );
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        !(await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )),
        `Login overflows at ${width}`,
      );
    }
    await page.locator("#demo-account").click();
    await page.waitForURL("**/account.html");
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("Blocked", "SecurityError");
      };
    });
    await mockGraphql(blocked);
    const blockedPage = await blocked.newPage();
    blockedPage.on("pageerror", (e) => errors.push(e.message));
    await blockedPage.goto(`${url}/account.html`);
    await blockedPage.locator("#profile-name").fill("Offline preview");
    await blockedPage.locator("#profile-form [type=submit]").click();
    await blockedPage
      .getByText("Applied for this visit.", { exact: false })
      .waitFor();
    assert(requests.every((request) => request.method === "GET" || request.url.endsWith("/graphql")), "Account/video flows must not send image-provider POST requests");
    const external = requests.filter(
      (request) =>
        /^https?:/.test(request.url) && new URL(request.url).origin !== url,
    );
    assert(
      external.every((request) =>
        request.url.startsWith("https://www.youtube-nocookie.com/embed/"),
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "Passed: YouTube validation/canonicalization/deduplication and explicit mocked embed load/unload; real local video decode/playback/save/reattach/removal; refinement preservation; video/login/account responsive layouts; login validation/no credential persistence; local profile, shared appearance, connection deep links, preview sign-out, and blocked storage. No authentication or provider API requests. Zero browser errors.",
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
