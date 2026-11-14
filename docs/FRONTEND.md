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

- Studio, login, recovery, and account pages use the same **Theme: System / Light / Dark** selector. System is the default and follows device changes; manual overrides persist until System is selected again.
- **Customize** offers light, dark, or device-following appearance; terracotta, olive, or plum accents; comfortable or compact canvas spacing; and soft or square card edges.
- Changes apply immediately. Device-following mode responds to changes in the operating system color scheme. Reset restores the default device-following theme, terracotta accent, comfortable spacing, and soft edges.
- `theme-init.js` applies the device/stored theme before styles paint. Preferences synchronize across open tabs and are re-read on back/forward-cache restoration. Legacy MediaQueryList listeners are supported; CSS follows the device when JavaScript is disabled.
- Preferences are stored separately from boards under `scalable.appearance.v1`. Invalid values fall back to defaults. Old design-switcher preferences are ignored. Blocked browser storage still allows changes for the current visit and displays a persistence notice.
- Actual board color swatches do not change when the interface theme or accent changes.

## Songs and ambient sounds

These are distinct content types and can both be part of a board:

- **Songs:** Real curated examples with title, artist, genre/vocal information, and an explanation of the fit. Spotify links open a **catalog search**, not a verified track page or an embedded player. Coastal, after-hours, and earthy sample briefs each have different song picks. Examples include songs with vocals and instrumental tracks.
- **Sounds:** Ambient directions such as ocean waves, rain/city ambience, or wind in leaves. These are labeled sound concepts with no attached recording.

Use the two checkboxes before exploring to request songs, sounds, both, or neither. Separate Songs and Sounds filters make each easy to browse. Research options are saved with the board and restored when reopening it. Empty filters explain how to add the missing content.

No external catalog lookup, live AI recommendation, or streaming-service playback is implemented. Imported local audio can play in the browser. Sample songs are hand-picked; they are not claimed to be researched or licensed for use. The future backend should retrieve verified catalog IDs/links and licensed sound sources, return provenance and explanations, and provide previews only when allowed by the provider.

## Other working interactions

- Edit a brief or choose a sample prompt. Explore selects one of three curated sample collections using keywords. Photography stays the same while palette, title, note, songs, and ambient direction change. This is not AI research.
- Preview a JPG/PNG/WebP reference up to 10 MB. The browser verifies decoding. Files never leave the browser and are neither analyzed nor persisted.
- Pin/unpin images; pins survive a sample refinement. Save again to persist changes.
- Copy palette HEX values with a manual-copy fallback.
- Save boards locally, reopen them, or start a new exploration. Starting fresh discards the unsaved canvas but keeps saved boards.
- Previously saved `type: "music"` concepts are read as `type: "sound"`. Existing boards are not overwritten automatically; older boards gain songs when the user explores again with songs enabled.

There is no real authenticated account, cloud sync, SQL connection, sharing, export, or live AI yet. Login and account pages are local frontend previews. Browser storage is origin/device-specific and may be cleared. Image-only research and drag-and-drop uploads remain unimplemented.

## File map

