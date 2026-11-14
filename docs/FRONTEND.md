# The Studio frontend

The Studio is the selected design: warm paper, forest green, terracotta accents, serif headings, and an editorial collage. The other design explorations have been removed. Light and dark modes use this same Studio layout.

Plain HTML, CSS, and native JavaScript modules power the frontend without a framework or build step. Local Studio features need no provider key. Legacy authentication loads the Supabase browser SDK from a pinned CDN URL and uses public project configuration; the manifest also declares that SDK. The selected backend direction is C# / ASP.NET Core with **GraphQL instead of Supabase for application data access**. No GraphQL server/client or database is implemented. See [BACKEND.md](BACKEND.md) for the authoritative backend direction and [the complete frontend reference](../documentation/FRONTEND.md) for detailed current behavior.

## Run

From the repository root:

```sh
python3 -m http.server 8080 --directory frontend
```

Open `http://localhost:8080`. Serve over HTTP; JavaScript modules will not work by opening the HTML as a `file://` URL. Python is only a convenience static server.

Previews: [light](design-previews/studio.png), [dark](design-previews/studio-dark.png), [customization](design-previews/studio-customize.png).

## Appearance and customization

- Theme lives inside **Customize**, alongside the other appearance preferences. Studio, login, signup, and recovery open a Customize dialog; the account page uses its **Customize** tab. System is the default and follows device changes; Light/Dark overrides persist until System is selected again. There is no separate navbar theme selector.
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
- In **Saved boards**, choose **Delete** and confirm **“Are you sure you want to delete this mood board?”** Cancel and Escape leave the saved copy untouched. Confirming removes only that board from this browser, updates the count/list, and returns keyboard focus to the list. Storage failures keep the confirmation open with a retry message.
- Deleting the open board keeps its current canvas and imported media as an unsaved draft with a new ID. Saving that draft creates a new saved board. Deletion does not remove original files or content from connected providers.
- Previously saved `type: "music"` concepts are read as `type: "sound"`. Existing boards are not overwritten automatically; older boards gain songs when the user explores again with songs enabled.

Previews: [saved boards](design-previews/studio-saved-boards.png), [delete confirmation](design-previews/studio-delete-board.png).

Login, recovery from login, session lookup, password update, and sign-out call legacy Supabase Auth. Signup, standalone recovery, profile editing, and provider connections remain local previews. There is no GraphQL connection, cloud board sync, server database persistence, sharing, export, or live AI. A Supabase session does not guard Studio/account routes or partition browser records by user. Browser storage is origin/device-specific and may be cleared. Image-only research and drag-and-drop uploads remain unimplemented.

## File map

```text
frontend/
  index.html             Studio application shell and import/appearance dialogs
  login.html             Legacy Supabase login and recovery request
  signup.html            Create-account form and validation preview
  recover.html           Standalone recovery preview; no email
  update-password.html   Legacy Supabase session/password update
  account.html           Local profile, preferences, and connection previews
  styles.css             Responsive Studio layout and appearance tokens
  js/appearance.js       Validated local preferences and device theme handling
  js/app.js              Studio rendering, filters, and interactions
  js/account.js          Login/signup/recovery/account handlers
  js/update-password.js  Session check, password update, and sign-out
  js/config/             Public legacy Supabase client configuration/loader
  js/theme-init.js       Theme initialization before paint
  js/customize.js        Shared settings bindings and auth-page dialog
  js/icons.js            Shared vector symbols
  js/video-library.js    YouTube references and local video playback/imports
  js/audio-library.js    Link imports, provider previews, local audio registry
  js/pinterest-import.js Pinterest connection preview, board/pin selection, import DTOs
  js/board-service.js    Demo service, saved-board compatibility, inactive REST adapter
  assets/                Local sample photography and source notes
```

## Connecting ASP.NET Core and GraphQL later

The renderer uses `boardService`, not a database or AI SDK. `DemoBoardService` owns local sample generation and persistence. `ApiBoardService` is an inactive REST-shaped adapter, not the selected GraphQL contract. Its `/api` paths and HTTP-204 deletion behavior describe existing unused code only.

The production research lifecycle requires an integration pass: replace demo `research()` with a start/poll/completion flow and add cancellation, partial results, timeouts, and loading/error states. The old adapter sends multipart REST requests; GraphQL must instead use operations/variables and an agreed upload/media-ID flow. It must unwrap `data` and handle GraphQL `errors`, including HTTP-200 errors, before announcing success.

Proposed operations at `/graphql` (not implemented; exact schema pending):

| Kind | Field | Contract |
| --- | --- | --- |
| Mutation | `startResearch` | Prompt, optional media ID, independent song/sound flags; return run identity/status |
| Query | `researchRun` | ID, status, progress, partial/completed board, safe error; terminal completed/failed/cancelled |
| Mutation | `cancelResearch` | Cancel an authorized active run |
| Query | `boards` | Paginated authenticated-owner summaries |
| Query | `board` | Complete authorized board detail |
| Mutation | `saveBoard` | Validate/save with ownership and expected-version checks |
| Mutation | `deleteBoard` | Confirm authorized deletion or already-absent outcome |

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

