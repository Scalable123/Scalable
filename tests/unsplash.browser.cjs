// Runs against the real ASP.NET host with no provider credentials; provider fixtures use Playwright routing.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");

(async () => {
  const root = path.resolve(__dirname, "..");
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(process.env.DOTNET_PATH || "dotnet", [path.join(root, "backend/bin/Debug/net10.0/Scalable.Api.dll")], {
    cwd: path.join(root, "backend"),
    env: { ...process.env, ASPNETCORE_URLS: url, Unsplash__AccessKey: "", ASPNETCORE_ENVIRONMENT: "Production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", chunk => logs += chunk);
  server.stderr.on("data", chunk => logs += chunk);
  let browser;
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(url)).ok) break; } catch {}
      if (attempt > 100 || server.exitCode !== null) throw new Error("Host did not start: " + logs);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const endpoint = url + "/api/image-sources/unsplash";
    const post = (body, headers = {}) => fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
    const noKey = await post({ prompt: "quiet coast" });
    assert.equal(noKey.headers.get("cache-control"), "no-store");
    assert.deepEqual(await noKey.json(), { status: "not_configured", image: null });
    for (const body of [{}, { prompt: "  " }, { prompt: "x".repeat(2001) }, { prompt: 123 }])
      assert.equal((await post(body)).status, 400);
    assert.equal((await post({ prompt: "coast" }, { Origin: "https://evil.test" })).status, 403);
    assert.equal((await post({ prompt: "coast" }, { "Sec-Fetch-Site": "cross-site" })).status, 403);
    assert.equal((await fetch(endpoint, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "coast" })).status, 415);
    assert.equal((await post({ prompt: "x".repeat(17000) })).status, 413);
    for (const privatePath of ["/.env", "/backend/Program.cs", "/data/unsplash-budget.json", "/docs/T001.md"])
      assert.equal((await fetch(url + privatePath)).status, 404);

    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    let calls = 0, photoId = "photo1", status = "available", malformed = false, delay = 0;
    const photo = id => ({
      id: `unsplash-${id}`, type: "image", provider: "unsplash", externalPhotoId: id,
      url: `https://images.unsplash.com/${id}?ixid=preserved`,
      title: "Quiet coast <script>", description: "Soft water and stone",
      sourceUrl: `https://unsplash.com/photos/${id}?utm_source=scalable&utm_medium=referral`,
      sourceLabel: "Photo by Artist on Unsplash", creatorName: "Artist <b>",
      creatorUrl: "https://unsplash.com/@artist?utm_source=scalable&utm_medium=referral", position: "hero", pinned: false,
    });
    await page.route("https://images.unsplash.com/**", route => route.fulfill({ contentType: "image/jpeg", path: path.join(root, "frontend/assets/coast.jpg") }));
    await page.route("**/api/image-sources/unsplash", async route => {
      calls++;
      assert.equal(route.request().method(), "POST");
      assert.ok(route.request().postDataJSON().prompt.trim());
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const image = photo(photoId);
      if (malformed) image.url = "https://evil.test/image.jpg";
      await route.fulfill({ json: { status, image: status === "available" ? image : null } });
    });
    const ready = async () => { await page.goto(url); await page.locator(".image-card").first().waitFor(); };
    const explore = async prompt => {
      await page.locator("#prompt").fill(prompt);
      await page.locator("#generate").click();
      await page.waitForFunction(() => !document.querySelector("#generate").disabled);
    };
    await ready();
    assert.equal(calls, 0, "initial sample must cost no provider calls");
    await explore("quiet coast");
    assert.equal(calls, 1);
    assert.equal(await page.locator(".unsplash-card").count(), 1);
    assert.equal(await page.locator(".image-card").count(), 3);
    assert.match(await page.locator(".photo-credit").innerText(), /Photo by Artist <b> on Unsplash/);
    assert.equal(await page.locator(".photo-credit b").count(), 0, "provider text must not be interpreted as HTML");
    assert.match(await page.locator(".photo-credit a").first().getAttribute("href"), /utm_source=scalable/);
    assert.match(await page.locator("#image-source-status").innerText(), /One Unsplash photo/);
    await page.locator(".unsplash-card .pin").click();
    await page.locator("#save-board").click();
    await page.waitForFunction(() => document.querySelector("#save-label").textContent === "Saved locally");
    for (const filter of ["image", "all"]) await page.locator(`[data-filter="${filter}"]`).click();
    assert.equal(calls, 1, "pin/save/filter must not fetch");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("scalable.boards.v1"))[0]);
    assert.equal(saved.items[0].externalPhotoId, "photo1");
    assert.equal(saved.items[0].creatorName, "Artist <b>");
    await ready();
    assert.equal(calls, 1, "reload must not fetch");
    await page.locator("#saved-boards").click();
    await page.getByRole("button", { name: "Open", exact: true }).first().click();
    assert.equal(await page.locator(".unsplash-card .pin").getAttribute("aria-pressed"), "true");
    assert.equal(calls, 1, "open must not fetch");
    await explore("quiet coast again");
    assert.equal(await page.locator(".unsplash-card").count(), 1, "repeat photo deduplicates and retains pin");
    photoId = "photo2";
    await explore("earthy forms");
    assert.equal(await page.locator(".unsplash-card").count(), 2, "pinned photo survives a different result");
    assert.equal(await page.locator(".unsplash-card .pin[aria-pressed=true]").count(), 1);
    for (const theme of ["dark", "light"]) {
      await page.evaluate(async theme => (await import("/js/appearance.js")).updateAppearance({ theme }), theme);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no overflow at ${width} in ${theme}`);
        for (const credit of await page.locator(".photo-credit").all()) assert.ok(await credit.isVisible());
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: path.join(root, "work/unsplash-preview.png"), fullPage: true });
    for (const nextStatus of ["rate_limited", "no_results", "not_configured", "unavailable"]) {
      status = nextStatus;
      const before = calls;
      await explore("night city");
      assert.equal(calls, before + 1, "failure must not auto retry");
      assert.equal(await page.locator(".unsplash-card").count(), 1, "only pinned photo survives failure");
      assert.ok(await page.locator("#image-source-status").isVisible());
      assert.equal(await page.locator(".song-card").count(), 3);
    }
    status = "available"; malformed = true;
    await explore("coast");
    assert.match(await page.locator("#image-source-status").innerText(), /unavailable/);
    malformed = false; delay = 1300;
    const requestStarted = page.waitForRequest("**/api/image-sources/unsplash");
    await page.locator("#generate").click();
    await requestStarted;
    await page.locator("#new-board").click();
    await page.waitForFunction(() => !document.querySelector("#generate").disabled);
    await page.waitForTimeout(1500);
    assert.equal(await page.locator(".unsplash-card").count(), 0, "late response must not replace new board");
    assert.equal(await page.locator("#prompt").inputValue(), "");
    assert.equal(await page.locator("#image-source-status").isVisible(), false);
    delay = 0;
    const before = calls;
    await page.locator("#new-board").click();
    await page.waitForTimeout(750);
    assert.equal(calls, before, "new sample must not fetch");
    await page.locator("#prompt").fill("   ");
    await page.locator("#generate").click();
    assert.equal(calls, before, "blank prompt must not fetch");
    await page.unroute("**/api/image-sources/unsplash");
    await explore("coast");
    assert.match(await page.locator("#image-source-status").innerText(), /not configured/);
    assert.deepEqual(errors, []);
    await context.close();
    console.log("Unsplash host and browser checks passed (fixtures only; no provider quota used).");
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
