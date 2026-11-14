# The Studio frontend

The Studio is the selected design: warm paper, forest green, terracotta accents, serif headings, and an editorial collage. The other design explorations have been removed. Light and dark modes use this same Studio layout.

Plain HTML, CSS, and native JavaScript modules power the frontend. No framework, build step, runtime package dependency, or API key is required. The planned backend remains C# / ASP.NET Core with a SQL database and server-side AI/media integrations.

## Run

From the repository root:

```sh
python3 -m http.server 8080 --directory frontend
```

Open `http://localhost:8080`. Serve over HTTP; JavaScript modules will not work by opening the HTML as a `file://` URL. Python is only a convenience static server.

Previews: [light](design-previews/studio.png), [dark](design-previews/studio-dark.png), [customization](design-previews/studio-customize.png).

## Appearance and customization

- The top mode button switches between light and dark.
- **Customize** offers light, dark, or device-following appearance; terracotta, olive, or plum accents; comfortable or compact canvas spacing; and soft or square card edges.
- Changes apply immediately. Device-following mode responds to changes in the operating system color scheme. Reset restores the default device-following theme, terracotta accent, comfortable spacing, and soft edges.
- Preferences are stored separately from boards under `scalable.appearance.v1`. Invalid values fall back to defaults. Old design-switcher preferences are ignored. Blocked browser storage still allows changes for the current visit and displays a persistence notice.
- Actual board color swatches do not change when the interface theme or accent changes.

## Songs and ambient sounds

These are distinct content types and can both be part of a board:

- **Songs:** Real curated examples with title, artist, genre/vocal information, and an explanation of the fit. Spotify links open a **catalog search**, not a verified track page or an embedded player. Coastal, after-hours, and earthy sample briefs each have different song picks. Examples include songs with vocals and instrumental tracks.
- **Sounds:** Ambient directions such as ocean waves, rain/city ambience, or wind in leaves. These are labeled sound concepts with no attached recording.

Use the two checkboxes before exploring to request songs, sounds, both, or neither. Separate Songs and Sounds filters make each easy to browse. Research options are saved with the board and restored when reopening it. Empty filters explain how to add the missing content.

No external catalog lookup, AI recommendation, audio streaming, or playback is implemented. Sample songs are hand-picked; they are not claimed to be researched or licensed for use. The future backend should retrieve verified catalog IDs/links and licensed sound sources, return provenance and explanations, and provide previews only when allowed by the provider.

## Other working interactions

- Edit a brief or choose a sample prompt. Explore selects one of three curated sample collections using keywords. Photography stays the same while palette, title, note, songs, and ambient direction change. This is not AI research.
- Preview a JPG/PNG/WebP reference up to 10 MB. The browser verifies decoding. Files never leave the browser and are neither analyzed nor persisted.
- Pin/unpin images; pins survive a sample refinement. Save again to persist changes.
- Copy palette HEX values with a manual-copy fallback.
- Save boards locally, reopen them, or start a new exploration. Starting fresh discards the unsaved canvas but keeps saved boards.
- Previously saved `type: "music"` concepts are read as `type: "sound"`. Existing boards are not overwritten automatically; older boards gain songs when the user explores again with songs enabled.

There is no account, cloud sync, SQL connection, sharing, export, or live AI yet. Browser storage is origin/device-specific and may be cleared. Image-only research and drag-and-drop uploads remain unimplemented.

## File map

```text
frontend/
  index.html             Semantic application shell and appearance dialog
  styles.css             Responsive Studio layout and appearance tokens
  js/appearance.js       Validated local preferences and device theme handling
  js/app.js              DOM rendering, filters, interactions
  js/board-service.js    Demo service, saved-board compatibility, future HTTP adapter
  assets/                Local sample photography and source notes
```

## Connecting ASP.NET Core later

The renderer uses `boardService`, not SQL or an AI SDK. `DemoBoardService` owns local sample generation and persistence. `ApiBoardService` documents an HTTP boundary and is not enabled.

The production research lifecycle requires an integration pass: replace demo `research()` with `startResearch()`, poll `getResearchRun()` to completion, and add cancellation, partial results, timeouts, and loading/error states. The adapter sends a multipart prompt, optional reference file, and `includeSongs`/`includeSounds` booleans as text fields for .NET model binding.

Proposed endpoints (not implemented):

| Method | Endpoint                  | Contract                                                                                                    |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| POST   | `/api/research-runs`      | Multipart `prompt`, optional `reference`, `includeSongs`, `includeSounds`; return 202 with `{ id, status }` |
| GET    | `/api/research-runs/{id}` | `{ id, status, progress, board?, error? }`; terminal states completed, failed, cancelled                    |
| DELETE | `/api/research-runs/{id}` | Cancel active research; return 204                                                                          |
| GET    | `/api/boards`             | Authenticated owner's board summaries, with pagination                                                      |
| GET    | `/api/boards/{id}`        | Complete board DTO                                                                                          |
| PUT    | `/api/boards/{id}`        | Validate/save board; add concurrency/version checks                                                         |

The demo list returns full boards. Adapt the saved-board UI to retrieve board detail when the backend returns summaries.

JSON uses camelCase, string IDs, and ISO 8601 timestamps:

```js
{
  id, title, description, prompt, createdAt, mode,
  researchOptions: { includeSongs, includeSounds },
  items: [
    { id, type: 'image', url, title, description, sourceUrl, sourceLabel, position, pinned },
    { id, type: 'palette', colors: [{ hex, name }] },
    { id, type: 'note', text },
    { id, type: 'sound', title, description, isSample },
    { id, type: 'song', title, artist, explanation, tags, discoveryUrl, linkKind, isSample }
  ]
}
```

`linkKind: "catalog-search"` explicitly distinguishes sample search links from future verified track links. Extend the song/sound DTOs with provider IDs, attribution, licenses, and optional permitted previews after choosing providers. Keep song and sound filtering independent of provider choice.

`position` is a prototype layout hint (`hero`, `detail`, `water`). Arbitrary production image counts need layout rules rather than fixed IDs. Resolve media through server-validated URLs. Map DTOs to database entities without exposing SQL rows.

ASP.NET Core owns authorization, validation, upload verification/storage, research jobs, rate limits, and provider credentials. Never ship SQL credentials or API keys to JavaScript. Prefer same-origin hosting through `wwwroot` or a shared origin. Configure explicit CORS/authentication if origins differ and CSRF protection for cookie-authenticated mutations. Appearance is a browser preference now; a future user-settings endpoint can optionally sync it.

## Validation

Run `node tests/studio.browser.cjs` in a development environment with Playwright and Chromium installed. The script starts its own temporary static server. Set `CHROMIUM_PATH` if Chromium is installed somewhere other than `/usr/bin/chromium`.

The checks cover desktop/mobile layouts, theme/device changes, persisted customization, keyboard dismissal, songs and sounds filters and inclusion options, sample selection, saved-board reopening, legacy board compatibility, and storage failures. This tests the frontend only; no backend/provider integration is claimed.
