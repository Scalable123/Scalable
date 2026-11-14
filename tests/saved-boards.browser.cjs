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
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.locator("#import-audio:not([disabled])").waitFor();
    // Add an actual browser-local audio clip to the open board before saving it.
    const wav = Buffer.alloc(44 + 16000);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(16000, 40);
    await page.locator("#import-audio").click();
    await page.locator("#file-tab").click();
    await page.locator("#audio-file").setInputFiles({
      name: "kept-local.wav",
      mimeType: "audio/wav",
      buffer: wav,
    });
    await page.locator("#add-file").click();
    await page.getByText("Local audio added.", { exact: false }).waitFor();
    await page.locator("#close-audio").click();
    const audioUrl = await page.locator("audio").getAttribute("src");
    await page.locator("#save-board").click();
    await page.getByText("Saved locally", { exact: true }).waitFor();
    const original = await page.evaluate(
      () => JSON.parse(localStorage.getItem("scalable.boards.v1"))[0],
    );
    const second = await page.evaluate(async () => {
      const { boardService } = await import("/js/board-service.js");
      const saved = {
        id: crypto.randomUUID(),
        title: "A second direction <b>keep this text literal</b>",
        prompt: "Second board",
        description: "No thumbnail",
        createdAt: new Date().toISOString(),
        mode: "demo",
        items: [],
      };
      await boardService.saveBoard(saved);
      return saved;
    });
    const row = (id) => page.locator(`.saved-item[data-board-id="${id}"]`);
    const startDelete = async (id) => {
      await row(id)
        .getByRole("button", { name: /^Delete saved mood board / })
        .click();
      await page.locator("#delete-board-dialog").waitFor();
    };
    await page.locator("#saved-boards").click();
    assert.equal(await page.locator("#saved-count").textContent(), "2");
    assert.equal(await row(second.id).locator(".saved-thumbnail").count(), 1);
    assert.equal(await row(second.id).locator("b").count(), 0);
    const originalRaw = await page.evaluate(() =>
      localStorage.getItem("scalable.boards.v1"),
    );
    for (const cancel of ["button", "escape", "enter"]) {
      await startDelete(second.id);
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "cancel-delete-board",
      );
      assert.equal(
        await page.locator("#delete-board-name").textContent(),
        second.title,
      );
      assert.equal(
        await page.evaluate(() => localStorage.getItem("scalable.boards.v1")),
        originalRaw,
      );
      if (cancel === "button")
        await page.locator("#cancel-delete-board").click();
      else await page.keyboard.press(cancel === "escape" ? "Escape" : "Enter");
      await page.locator("#delete-board-dialog").waitFor({ state: "hidden" });
      assert(await page.locator("#dialog").isVisible());
      assert.equal(
        await page.evaluate(() => localStorage.getItem("scalable.boards.v1")),
        originalRaw,
      );
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.getAttribute("aria-label"),
        ),
        `Delete saved mood board ${second.title}`,
      );
    }
    // Failure must keep storage, the list, count, and open canvas unchanged.
    await page.evaluate(() => {
      window.__setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "scalable.boards.v1")
          throw new DOMException("Blocked", "SecurityError");
        return window.__setItem.call(this, key, value);
      };
    });
    await startDelete(second.id);
    await page.locator("#confirm-delete-board").click();
    await page
      .getByText("Deletion could not be confirmed.", { exact: false })
      .waitFor();
    assert(await page.locator("#delete-board-dialog").isVisible());
    assert.equal(await page.locator("#saved-count").textContent(), "2");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("scalable.boards.v1")),
      originalRaw,
    );
    await page.locator("#cancel-delete-board").click();
    await page.evaluate(() => {
      Storage.prototype.setItem = window.__setItem;
      delete window.__setItem;
    });
    // Confirming twice or pressing Escape while saving cannot race the mutation.
    await page.evaluate(async () => {
      const { boardService } = await import("/js/board-service.js");
      window.__deleteOriginal = boardService.deleteBoard;
      window.__deleteCalls = 0;
      boardService.deleteBoard = async function (id) {
        window.__deleteCalls++;
        await new Promise((resolve) => {
          window.__finishDelete = resolve;
        });
        return window.__deleteOriginal.call(this, id);
      };
    });
    await startDelete(second.id);
    await page.locator("#confirm-delete-board").click();
    assert(await page.locator("#confirm-delete-board").isDisabled());
    assert(await page.locator("#cancel-delete-board").isDisabled());
    await page.keyboard.press("Escape");
    assert(await page.locator("#delete-board-dialog").isVisible());
    await page.evaluate(() =>
      document
        .querySelector("#confirm-delete-board")
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    assert.equal(await page.evaluate(() => window.__deleteCalls), 1);
    await page.evaluate(() => window.__finishDelete());
    await page.locator("#delete-board-dialog").waitFor({ state: "hidden" });
    assert.equal(await row(second.id).count(), 0);
    assert.equal(await page.locator("#saved-count").textContent(), "1");
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("scalable.boards.v1")),
      ),
      [original],
    );
    assert.equal(await page.locator("audio").getAttribute("src"), audioUrl);
    await page.evaluate(async () => {
      const { boardService } = await import("/js/board-service.js");
      boardService.deleteBoard = window.__deleteOriginal;
    });
    // Dark/mobile confirmation and the saved-list layout must remain usable.
    await page.locator("#close-dialog").click();
    await page.locator("#customize").click();
    await page.locator("#theme-preference").selectOption("dark");
    await page.keyboard.press("Escape");
    await page.locator("#saved-boards").click();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        !(await page
          .locator("#dialog")
          .evaluate((e) => e.scrollWidth > e.clientWidth)),
      );
      await startDelete(original.id);
      assert(
        !(await page
          .locator("#delete-board-dialog")
          .evaluate((e) => e.scrollWidth > e.clientWidth)),
      );
      assert(await page.locator("#cancel-delete-board").isVisible());
      assert(await page.locator("#confirm-delete-board").isVisible());
      await page.locator("#cancel-delete-board").click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Hold a research request in flight to verify it cannot replace the preserved draft.
    await page.evaluate(async () => {
      const { boardService } = await import("/js/board-service.js");
      window.__researchOriginal = boardService.research;
      boardService.research = async function (request) {
        await new Promise((resolve) => {
          window.__finishResearch = resolve;
        });
        const result = await window.__researchOriginal.call(this, request);
        window.__researchFinished = true;
        return result;
      };
      document.querySelector("#prompt").value = "A city at midnight";
      document.querySelector("#prompt-form").requestSubmit();
    });
    // Deleting the open board removes its saved identity but keeps media and edits as a draft.
    await startDelete(original.id);
    await page.locator("#confirm-delete-board").click();
    await page.locator("#delete-board-dialog").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#saved-count").textContent(), "0");
    assert.equal(await page.locator(".saved-item").count(), 0);
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "close-dialog",
    );
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("scalable.boards.v1")),
      ),
      [],
    );
    await page.evaluate(() => window.__finishResearch());
    await page.waitForFunction(() => window.__researchFinished === true);
    assert.equal(
      await page.locator("#board-title").textContent(),
      original.title + ".",
    );
    await page.evaluate(async () => {
      const { boardService } = await import("/js/board-service.js");
      boardService.research = window.__researchOriginal;
    });
    assert.equal(await page.locator("#save-label").textContent(), "Save board");
    await page.locator("#close-dialog").click();
    assert.equal(
      await page.locator("#board-title").textContent(),
      original.title + ".",
    );
    assert.equal(await page.locator("audio").getAttribute("src"), audioUrl);
    await page.locator("#save-board").click();
    await page.getByText("Saved locally", { exact: true }).waitFor();
    const draft = await page.evaluate(
      () => JSON.parse(localStorage.getItem("scalable.boards.v1"))[0],
    );
    assert.notEqual(draft.id, original.id);
    assert.deepEqual(draft.items, original.items);
    await page.locator("#saved-boards").click();
    await startDelete(draft.id);
    // A board already removed in another tab is handled without resurrecting it.
    await page.evaluate(() => localStorage.setItem("scalable.boards.v1", "[]"));
    await page.locator("#confirm-delete-board").click();
    await page.locator("#delete-board-dialog").waitFor({ state: "hidden" });
    await page
      .getByText("This mood board was already deleted.", { exact: false })
      .waitFor();
    assert.equal(await page.locator("#saved-count").textContent(), "0");
    await page.reload();
    await page.locator("#import-audio:not([disabled])").waitFor();
    await page.locator("#saved-boards").click();
    assert.equal(await page.locator(".saved-item").count(), 0);
    // Adapter contract and raw legacy-record preservation are local, deterministic checks.
    await page.route("**/api/boards/**", (route) => {
      assert.equal(route.request().method(), "DELETE");
      assert(route.request().url().endsWith("/api/boards/a%2Fb"));
      return route.fulfill({ status: 204 });
    });
    await page.evaluate(async () => {
      const { ApiBoardService, boardService } = await import(
        "/js/board-service.js"
      );
      await new ApiBoardService("/api").deleteBoard("a/b");
      const legacy = {
        id: "legacy",
        title: "Legacy",
        items: [{ id: "music", type: "music" }],
      };
      localStorage.setItem(
        "scalable.boards.v1",
        JSON.stringify([legacy, { id: "remove", items: [] }]),
      );
      await boardService.deleteBoard("remove");
    });
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("scalable.boards.v1")),
      ),
      [
        {
          id: "legacy",
          title: "Legacy",
          items: [{ id: "music", type: "music" }],
        },
      ],
    );
    assert.deepEqual(errors, []);
    console.log(
      "Passed: delete confirmation, safe default focus, Cancel/Enter/Escape, storage failures, duplicate-click/in-flight protection, selective deletion, count/focus/empty states, active-canvas draft/media preservation and stale-research cancellation, reload persistence, already-deleted handling, responsive dark dialogs, legacy-record preservation, and future DELETE adapter. Zero browser errors.",
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