`position` is a prototype layout hint (`hero`, `detail`, `water`). Arbitrary production image counts need layout rules rather than fixed IDs. Resolve media through server-validated URLs. Map DTOs to database entities without exposing raw persistence entities.

ASP.NET Core owns authorization, validation, upload verification/storage, research jobs, rate limits, and provider credentials. GraphQL is the API layer; database/ORM and replacement identity choices remain open. Never ship database credentials or server API keys to JavaScript. Prefer same-origin hosting through `wwwroot` or a shared origin. Configure explicit CORS/authentication if origins differ and CSRF protection for cookie-authenticated mutations. Appearance is a browser preference now; future GraphQL preference operations can optionally sync it.

## Validation

Run `node tests/studio.browser.cjs` in a development environment with Playwright and Chromium installed. The script starts its own temporary static server. Set `CHROMIUM_PATH` if Chromium is installed somewhere other than `/usr/bin/chromium`.

The checks cover desktop/mobile layouts, theme/device changes, persisted customization, keyboard dismissal, songs and sounds filters and inclusion options, sample selection, saved-board reopening, legacy board compatibility, and storage failures. This tests the frontend only; no backend/provider integration is claimed.

Run `node tests/saved-boards.browser.cjs` for deletion checks: confirmation and safe default focus, Cancel/Enter/Escape, selective deletion, persistence after reload, storage failures, duplicate clicks, empty/count/focus states, responsive dark dialogs, and preservation of an open draft and its media. It also checks stale research cancellation, already-deleted boards, unchanged legacy records, and the proposed DELETE adapter using a mock response.

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

No Pinterest account is connected and no Pinterest content is fetched. The three demo boards use existing local sample photographs. [Pinterest integration notes](PINTEREST-INTEGRATION.md) describe the flow, limitations, data shape, and proposed .NET GraphQL operations for real authorization and paginated whole-board imports.

## Videos, login, and account

**Import video** accepts YouTube references and browser-playable local files. Videos can be filtered, removed, saved as references, and retained through refinement. YouTube embeds load only on request. Local video files need reattachment after reload; file bytes are not saved.

Use the Studio's **Log in** and **Account** links for the account pages. Login transmits credentials to the configured legacy Supabase Auth project; SDK-managed session persistence is enabled. The app does not copy passwords into local profiles/boards. The account page reads the auth session while retaining a local profile, shared appearance settings, and service/security previews. No demo browser flag is authentication.

See [video/account implementation and .NET handoff](VIDEO-ACCOUNT.md) for behavior, data contracts, test commands, and backend requirements.

## Login navigation and shared branding

The Studio, login, signup, recovery, and account pages use the same static star-and-wordmark logo. Logo links point to the Studio. Demo-account navigation and password-recovery fallback use real relative links under a GitHub Pages project path and without JavaScript. The sign-in form has an `account.html` fallback action; fields have no names and are not sent as fallback GET parameters. This fallback only navigates; JavaScript-enabled login sends credentials through Supabase. Password visibility is enabled only after its handler is ready. The password-update page lacks the shared header/customization controls.

`recover.html` is an explicit recovery preview, with a sample-email form and visible confirmation. It sends no email and does not implement authentication. See `node tests/navigation-theme.browser.cjs` for branding, navigation, device themes, overrides, legacy listeners, cross-tab updates, and no-JavaScript checks.

## Create-account flow

Login's **Create an account** link opens `signup.html`, with display name, email, password, and confirmation validation. A successful submission shows a frontend-only confirmation and clears the form; it does not register an account or store/send the entered details. Continue to the account preview or return to login through ordinary links. Shared branding, System/Light/Dark preferences, and responsive layouts match the other pages. See the [signup handoff](VIDEO-ACCOUNT.md#create-account-page).

Legacy Supabase sign-in, recovery, session lookup, password update, and sign-out remain alongside the independent signup preview. They require an explicit migration to the selected backend's identity service; GraphQL alone does not implement authentication. Auth SDK loading is lazy on account/login pages; the password-update module imports it directly. Signup does not call Supabase or register a user. Browser checks mock the client and do not verify live auth or password-update completion.

## Navigation cleanup

The Studio has one account entry: the sidebar profile link, shown as an accessible avatar on mobile. The header keeps Log in and Customize. The focus-only Explore shortcut was removed; the brief and New mood board remain available. The soundtrack section uses one introduction plus an import action, and the repeated demo footer was removed. Account customization uses its existing tab navigation rather than an extra Back to profile button.

`js/customize.js` shares appearance binding across pages and builds the auth-page Customize dialog from one field definition. System/Light/Dark, accent, layout, spacing, edges, typography, canvas, and reading size all use the existing stored preferences; no setting or saved board was reset.