```text
frontend/
  index.html             Studio application shell and import/appearance dialogs
  login.html             Frontend login preview
  signup.html            Create-account form and validation preview
  account.html           Local profile, preferences, and connection previews
  styles.css             Responsive Studio layout and appearance tokens
  js/appearance.js       Validated local preferences and device theme handling
  js/app.js              Studio rendering, filters, and interactions
  js/account.js          Login/account preview interactions
  js/icons.js            Shared vector symbols
  js/video-library.js    YouTube references and local video playback/imports
  js/audio-library.js    Link imports, provider previews, local audio registry
  js/pinterest-import.js Pinterest connection preview, board/pin selection, import DTOs
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

## Personalization and imported audio

The Studio now also supports editorial/modern typography, collage/even-grid arrangement, plain/dotted canvas, and standard/larger reading text. Defaults and validation live in `appearance.js`; older saved preferences gain the new defaults without a migration or loss of existing choices. Reset restores all appearance settings without changing boards or imported media.

Use **Import audio** in **03 / Find Your Soundtrack**. This section stays available when song results are empty or hidden by a filter:

- **Paste a link:** Add a Spotify, Amazon Music, Apple Music, SoundCloud, or YouTube reference as a song or ambient sound. Supply a title and optional creator. This saves the reference, not a streamed recording or extracted metadata. Album/playlist links remain one reference. Shortened share links must be opened in a browser and replaced with the destination URL.
- **Local audio:** Import a browser-decodable MP3, WAV, OGG, or M4A up to 20 MB. Native controls play the local file. Only metadata persists when saving a board; the file must be reattached after a page reload/new visit. Reattaching is available directly on the card. File bytes and temporary blob URLs never enter localStorage or a board DTO.
- **Music services:** Preview candidate library experiences for Spotify, Amazon Music, Apple Music, and SoundCloud. Each provider stays labeled **not connected**. Choose hand-picked demo tracks and add them as sample references. Nothing opens OAuth, reads a real library, or contacts a provider.

Imported references can be removed and survive brief refinement, even if new song/sound recommendations are turned off. Duplicate imported links are skipped after tracking-parameter normalization. Supported external references use HTTPS and an explicit host allowlist. These checks validate URL shape, not the existence of a track or its availability. Only explicit outbound clicks leave the app. Imported links are not embedded or fetched.

`js/audio-library.js` owns URL validation, provider preview fixtures, import interactions, and the in-memory local-audio URL registry. The renderer receives plain song/sound DTOs, and the existing board service persists their metadata. When a board is replaced or references are removed, unused object URLs are revoked. UI rerenders pause playback, and playing one local clip pauses the others.

Additional imported item fields:

```js
{
  id, type: 'song' /* or 'sound' */, title, artist,
  imported: true,
  sourceKind: 'link' /* or 'local-file' or 'demo-provider' */,
  provider, resourceType, discoveryUrl, linkKind, // linked references only
  fileInfo: { name, size, mimeType, lastModified }, // local file references only
  sourceKey, explanation, tags, isSample
}
```

The importer never stores account credentials or marks a provider connected. See [music integration handoff](MUSIC-INTEGRATION.md) for the future backend boundary.

The browser suite also exercises new preference persistence/reset, import dialogs across five widths, validated/duplicate links, all four provider previews, real local WAV decoding/playback, save/reopen/reattach, imported-reference preservation/removal, and absence of external provider requests during these flows.

## Start from Pinterest boards

Use **Import Pinterest board** in **01 / The Starting Point**, alongside the reference-image input, for the local connection preview. Select complete sample boards, review/deselect pins, and add them to the current canvas or create a new named mood board. Imported sample pins retain board provenance, can be pinned/removed, survive refinement, and persist with saved boards. Duplicate pins are skipped. New board creation also guards against older research results overwriting the imported canvas.

No Pinterest account is connected and no Pinterest content is fetched. The three demo boards use existing local sample photographs. [Pinterest integration notes](PINTEREST-INTEGRATION.md) describe the flow, limitations, data shape, and proposed .NET endpoints for real authorization and paginated whole-board imports.

## Videos, login, and account

**Import video** accepts YouTube references and browser-playable local files. Videos can be filtered, removed, saved as references, and retained through refinement. YouTube embeds load only on request. Local video files need reattachment after reload; file bytes are not saved.

Use the Studio's **Log in** and **Account** links for the new pages. Login is a credential-free simulation after form validation; entered credentials are not transmitted or persisted. The account page has a local profile, shared appearance settings, service preview links, and sign-in/security placeholders. No browser flag is treated as authentication.

See [video/account implementation and .NET handoff](VIDEO-ACCOUNT.md) for behavior, data contracts, test commands, and backend requirements.

## Login navigation and shared branding

The Studio, login, recovery, and account pages use the same static star-and-wordmark logo. Logo links point to the Studio. Demo-account navigation and password-recovery navigation use real relative links, so they work under a GitHub Pages project path and without JavaScript. Valid sample sign-in details have an `account.html` fallback action; fields have no names and are never sent as form parameters. Password visibility is enabled only after its handler is ready.

`recover.html` is an explicit recovery preview, with a sample-email form and visible confirmation. It sends no email and does not implement authentication. See `node tests/navigation-theme.browser.cjs` for branding, navigation, device themes, overrides, legacy listeners, cross-tab updates, and no-JavaScript checks.

## Create-account flow

Login's **Create an account** link opens `signup.html`, with display name, email, password, and confirmation validation. A successful submission shows a frontend-only confirmation and clears the form; it does not register an account or store/send the entered details. Continue to the account preview or return to login through ordinary links. Shared branding, System/Light/Dark preferences, and responsive layouts match the other pages. See the [signup handoff](VIDEO-ACCOUNT.md#create-account-page).

The branch also contains Supabase sign-in, recovery, session lookup, and sign-out hooks brought in by remote commits. These are preserved alongside the independent signup preview. Auth SDK loading is lazy and browser-compatible; the signup form does not call Supabase or register a user. Auth browser checks use a mocked client and do not contact the live project.
