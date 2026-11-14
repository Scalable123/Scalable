// Development-only browser checks. Requires Playwright and Chromium, not app dependencies.
const { chromium } = require("playwright");
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
    const page = await context.newPage();
    const errors = [];
    const watch = (page) => page.on("pageerror", (e) => errors.push(e.message));
    watch(page);
    const url = `http://127.0.0.1:${server.address().port}`;
    await context.addInitScript(() =>
      localStorage.setItem("scalable.design", "nocturne"),
    );
    const ready = async () => {
      await page.goto(url);
      await page.locator(".song-card").first().waitFor();
    };
    const theme = async () => page.locator("html").getAttribute("data-theme");
    const appearance = async () => {
      await page.locator("#customize").click();
    };
    const closeAppearance = async () => {
      await page.locator("#close-appearance").click();
    };
    const explore = async () => {
      await page.locator("#generate").click();
      await page.waitForFunction(
        () => !document.querySelector("#generate").disabled,
      );
    };
    const filter = async (name) =>
      page.locator(`[data-filter="${name}"]`).click();
    await ready();
    assert.equal(await page.locator("[data-design-choice]").count(), 0);
    assert.equal(await theme(), "light");
    assert.equal(await page.locator(".song-card").count(), 3);
    assert.equal(await page.locator(".music-card").count(), 1);
    const palette = await page.locator(".color").first().getAttribute("style");
    await page.locator("#theme-toggle").click();
    assert.equal(await theme(), "dark");
    await appearance();
    await page.locator('[name="accent"][value="plum"]').check();
    await page.selectOption("#density-preference", "compact");
    await page.selectOption("#corners-preference", "square");
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "customize",
    );
    await page.reload();
    await page.locator(".song-card").first().waitFor();
    assert.equal(await theme(), "dark");
    assert.equal(
      await page.locator("html").getAttribute("data-accent"),
      "plum",
    );
    assert.equal(
      await page.locator("html").getAttribute("data-density"),
      "compact",
    );
    assert.equal(
      await page
        .locator(".board-card")
        .first()
        .evaluate((e) => getComputedStyle(e).borderRadius),
      "0px",
    );
    assert.equal(
      await page.locator(".color").first().getAttribute("style"),
      palette,
    );
    await appearance();
    await page.selectOption("#theme-preference", "system");
    await closeAppearance();
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    await appearance();
    await page.selectOption("#theme-preference", "light");
    await closeAppearance();
    await page.emulateMedia({ colorScheme: "dark" });
    assert.equal(await theme(), "light");
    await appearance();
    await page.locator("#reset-appearance").click();
    await closeAppearance();
    assert.equal(
      await page.locator("html").getAttribute("data-accent"),
      "terracotta",
    );
    assert.equal(
      await page.locator("html").getAttribute("data-density"),
      "comfortable",
    );
    assert.equal(
      await page.locator("html").getAttribute("data-corners"),
      "soft",
    );

    for (const mode of ["light", "dark"]) {
      await appearance();
      await page.selectOption("#theme-preference", mode);
      await closeAppearance();
      for (const density of ["comfortable", "compact"]) {
        await appearance();
        await page.selectOption("#density-preference", density);
        await closeAppearance();
        for (const width of [1440, 1024, 768, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          assert(
            !(await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            )),
            `${mode}/${density} overflow at ${width}`,
          );
          assert.equal(await page.locator(".board-card:visible").count(), 6);
          assert.equal(await page.locator(".song-card:visible").count(), 3);
          assert(await page.locator("#saved-boards").isVisible());
          await appearance();
          assert(
            !(await page
              .locator("#appearance-dialog")
              .evaluate((e) => e.scrollWidth > e.clientWidth)),
            `Customization overflow at ${width}`,
          );
          await closeAppearance();
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await filter("song");
    assert(await page.locator("#board-grid").isHidden());
    assert(await page.locator("#song-section").isVisible());
    const link = await page.locator(".song-link").first().getAttribute("href");
    assert.equal(new URL(link).hostname, "open.spotify.com");
    assert.match(
      decodeURIComponent(new URL(link).pathname),
      /Holocene Bon Iver/,
    );
    await filter("sound");
    assert.equal(await page.locator(".music-card:visible").count(), 1);
    assert(await page.locator("#song-section").isHidden());
    await page.locator(".music-info").click();
    await page.getByText(/No recording is attached/).waitFor();
    await page.keyboard.press("Escape");
    await filter("image");
    await page.locator(".pin").first().click();
    await page.locator('[data-prompt="After hours"]').click();
    await explore();
    assert.match(
      await page.locator("#board-title").textContent(),
      /When the city sleeps/,
    );
    assert.equal(await page.locator('.pin[aria-pressed="true"]').count(), 1);
    assert.match(await page.locator("#song-list").textContent(), /Nightcall/);
    for (const [songs, sounds] of [
      [false, true],
      [true, false],
      [false, false],
      [true, true],
    ]) {
      await page.locator("#include-songs").setChecked(songs);
      await page.locator("#include-sounds").setChecked(sounds);
      await explore();
      assert.equal(await page.locator(".song-card").count(), songs ? 3 : 0);
      assert.equal(await page.locator(".music-card").count(), sounds ? 1 : 0);
      await filter("song");
      assert.equal(await page.locator("#song-section").isVisible(), songs);
      if (!songs)
        await page
          .getByText("No song picks in this board yet.", { exact: false })
          .waitFor();
      await filter("sound");
      if (!sounds)
        await page
          .getByText("No ambient sounds in this board.", { exact: false })
          .waitFor();
      await filter("all");
    }
    await page.locator("#include-sounds").uncheck();
    await explore();
    await page.locator("#save-board").click();
    await page.getByText("Saved locally", { exact: true }).waitFor();
    await page.reload();
    await page.locator(".song-card").first().waitFor();
    await page.locator("#saved-boards").click();
    await page.getByRole("button", { name: "Open", exact: true }).click();
    assert.equal(await page.locator(".song-card").count(), 3);
    assert.equal(await page.locator(".music-card").count(), 0);
    assert.equal(await page.locator("#include-sounds").isChecked(), false);
    // An older saved board can be opened without overwriting its original stored record.
    await page.evaluate(async () => {
      const { DemoBoardService } = await import("/js/board-service.js");
      const old = await new DemoBoardService().research({
        prompt: "old board",
      });
      old.items = old.items
        .filter((i) => i.type !== "song")
        .map((i) => (i.type === "sound" ? { ...i, type: "music" } : i));
      delete old.researchOptions;
      localStorage.setItem("scalable.boards.v1", JSON.stringify([old]));
    });
    await page.locator("#saved-boards").click();
    await page.getByRole("button", { name: "Open", exact: true }).click();
    assert.equal(await page.locator(".music-card").count(), 1);
    assert.equal(await page.locator(".song-card").count(), 0);
    assert.equal(await page.locator("#include-songs").isChecked(), false);
    assert(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("scalable.boards.v1"))[0].items.some(
          (i) => i.type === "music",
        ),
      ),
    );

    const blocked = await browser.newContext();
    await blocked.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("Blocked", "SecurityError");
      };
    });
    const blockedPage = await blocked.newPage();
    watch(blockedPage);
    await blockedPage.goto(url);
    await blockedPage.locator(".song-card").first().waitFor();
    await blockedPage.locator("#customize").click();
    await blockedPage.selectOption("#theme-preference", "dark");
    assert.equal(
      await blockedPage.locator("html").getAttribute("data-theme"),
      "dark",
    );
    await blockedPage
      .getByText("Applied for this visit.", { exact: false })
      .waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "Passed: Studio themes, customization persistence/reset, OS theme changes, 20 responsive combinations, songs/sounds and inclusion options, catalog-search links, pins, saved-board reopening, legacy compatibility, and blocked storage. Zero browser errors.",
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
