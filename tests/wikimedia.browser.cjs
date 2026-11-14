// Deterministic provider-policy and browser integration checks; no live provider traffic.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const commonsPage = (id = 101) => ({
  pageid: id, ns: 6, index: 1, title: "File:Coastal light.jpg",
  imageinfo: [{
    mime: "image/jpeg", thumbmime: "image/jpeg", width: 1920, height: 1280,
    thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Coastal_light_${id}.jpg/960px-Coastal_light_${id}.jpg`,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:Coastal_light_${id}.jpg`,
    extmetadata: {
      ObjectName: { value: "Coastal <i>light</i>" },
      ImageDescription: { value: "A quiet shoreline in mist." },
      Artist: { value: '<a href="https://example.org">Example &amp; Artist</a>' },
      Credit: { value: "Own work" },
      Attribution: { value: "Photo: Example Artist, via Wikimedia Commons" },
      Copyright: { value: "© Example Artist" },
      LicenseShortName: { value: "CC BY-SA 4.0" },
      LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" },
    },
  }],
});
const payload = (...pages) => ({ batchcomplete: true, query: { pages } });

(async () => {
  const root = path.resolve(__dirname, "../frontend");
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    try {
      res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg" })[path.extname(file)] || "application/octet-stream");
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const apiRequests = [], imageRequests = [], errors = [];
    let responseBody = payload(commonsPage());
    let responseStatus = 200, responseHeaders = {};
    await context.route("https://commons.wikimedia.org/w/api.php?*", (route) => {
      apiRequests.push(route.request());
      return route.fulfill({ status: responseStatus, contentType: "application/json", headers: responseHeaders, body: JSON.stringify(responseBody) });
    });
    const photo = await fs.readFile(path.join(root, "assets/water.jpg"));
    await context.route("https://upload.wikimedia.org/**", (route) => {
      imageRequests.push(route.request().url());
      return route.fulfill({ contentType: "image/jpeg", body: photo });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.locator("#import-audio:not([disabled])").waitFor();
    assert.equal(apiRequests.length, 0, "Initial sample must not search");

    const unit = await page.evaluate(async (basePage) => {
      const { WikimediaImageSource, validWikimediaImage } = await import("/js/wikimedia-source.js");
      const key = "scalable.wikimedia.nextRequestAt.v1";
      const checks = [];
      function check(value, label) { if (!value) throw new Error(label); checks.push(label); }
      let time = Date.now(), calls = 0;
      let data = { query: { pages: [basePage] } }, status = 200, headers = {};
      const source = () => new WikimediaImageSource({ now: () => time, fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify(data), { status, headers });
      } });
      const reset = () => { localStorage.removeItem(key); calls = 0; status = 200; headers = {}; data = { query: { pages: [structuredClone(basePage)] } }; };
      reset();
      let adapter = source();
      check((await adapter.search("  ")).status === "skipped" && calls === 0, "Blank input skips API");
      check((await adapter.search("x".repeat(2001))).status === "skipped" && calls === 0, "Oversized input skips API");
      const alreadyAborted = new AbortController(); alreadyAborted.abort();
      check((await adapter.search("coast", { signal: alreadyAborted.signal })).status === "cancelled" && calls === 0, "Cancelled input skips API");
      let result = await adapter.search("quiet coast");
      check(result.status === "found" && result.image.creator === "Example & Artist" && result.image.credit === "Own work", "Author HTML becomes plain credit");
      check(result.image.license.name === "CC BY-SA 4.0" && validWikimediaImage(result.image), "License and provenance retained");
      check(result.image.attributionLinks[0].url === "https://example.org/", "Supplied author link retained");
      result.image.creator = "changed";
      const cached = await adapter.search("Quiet coast");
      check(cached.cached && cached.image.creator === "Example & Artist" && calls === 1, "Normalized cache is cloned and avoids repeat requests");
      check((await adapter.search("other direction")).status === "rate-limited" && calls === 1, "Distinct prompts cannot exceed local budget");
      check((await source().search("third direction")).status === "rate-limited" && calls === 1, "Budget persists across provider instances");
      time += 6101;
      check((await adapter.search("third direction")).status === "found" && calls === 2, "Budget permits later request");
      time += 10 * 60000;
      await adapter.search("quiet coast");
      check(calls === 3, "Expired cache performs a new bounded lookup");

      for (const [label, change] of [
        ["Missing author rejected", (p) => delete p.imageinfo[0].extmetadata.Artist],
        ["Missing license rejected", (p) => delete p.imageinfo[0].extmetadata.LicenseUrl],
        ["Unsupported license rejected", (p) => p.imageinfo[0].extmetadata.LicenseUrl.value = "https://example.org/license"],
        ["Restricted license rejected", (p) => p.imageinfo[0].extmetadata.LicenseUrl.value = "https://creativecommons.org/licenses/by-nc/4.0/"],
        ["Unclear restrictions rejected", (p) => p.imageinfo[0].extmetadata.Restrictions = { value: "personality" }],
        ["Array restrictions rejected", (p) => p.imageinfo[0].extmetadata.Restrictions = { value: ["trademark"] }],
        ["Deletion nomination rejected", (p) => p.imageinfo[0].extmetadata.DeletionReason = { value: "Missing permission" }],
        ["Non-free flag rejected", (p) => p.imageinfo[0].extmetadata.NonFree = { value: "True" }],
        ["Bad-file flag rejected", (p) => p.imageinfo[0].badfile = true],
        ["Unsafe file source rejected", (p) => p.imageinfo[0].descriptionurl = "javascript:alert(1)"],
        ["Lookalike media host rejected", (p) => p.imageinfo[0].thumburl = "https://upload.wikimedia.org.evil.test/wikipedia/commons/a.jpg"],
        ["Credential URL rejected", (p) => p.imageinfo[0].thumburl = "https://user:pass@upload.wikimedia.org/wikipedia/commons/a.jpg"],
        ["SVG rejected", (p) => p.imageinfo[0].mime = "image/svg+xml"],
        ["Missing thumbnail rejected", (p) => delete p.imageinfo[0].thumburl],
        ["Missing dimensions rejected", (p) => p.imageinfo[0].width = 0],
        ["Excessive required credit skips image", (p) => p.imageinfo[0].extmetadata.Attribution.value = "A".repeat(10001)],
      ]) {
        reset(); change(data.query.pages[0]);
        check((await source().search("coast")).status === "no-results" && calls === 1, label);
      }
      for (const [name, licenseUrl] of [
        ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
        ["CC0", "https://creativecommons.org/publicdomain/zero/1.0/"],
        ["Public domain", "https://creativecommons.org/publicdomain/mark/1.0/"],
      ]) {
        reset(); data.query.pages[0].imageinfo[0].extmetadata.LicenseUrl.value = licenseUrl;
        data.query.pages[0].imageinfo[0].extmetadata.LicenseShortName.value = name;
        check((await source().search("coast")).status === "found", `${name} supported`);
      }
      reset();
      data.query.pages[0].imageinfo[0].extmetadata.Artist.value = '<img src="https://evil.test/image" onerror="window.__wikiInjected=true">Example <script>window.__wikiInjected=true</script>';
      result = await source().search("coast");
      check(result.image.creator === "Example" && !window.__wikiInjected, "Metadata HTML stays inert and scripts are removed");
      reset();
      const second = structuredClone(basePage); second.pageid = 202; second.index = 2;
      data.query.pages[0].imageinfo[0].badfile = true;
      data.query.pages.push(second, structuredClone(basePage));
      data.query.pages[2].index = 3;
      result = await source().search("coast");
      check(result.image.id === "wikimedia-202" && calls === 1, "Choose one valid ranked candidate in one request");
      reset(); data = { batchcomplete: true }; adapter = source();
      check((await adapter.search("coast")).status === "no-results", "Empty search supported");
      check((await adapter.search("coast")).cached && calls === 1, "Empty search cached");
      for (const httpStatus of [429, 503]) {
        reset(); status = httpStatus; headers = { "Retry-After": "120" };
        result = await source().search("coast");
        check(result.status === "rate-limited" && result.retryAt >= time + 120000, `${httpStatus} obeys Retry-After seconds`);
      }
      reset(); status = 429; headers = { "Retry-After": new Date(time + 300000).toUTCString() };
      check((await source().search("coast")).retryAt >= time + 299000, "Retry-After HTTP date supported");
      reset(); status = 503;
      check((await source().search("coast")).retryAt === time + 60000, "Missing Retry-After applies conservative cooldown");
      for (const code of ["maxlag", "ratelimited", "readonly"]) {
        reset(); data = { error: { code } };
        check((await source().search("coast")).status === "rate-limited", `API ${code} obeys cooldown`);
      }
      reset(); status = 403;
      check((await source().search("coast")).status === "unavailable", "HTTP failures do not retry");
      reset(); data = { query: { pages: "malformed" } };
      check((await source().search("coast")).status === "unavailable", "Malformed response fails gracefully");
      reset();
      check((await new WikimediaImageSource({ fetchImpl: async () => { throw new TypeError("offline"); } }).search("coast")).status === "unavailable", "Network failure falls back");
      reset();
      const hangingFetch = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
      check((await new WikimediaImageSource({ timeoutMs: 25, fetchImpl: hangingFetch }).search("coast")).status === "timeout", "Timeout aborts lookup");
      reset();
      const controller = new AbortController();
      const pending = new WikimediaImageSource({ fetchImpl: hangingFetch }).search("coast", { signal: controller.signal });
      await new Promise((resolve) => setTimeout(resolve, 10)); controller.abort();
      check((await pending).status === "cancelled", "In-flight cancellation supported");
      reset();
      let release;
      const inFlight = new WikimediaImageSource({ fetchImpl: () => new Promise((resolve) => { release = () => resolve(new Response(JSON.stringify(data))); }) }).search("coast");
      while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
      check((await source().search("other prompt")).status === "busy", "Concurrent clients skip instead of queueing requests");
      release(); await inFlight;
      reset(); localStorage.setItem(key, "corrupt");
      check((await source().search("coast")).status === "unavailable" && calls === 0, "Invalid budget fails closed");
      reset();
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new DOMException("blocked"); };
      try { check((await source().search("coast")).status === "unavailable" && calls === 0, "Blocked budget storage skips provider"); }
      finally { Storage.prototype.setItem = originalSet; }
      reset();
      const unsafe = { ...result.image, provider: "wikimedia", url: "javascript:alert(1)" };
      check(!validWikimediaImage(unsafe), "Persisted unsafe references rejected");
      return checks;
    }, commonsPage());
    assert(unit.length >= 40);
    assert.equal(apiRequests.length, 0, "Policy checks use injected fetch, not a provider");

    const explore = async (prompt) => {
      await page.locator("#prompt").fill(prompt);
      await page.locator("#generate").click();
      await page.waitForFunction(() => !document.querySelector("#generate").disabled);
    };
    const advance = async () => page.evaluate(async () => {
      const { boardService } = await import("/js/board-service.js");
      window.__wikiOffset = (window.__wikiOffset || 0) + 6101;
      boardService.source.now = () => Date.now() + window.__wikiOffset;
    });
    await explore("A quiet coastal escape in mist");
    assert.equal(apiRequests.length, 1);
    assert.equal(await page.locator(".wikimedia-card").count(), 1);
    assert.match(await page.locator("#wikimedia-status").textContent(), /One Wikimedia/);
    assert.match(await page.locator(".wikimedia-card figcaption").textContent(), /Example & Artist.*Own work.*Photo: Example Artist/s);
    assert.equal(await page.locator(".image-license").getAttribute("href"), "https://creativecommons.org/licenses/by-sa/4.0/");
    assert.equal(await page.locator(".wikimedia-card img").evaluate((img) => getComputedStyle(img).objectFit), "contain");
    const request = apiRequests[0], params = new URL(request.url()).searchParams;
    assert.equal(request.method(), "GET");
    assert.equal(params.get("gsrlimit"), "3");
    assert.equal(params.get("gsrnamespace"), "6");
    assert.equal(params.get("origin"), "*");
    assert.match(request.headers()["api-user-agent"], /ScalableStudio.*github/);
    assert.equal(request.headers().authorization, undefined);
    assert.equal(request.headers().cookie, undefined);
    await page.locator(".wikimedia-card .pin").click();
    await page.locator("#save-board").click();
    await page.getByText("Saved locally", { exact: true }).waitFor();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("scalable.boards.v1"))[0]);
    const savedImage = saved.items.find((item) => item.provider === "wikimedia");
    assert.equal(savedImage.pinned, true);
    assert.equal(savedImage.attribution, "Photo: Example Artist, via Wikimedia Commons");
    assert.equal(saved.sourceResults.wikimedia.image, undefined, "Image metadata is not duplicated in status");
    await page.reload();
    await page.locator("#import-audio:not([disabled])").waitFor();
    assert.equal(apiRequests.length, 1, "Reload does not search");
    await page.locator("#saved-boards").click();
    await page.locator(`[data-open-board="${saved.id}"]`).click();
    assert.equal(apiRequests.length, 1, "Open does not search");
    assert.equal(await page.locator(".wikimedia-card .pin").getAttribute("aria-pressed"), "true");

    await explore("A different city direction");
    assert.equal(apiRequests.length, 1, "Rapid second prompt is throttled");
    assert.match(await page.locator("#wikimedia-status").textContent(), /paused/);
    assert.equal(await page.locator(".wikimedia-card").count(), 1, "Pinned image survives fallback");
    responseBody = payload(commonsPage(202), commonsPage(303), commonsPage(404));
    await advance();
    await explore("Earth and sculptural clay");
    assert.equal(apiRequests.length, 2);
    assert.equal(await page.locator(".wikimedia-card").count(), 2, "One new result plus earlier pinned image");
    assert(imageRequests.every((imageUrl) => /Coastal_light_(101|202)\.jpg/.test(imageUrl)), "Only selected image files are loaded");

    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(async ({ theme }) => { const { updateAppearance } = await import("/js/appearance.js"); updateAppearance({ theme }); }, { theme });
        for (const layout of ["collage", "grid"]) {
          await page.evaluate(async (layout) => { const { updateAppearance } = await import("/js/appearance.js"); updateAppearance({ layout }); }, layout);
          for (const filter of ["all", "image"]) {
            await page.locator(`[data-filter="${filter}"]`).click();
            const fits = await page.locator(".wikimedia-card").evaluateAll((cards) => cards.every((card) => {
              const box = card.getBoundingClientRect(), credit = card.querySelector(".image-license").getBoundingClientRect();
              return card.scrollHeight <= card.clientHeight + 2 && credit.bottom <= box.bottom + 2 && box.right <= innerWidth + 2;
            }));
            assert(fits, `Full attribution fits ${width}/${theme}/${layout}/${filter}`);
          }
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator('[data-filter="all"]').click();
    await page.screenshot({ path: path.resolve(__dirname, "../work/wikimedia-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 1100 });
    await page.screenshot({ path: path.resolve(__dirname, "../work/wikimedia-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    const failedPreview = "**/Coastal_light_505.jpg/960px-Coastal_light_505.jpg";
    await context.route(failedPreview, (route) => route.abort());
    responseBody = payload(commonsPage(505));
    await advance();
    await explore("Coastal water preview failure");
    await page.getByText("Wikimedia preview unavailable.", { exact: false }).waitFor();
    assert.equal(await page.locator('.wikimedia-card[data-source-key="wikimedia:505"] .image-license').count(), 1, "Failed preview retains source and license fallback");
    await context.unroute(failedPreview);
    await advance(); responseStatus = 429; responseHeaders = { "Retry-After": "120" };
    await explore("New blue ocean brief");
    const afterLimit = apiRequests.length;
    assert.match(await page.locator("#wikimedia-status").textContent(), /paused/);
    const secondTab = await context.newPage();
    await secondTab.goto(url); await secondTab.locator("#import-audio:not([disabled])").waitFor();
    await secondTab.locator("#prompt").fill("Another tab asks for mountains");
    await secondTab.locator("#generate").click();
    await secondTab.waitForFunction(() => !document.querySelector("#generate").disabled);
    assert.equal(apiRequests.length, afterLimit, "Provider cooldown shared across tabs");
    assert.match(await secondTab.locator("#wikimedia-status").textContent(), /paused/);
    await secondTab.close();
    responseStatus = 200; responseHeaders = {};

    // A new board aborts a pending lookup and cannot be overwritten by its late result.
    await page.evaluate(async () => {
      const { boardService } = await import("/js/board-service.js");
      localStorage.removeItem("scalable.wikimedia.nextRequestAt.v1"); boardService.source.nextRequestAt = 0;
      boardService.source.fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
        window.__wikiCalls = (window.__wikiCalls || 0) + 1;
        window.__pendingWiki = true;
        signal.addEventListener("abort", () => { window.__abortedWiki = true; reject(new DOMException("aborted", "AbortError")); }, { once: true });
      });
    });
    await page.locator("#prompt").fill("A new landscape waiting");
    await page.locator("#generate").click();
    await page.evaluate(() => {
      document.querySelector("#prompt-form").requestSubmit();
      document.querySelector("#prompt-form").requestSubmit();
    });
    await page.waitForFunction(() => window.__pendingWiki);
    assert.equal(await page.evaluate(() => window.__wikiCalls), 1, "Duplicate submissions do not start extra lookups");
    await page.locator("#new-board").click();
    await page.waitForFunction(() => window.__abortedWiki);
    await page.waitForFunction(() => document.querySelector("#prompt").value === "" && document.querySelectorAll(".wikimedia-card").length === 0);
    assert.equal(await page.locator("#generate").isEnabled(), true);
    assert.equal(apiRequests.length, afterLimit, "New board does not search");
    assert.deepEqual(errors, []);
    console.log(`Passed: ${unit.length} provider-policy checks; one-image prompt lookup, attribution, pin/save/reload/refinement, cache/throttle/cross-tab cooldown, cancellation, and 40 responsive theme/layout/filter combinations. All provider traffic mocked; zero browser errors.`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
