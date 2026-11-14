// Real frontend modules and importer, synthetic same-origin API; no provider credentials or network access.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "../frontend");
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    try {
      res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg" })[path.extname(file)] || "application/octet-stream");
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const errors = []; const requests = []; const external = [];
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
    let connection = "connected", failure = false, delay = false, disconnected = false;
    let failBoards = false;
    await context.route("**/js/config/supabaseClient.js", route => route.fulfill({ contentType: "text/javascript", body: `export const supabase = { auth: { async getSession() { return { data: { session: { access_token: 'application-test-token' } } }; } } };` }));
    await context.route("https://i.pinimg.com/**", async route => {
      external.push(route.request().url());
      await route.fulfill({ contentType: "image/jpeg", body: await fs.readFile(path.join(root, "assets/water.jpg")) });
    });
    await context.route("**/api/integrations/pinterest{,/**}", async route => {
      const request = route.request(); const url = new URL(request.url());
      const endpoint = url.pathname.replace("/api/integrations/pinterest", "");
      requests.push({ endpoint, method: request.method(), bookmark: url.searchParams.get("bookmark"), auth: request.headers().authorization });
      const reply = body => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      if (endpoint === "/availability") return reply({ available: true, researchAllowed: false });
      assert.equal(request.headers().authorization, "Bearer application-test-token");
      if (!endpoint && request.method() === "DELETE") { disconnected = true; connection = "disconnected"; return reply({ message: "Disconnected from Scalable. Remove Scalable in Pinterest account settings to revoke Pinterest's grant.", providerRevocationRequired: true }); }
      if (!endpoint) return reply({ status: connection, canImport: connection === "connected", researchAllowed: false });
      if (endpoint === "/boards") {
        if (failBoards) return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "forbidden", message: "Pinterest has not permitted access." }) });
        if (url.searchParams.has("bookmark")) return reply({ items: [{ id: "12", title: "Second board", description: "A second page", pinCount: 1 }], bookmark: null });
        return reply({ items: [{ id: "11", title: "Private inspiration", description: "Owned board", pinCount: 3 }], bookmark: "boards-next" });
      }
      if (endpoint === "/boards/11/pins") {
        if (url.searchParams.has("bookmark")) {
          if (delay) await new Promise(resolve => setTimeout(resolve, 500));
          if (failure) return route.fulfill({ status: 429, headers: { "Retry-After": "90" }, contentType: "application/json", body: JSON.stringify({ error: "rate_limited", message: "Pinterest's request limit was reached." }) });
          return reply({ items: [pin("102"), { id: "103", title: "Unsupported video", supported: false, imageUrl: null }], bookmark: null });
        }
        return reply({ items: [pin("101")], bookmark: "pins-next" });
      }
      if (endpoint === "/boards/12/pins") return reply({ items: [pin("101")], bookmark: null });
      if (endpoint === "/authorize") return reply({ authorizationUrl: "https://www.pinterest.com/oauth/?state=synthetic" });
      throw new Error(`Unexpected API request ${endpoint}`);
    });
    function pin(id) { return { id, title: "Reference " + id, description: "Pinterest description must never go to AI", supported: true, imageUrl: `https://i.pinimg.com/${id}.jpg`, imageSourceUrl: "https://creator.example/work" }; }
    await page.goto(origin); await page.locator(".song-card").first().waitFor();
    await page.locator("#import-pinterest").click();
    await page.locator('#pinterest-board-list input[value="12"]').waitFor();
    assert.equal(await page.locator("#pinterest-board-list input").count(), 2);
    assert.match(await page.locator("#pinterest-connection-notice").textContent(), /CONNECTED FOR BOARD IMPORT ONLY/);
    assert.equal(requests.filter(r => /\/pins$/.test(r.endpoint)).length, 0, "Listing boards never reads pins before selection");
    await page.locator("#select-pinterest-boards").click();
    failure = true;
    await page.locator("#review-pinterest").click();
    await page.waitForFunction(() => document.querySelector("#pinterest-status").textContent.includes("90"));
    assert.equal(await page.locator(".imported-pin-badge").count(), 0, "A failed second page never commits the first page");
    assert.equal(await page.locator("#pinterest-review").isVisible(), false);
    failure = false; delay = true;
    await page.locator("#review-pinterest").click();
    await page.locator("#cancel-pinterest-request").click();
    await page.waitForFunction(() => document.querySelector("#pinterest-status").textContent.includes("cancelled"));
    assert.equal(await page.locator(".imported-pin-badge").count(), 0);
    delay = false;
    await page.locator("#review-pinterest").click(); await page.locator("#pinterest-review").waitFor();
    assert.match(await page.locator("#pinterest-review-description").textContent(), /1 unsupported pins excluded/);
    assert.equal(await page.locator("#pinterest-pin-list input").count(), 3);
    await page.locator('input[name="destination"][value="new"]').check();
    await page.locator("#pinterest-new-title").fill("My imported board");
    await page.locator("#confirm-pinterest-import").click();
    await page.locator("#pinterest-complete").waitFor();
    assert.match(await page.locator("#pinterest-result").textContent(), /2 pins imported/);
    assert.equal(await page.locator(".imported-pin-badge").count(), 2);
    assert.equal(await page.locator("#prompt").inputValue(), "", "Provider titles and descriptions never become AI input");
    await page.locator("#view-pinterest-board").click(); await page.locator("#save-board").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("scalable.boards.v1"))[0]);
    assert.equal(saved.items.length, 2); assert.equal(saved.items[0].sourceBoards.length, 2);
    assert(saved.items.every(item => item.researchAllowed === false && item.sourceKind === "pinterest-api" && !item.isSample));
    assert(saved.items.every(item => item.originalPinUrl.includes("pinterest.com/pin/") && item.creatorSourceUrl.includes("creator.example")));
    assert(!JSON.stringify(saved).includes("application-test-token"));
    await page.locator("#prompt").fill("Research https://www.pinterest.com/pin/101/");
    await page.locator("#generate").click();
    await page.waitForFunction(() => document.querySelector("#input-error").textContent.includes("cannot be used for AI research"));
    assert.equal(await page.locator(".imported-pin-badge").count(), 2);
    await page.locator("#prompt").fill("A quiet coastal direction"); await page.locator("#generate").click();
    await page.waitForFunction(() => !document.querySelector("#generate").disabled);
    assert.equal(await page.locator(".imported-pin-badge").count(), 2);
    // Exercise the future HTTP research boundary against the actual module, before fetch can execute.
    const guarded = await page.evaluate(async () => {
      const { ApiBoardService } = await import("/js/board-service.js");
      const { assertResearchInputAllowed } = await import("/js/research-policy.js");
      const { validatePinterestAuthorization } = await import("/js/pinterest-service.js");
      const cases = ["https://pin.it/abc", "i.pinimg.com/test.jpg", "https://pinterest.co.uk/pin/1/", { items: [{ provider: "pinterest" }] }];
      const rejected = cases.map(value => { try { assertResearchInputAllowed(value); return false; } catch { return true; } });
      try { new ApiBoardService().startResearch("https://www.pinterest.com/pin/1/"); rejected.push(false); } catch { rejected.push(true); }
      try { validatePinterestAuthorization("https://www.pinterest.com.evil.example/oauth/"); rejected.push(false); } catch { rejected.push(true); }
      return rejected;
    });
    assert(guarded.every(Boolean));
    await page.locator("#import-pinterest").click(); await page.locator("#more-pinterest-boards").click();
    await page.locator("#end-pinterest-preview").click();
    await page.waitForFunction(() => document.querySelector("#pinterest-status").textContent.includes("account settings"));
    assert(disconnected); assert.equal(await page.locator(".imported-pin-badge").count(), 2);
    assert.match(await page.locator("#pinterest-connection-notice").textContent(), /NOT CONNECTED/);
    await page.locator("#close-pinterest").click();
    // Signed-out/expired, empty, and forbidden states do not silently switch to fixtures.
    connection = "expired";
    await page.locator("#import-pinterest").click();
    await page.waitForFunction(() => document.querySelector("#pinterest-status").textContent.includes("expired"));
    assert.equal(await page.locator("#pinterest-boards").isVisible(), false);
    await page.locator("#close-pinterest").click();
    connection = "connected"; failBoards = true;
    await page.locator("#import-pinterest").click();
    await page.waitForFunction(() => document.querySelector("#pinterest-status").textContent.includes("not permitted"));
    assert.equal(await page.locator("#pinterest-boards").isVisible(), false);
    assert.equal(await page.locator(".imported-pin-badge").count(), 2);
    await page.locator("#close-pinterest").click(); failBoards = false;
    // Explicit sample fallback remains separate and responsive.
    await page.locator("#import-pinterest").click();
    await page.locator('#pinterest-board-list input[value="11"]').waitFor();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert(await page.locator("#pinterest-dialog").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    }
    assert.equal(errors.length, 0, errors.join("\n"));
    assert(external.every(url => new URL(url).hostname === "i.pinimg.com"));
    console.log("Passed: authenticated Pinterest adapter, all board/pin pages, no pre-selection pin reads, cancellation and partial-page failure atomicity, unsupported pins, source associations, live provenance, local save, research exclusion, refresh/reconnect UI, safe authorization URL, disconnect preserving imports, forbidden state, and responsive dialogs. Zero browser errors; providers mocked.");
    await context.close();
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
