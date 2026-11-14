// Regression coverage for the demo's remaining image, audio, video, and account flows.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const mockGraphql = require("./helpers/mock-graphql.cjs");

(async () => {
  const root = path.resolve(__dirname, "../frontend");
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg" };
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    try {
      res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const base = `http://127.0.0.1:${server.address().port}`;
    const unexpected = [];
    const errors = [];
    const requests = [];
    const photo = await fs.readFile(path.join(root, "assets/coast.jpg"));
    await context.route("**/*", route => {
      if (new URL(route.request().url()).origin === base) return route.continue();
      unexpected.push(route.request().url());
      return route.abort();
    });
    await context.addInitScript(() => {
      window.SCALABLE_API_ORIGIN = location.origin;
      window.SCALABLE_AI_ORIGIN = location.origin;
      window.GRAPHQL_ENDPOINT = `${location.origin}/graphql`;
    });
    await mockGraphql(context);
    await context.route("**/api/ai/creative-direction", route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: {
        title: "A demo direction", description: "A direction from a synthetic AI response.",
        note: "Room to explore.", imageQueries: ["coast", "harbor", "cliffs"], songs: [], sounds: [],
      } });
    });
    let imageId = 0;
    await context.route("**/api/image-sources/wikimedia", route => {
      const id = String(++imageId);
      return route.fulfill({ json: { status: "available", image: {
        id: `wikimedia-${id}`, externalPhotoId: id, type: "image", provider: "wikimedia",
        url: `https://upload.wikimedia.org/fixture-${id}.jpg`,
        sourceUrl: `https://commons.wikimedia.org/wiki/File:Fixture_${id}.jpg`,
        creatorUrl: `https://commons.wikimedia.org/wiki/User:Fixture_artist`,
        creatorName: "Fixture artist", licenseName: "CC BY-SA 4.0",
        title: `Fixture image ${id}`, description: "Synthetic image-search metadata.",
      } } });
    });
    await context.route("https://upload.wikimedia.org/**", route => route.fulfill({ contentType: "image/jpeg", body: photo, headers: { "Access-Control-Allow-Origin": "*" } }));
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base);
    await page.locator("#import-audio:not([disabled])").waitFor();
    assert.equal(await page.locator(".image-card").count(), 3);
    assert.equal(await page.locator("#reference").count(), 1);
    await page.locator("#import-audio").click();
    assert(await page.locator("#audio-dialog").isVisible());
    await page.keyboard.press("Escape");
    const explore = async () => {
      await page.locator("#generate").click();
      await page.waitForFunction(() => !document.querySelector("#generate").disabled);
    };
    await page.locator("#prompt").fill("A quiet coast");
    await explore();
    assert.equal(await page.locator(".wikimedia-card").count(), 3);
    await page.locator(".wikimedia-card .pin").first().click();
    await explore();
    assert.equal(await page.locator(".wikimedia-card").count(), 4);
    assert.equal(await page.locator('.pin[aria-pressed="true"]').count(), 1);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `Overflow at ${width}`);
      const boxes = await page.locator(".image-card").evaluateAll(cards => cards.map(card => {
        const { x, y, right, bottom, width, height } = card.getBoundingClientRect();
        return { x, y, right, bottom, width, height };
      }));
      assert(boxes.every(box => box.width > 0 && box.height > 0));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        assert(!(a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1), `Overlapping images at ${width}`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#save-board").click();
    await page.getByText("Saved locally", { exact: true }).waitFor();
    await page.reload();
    await page.locator("#import-audio:not([disabled])").waitFor();
    await page.locator("#saved-boards").click();
    await page.getByRole("button", { name: "Open", exact: true }).click();
    assert.equal(await page.locator(".wikimedia-card").count(), 4);
    // Older imported references remain editable without their original importer.
    await page.evaluate(() => {
      const boards = JSON.parse(localStorage.getItem("scalable.boards.v1"));
      boards[0].items.push({ ...boards[0].items.find(item => item.type === "image"), id: "legacy-image", imported: true, title: "Saved legacy image", provider: "legacy-source", researchAllowed: false });
      localStorage.setItem("scalable.boards.v1", JSON.stringify(boards));
    });
    await page.locator("#saved-boards").click();
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await page.getByRole("button", { name: "Remove imported image Saved legacy image", exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement.id), "prompt");
    assert.equal(await page.locator(".image-card").count(), 4);
    await page.goto(`${base}/account.html#connections`);
    await page.locator(".account-connection").last().waitFor();
    assert.deepEqual(await page.locator(".account-connection h3").allTextContents(), ["Spotify", "Amazon Music", "Apple Music", "SoundCloud", "YouTube"]);
    await page.getByRole("link", { name: "Open YouTube import preview", exact: true }).click();
    await page.locator("#video-dialog").waitFor();
    assert(!page.url().includes("import="));
    assert(requests.every(request => Object.keys(request).sort().join() === "includeSongs,includeSounds,prompt"));
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    console.log("Passed: image discovery/refinement and extra-image layouts at four widths, saved image compatibility, audio/video dialogs, five account services, and query navigation. Zero unmocked external requests or browser errors.");
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
