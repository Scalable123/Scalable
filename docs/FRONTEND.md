# Frontend design explorations

This branch uses plain HTML, CSS, and native JavaScript modules. No framework, build step, runtime package dependency, or API key is required. The planned backend is C# / ASP.NET Core with a SQL database and server-side AI/media API integrations.

## Run

From the repository root:

```sh
python3 -m http.server 8080 --directory frontend
```

Open `http://localhost:8080` in a browser. Serve over HTTP; JavaScript modules will not work by opening the HTML as a `file://` URL. Python is only a convenience static server, not the planned application backend.

## Compare the designs

Use the switcher at the top. Your selected direction is remembered in this browser.

| Direction                                       | Visual treatment                                                 | Layout                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| 01 — The Studio                                 | Warm paper, forest green, terracotta, expressive serif headings  | Persistent sidebar, intimate brief composer, editorial collage |
| 02 — Nocturne                                   | Deep charcoal, pale lime, cinematic imagery, sans-serif headings | Compact navigation rail, horizontal composer, wide canvas      |
| [03 — The Gallery](design-previews/gallery.png) | White, black, violet, oversized typography                       | Horizontal navigation, graphic gallery grid                    |

All directions share one state and service boundary. Switching the design preserves the board and pinned selections. On mobile the controls stack, navigation compresses, and the canvas becomes a two-column collage.

## Working interactions

- Edit a brief or use one of three suggested directions. Explore selects one of three **curated sample collections** based on keywords; it does not perform AI research. Images stay the same across those sample collections while palette, title, note, and soundtrack concept change.
- Preview a JPG/PNG/WebP reference up to 10 MB. The browser checks decoding, and the file never leaves the browser. References are neither analyzed nor persisted.
- Pin/unpin images. Pins remain when composing another sample direction. Save again to persist changes.
- Filter the canvas to images, palette, or sounds. Click a swatch to copy its HEX value, with a manual-copy fallback.
- Save a board in localStorage, reopen it through Saved boards, or start a new exploration. New exploration discards the current unsaved canvas; saved boards are retained.
- Open soundtrack information. It is a concept card, with **no playback or real track recommendation**.

There is no login, cloud sync, database connection, sharing, export, live AI, or music provider yet. Browser storage is device/origin-specific and may be unavailable or cleared. Do not use it for sensitive information. Image-only research and drag-and-drop uploads are not implemented.

## File map

```text
frontend/
  index.html             Semantic application shell
  styles.css             Responsive layouts and three design directions
  js/app.js              DOM rendering, UI state, browser interactions
  js/board-service.js    Demo data/service and disabled future HTTP adapter
  assets/                Local sample photography and source notes
```

## Connecting ASP.NET Core later

`app.js` uses `boardService` rather than SQL or an AI SDK. `DemoBoardService` owns local sample generation and persistence. `ApiBoardService` demonstrates the proposed HTTP boundary; it is intentionally not enabled because no server exists.

The research lifecycle needs an integration pass, not just a URL change: replace demo `research()` with `startResearch()`, poll `getResearchRun()` until completion, and add cancellation, progressive results, timeouts, and appropriate loading/error states. Keep the renderer independent of these transport details.

Proposed endpoints (design contract, not implemented):

| Method | Endpoint                  | Contract                                                                                 |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------- |
| POST   | `/api/research-runs`      | Multipart `prompt` plus optional `reference`; return 202 with `{ id, status }`           |
| GET    | `/api/research-runs/{id}` | `{ id, status, progress, board?, error? }`; terminal states completed, failed, cancelled |
| DELETE | `/api/research-runs/{id}` | Cancel active research; return 204                                                       |
| GET    | `/api/boards`             | Return board summaries for the authenticated owner; add pagination                       |
| GET    | `/api/boards/{id}`        | Return a complete board DTO                                                              |
| PUT    | `/api/boards/{id}`        | Validate and save a complete board DTO; define concurrency/version checks                |

The current demo returns complete boards in its list. Adapt the saved-board UI to load the selected detail when the backend returns summaries.

Use JSON camelCase with string IDs and ISO 8601 timestamps. The current board structure is:

```js
{
  id, title, description, prompt, createdAt, mode,
  items: [
    { id, type: 'image', url, title, description, sourceUrl, sourceLabel, position, pinned },
    { id, type: 'palette', colors: [{ hex, name }] },
    { id, type: 'note', text },
    { id, type: 'music', title, artist, description, isSample }
  ]
}
```

`position` is a prototype layout hint (`hero`, `detail`, `water`); a production board with arbitrary results should use responsive layout rules rather than requiring these exact item IDs. Sample asset URLs currently come from this origin. Resolve media through server-provided, validated URLs in production. Add real license, creator, source, music catalog, and provenance fields as the research providers are selected.

ASP.NET Core should own authorization, validation, file verification/storage, research jobs, rate limits, provider credentials, and SQL access. Map DTOs to backend entities rather than exposing database rows. Never ship provider keys or database credentials to JavaScript. Prefer same-origin hosting under `wwwroot` (or a separate static host behind the same application origin). If development uses separate origins, configure explicit CORS and authentication rules. Add CSRF protection if using cookie-authenticated mutations. This prototype does not implement authentication or those server protections.

## Validation

The prototype was exercised with headless Chromium at 320, 390, 768, 1024, and 1440 pixel widths: all three directions, filters, pin preservation, sample generation, reference preview, save/reload/reopen, soundtrack information, and horizontal-overflow checks. Additional checks covered clipboard values, blank briefs, invalid/corrupt image uploads, reference removal, browser-storage errors, and visibility of all board cards and saved-board navigation across designs. Manual visual review used desktop and mobile screenshots. No backend behavior has been tested or implemented.
