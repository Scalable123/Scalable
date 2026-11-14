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
    await appearance();
    await page.locator("#theme-preference").selectOption("dark");
    await closeAppearance();
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

    // New Studio preferences remain independent from board content.
    await page.locator("#new-board").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#prompt").value === "" &&
        document.querySelectorAll(".song-card").length === 3,
    );
    await appearance();
    for (const [name, value] of [
      ["typography", "modern"],
      ["layout", "grid"],
      ["canvas", "dotted"],
      ["textSize", "large"],
    ]) {
      await page
        .locator(`#appearance-form [name="${name}"]`)
        .selectOption(value);
    }
    await closeAppearance();
    await page.reload();
    await page.locator(".song-card").first().waitFor();
    for (const [field, value] of [
      ["typography", "modern"],
      ["layout", "grid"],
      ["canvas", "dotted"],
      ["text-size", "large"],
    ])
      assert.equal(
        await page.locator("html").getAttribute(`data-${field}`),
        value,
      );
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        !(await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )),
        `Customized Studio overflows at ${width}`,
      );
      assert.equal(await page.locator(".board-card:visible").count(), 6);
      await page.locator("#import-audio").click();
      for (const tab of ["link", "file", "services"]) {
        await page.locator(`[data-import-tab="${tab}"]`).click();
        assert(
          !(await page
            .locator("#audio-dialog")
            .evaluate((e) => e.scrollWidth > e.clientWidth)),
          `Audio ${tab} panel overflow at ${width}`,
        );
      }
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await appearance();
    await page.locator("#reset-appearance").click();
    await closeAppearance();
    assert.equal(
      await page.locator("html").getAttribute("data-layout"),
      "collage",
    );
    const externalRequests = [];
    page.on("request", (request) => {
      if (
        /^https?:/.test(request.url()) &&
        new URL(request.url()).origin !== url
      )
        externalRequests.push(request.url());
    });
    const openImporter = async (tab) => {
      await page.locator("#import-audio").click();
      await page.locator(`[data-import-tab="${tab}"]`).click();
    };
    await openImporter("link");
    await page
      .locator("#audio-link")
      .fill("https://open.spotify.com.evil.example/track/123");
    await page.locator("#link-title").fill("Not a supported source");
    await page.locator("#audio-link-form [type=submit]").click();
    await page
      .getByText(
        "Use a Spotify, Amazon Music, Apple Music, SoundCloud, or YouTube link.",
        { exact: false },
      )
      .waitFor();
    await page
      .locator("#audio-link")
      .fill(
        "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b?si=tracking",
      );
    await page.locator("#link-title").fill("My neon reference");
    await page.locator("#link-artist").fill("My artist");
    await page.locator("#audio-link-form [type=submit]").click();
    await page
      .getByText("Reference added. Save your board to keep it.", {
        exact: true,
      })
      .waitFor();
    await page
      .locator("#audio-link")
      .fill("https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b");
    await page.locator("#link-title").fill("Same song");
    await page.locator("#audio-link-form [type=submit]").click();
    await page
      .getByText("That link is already on this board.", { exact: true })
      .waitFor();
    await page
      .locator("#audio-link")
      .fill("https://soundcloud.com/field-recordings/soft-rain");
    await page.locator("#link-title").fill("Personal rain");
    await page.locator("#link-kind").selectOption("sound");
    await page.locator("#audio-link-form [type=submit]").click();
    await page
      .getByText("Reference added. Save your board to keep it.", {
        exact: true,
      })
      .waitFor();
    await page.locator("#services-tab").click();
    await page.locator("#services-tab").press("ArrowLeft");
    assert.equal(
      await page.locator("#file-tab").getAttribute("aria-selected"),
      "true",
    );
    await page.locator("#services-tab").click();
    for (const provider of [
      "Spotify",
      "Amazon Music",
      "Apple Music",
      "SoundCloud",
    ]) {
      await page
        .getByRole("button", {
          name: `Preview ${provider} connection`,
          exact: true,
        })
        .click();
      await page.locator("#provider-import-form [type=submit]").click();
      await page
        .getByText("Choose at least one demo reference to add.")
        .waitFor();
      if (provider === "Amazon Music") {
        await page.locator("#provider-tracks input").first().check();
        await page.locator("#provider-import-form [type=submit]").click();
        await page
          .getByText("1 demo reference added.", { exact: false })
          .waitFor();
      }
      await page.locator("#leave-provider").click();
    }
    await page.locator("#file-tab").click();
    await page.locator("#audio-file").setInputFiles({
      name: "broken.mp3",
      mimeType: "audio/mpeg",
      buffer: Buffer.from("This is not audio"),
    });
    await page.locator("#add-file").click();
    await page
      .getByText("This file could not be decoded as audio.", { exact: false })
      .waitFor();
    // A tiny generated PCM WAV exercises actual browser decoding and local playback.
    const sampleCount = 8000;
    const wav = Buffer.alloc(44 + sampleCount * 2);
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
    wav.writeUInt32LE(sampleCount * 2, 40);
    await page.locator("#audio-file").setInputFiles({
      name: "studio-tone.wav",
      mimeType: "audio/wav",
      buffer: wav,
    });
    await page.locator("#file-title").fill("My local recording");
    await page.locator("#add-file").click();
    await page.getByText("Local audio added.", { exact: false }).waitFor();
    await page.locator("#close-audio").click();
    assert.equal(await page.locator(".imported-audio-card").count(), 4);
    const localAudio = page.locator("audio");
    await localAudio.evaluate((audio) => audio.play());
    assert((await localAudio.evaluate((audio) => audio.duration)) > 0);
    await filter("song");
    assert.equal(await page.locator(".imported-audio-card:visible").count(), 2);
    await filter("sound");
    assert.equal(await page.locator(".imported-audio-card:visible").count(), 2);
    await filter("all");
    await page.locator("#prompt").fill("A warm earthy room");
    await explore();
    assert.equal(await page.locator(".imported-audio-card").count(), 4);
    await page.evaluate(() => localStorage.removeItem("scalable.boards.v1"));
    await page.locator("#save-board").click();
    await page.getByText("Saved locally", { exact: true }).waitFor();
    const stored = await page.evaluate(() =>
      localStorage.getItem("scalable.boards.v1"),
    );
    assert(!stored.includes("blob:"));
    assert(!stored.includes("data:audio"));
    assert.match(stored, /studio-tone.wav/);
    await page.reload();
    await page.locator(".song-card").first().waitFor();
    await page.locator("#saved-boards").click();
    await page.getByRole("button", { name: "Open", exact: true }).click();
    assert.equal(await page.locator(".imported-audio-card").count(), 4);
    assert.equal(await page.locator("audio").count(), 0);
    await page
      .getByText("Reattach studio-tone.wav to play.", { exact: false })
      .waitFor();
    await page
      .getByLabel("Reattach audio for My local recording", { exact: true })
      .setInputFiles({
        name: "studio-tone.wav",
        mimeType: "audio/wav",
        buffer: wav,
      });
    await page.locator("audio").waitFor();
    await page
      .getByRole("button", {
        name: "Remove Personal rain from board",
        exact: true,
      })
      .click();
    assert.equal(await page.locator(".imported-audio-card").count(), 3);
    assert.equal(
      await page
        .getByRole("heading", { name: "Personal rain", exact: true })
        .count(),
      0,
    );
    const parsed = await page.evaluate(async () => {
      const { parseMediaLink } = await import("/js/audio-library.js");
      if (
        parseMediaLink("https://open.spotify.com/intl-de/track/EXAMPLE?si=abc")
          .url !== "https://open.spotify.com/track/EXAMPLE"
      )
        throw new Error("Localized Spotify link did not normalize");
      const accepted = [
        "https://music.amazon.co.uk/albums/EXAMPLE",
        "https://music.apple.com/us/album/example/123",
        "https://youtu.be/example",
      ].map((link) => parseMediaLink(link).provider);
      const rejected = [
        "javascript:alert(1)",
        "https://user:pass@open.spotify.com/track/abc",
        "https://open.spotify.com:444/track/abc",
        "http://soundcloud.com/a/b",
      ].every((link) => {
        try {
          parseMediaLink(link);
          return false;
        } catch {
          return true;
        }
      });
      return { accepted, rejected };
    });
    assert.deepEqual(parsed, {
      accepted: ["amazon", "apple", "youtube"],
      rejected: true,
    });
    assert.deepEqual(externalRequests, []);

    // Pinterest account connection and board imports are explicitly local previews.
    await page.locator("#import-pinterest").click();
    await page
      .getByRole("button", {
        name: "Preview Pinterest connection",
        exact: true,
      })
      .click();
    assert(await page.locator("#review-pinterest").isDisabled());
    await page
      .getByLabel("Select board The slow coast", { exact: true })
      .check();
    await page.locator("#pinterest-search").fill("earth");
    await page
      .getByLabel("Select board Earth & atmosphere", { exact: true })
      .check();
    await page.locator("#pinterest-search").fill("no such board");
    assert(await page.locator("#pinterest-no-boards").isVisible());
    assert.equal(
      await page.locator("#pinterest-board-count").textContent(),
      "2 boards selected",
    );
    await page.locator("#select-pinterest-boards").click();
    assert.equal(
      await page.locator("#pinterest-board-count").textContent(),
      "3 boards selected",
    );
    await page.locator("#clear-pinterest-boards").click();
    assert(await page.locator("#review-pinterest").isDisabled());
    await page.locator("#pinterest-search").fill("");
    await page
      .getByLabel("Select board The slow coast", { exact: true })
      .check();
    await page
      .getByLabel("Select board Earth & atmosphere", { exact: true })
      .check();
    await page.locator("#review-pinterest").click();
    assert.equal(
      await page.locator("#pinterest-pin-list input:checked").count(),
      10,
    );
    await page
      .getByLabel("Import pin Follow the tide", { exact: true })
      .uncheck();
    assert(
      await page
        .locator("#select-pinterest-pins")
        .evaluate((e) => e.indeterminate),
    );
    // A mixed checkbox first selects all, then a second action clears all.
    await page.locator("#select-pinterest-pins").check();
    await page.locator("#select-pinterest-pins").uncheck();
    assert(await page.locator("#confirm-pinterest-import").isDisabled());
    await page.locator("#select-pinterest-pins").check();
    await page.locator("#confirm-pinterest-import").click();
    assert.match(
      await page.locator("#pinterest-result").textContent(),
      /10 sample pins added to your current mood board/,
    );
    await page.locator("#view-pinterest-board").click();
    assert.equal(await page.locator(".imported-pin-badge").count(), 10);
    assert.equal(await page.locator(".image-card").count(), 13);
    await page.locator("#import-pinterest").click();
    await page.locator("#more-pinterest-boards").click();
    await page.locator("#review-pinterest").click();
    await page.locator("#confirm-pinterest-import").click();
    assert.match(
      await page.locator("#pinterest-result").textContent(),
      /0 sample pins.*10 already-present pins were skipped/,
    );
    await page.locator("#view-pinterest-board").click();
    await page
      .getByRole("button", {
        name: "Remove imported pin Mornings in the mist",
        exact: true,
      })
      .click();
    assert.equal(await page.locator(".imported-pin-badge").count(), 9);
    await page.locator("#import-pinterest").click();
    await page.locator("#more-pinterest-boards").click();
    await page.locator("#review-pinterest").click();
    await page.locator("#confirm-pinterest-import").click();
    assert.match(
      await page.locator("#pinterest-result").textContent(),
      /1 sample pin.*9 already-present pins were skipped/,
    );
    await page.locator("#view-pinterest-board").click();
    await filter("image");
    assert.equal(await page.locator(".image-card:visible").count(), 13);
    await filter("all");
    await page
      .locator("#board-grid .image-card")
      .last()
      .getByRole("button", { name: /^Pin / })
      .click();
    await page.locator("#prompt").fill("A coastal creative direction");
    await explore();
    assert.equal(await page.locator(".imported-pin-badge").count(), 10);
    assert.equal(await page.locator(".imported-audio-card").count(), 3);
    await page.evaluate(() => localStorage.removeItem("scalable.boards.v1"));
    await page.locator("#save-board").click();
    await page.getByText("Saved locally", { exact: true }).waitFor();
    const savedPins = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("scalable.boards.v1"))[0].items.filter(
        (i) => i.provider === "pinterest",
      ),
    );
    assert.equal(savedPins.length, 10);
    assert(
      savedPins.every(
        (i) =>
          i.sourceBoard.id &&
          i.externalPinId &&
          i.isSample &&
          i.originalPinUrl === null,
      ),
    );
    assert(savedPins.some((i) => i.pinned));
    await page.reload();
    await page.locator("#import-pinterest:not([disabled])").waitFor();
    await page.locator("#saved-boards").click();
    await page.getByRole("button", { name: "Open", exact: true }).click();
    assert.equal(await page.locator(".imported-pin-badge").count(), 10);
    await page.locator("#import-pinterest").click();
    assert(await page.locator("#pinterest-connect").isVisible());
    await page
      .getByRole("button", {
        name: "Preview Pinterest connection",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Select board The slow coast", { exact: true })
      .check();
    await page.locator("#review-pinterest").click();
    await page.locator("[name=destination][value=new]").check();
    await page.locator("#pinterest-new-title").fill("   ");
    await page.locator("#confirm-pinterest-import").click();
    await page
      .getByText("Give the new mood board a name.", { exact: true })
      .waitFor();
    await page
      .locator("#pinterest-new-title")
      .fill("A Pinterest starting point");
    // Simulate research already in flight when the user starts a fresh imported board.
    await page.evaluate(() =>
      document.querySelector("#prompt-form").requestSubmit(),
    );
    await page.locator("#confirm-pinterest-import").click();
    await page.locator("#view-pinterest-board").click();
    await page.waitForTimeout(750);
    assert.equal(
      await page.locator("#board-title").textContent(),
      "A Pinterest starting point.",
    );
    assert.equal(await page.locator(".image-card").count(), 6);
    assert.equal(await page.locator(".imported-audio-card").count(), 0);
    for (const layout of ["collage", "grid"]) {
      await appearance();
      await page.locator("[name=layout]").selectOption(layout);
      await closeAppearance();
      for (const colorScheme of ["light", "dark"]) {
        await appearance();
        await page.locator("[name=theme]").selectOption(colorScheme);
        await closeAppearance();
        for (const width of [1440, 1024, 768, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          assert(
            !(await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            )),
            `Pinterest board overflows at ${width}/${layout}/${colorScheme}`,
          );
          const rects = await page.locator(".image-card").evaluateAll((cards) =>
            cards.map((card) => {
              const r = card.getBoundingClientRect();
              return {
                x: r.x,
                y: r.y,
                right: r.right,
                bottom: r.bottom,
                width: r.width,
                height: r.height,
              };
            }),
          );
          assert(rects.every((r) => r.width > 0 && r.height > 0));
          for (let i = 0; i < rects.length; i++)
            for (let j = i + 1; j < rects.length; j++)
              assert(
                !(
                  rects[i].x < rects[j].right - 1 &&
                  rects[i].right > rects[j].x + 1 &&
                  rects[i].y < rects[j].bottom - 1 &&
                  rects[i].bottom > rects[j].y + 1
                ),
                "Imported cards overlap",
              );
          await page.locator("#import-pinterest").click();
          await page.locator("#more-pinterest-boards").click();
          assert(
            !(await page
              .locator("#pinterest-dialog")
              .evaluate((e) => e.scrollWidth > e.clientWidth)),
            `Pinterest board picker overflows at ${width}`,
          );
          await page.locator("#review-pinterest").click();
          assert(
            !(await page
              .locator("#pinterest-dialog")
              .evaluate((e) => e.scrollWidth > e.clientWidth)),
            `Pinterest review overflows at ${width}`,
          );
          await page.locator("#close-pinterest").click();
          // Return to the completion state so the next matrix iteration follows the same path.
          await page.locator("#import-pinterest").click();
          await page.locator("#confirm-pinterest-import").click();
          await page.locator("#view-pinterest-board").click();
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator("#import-pinterest").click();
    await page.locator("#more-pinterest-boards").click();
    await page.locator("#end-pinterest-preview").click();
    assert(await page.locator("#pinterest-connect").isVisible());
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "import-pinterest",
    );
    assert.equal(context.pages().length, 1);
    assert.deepEqual(externalRequests, []);

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
      "Passed: Studio themes, customization persistence/reset, OS theme changes, 20 responsive combinations, songs/sounds and inclusion options, catalog-search links, pins, saved-board reopening, legacy compatibility, and blocked storage. Plus extended appearance settings, link imports, provider library previews, local audio decoding/playback, reattachment, persistence, safe URLs, duplicate prevention, and removal. Pinterest: full-board and selected-pin imports, duplicate prevention, save/reopen, new-board creation, stale-research protection, and 20 responsive layout/theme combinations. No provider requests. Zero browser errors.",
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
