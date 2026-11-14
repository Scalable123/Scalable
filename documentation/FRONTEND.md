# Scalable — The Studio frontend documentation

Source baseline: commit `aa1784a` on `front-end-design`. Audited against the application source on November 14, 2026.

T001 adds the optional ASP.NET Core Pinterest API, live async import mode, account status, and Pinterest research exclusion. Live provider access remains disabled pending approved configuration; see [setup and restrictions](../docs/PINTEREST-INTEGRATION.md) and [decisions](../docs/T001.md).

This document records the implemented pages, controls, state transitions, data structures, validation, persistence, styling, modules, deployment configuration, tests, and remaining service connections. Behavior described as **implemented** exists in this checkout. Routes described as **proposed** are backend contracts to implement; they are not running endpoints. Supabase authentication calls and explicitly loaded YouTube embeds are identified separately from local previews.

## Contents

1. [Application structure and runtime](#1-application-structure-and-runtime)
2. [Page routes and navigation](#2-page-routes-and-navigation)
3. [Studio workspace](#3-studio-workspace)
4. [Research and board lifecycle](#4-research-and-board-lifecycle)
5. [Saved boards and deletion](#5-saved-boards-and-deletion)
6. [Appearance and responsive design](#6-appearance-and-responsive-design)
7. [Audio imports and music-service previews](#7-audio-imports-and-music-service-previews)
8. [Pinterest board import](#8-pinterest-board-import)
9. [Video imports and playback](#9-video-imports-and-playback)
10. [Login, signup, recovery, and account pages](#10-login-signup-recovery-and-account-pages)
11. [Browser storage and media lifetime](#11-browser-storage-and-media-lifetime)
12. [Board and reference data fields](#12-board-and-reference-data-fields)
13. [JavaScript module interfaces](#13-javascript-module-interfaces)
14. [Existing external connections](#14-existing-external-connections)
15. [Required backend and API connections](#15-required-backend-and-api-connections)
16. [Accessibility and interaction conventions](#16-accessibility-and-interaction-conventions)
17. [Local development and GitHub Pages](#17-local-development-and-github-pages)
18. [Validation and test coverage](#18-validation-and-test-coverage)
19. [Current implementation gaps](#19-current-implementation-gaps)
20. [Source and asset reference](#20-source-and-asset-reference)

## 1. Application structure and runtime

The selected frontend is **The Studio**. The other two initial design explorations and the design-switching interface have been removed. The interface uses warm paper backgrounds, forest green controls, terracotta accents, serif headings, an image collage, palettes, songs, ambient sound directions, and imported media references.

The application consists of static HTML, one shared CSS file, and native JavaScript ES modules. There is no frontend framework, bundler, transpilation step, application server, or client-side route framework. Each account/authentication screen is a separate HTML page. Account sections use URL hashes. Studio import shortcuts use a query parameter.

`backend/Scalable.Api` now implements an optional .NET 10 / ASP.NET Core API for Pinterest OAuth, connection status, and authorized owned-board/pin reads, with encrypted SQLite credential storage. It can host this frontend at `/frontend`. Cloud board saving, general profile/SQL APIs, and server AI/media research remain planned. Static-only hosting retains all local previews.

The browser can run the local Studio features without contacting an AI or media provider. Authentication uses a remotely loaded Supabase browser SDK when an authentication operation is requested. The browser needs access to that CDN and the configured Supabase project for those operations. YouTube is contacted when a user explicitly loads an embedded player or follows an external source link.

The root `package.json` declares `@supabase/supabase-js` with version range `^2.119.0`. The served authentication client imports the pinned `2.119.0` browser module from jsDelivr; it does not resolve the package through `node_modules`. Playwright is development tooling and is not declared by this package file. There are no npm start, build, or test scripts.

## 2. Page routes and navigation

Paths in this table are relative to the repository's hosted root. Serving only `frontend/` makes that directory the local URL root instead.

| File / route                                                        | Implemented responsibility                                                                                      | Script entry point                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [`index.html`](../index.html)                                       | Landing page; immediate HTML refresh to `./frontend/login.html`, visible login fallback link, Studio brand link | `frontend/js/theme-init.js`            |
| [`frontend/index.html`](../frontend/index.html)                     | Studio prompt, board canvas, filters, saved boards, customization, and import dialogs                           | `js/app.js` and `js/theme-init.js`     |
| [`frontend/login.html`](../frontend/login.html)                     | Supabase password sign-in, recovery request, create-account link, demo account shortcut                         | `js/account.js` and `js/theme-init.js` |
| [`frontend/signup.html`](../frontend/signup.html)                   | Registration form validation and confirmation preview                                                           | `js/account.js` and `js/theme-init.js` |
| [`frontend/recover.html`](../frontend/recover.html)                 | Standalone recovery-form preview; sends no email                                                                | `js/account.js` and `js/theme-init.js` |
| [`frontend/update-password.html`](../frontend/update-password.html) | Supabase session-dependent password update following a recovery link                                            | `js/update-password.js`                |
| [`frontend/account.html`](../frontend/account.html)                 | Local profile, Customize, connection previews, session display, and security controls                           | `js/account.js` and `js/theme-init.js` |

The landing redirect uses a meta refresh rather than requiring JavaScript. A user can visit the Studio and account pages directly. Landing on login is navigation behavior, not access control. The Studio does not require an authenticated session.

The static Studio logo combines the letter `s`, an inline SVG star, `scalable`, and an accent period. The landing, Studio, login, signup, recovery, and account pages use this shared visual construction. The password-update page currently has no branded header.

### 2.1 Account sections

| Account hash   | Visible panel                                                      | Focus destination after a hash change |
| -------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `#profile`     | Display name/email, local avatar, saved-board count                | `#profile-title`                      |
| `#appearance`  | Shared Customize settings                                          | `#account-appearance-title`           |
| `#connections` | Pinterest, music services, and YouTube preview links               | `#connections-title`                  |
| `#security`    | Login/signup links, password-settings preview, end-session control | `#security-title`                     |

An absent or unknown hash shows Profile. Active navigation gets `aria-current="page"`. Nonselected panels are hidden. Initial panel selection does not force focus; later hash changes focus the selected heading.

### 2.2 Studio import links

The account connection cards link to `index.html?import=pinterest`, `index.html?import=audio`, or `index.html?import=video`. After the initial Studio board is ready, `app.js` opens the matching dialog and removes only the recognized `import` parameter with `history.replaceState`. Other query parameters and the hash are preserved. Unknown import values are not opened.

Music-service cards open the audio importer without authorization; YouTube opens the video importer. Pinterest opens the importer, which checks real status when the approved backend is available. Only its explicit Link action begins OAuth. Recognized `pinterest=connected|denied|failed` callback outcomes are consumed without retaining credentials in the URL.

## 3. Studio workspace

Source: [`frontend/index.html`](../frontend/index.html), [`frontend/js/app.js`](../frontend/js/app.js).

### 3.1 Workspace shell

The top bar identifies The Studio and contains Log in and Customize. The sidebar contains the brand, New mood board, Saved boards with a count, an About this prototype button, and the account-profile link. Decorative sidebar copy and artwork are part of the Studio design. The workspace header shows a breadcrumb and a “Sample content · no live AI” badge. The footer identifies Scalable / The Studio.

The profile link initially displays “Your creative space” with a `Y` avatar. At Studio startup, a valid locally saved profile name replaces that text, and the first Unicode character of the trimmed name becomes the uppercase avatar. This is local profile personalization, not a live identity lookup.

About this prototype opens the general dialog. Its text covers customization, samples, local storage, existing Supabase sign-in, optional approved Pinterest imports, the Pinterest AI exclusion, and remaining cloud/research work.

### 3.2 Section 01 — The Starting Point

| Control                                   | Behavior and constraints                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Creative brief `#prompt`                  | Required textarea; maximum 2,000 characters; initially populated with the coastal brief; live character counter                      |
| Reference image `#reference`              | Single JPG/JPEG, PNG, or WebP selected through a file input; up to `10 × 1024 × 1024` bytes; MIME allowlist and browser decode check |
| Reference preview                         | Filename and decoded image; Remove reference image revokes its object URL and clears the input                                       |
| Import Pinterest board                    | Opens the Pinterest import workflow; disabled until a board is available                                                             |
| Imported-pin status                       | Shows the current number of sample pins and distinct source-board IDs, with a reminder to save                                       |
| Coastal calm / After hours / Earth & form | Replace the brief with the corresponding fixed prompt; update the character count and focus the textarea                             |
| Song recommendations                      | Independent checkbox controlling generated song picks; checked by default                                                            |
| Ambient sounds                            | Independent checkbox controlling the generated sound concept; checked by default                                                     |
| Explore this feeling                      | Submits the trimmed prompt, reference `File`, and both audio-option booleans to the board-service boundary                           |
| Input error                               | Live alert for blank briefs, unsupported or undecodable images, and research failures                                                |

The fixed prompts are:

| Prompt chip  | Stored prompt text                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Coastal calm | A quiet coastal escape. Misty mornings, weathered stone, soft greens. A little nostalgic, a little wild.              |
| After hours  | A cinematic city after midnight. Deep indigo, warm amber light, grainy photography, and atmospheric electronic music. |
| Earth & form | An earthy design studio. Sculptural forms, warm clay, natural textures, and quiet instrumental music.                 |

The reference image remains a separate prompt input. It is not inserted into the board, persisted with the board, uploaded, or analyzed by the demo service. Image-only submission is not supported: the prompt must contain non-whitespace text. The upload interface is a file picker; drag-and-drop is not implemented.

### 3.3 Section 02 — A World Taking Shape

This section contains the board title/description, Save board, the video import entry point, content filters, collage, and video-reference list. The displayed `SC—001` board index and “New exploration” breadcrumb are decorative/static labels rather than generated saved-board identifiers.

| Filter     | Content shown                                              |
| ---------- | ---------------------------------------------------------- |
| Everything | All board item types; count equals `board.items.length`    |
| Images     | Generated sample photographs and imported Pinterest images |
| Palette    | Palette items with named HEX swatches                      |
| Songs      | Curated song picks and imported song references            |
| Sounds     | Generated ambient concepts and imported ambient references |
| Videos     | YouTube and local-video references                         |

Filters update their `aria-pressed` state. Selecting a filter does not edit or save the board. Empty views provide content-specific instructions. Notes have no dedicated filter and appear in Everything. Songs, imported sounds, and videos render in their own lists; the general grid is hidden when a selected media-only view has its corresponding list content. The soundtrack import entry point remains available when result lists are empty or hidden.

#### Image cards

Image cards show photography, a title, a source link, and a pin toggle. Source links open a new tab with `noopener noreferrer`. Pinning updates `pinned`, accessible pressed state, tooltip/label text, the save label, and a toast. Generated image pins survive a refinement when the next generated image has the same ID. Imported Pinterest cards also show their sample/source-board badge and an individual removal control.

Generated images cannot currently be removed through the UI. Pinning is a preservation signal during refinement; it does not reorder or drag cards. Imported images can be removed and later reimported.

#### Palette cards

Each swatch preserves its actual HEX value independently of interface appearance. Clicking writes the HEX string using the Clipboard API. If clipboard access fails, a dialog displays the name and HEX value for manual selection/copying. Palettes are not editable. The card footer currently uses fixed editorial copy, including “The colors of quiet,” for every collection.

#### Note cards

Each demo board has a short collection-specific text note. It is rendered as display text and cannot be edited directly. Notes remain part of the saved board items.

#### Ambient concept cards

The generated sound card displays a title, decorative waveform, and “Sound concept · no audio.” Its information control explains the direction and the future recording-provider dependency. The waveform is decorative and is not an audio visualization. There is no recording or playback on these generated concepts.

### 3.4 Section 03 — Find Your Soundtrack

The soundtrack section contains Import audio, curated/imported songs, and imported ambient references. Music/audio import is located here; Pinterest import stays in section 01 and video import in section 02.

Curated song cards show title, artist, fit explanation, genre/vocal tags, and a “Find on Spotify” catalog-search link. The renderer only displays a curated link when it parses as HTTPS on `open.spotify.com` with a `/search/` path. These are catalog searches; they are not verified track IDs, embedded players, API results, or proof of streaming availability.

The song-list label changes from “Curated sample picks” to “Samples & your references” when an imported song is present. Imported songs and sounds expose their provider link or local player and a removal action. Full import behavior is in section 7.

## 4. Research and board lifecycle

Source: [`frontend/js/board-service.js`](../frontend/js/board-service.js), [`frontend/js/app.js`](../frontend/js/app.js).

### 4.1 Initial load and sample generation

Startup initializes icons, import callbacks, customization, event handlers, profile display, the character count, and the saved-board count. It then requests the initial sample board from the populated prompt. The board has a generated UUID, an ISO creation timestamp, `mode: "demo"`, research-option booleans, and JSON-compatible items.

`DemoBoardService.research()` waits approximately 650 milliseconds and chooses a fixed collection using case-insensitive prompt matching. Night matching has priority: `night`, `midnight`, `city`, or `indigo` selects the night collection. Otherwise `earth`, `clay`, `sculptur`, or `studio` selects earth. All remaining text selects coast. Uploaded image contents do not affect this decision.

Every collection uses the same three local photographs and the same structural item IDs. Collection selection changes title, description, note, colors, generated ambient direction, and song picks.

| Collection | Board title           | Description                                                   | Note                                  | Ambient concept                                                                       |
| ---------- | --------------------- | ------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| coast      | Somewhere slower      | Coastal stillness. Organic textures. Room to breathe.         | Less noise. / More feeling.           | Ocean / Tides — Slow waves, a little wind, a distant shoreline                        |
| night      | When the city sleeps  | Deep shadows. Electric atmosphere. A different kind of quiet. | Stay a little / after dark.           | Rain / City — Distant rain, soft city hum, an occasional passing car                  |
| earth      | A softer kind of form | Grounded colors. Honest materials. Space for the unexpected.  | Made of earth. / Full of possibility. | Wind / Leaves — A breeze through leaves, birds in the distance, a quiet outdoor space |

Slashes separating note phrases in this table represent the stored line break.

| Collection | Ordered palette: name and HEX                                                           |
| ---------- | --------------------------------------------------------------------------------------- |
| coast      | Pine `#475C53`; Sage `#899A88`; Lichen `#C8C8B5`; Oat `#E6DFD0`; Clay `#B8816B`         |
| night      | Midnight `#202632`; Slate `#4C5472`; Haze `#8C7B93`; Copper `#B78264`; Glow `#E5CCAC`   |
| earth      | Umber `#72533F`; Terracotta `#AF8164`; Sand `#C8B494`; Linen `#DBD3BD`; Olive `#7D856C` |

| Collection | Song            | Artist          | Fit explanation                                           | Tags                            |
| ---------- | --------------- | --------------- | --------------------------------------------------------- | ------------------------------- |
| coast      | Holocene        | Bon Iver        | Wide-open space and a reflective vocal for a slower pace. | Indie folk · vocals             |
| coast      | Pink Moon       | Nick Drake      | Intimate acoustic guitar with a quietly nostalgic mood.   | Folk · vocals                   |
| coast      | Sunset Lover    | Petit Biscuit   | Soft electronic textures with a little coastal warmth.    | Electronic · instrumental       |
| night      | Nightcall       | Kavinsky        | Neon synths and late-night momentum.                      | Synthwave · vocals              |
| night      | Intro           | The xx          | Minimal guitar and a spacious, cinematic pulse.           | Indie electronic · instrumental |
| night      | Open Eye Signal | Jon Hopkins     | A patient electronic build for an after-hours atmosphere. | Electronic · instrumental       |
| earth      | Bloom           | The Paper Kites | Gentle acoustic detail and an intimate, handmade feel.    | Indie folk · vocals             |
| earth      | A Walk          | Tycho           | Warm layers and an easy rhythm to shape ideas around.     | Electronic · instrumental       |
| earth      | Says            | Nils Frahm      | Gradual, tactile layers with room to think.               | Ambient · instrumental          |

A generated board contains three images, one palette, and one note, plus one sound concept if requested and three songs if requested. That produces nine items with both options enabled, eight with songs only, six with sound only, or five with neither. Imported items increase these totals.

### 4.2 Explore and refinement

Submitting a nonblank brief increments `boardVersion`, disables the Explore button, changes its label to “Composing a sample…”, sets the grid's `aria-busy` state, and clears the input error. A successful response is applied only if its captured version still matches the current board version.

Before replacement, matching pinned generated images are carried into the next board. All items with `imported: true` are appended to the new generated items, so imported audio, Pinterest images, and videos survive refinement. A new generated board has a new UUID; exploring a previously saved board creates a new direction to save rather than updating the old saved identity automatically. The filter returns to Everything and Save board becomes available as an unsaved action.

On a research error, the current board stays visible and the input error invites retry. The matching request's completion restores the button and busy state. A stale response cannot reset the interface for a newer board operation. This version guard prevents local result replacement; it is not cancellation of a server job.

### 4.3 New mood board

New mood board invalidates old research results, resets the research controls, pauses local media, releases the current audio/video object URLs, clears the prompt and reference image, clears old image pin states, and re-enables both song/sound options. It creates a fresh coastal sample with an empty prompt, resets the filter, and focuses the prompt.

This action replaces the unsaved canvas without a confirmation dialog. It does not delete any saved board. A fresh sample remains visible until the user explores their own brief; it is not a blank item array.

### 4.4 Open and replacement behavior

Opening a saved board invalidates in-flight research, restores its prompt/options/items, removes the separate uploaded reference image, resets the filter, and closes the saved-board dialog. Old saved boards without research options derive checkbox values from their item types. Local audio/video objects are retained only for item IDs belonging to the opened board. Reloading the page creates the default sample rather than automatically opening the last active board.

Creating a new board through Pinterest similarly invalidates older research and discards the previous unsaved canvas and media registry entries. Its initial items are only the imported pins; further exploration supplies generated palette/song/sound content.

## 5. Saved boards and deletion

Sources: `DemoBoardService`, `renderSavedBoards()`, `updateSavedCount()`, and `#delete-board-dialog`.

### 5.1 Save and reopen

Save board writes a structured clone of the current board to `scalable.boards.v1`. A matching ID is replaced; the saved record is placed at the beginning of the list. New IDs add new records. There is no autosave. Pin changes, reference removal/import, and other canvas changes require Save board to persist.

On success, the save label reads “Saved locally”, the sidebar count refreshes, and a toast explains media persistence. A storage read/write failure reports that the board could not be saved. Saving never uploads files or writes SQL.

Saved boards opens “Your saved directions.” Each row contains the first image thumbnail, title, local creation date, Open, and Delete. A decorative thumbnail replaces the image when the board has none. Titles are assigned as text. The displayed count comes from a fresh storage read. The empty state invites the user to save a first board.

Open restores the board as described in section 4.4. A missing/unreadable storage list produces a toast. The count shows an em dash when it cannot be read. There is no search, rename, folder, bulk-delete, cloud-save, or export action in this list.

### 5.2 Delete confirmation

Delete opens a separate native alert dialog over the saved-board list. Its heading is **“Are you sure you want to delete this mood board?”** The dialog identifies the selected board and explains that the saved copy will be removed from this browser, cannot be restored through an undo action, and leaves an open canvas as an unsaved draft.

Cancel receives initial focus. Cancel and Escape close the confirmation without changing storage. Enter with the default Cancel focus also leaves the saved copy untouched. Native focus restoration returns to the originating action on cancellation. Clicking Delete in the list never immediately deletes a record.

Confirming **Delete mood board** performs these operations:

1. Capture the selected board identity and list position.
2. Disable Cancel and Delete, change the confirmation label to “Deleting…”, and reject duplicate submissions. Escape cannot dismiss the dialog during the write.
3. Read raw saved records and remove records matching that ID. Unrelated records are kept unchanged, including legacy item representations.
4. If that ID was already absent, treat it as already deleted rather than restoring or recreating it.
5. If the deleted ID is currently open, invalidate old research and give the retained canvas a new UUID and timestamp. Keep all current items and imported media in memory. Mark it Save board so a later save creates a fresh saved record.
6. Refresh the count and list, close the confirmation, and focus the nearest remaining Open action or the list's Close button when empty.
7. Announce deletion or the already-deleted state in a toast, including the retained-draft behavior when applicable.

If the storage write fails, confirmation stays open, buttons are restored, Cancel gets focus, and an alert explains that deletion could not be confirmed. The current canvas is retained. If deletion succeeds but refreshing the list fails, the list explains that the saved copy was removed and asks the user to reopen Saved boards.

Deletion affects the local saved-board record. It does not delete original local files, provider content, other saved boards, profile/preferences, or the currently open canvas. The future HTTP adapter has a DELETE method, but the active board service performs local deletion only.

Previews: [saved boards](../docs/design-previews/studio-saved-boards.png) and [confirmation](../docs/design-previews/studio-delete-board.png).

## 6. Appearance and responsive design

Sources: [`appearance.js`](../frontend/js/appearance.js), [`theme-init.js`](../frontend/js/theme-init.js), [`customize.js`](../frontend/js/customize.js), [`styles.css`](../frontend/styles.css).

### 6.1 Available settings

| Stored field | Allowed values                | Default       | Applied behavior                                                     |
| ------------ | ----------------------------- | ------------- | -------------------------------------------------------------------- |
| `theme`      | `system`, `light`, `dark`     | `system`      | Resolve appearance from device or explicit override                  |
| `accent`     | `terracotta`, `olive`, `plum` | `terracotta`  | Interface accent and button color tokens                             |
| `density`    | `comfortable`, `compact`      | `comfortable` | Canvas gaps, row dimensions, selected content spacing                |
| `corners`    | `soft`, `square`              | `soft`        | Shared card radius                                                   |
| `typography` | `editorial`, `modern`         | `editorial`   | Georgia/Times serif treatment or clean sans serif headings           |
| `layout`     | `collage`, `grid`             | `collage`     | Editorial placement or even board grid                               |
| `canvas`     | `plain`, `dotted`             | `plain`       | Plain paper or dotted main-area background                           |
| `textSize`   | `standard`, `large`           | `standard`    | Increased reading sizes for specified copy, form, and card selectors |

Theme belongs inside Customize rather than in a separate navigation section. Studio has its static Customize dialog. Login, signup, and standalone recovery receive a shared dynamically created Customize dialog. The account page provides the same settings in its Customize panel. Changes apply on control change; Done and Close dismiss the dialog without reverting. Reset to defaults restores all eight default values without touching boards, imports, or profiles.

Preferences are validated per field. Unknown fields and unsupported values are ignored. Missing or malformed stored values fall back to defaults, so older stored preferences gain the newer settings. Save failure still applies the preferences for the current visit and reports that browser persistence is unavailable.

### 6.2 Device and page synchronization

`theme-init.js` runs in the HTML head before stylesheet paint. It reads only the stored theme choice, falls back to System, resolves `prefers-color-scheme: dark`, and sets `data-theme` and `color-scheme` on the root element. This limits a wrong-theme flash on pages that include it.

The full appearance module sets `data-theme`, `data-accent`, `data-density`, `data-corners`, `data-typography`, `data-layout`, `data-canvas`, and `data-text-size`, updates browser color-scheme and the theme-color meta tag, and notifies subscribed controls. Device changes update the interface only while System is selected. Both modern MediaQueryList change events and the older `addListener` API are handled.

Storage events synchronize changed/reset preferences across same-origin tabs. A restored back/forward-cache page rereads preferences on `pageshow`. Reset/cleared storage produces default settings. CSS has a device-dark fallback when no `data-theme` attribute exists and JavaScript is unavailable.

The landing page includes only early theme initialization. The password-update page includes neither early initialization nor the full appearance module and has no theme-color meta tag or Customize control. It therefore does not currently restore stored appearance settings; only applicable CSS defaults/device fallback style it.

### 6.3 Theme tokens

The stylesheet uses Arial/Helvetica for base interface text and Georgia/Times New Roman for editorial serif text. Fonts are system fonts; no external font request is required.

| Token                            | Light                 | Dark                  |
| -------------------------------- | --------------------- | --------------------- |
| `--bg`                           | `#f6f4ee`             | `#1c211e`             |
| `--panel`                        | `#eeede5`             | `#262e28`             |
| `--ink`                          | `#30382f`             | `#e8e7dd`             |
| `--muted`                        | `#686e62`             | `#acb3a5`             |
| `--line`                         | `#ddded3`             | `#424b40`             |
| `--accent`                       | `#a64b35`             | `#e5a286`             |
| `--button`                       | `#344737`             | `#c6d3b3`             |
| `--on-button`                    | `#ffffff`             | `#20261d`             |
| `--card`                         | `#e8e6dc`             | `#30392f`             |
| `--palette-bg` / `--palette-ink` | `#e6e6db` / `#3c4439` | `#30392e` / `#e0e5d7` |
| `--note-bg` / `--note-ink`       | `#ddd9ca` / `#535b47` | `#39382c` / `#ded9c4` |
| `--sound-bg` / `--sound-ink`     | `#d7dece` / `#3b4d38` | `#2d3b2d` / `#d9e6ce` |
| `--accent-on`                    | `#ffffff`             | `#241d15`             |

Olive uses light accent `#576a36`, light button `#4b5d32`, and dark accent/button `#bdce95`. Plum uses light accent `#775077`, light button `#674568`, and dark accent/button `#d4acd1`. Soft corners use a 5px shared radius; Square sets it to zero. Comfortable canvas gaps use 10px; Compact uses 6px. Board palette swatches retain their supplied HEX values under every theme/accent.

### 6.4 Layout behavior

The desktop shell uses a sidebar, a prompt column, and a flexible board area. The default board has named placement hints for hero, detail, and water images plus palette, note, and ambient concept. Grid mode gives cards uniform grid treatment. Pinterest content introduces additional layout rules so arbitrary numbers of imported pins fit the board. Filtered grids have separate rules from the unfiltered collage.

The stylesheet contains responsive groups at a minimum width of 1600px and maximum widths of 1150px, 1100px, 800px, 600px, and 500px, plus an 801–1150px range. At narrower widths, the workspace becomes a vertical flow, card arrangements adapt, import panels stack, auth split layouts become one column, account navigation reflows, and dialogs fit the viewport. Saved-board actions wrap below the title on small screens.

On mobile, the decorative sidebar material and About control are hidden; a compact profile avatar remains as the account entry. Saved boards remains accessible through the responsive sidebar navigation rules. The save label may collapse visually at intermediate widths while the save button keeps its accessible label. Larger reading size affects specified text selectors rather than a global browser zoom.

Reduced-motion CSS removes transitions, animations, and smooth scrolling for `prefers-reduced-motion: reduce`. CSS layers later in the shared stylesheet intentionally override earlier base layout rules; their source order matters.

## 7. Audio imports and music-service previews

Source: [`frontend/js/audio-library.js`](../frontend/js/audio-library.js). The Import audio action in section 03 opens `#audio-dialog` with three tabs: Paste a link, Local audio, and Music services. Switching tabs clears the importer status. The dialog has a Close action and native Escape dismissal. Importing leaves the dialog open and reports the result so additional references can be added.

### 7.1 Paste a link

The form accepts a required HTTPS URL up to 2,048 characters, a required title up to 160 characters, an optional artist/creator up to 120 characters, and a Song / music reference or Ambient sound reference classification. The initial classification is Song. Whitespace-only titles are rejected. The user supplies the title and artist; the frontend does not fetch metadata.

`parseMediaLink()` rejects invalid URLs, non-HTTPS schemes, embedded usernames/passwords, and custom ports. Recognized sources and resource rules are:

| Provider                | Accepted hosts                                                                                                    | Resource handling                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Spotify                 | `open.spotify.com`                                                                                                | First path segment `track`, `album`, `playlist`, or `search`, with a following segment; `track` maps to resource type `song` |
| Amazon Music            | `music.amazon.com`, `.co.uk`, `.de`, `.fr`, `.it`, `.es`, `.co.jp`, `.ca`, `.com.au`, `.in`, `.com.br`, `.com.mx` | Requires a nonempty path; first segment containing `playlist` or `album` classifies that resource, otherwise `music`         |
| Apple Music             | `music.apple.com`                                                                                                 | At least two path segments; `playlist` or `album` anywhere in the path sets that resource, otherwise `music`                 |
| SoundCloud              | `soundcloud.com`, `www.soundcloud.com`                                                                            | Nonempty path; path containing `sets` classifies as `playlist`, otherwise `sound`                                            |
| YouTube audio reference | `youtube.com`, `www.youtube.com`, `music.youtube.com`                                                             | `/watch` with `v`, or `/playlist` with `list`; resource type `video` or `playlist`                                           |
| YouTube short URL       | `youtu.be`                                                                                                        | Exactly one path segment; resource type `video`                                                                              |

Spotify localized desktop prefixes matching `intl-xx` or `intl-xx-xx` are removed. Query parameters matching `utm_…`, `si`, `ref`, `ref_…`, or `feature` are stripped, and fragments are removed. Other query parameters remain. The normalized URL is both the outbound reference and its deduplication `sourceKey`.

Unsupported hosts and short provider share-link domains are rejected; the message asks the user to expand short links in their browser. This parser validates supported reference shapes, not that a live resource exists. Its YouTube checks are less strict than the dedicated video importer: it does not require the dedicated importer's 11-character video ID or normalize start moments.

Albums and playlists remain single references. A YouTube URL added through audio import stays a song/sound reference opening its source; it does not become an embedded video card. Audio-link import performs no streaming, account authorization, download, or playlist expansion.

### 7.2 Local audio

The local-audio form accepts an optional title up to 160 characters and Song or Ambient sound, defaulting to Ambient sound. Without a custom title, the filename without its final extension becomes the title.

Files must be nonempty, have an `.mp3`, `.wav`, `.ogg`, or `.m4a` extension, and be no larger than `20 × 1024 × 1024` bytes. An audio element probes browser decoding by loading metadata. The probe times out after eight seconds. Invalid extensions, empty files, excessive size, decode errors, and timeouts produce status messages. Supported codecs depend on the browser; a filename alone does not guarantee import.

A successful import creates an in-memory object URL keyed by item ID and a JSON-safe reference containing file metadata. The current board ID is captured before asynchronous decoding. If the board changes before import finishes, the result is rejected and its new object URL released. Duplicate files are detected by filename, size, and last-modified timestamp, not by a content hash.

Cards provide native audio controls while a local URL is available. Playback pauses other local audio/video elements. Missing local files show a Reattach audio action; an attached recording has Replace file. Reattachment repeats validation, replaces the old object URL, updates file metadata/source key, rerenders the board, and marks it unsaved. Reattachment can use a different valid file; there is no identity/content-match enforcement.

The recording stays in browser memory for that page visit. Saving preserves file details, not bytes. A page reload requires reattachment. Removal releases the local URL, removes the item, and marks the board unsaved.

### 7.3 Music-service library previews

The Music services tab displays Spotify, Amazon Music, Apple Music, and SoundCloud. Every service is labeled **Not connected · frontend preview**. Preview opens a candidate library panel; no OAuth, account popup, provider API request, token storage, or real library read occurs.

Each preview contains the same two hand-picked songs: **Holocene — Bon Iver** and **A Walk — Tycho**. Neither is selected by default. Provider-specific catalog searches are generated on Spotify, Amazon Music, Apple Music, or SoundCloud. Choosing at least one song and submitting adds demo song references. Existing links are skipped. The status reports added references or that the selections already exist.

Leave preview hides the panel, clears the active provider/fixture array, and restores focus to that provider's Preview button. Closing the dialog does not establish or persist a connection. Account connection cards remain Not connected.

### 7.4 Shared import/edit behavior

Imported audio is deduplicated against imported item source keys in the current board. Imports return the canvas to Everything, mark Save board, and announce added counts. Selecting the same source as song and sound does not bypass URL deduplication. Reimporting after removal is allowed.

Nonlocal references render a validated outbound link with provider name and a new-tab announcement. Unsupported restored links show a message instead of a link. Each imported audio card has Remove. Removing a reference only edits the current canvas until it is saved. Imported references survive prompt refinement.

## 8. Pinterest board import

Source: [`frontend/js/pinterest-import.js`](../frontend/js/pinterest-import.js). Entry point: Import Pinterest board in section 01, or the account Pinterest deep link.

The dialog has Connect, Boards, Review, and Done steps with two separate modes. **Link Pinterest account** uses the configured ASP.NET API and actual account status; **Preview Pinterest connection** uses local fixtures and never claims a connection. Live use is disabled by default. Sections 8.1–8.5 describe sample behavior; section 8.6 describes the live implementation. `DemoPinterestService.listBoards()` remains a synchronous fixture clone.

### 8.1 Local board library

| Board ID          | Title              | Description                                                | Pin count |
| ----------------- | ------------------ | ---------------------------------------------------------- | --------- |
| `demo-slow-coast` | The slow coast     | Misty mornings, quiet water, and a little room to breathe. | 6         |
| `demo-earth`      | Earth & atmosphere | Natural forms and soft, grounded landscapes.               | 4         |
| `demo-after-rain` | After the rain     | Moody silhouettes, softer edges, and reflective moments.   | 5         |

| Source board       | Pin ID           | Pin title                  | Local photograph |
| ------------------ | ---------------- | -------------------------- | ---------------- |
| The slow coast     | `coast-mist`     | Mornings in the mist       | `mountains.jpg`  |
| The slow coast     | `coast-tides`    | Follow the tide            | `water.jpg`      |
| The slow coast     | `coast-ridges`   | A slower perspective       | `coast.jpg`      |
| The slow coast     | `coast-still`    | The art of standing still  | `water.jpg`      |
| The slow coast     | `coast-horizon`  | Leave a little space       | `mountains.jpg`  |
| The slow coast     | `coast-fog`      | Between sky and earth      | `coast.jpg`      |
| Earth & atmosphere | `earth-layers`   | Layers of the landscape    | `coast.jpg`      |
| Earth & atmosphere | `earth-forest`   | In the folds of the forest | `mountains.jpg`  |
| Earth & atmosphere | `earth-water`    | An organic rhythm          | `water.jpg`      |
| Earth & atmosphere | `earth-distance` | A sense of distance        | `coast.jpg`      |
| After the rain     | `rain-clouds`    | Let the clouds settle      | `mountains.jpg`  |
| After the rain     | `rain-ridges`    | Silhouettes at dusk        | `coast.jpg`      |
| After the rain     | `rain-surface`   | A reflective mood          | `water.jpg`      |
| After the rain     | `rain-air`       | A change in the air        | `mountains.jpg`  |
| After the rain     | `rain-blue`      | The last of the blue       | `water.jpg`      |

The 15 fixture pins reuse three photographs. The pin descriptions provide alt text during review and become board item descriptions. These are not Pinterest downloads or distinct images obtained from a user's account.

### 8.2 Connect step

Preview Pinterest connection opens the local Boards step. It does not redirect to Pinterest or ask for credentials. End preview clears selected board IDs, pin choices, search, destination form, and required new-title state, then returns to Connect. It does not remove references already imported onto the canvas. Connection/selection state is held in memory and resets on page reload.

### 8.3 Boards step

Search matches board title and description case-insensitively; the input is limited to 100 characters. Rows show three preview thumbnails, title, full fixture pin count, and description. A no-match state appears when the search has no results.

Board checkboxes support multiple selections. Selection persists while search changes. Select all boards selects the entire local library, including search-hidden boards. Clear selection clears all board selections. The chosen-board count updates, and Review selected boards remains disabled until at least one is chosen.

### 8.4 Review step

Review displays every pin in each chosen board, grouped by source board. Pins are selected unless individually deselected. Select every pin supports checked, unchecked, and indeterminate states. Counts update with each change. Import is disabled with zero chosen pins; its label includes the selected count.

Destination choices are Add to my current mood board or Start a new mood board. Current is the default. New reveals a required title, maximum 120 characters, with a warning that it replaces the unsaved canvas. A single selected board supplies its title by default; multiple boards use “A Pinterest-inspired direction.” Whitespace-only new titles are rejected.

Back to boards retains selection choices. Pin selections are remembered independently of board checkbox selection for the duration of the preview.

### 8.5 Conversion and import

`toBoardItems(boards, selectedPinIds)` converts selected fixture pins into image items. Each receives a new item UUID and stable `pinterest-demo:<pinId>` source key, external pin ID, source-board ID/title, `position: "pinterest"`, `imported: true`, `provider: "pinterest"`, `sourceKind: "pinterest-demo"`, and `isSample: true`. Source URLs identify the sample photography repositories. Original Pinterest pin URL and source-board URL are null; no live URLs are fabricated.

For the current destination, stable source keys skip pins already present. For a new destination, the application creates a new UUID/timestamp, selected title, description identifying the source board titles and sample import, starter prompt derived from the source board titles, both audio options enabled, and only the selected imported image items. It resets local media and the old prompt reference. Saved boards are retained.

Done reports added/skipped counts and destination. View mood board closes the importer; Import more boards returns to selection. A save is required to persist the resulting references.

Imported pins appear in Everything/Images, retain their source-board badges, can be pinned or removed, survive research refinement, and save/reopen with their metadata. Removing one permits a later reimport. Import copies references into the Studio; it does not move, edit, or delete any external board or pin.

### 8.6 Live account linking and owned-board import

`ApiPinterestService` checks anonymous deployment availability before loading Supabase for an application bearer token. An authenticated status response drives connection state. Link opens Pinterest's supported OAuth URL after server-side state creation. The server binds expiring single-use state to both the authenticated owner and an HttpOnly browser cookie; code exchange/refresh and encrypted SQL credentials remain server-side. Account cards use real status only when this backend is available. Disconnect deletes Scalable credentials and pending states; Pinterest's documented revoke endpoint is system-user-only, so the UI explicitly directs ordinary users to revoke the grant in Pinterest settings.

Board summaries load across every page. Pins are fetched only after explicit selection/review; all selected pin pages must succeed before review or canvas commit. Progress, Cancel, dialog-close abort, empty, denied, expired, forbidden, rate-limit, and retry states preserve the current canvas. Video/carousel/missing-image pins are excluded and counted. Only boards owned by the linked account are exposed. The backend validates board IDs/ownership and protects pagination cursors for the user/resource. Bounded traversal fails visibly rather than claiming partial success.

Live image references use `sourceKind: "pinterest-api"`, `sourceKey: "pinterest:<id>"`, `isSample: false`, `researchAllowed: false`, original Pin/creator links, `sourceBoards`, `importedAt`, and unknown reuse rights. Deduplication merges board associations. Previews use approved HTTPS `pinimg.com` URLs without referrers; no media download/cache is implemented. Import/save remains local, with no durable cloud import jobs.

Pinterest is excluded from AI research, crawling, discovery, image analysis, and training. Imported items are retained on the canvas after research completes, never included in the request. Live board metadata is never turned into an AI prompt; new live-import boards start with a blank brief. `research-policy.js` rejects Pinterest/pin.it/pinimg URLs at both research adapters and rejects tagged structured references. The backend has no research/search endpoints. Future AI workers must enforce this independently on the server, including redirects, tool results, and derived media.

See [Pinterest setup, permissions, API, limits, and tests](../docs/PINTEREST-INTEGRATION.md). Mock tests do not prove live provider approval or legal permission; both `Pinterest__Enabled` and `Pinterest__ImportUseApproved` default to false.

## 9. Video imports and playback

Source: [`frontend/js/video-library.js`](../frontend/js/video-library.js). The section 02 Import video button opens `#video-dialog` with YouTube link and Local video tabs. Both support Close, native Escape, status feedback, and repeated imports.

### 9.1 YouTube link import

The form requires an HTTPS video URL up to 2,048 characters and a nonblank title up to 160 characters. The user provides the title; no thumbnail, title, or other metadata lookup occurs.

`parseYouTubeLink()` rejects non-HTTPS links, URL credentials, custom ports, unsupported hosts/shapes, malformed video IDs, and invalid time values.

| Accepted host                                                          | Supported video path                           |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| `youtu.be`                                                             | Exactly one video-ID segment                   |
| `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com` | `/watch?v=…`, `/shorts/<id>`, or `/embed/<id>` |

Video IDs must contain exactly 11 ASCII letters, digits, underscores, or hyphens. Playlist-only, channel, and account-library imports are unsupported. A watch URL containing a playlist parameter is treated as its single video reference, not as a playlist import.

Start time comes from `t`, otherwise `start`, otherwise zero. Integer seconds and hour/minute/second suffix combinations are recognized. The result must be a safe integer no greater than 604,800 seconds. Unrecognized time syntax is rejected. URL fragments are not interpreted as time.

The parser produces a canonical HTTPS `www.youtube.com/watch` source URL and a `www.youtube-nocookie.com/embed` URL, carrying a positive start time where applicable. The persisted item stores the canonical source, video ID, numeric start time, and source key `youtube:<videoId>:<startSeconds>`. Equivalent links to the same video/start are duplicates; different starts are separate references.

### 9.2 On-demand embedded players

Adding or restoring a YouTube reference does not create a network player or load a remote thumbnail. The card initially shows a local placeholder and Load YouTube player. Pressing it creates a titled iframe using the reparsed canonical source and privacy-enhanced embed host. The iframe allows encrypted media, picture-in-picture, and fullscreen; it sets `strict-origin-when-cross-origin` referrer policy.

Unload player removes the iframe and restores the placeholder. Open on YouTube remains available as an external fallback when embedding is restricted, the resource is unavailable, or network access fails. The interface explains that loading the player contacts YouTube. No YouTube API key, OAuth session, or account connection is used.

Rerendering the board, changing filters, or replacing the board removes iframe elements and requires an explicit player load again. Local media coordination does not control YouTube playback inside an iframe. There is no YouTube download, audio extraction, or file persistence feature.

### 9.3 Local video

Local video accepts `.mp4`, `.webm`, or `.mov`, requires nonzero size, and caps size at `100 × 1024 × 1024` bytes. A video element probes metadata for up to ten seconds and requires positive video width and height, rejecting audio-only files masquerading as video. Decode support depends on browser/container/codec support.

The optional title is limited to 160 characters and defaults to the filename without the final extension. The item records filename, size, MIME type, last-modified time, dimensions, and finite duration (or null). Its deduplication key is `video-file:<name>:<size>:<lastModified>`.

The current board ID is captured during async validation; completing an import for a replaced board is rejected and the new object URL released. Duplicate videos are skipped. A successful import returns to Everything and marks the board unsaved.

Native video controls play the in-memory recording inline. Playing pauses other local audio/video elements. After reload, the card asks for Reattach video. Replace video file and Reattach video repeat validation, update metadata/source key, and require Save board to persist metadata changes. Reattachment need not match the original bytes.

Remove video edits the canvas, releases its object URL, and returns focus to Import video. Video imports survive refinement and save as metadata/references; file bytes and blob URLs are not persisted.

## 10. Login, signup, recovery, and account pages

Sources: [`account.js`](../frontend/js/account.js), [`supabaseClient.js`](../frontend/js/config/supabaseClient.js), [`update-password.js`](../frontend/js/update-password.js), and the corresponding HTML pages.

### 10.1 Supabase client loading and configuration

`account.js` loads the Supabase client lazily and caches the import promise. Failed imports clear the cache so a later operation can retry. This keeps signup validation, appearance, navigation, and standalone recovery preview usable without the authentication SDK.

`supabaseClient.js` imports `createClient` from the pinned jsDelivr browser module and reads `url` and `publishableKey` from `frontend/js/config/supabase-config.js`. It throws when either is absent. Its auth configuration enables `persistSession`, `autoRefreshToken`, and `detectSessionInUrl`. Project-specific values are not reproduced here. The browser configuration must contain only the intended publishable client configuration; server/service-role secrets do not belong in this file.

`update-password.js` imports this module directly rather than using the lazy helper. It therefore depends on the CDN/client being available at page startup.

### 10.2 Login

The login form requires an email address of at most 254 characters and a password of 8–128 characters. Native HTML validation applies. The email is trimmed before submission. Show/Hide toggles the password input type, visible label, pressed state, and accessible label. This toggle is hidden until JavaScript initializes it.

Submit displays Signing in and calls `supabase.auth.signInWithPassword({ email, password })`. A returned auth error produces a neutral sign-in failure. A thrown SDK/network error reports temporary unavailability and suggests the demo account. Success resets the form and navigates to `account.html`.

The app does not copy the password into its local profile or board storage. Supabase session persistence is separate from these application records. The handler currently does not disable sign-in during an in-flight request.

Create an account links to `signup.html`. Back to Studio and the brand link go to the Studio. Customize opens the shared appearance dialog.

Explore the demo account writes `scalable.demoSession = "preview"` to sessionStorage when available and opens `account.html`. This flag neither creates nor clears a Supabase session and is not an authorization check. The account preview remains accessible when storage is blocked.

The HTML form fallback points to the account page with GET. Login inputs have no form `name` attributes, so their values are not serialized into that fallback URL. Without JavaScript, following or submitting a navigation path does not authenticate the user.

### 10.3 Password recovery requested from login

With JavaScript enabled, Forgot password uses the email already entered on login. An empty value focuses the email and asks for one. The handler calls `supabase.auth.resetPasswordForEmail(email, { redirectTo })`, where `redirectTo` is an absolute URL for sibling `update-password.html` under the current hosting path.

A returned error or thrown failure reports inability to send instructions. Success uses neutral wording: if the account exists, recovery instructions are on the way. Sending actual email depends on Supabase project/email configuration, allowed redirect URLs, rate limits, and delivery. The handler checks for a nonempty string; the backend auth service remains responsible for authoritative validation.

The anchor's regular href is `recover.html`. Without the enhanced click handler, it opens the separate static recovery preview instead.

### 10.4 Standalone recovery preview

`recover.html` has a required sample email input capped at 254 characters. Submitting resets the form, reveals a focused confirmation, and explicitly states that no email was sent. It does not call Supabase or a .NET endpoint. It provides Customize, Back to Studio, and Return to login.

Its fallback form action returns to `recover.html#recovery-info`; the input has no name, so it is not added to GET parameters. The static page copy describes this preview only and must not be taken to describe the live Forgot password hook on login.

### 10.5 Password update after recovery

`update-password.html` contains two required 8–128 character password inputs with `autocomplete="new-password"`. On module load, `getSession()` checks whether Supabase exposes a session. Without one, the form is hidden and an expired/invalid-link message is displayed.

Submitting compares the password strings. A mismatch displays “Passwords do not match.” A match calls `supabase.auth.updateUser({ password })`. A returned error asks the user to request a new recovery link. On success it awaits `signOut()`, resets the form, and reports that the password was updated and sign-in is available.

This page currently checks for a session, not a recovery-specific event or app-defined recovery state. It does not redirect to login, provide a login link, disable duplicate submissions, or wrap SDK calls in network-exception handling. Its appearance/branding differences are recorded in sections 2 and 6. No existing browser suite exercises this live recovery-completion page.

### 10.6 Create-account validation preview

Signup collects a display name (required, maximum 80 characters), email (required, maximum 254), sample password (required, 8–128), and confirmation (required, 8–128). Whitespace-only display names are invalid. Confirmation input changes set a custom validity message, `aria-invalid`, and inline mismatch status. Password and confirmation have independent Show/Hide controls.

Submit is initially disabled until the validation handlers are ready. A successful validation resets the form, returns both inputs to password masking, resets toggle labels/states and mismatch state, hides the form, and focuses the result panel. The result says no account was registered and no form data was saved. It links to the account preview; surrounding navigation links to login. Try the form again hides the result and returns to an empty form with the display name focused.

No `signUp`, registration API, email dispatch, credential storage, local-profile update, or demo-session creation is performed. Existing local boards/profile/preferences remain intact. Form fields have no names, the fallback action is local, and JavaScript-disabled users receive a notice with ordinary navigation links. This page is validation only even though login already has live Supabase integration.

### 10.7 Account profile

The account defaults are display name “Your creative space” and email `you@example.com`. It restores a locally saved name only if it is a nonblank string no longer than 80 characters, and email only if it is a string no longer than 254. Invalid/corrupt storage falls back to defaults.

The Profile panel shows a derived first-character avatar, display name, editable local display name/email fields, a save action, and the browser-origin saved-board count. The form uses native required/email/length checks and trims submitted values. A blank name is explicitly rejected. Saving writes `scalable.profile.v1` and reports that no login identity or cloud account changed. If storage fails, changes remain for the current visit and the status explains persistence failed.

The account also calls `getSession()`. If a session exists, the heading status becomes “Authenticated session”, and its email is copied into the in-memory profile display. This does not automatically save the profile or turn the editable email form into an identity-change API. Authentication-client failure changes the status to “Local preview · authentication unavailable.” There is no redirect guarding this page.

The saved-board count is read on page initialization. It is not a live server count and does not subscribe to board changes in another tab. Profile updates do not automatically rerender an already open Studio tab; Studio reads the local name on its own startup.

### 10.8 Account Customize and connections

Customize edits the same eight browser preferences as Studio. The account has no redundant navbar theme selector or second account Customize dialog.

Connected services renders Pinterest, Spotify, Amazon Music, Apple Music, SoundCloud, and YouTube. Pinterest checks deployment availability and, when enabled, uses authenticated API status with a Manage Pinterest link. Missing/expired sessions and unavailable status are explicit. Static-only hosts keep its Not connected sample-preview link. Other services remain fixed Not connected/Open preview links. Pinterest tokens are never read by the browser.

### 10.9 Account security and sign-out

Password-settings preview only writes a message stating that no password/account settings changed. Login and create-account links remain ordinary navigation.

End demo session first loads Supabase and awaits `supabase.auth.signOut()`. A thrown client/network exception shows a failure and keeps the user on the page. Otherwise it removes the tab-scoped preview flag where possible and navigates to login. This action does not delete boards, profile, appearance, or media held by another open Studio page. It can sign out a real Supabase session as well as clear the preview flag.

The handler currently does not inspect a resolved `{ error }` from `signOut()`. Its SDK-unavailable path can prevent ending a purely local demo through this control. Static security text still describes a future .NET identity service and no authenticated session even when the separate heading reflects a real Supabase session. These are existing integration gaps, not implemented identity guarantees.

## 11. Browser storage and media lifetime

| Storage location / key                | Contents                                      | Lifetime and partitioning                                          |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| localStorage `scalable.boards.v1`     | JSON array of saved complete board records    | Same browser origin; persists across reloads until removed/cleared |
| localStorage `scalable.appearance.v1` | Eight validated appearance fields             | Same origin; shared across pages/tabs; explicit synchronization    |
| localStorage `scalable.profile.v1`    | Local demo display name/email                 | Same origin; independent of login identity                         |
| sessionStorage `scalable.demoSession` | String `preview`                              | Tab-scoped demo flag; no authorization role                        |
| Supabase-managed auth storage         | SDK-managed persisted session state           | Controlled by Supabase browser client; separate from app keys      |
| `audio-library.js` Map                | Item ID to local audio object URL             | Current document memory only                                       |
| `video-library.js` Map                | Item ID to local video object URL             | Current document memory only                                       |
| `app.js` reference variables          | Prompt reference `File` and preview URL       | Current Studio document; cleared when removed/replaced             |
| Pinterest importer sets/maps          | Selected board IDs, pin choices, current step | Current Studio document; cleared by End preview or reload          |

Local boards and profiles are not keyed by a Supabase user ID. Signing in as a different user or changing a demo profile does not switch, restrict, or delete them. Browser-origin storage is not SQL ownership enforcement. Two site paths on the same origin share these keys; differing local ports or hostnames use different origins.

Only board JSON and file metadata are saved. Local audio/video bytes, prompt image bytes, object URLs, and base64 recordings are not placed into saved board DTOs by these importers. Playback can remain available when reopening a board in the same document if its item IDs still have retained object URLs. Reload, new navigation, a new board, or switching to a board without those IDs can require reattachment.

Object URLs are revoked when an attachment is replaced, removed, rejected, or no longer retained by the active board. Board rerendering pauses local players, replaces their DOM controls, and removes any embedded players. The shared local-playback handlers pause other local media when playback starts. They do not coordinate third-party iframe playback.

Board list parsing requires a JSON array. Legacy items with `type: "music"` normalize on read to `type: "sound"` with `isSample: true`. Reads do not automatically overwrite stored records. Saving rewrites the resulting board array, while deletion uses raw records so deleting one does not normalize unrelated records. There is no full schema repair/migration tool for malformed board items.

Appearance has field-level validation; profile has limited type/length checks. Storage exceptions are caught for board count/list/save/delete, profile load/save, preferences, and the demo flag as described in the relevant sections. There is no automatic backup, local-to-cloud migration, or recovery of browser-cleared data. Board writes are whole-array read/modify/write operations without cross-tab transactions or conflict resolution.

## 12. Board and reference data fields

These are the actual JSON-compatible frontend fields, not a SQL schema. String identifiers are UUIDs for new boards/imported items unless otherwise stated. Generated item IDs are stable fixture identifiers. Optional fields differ by item type; the current frontend does not enforce a complete runtime schema for restored board data.

### 12.1 Board record

| Field                           | Type                 | Meaning                                                                         |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| `id`                            | string               | Saved identity; a new exploration/imported board gets a new UUID                |
| `title`                         | string               | Collection or user-supplied imported-board title                                |
| `description`                   | string               | Displayed creative direction or import description                              |
| `prompt`                        | string               | Creative brief associated with the board                                        |
| `createdAt`                     | ISO timestamp string | Creation time; reset when an active deleted board becomes a fresh unsaved draft |
| `mode`                          | string               | Currently `demo`                                                                |
| `researchOptions`               | object               | May be absent in older saved records                                            |
| `researchOptions.includeSongs`  | boolean              | Whether generated song picks were requested                                     |
| `researchOptions.includeSounds` | boolean              | Whether generated ambient concepts were requested                               |
| `items`                         | array                | Ordered union of image, palette, note, sound, song, and video records           |

### 12.2 Generated image, palette, note, sound, and song records

| Item type                 | Fields                                                                           | Meaning                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| All generated items       | `id`, `type`                                                                     | Stable IDs: images `mountains`, `coast`, `water`; palette `palette`; note `note`; sound `sound`; songs `song-<collection>-<index>` |
| `image`                   | `url`, `title`, `description`, `sourceUrl`, `sourceLabel`, `position`, `pinned`  | Image/source locations, visible/alt copy, layout hint, boolean preservation flag                                                   |
| `image` optional          | `imagePosition`                                                                  | CSS image object-position hint when present                                                                                        |
| `palette`                 | `colors`                                                                         | Ordered color objects containing `hex` and `name` strings                                                                          |
| `note`                    | `text`                                                                           | Editorial note with possible line breaks                                                                                           |
| `sound` generated concept | `title`, `artist`, `description`, `isSample`                                     | Artist is “Ambient sound direction”; sample has no recording                                                                       |
| `song` curated pick       | `title`, `artist`, `explanation`, `tags`, `discoveryUrl`, `linkKind`, `isSample` | Fit copy, tags, Spotify search URL, `catalog-search`, and true sample flag                                                         |

`position` for generated images is `hero`, `detail`, or `water`. These are current layout hints; production result counts/layouts need a broader integration pass.

### 12.3 Imported audio record

| Field                 | Type / current values                                            | Meaning                                                             |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `id`, `type`          | UUID; `song` or `sound`                                          | Item identity and independent content classification                |
| `title`, `artist`     | strings                                                          | User details; artist is empty for a local recording                 |
| `imported`            | true                                                             | Preserves the item during refinement and selects imported rendering |
| `sourceKind`          | `link`, `demo-provider`, `local-file`                            | Manual link, preview-library choice, or local audio                 |
| `sourceKey`           | normalized URL or `file:<name>:<size>:<lastModified>`            | Current-board duplicate detection                                   |
| `provider`            | `spotify`, `amazon`, `apple`, `soundcloud`, `youtube`            | Present for linked/provider-preview references                      |
| `resourceType`        | `song`, `album`, `playlist`, `search`, `music`, `sound`, `video` | Parser-derived linked resource classification                       |
| `discoveryUrl`        | HTTPS URL                                                        | Linked/provider-preview outbound source                             |
| `linkKind`            | `user-link` or `catalog-search`                                  | Manual reference versus provider-preview search                     |
| `isSample`            | boolean                                                          | True for preview library items, false for manual/local imports      |
| `explanation`, `tags` | strings                                                          | Card copy identifying local, user, or demo origin                   |
| `fileInfo`            | object                                                           | Local file metadata only; absent on ordinary links                  |

Audio `fileInfo` contains `name` (string), `size` (bytes), `mimeType` (string), and `lastModified` (numeric file timestamp). Local audio has no serialized playback URL or provider token. Classification as a song/sound does not change its source resource type.

### 12.4 Imported Pinterest image record

In addition to the image fields, each Pinterest fixture import has:

| Field            | Current value / type             | Meaning                                                      |
| ---------------- | -------------------------------- | ------------------------------------------------------------ |
| `position`       | `pinterest`                      | Imported-image layout                                        |
| `imported`       | true                             | Preserve during refinement                                   |
| `provider`       | `pinterest`                      | Source family                                                |
| `sourceKind`     | `pinterest-demo`                 | Local fixture rather than an authenticated pin               |
| `sourceKey`      | `pinterest-demo:<pinId>`         | Stable deduplication identity                                |
| `externalPinId`  | string                           | Fixture pin ID                                               |
| `sourceBoard`    | object with `id`, `title`, `url` | Fixture board metadata; URL is null                          |
| `originalPinUrl` | null                             | No live pin URL exists for the fixture                       |
| `isSample`       | true                             | Demo provenance                                              |
| `sourceLabel`    | string                           | Identifies local sample photography, not Pinterest retrieval |

For fixtures, `sourceUrl` is the sample-photography repository source and `sourceBoard` identifies the single fixture board.

T001 implements that live distinction: `sourceUrl`/`originalPinUrl` identify the actual Pin, `creatorSourceUrl` retains its validated external creator link, and `url` is a validated Pinterest preview. `sourceBoards` holds all selected associations, while `sourceBoard` remains for renderer compatibility. `sourceKind` is `pinterest-api`, `sourceKey` is `pinterest:<pinId>`, `isSample` is false, `researchAllowed` is false, and `license` is `unknown`. Sample imports also carry `researchAllowed: false`. See section 8.6.

### 12.5 Video records

| Field                  | YouTube record                   | Local-video record                        |
| ---------------------- | -------------------------------- | ----------------------------------------- |
| `id`, `type`           | UUID; `video`                    | UUID; `video`                             |
| `title`                | User-supplied title              | User title or filename stem               |
| `imported`, `isSample` | true, false                      | true, false                               |
| `sourceKind`           | `youtube`                        | `local-video`                             |
| `provider`             | `youtube`                        | `local`                                   |
| `sourceUrl`            | Canonical watch URL              | Absent                                    |
| `videoId`              | Validated 11-character ID        | Absent                                    |
| `startSeconds`         | Nonnegative integer up to 604800 | Absent                                    |
| `sourceKey`            | `youtube:<id>:<start>`           | `video-file:<name>:<size>:<lastModified>` |
| `fileInfo`             | Absent                           | File metadata object                      |

Video `fileInfo` contains `name`, `size`, `mimeType`, `lastModified`, `width`, `height`, and `duration`. Dimensions are positive numeric pixels. Duration is finite seconds or null. The embed URL is derived during parsing/rendering rather than stored as a playback credential or object URL.

## 13. JavaScript module interfaces

### 13.1 Module responsibilities

| Module                                                                  | Responsibility                                                                                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`app.js`](../frontend/js/app.js)                                       | Studio state, renderers, filters, prompt/reference events, research version guard, import callbacks, saved-board UI, deletion, local profile display |
| [`board-service.js`](../frontend/js/board-service.js)                   | Fixed prompt/collection/song data, local board service, legacy item normalization, future HTTP adapter                                               |
| [`appearance.js`](../frontend/js/appearance.js)                         | Appearance defaults/validation, root attributes, persistence, OS/storage/page restoration listeners                                                  |
| [`theme-init.js`](../frontend/js/theme-init.js)                         | Early independent theme resolution before stylesheet paint                                                                                           |
| [`customize.js`](../frontend/js/customize.js)                           | Shared setting bindings and auth-page dialog construction                                                                                            |
| [`audio-library.js`](../frontend/js/audio-library.js)                   | Supported URL parser, provider fixtures, audio import UI, local-audio registry/probe, imported audio cards                                           |
| [`pinterest-import.js`](../frontend/js/pinterest-import.js)             | Local board/pin fixture library, conversion, four-step picker/review/import UI                                                                       |
| [`pinterest-service.js`](../frontend/js/pinterest-service.js)           | Authenticated live API calls, pagination, preview/OAuth URL checks, and live reference conversion |
| [`research-policy.js`](../frontend/js/research-policy.js)               | Reject Pinterest domain inputs and structured references at research boundaries |
| [`video-library.js`](../frontend/js/video-library.js)                   | YouTube URL parser, video import UI, local-video registry/probe, explicit iframe loading, video cards                                                |
| [`account.js`](../frontend/js/account.js)                               | Page-specific login/signup/recovery/profile/account handlers, lazy Supabase access, connection-card generation                                       |
| [`update-password.js`](../frontend/js/update-password.js)               | Direct Supabase session check and password update/sign-out flow                                                                                      |
| [`icons.js`](../frontend/js/icons.js)                                   | Converts selected text symbols to decorative CSS-masked icons                                                                                        |
| [`config/supabaseClient.js`](../frontend/js/config/supabaseClient.js)   | CDN SDK import and configured Supabase client export                                                                                                 |
| [`config/supabase-config.js`](../frontend/js/config/supabase-config.js) | Public browser project configuration; exports `supabaseConfig`                                                                                       |

### 13.2 Board-service exports

| Export / method                                                                    | Implemented interface                                                                                                |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `prompts`                                                                          | Object keyed by the three prompt-chip labels                                                                         |
| `DemoBoardService.research({ prompt, includeSongs = true, includeSounds = true })` | Promise of a full local sample board; caller also passes `referenceFile`, which this implementation does not analyze |
| `DemoBoardService.listBoards()`                                                    | Promise of normalized complete saved boards                                                                          |
| `DemoBoardService.saveBoard(board)`                                                | Persists and returns a structured clone                                                                              |
| `DemoBoardService.deleteBoard(id)`                                                 | Resolves true when removed, false when already absent; throws on storage failure                                     |
| `ApiBoardService(baseUrl = "/api")`                                                | Inactive future HTTP boundary                                                                                        |
| `ApiBoardService.request(path, options = {})`                                      | Fetch with `credentials: "same-origin"`; throws for non-OK; returns null on 204, JSON otherwise                      |
| `ApiBoardService.startResearch(prompt, referenceFile, options)`                    | Multipart POST with optional reference and boolean options serialized as strings                                     |
| `ApiBoardService.getResearchRun(id)`                                               | GET encoded research-run ID                                                                                          |
| `ApiBoardService.listBoards()`                                                     | GET boards                                                                                                           |
| `ApiBoardService.saveBoard(board)`                                                 | PUT full JSON board to its encoded ID                                                                                |
| `ApiBoardService.deleteBoard(id)`                                                  | DELETE encoded ID; returns true after a successful response                                                          |
| `boardService`                                                                     | Active singleton is `new DemoBoardService()`                                                                         |

The current app calls `research()`, while the HTTP adapter exposes `startResearch()`/`getResearchRun()`. Replacing the singleton alone is not sufficient to enable backend research. The API adapter has no polling, cancel, token attachment, CSRF-header handling, retry policy, schema validation, or 404-as-already-deleted mapping. Non-204 success responses must contain valid JSON under its current request helper.

### 13.3 Appearance and icon exports

| Export                         | Implemented contract                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `getAppearance()`              | Returns a shallow copy of the current eight preferences                                                         |
| `updateAppearance(changes)`    | Applies allowed fields, updates subscribers, attempts storage, returns whether persistence succeeded            |
| `resetAppearance()`            | Applies and persists defaults using the same update path                                                        |
| `onAppearanceChange(listener)` | Registers a listener and immediately invokes it with current preferences; no unsubscribe helper is exposed      |
| `setupCustomization()`         | Binds an existing appearance form; creates an auth-page dialog when a trigger exists without a dialog           |
| `iconify(root)`                | Walks text nodes and replaces `✳`, `↗`, `↘`, `↥`, and `▶` with decorative spans using shared symbol classes |

### 13.4 Importer exports and callbacks

| Export                                                      | Implemented contract                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `providers`                                                 | Four music provider definitions: ID, name, mark, color, description                                                           |
| `parseMediaLink(value)`                                     | Returns normalized `url`, `provider`, `resourceType`, or throws                                                               |
| `providerName(id)`                                          | Display label with YouTube/general fallbacks                                                                                  |
| `localAudioUrl(id)`                                         | Current local URL or null                                                                                                     |
| `attachLocalAudio(id, file)`                                | Async validation/registration; resolves file metadata                                                                         |
| `releaseLocalAudio(id)` / `retainLocalAudio(items)`         | Revoke one URL or all URLs whose IDs are absent from the supplied item list                                                   |
| `setupAudioImporter({ onImport, getBoardId, element })`     | Binds dialog; invokes `onImport(items, targetBoardId?)` and expects an added count                                            |
| `renderAudioReference(item, index, handlers)`               | Creates a card using `element`, `onRemove`, and `onReattach` handlers                                                         |
| `DemoPinterestService.listBoards()`                         | Synchronous complete fixture library clone                                                                                    |
| `DemoPinterestService.toBoardItems(boards, selectedPinIds)` | Pure selection-to-item mapping with new item IDs and stable source keys                                                       |
| `setupPinterestImporter({ element, onImport, service })`    | Optional service defaults to demo; invokes `onImport({ items, destination, title, boards })` and expects `{ added, skipped }` |
| `parseYouTubeLink(value)`                                   | Returns `videoId`, `startSeconds`, canonical `sourceUrl`, and derived `embedUrl`, or throws                                   |
| `attachLocalVideo(id, file)`                                | Async validation/registration; resolves video metadata                                                                        |
| `releaseLocalVideo(id)` / `retainLocalVideos(items)`        | Revoke unused local video URLs                                                                                                |
| `setupVideoImporter({ element, getBoardId, onImport })`     | Invokes `onImport(item, targetBoardId?)` and expects an added count                                                           |
| `renderVideoReference(item, handlers)`                      | Creates a card using `element`, `onRemove`, and `onReattach`                                                                  |

The `element` helper creates DOM nodes, applies class names, assigns strings via `textContent`, and iconifies symbols. Import callbacks own active-board mutations. The Pinterest picker now supports async live loading alongside synchronous fixtures. `setupPinterestImporter` also accepts `api` and `getBoardId`; live review rejects a changed destination. `pinterest-service.js` exports `ApiPinterestService` (`available`, `status`, `authorize`, `disconnect`, `listBoards`, `listPins`, `toBoardItems`), `PinterestApiError`, safe preview checks, and OAuth URL validation. `research-policy.js` exports `assertResearchInputAllowed`.

## 14. Existing external connections

### 14.1 Supabase Auth — wired in the frontend

| User operation         | SDK call                                            | Where it is used                                           |
| ---------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| Password login         | `auth.signInWithPassword({ email, password })`      | Login submit                                               |
| Request recovery email | `auth.resetPasswordForEmail(email, { redirectTo })` | Login Forgot password enhancement                          |
| Read session           | `auth.getSession()`                                 | Account initialization and password-update initialization  |
| Change password        | `auth.updateUser({ password })`                     | Password-update submit                                     |
| Sign out               | `auth.signOut()`                                    | Account end-session control and successful password update |

These calls use the configured Supabase project directly from the browser. No .NET proxy is present. The browser SDK is fetched from `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm`. Supabase handles its own auth network requests, token refresh, URL-session detection, and configured persistence. The board API adapter does not currently attach a Supabase access token.

To operate against the intended deployment, the configured project must have the intended password-auth and recovery settings, permitted site/callback URLs for the actual host/project path, and working email delivery. The frontend code alone does not establish those project settings. Existing automated tests mock the client; they do not verify live user credentials, token expiry, recovery email delivery, or successful live password updates.

There is no Supabase registration call, SQL/table query, storage-bucket upload, media-provider authorization, or board synchronization in these modules. A real authenticated heading on the account page does not make local boards user-owned server records.

### 14.2 YouTube embeds — explicit user-triggered network access

The dedicated video renderer constructs a `https://www.youtube-nocookie.com/embed/` iframe only after Load YouTube player. This is embed hosting, not a YouTube Data API connection or account login. A source link opens the normalized YouTube watch page. No video request occurs merely by adding or restoring the reference. Tests intercept the iframe response; real playback and regional/embedding restrictions are not validated by that interception.

### 14.3 External outbound links

Curated songs open Spotify search. Imported references open their supported provider source/search. Image sources link to the sample-photo repositories. These links do not fetch catalog metadata or grant library access in the application. The user leaves/opens the provider site through an ordinary link.

### 14.4 Connections absent from the running frontend

Live AI research, image search, licensed sounds, music-account APIs, YouTube account-library APIs, cloud board storage/uploads, registration, and authenticated cloud profile/preferences are not connected. Pinterest OAuth/owned-board/pin APIs are implemented in the optional backend, disabled until approved configuration. Its credential SQL store is separate from local canvas saving. `ApiBoardService` remains inactive for general boards/research.

## 15. Required backend and API connections

Except for the implemented Pinterest connection/board-read routes in section 15.5, `/api/…` routes here remain **proposed contracts**, including those in the inactive general board adapter. No backend API exists on GitHub Pages itself.

### 15.1 Application authentication and session boundary

The existing Supabase integration must be accounted for when implementing .NET authentication. Decide whether the backend validates Supabase-issued access tokens and associates them with SQL users, or whether an intentional migration establishes a different server-managed identity/session service. Do not enable a separate unrelated identity without linking its users and board ownership.

If retaining Supabase browser sign-in, add the chosen authenticated request mechanism to API calls and token/session-expiry handling to the UI. If using server-managed cookie sessions, implement the corresponding login/logout/session/recovery endpoints and replace direct frontend auth calls where necessary. The current adapter sends `credentials: "same-origin"`; it does not implement either cross-origin cookie sessions or Bearer headers automatically.

| Method | Proposed route             | Backend contract / frontend connection                                                                                                                                           |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/session`             | Return actual signed-in status and safe user identity/roles; replace preview/session assumptions with authoritative app state                                                    |
| POST   | `/api/auth/register`       | Implement real registration, field/password validation, account creation, verified-email requirements, and actual success/failure; replace signup's local confirmation-only path |
| POST   | `/api/auth/login`          | Needed for the server-managed login option; validate identity and establish the chosen session; replace direct password SDK call if this option is chosen                        |
| POST   | `/api/auth/logout`         | Invalidate the application session for the server-managed option; ensure provider/application sessions follow the chosen policy                                                  |
| POST   | `/api/auth/password-reset` | Needed if recovery is moved behind .NET; neutral response, delivery integration, request limits, and an allowed recovery callback                                                |

Recovery completion, email verification, email-change confirmation, and password change require contracts consistent with the selected identity provider. Their .NET routes are not defined by the current frontend adapter. The existing direct Supabase `updateUser` page is the current recovery-completion path. Link/account verification and security-control UI must be driven by actual identity responses, not demo flags.

The signup form must stop claiming completion based solely on client validity once real registration is enabled. Preserve input validation and accessible errors, add pending/duplicate-submit prevention, and show verification or account-created state only from a successful service response. Never store submitted passwords in board/profile JSON.

### 15.2 Board persistence and SQL ownership

| Method | Proposed route     | Contract                                                                                   | Existing frontend adapter coverage                                          |
| ------ | ------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| GET    | `/api/boards`      | Authenticated owner's board summaries with pagination                                      | `listBoards()` exists, but current saved-list UI expects full board records |
| GET    | `/api/boards/{id}` | Full authorized board DTO, items, and provenance                                           | No detail method or lazy Open fetch yet                                     |
| PUT    | `/api/boards/{id}` | Validate and persist a board for the authenticated owner; return authoritative DTO/version | `saveBoard(board)` exists; no server implementation                         |
| DELETE | `/api/boards/{id}` | Delete the authenticated owner's saved board and return 204                                | `deleteBoard(id)` exists; active UI still uses local service                |

The saved-list renderer currently needs `items`, image URLs, title, timestamp, prompt, and research options. Returning summaries without changing the renderer will break its thumbnail/Open assumptions. Add an async detail fetch when opening a summary, pending/error/retry UI, and pagination/loading/empty handling for the list.

The server must derive ownership from authenticated identity, enforce it on list/read/write/delete and related imports/media, validate item unions and lengths, and preserve JSON field meaning without exposing raw SQL entities. The client ID alone is not authorization. Add concurrency/version handling for saves, timestamps under the server's policy, and a defined already-deleted response policy. The current HTTP helper throws on a 404; it does not translate one into the local deletion service's false result.

Map boards, typed items, research options, source/provider identities, imported relationships, colors, and media references into SQL entities or validated JSON according to the backend design. No database engine choice, tables, migrations, row-level policies, or entity models exist in this frontend. Binary media belongs behind a media service/object store rather than embedded in board JSON.

Local saved boards need an explicit migration/import decision before cloud storage replaces local persistence. They have no trustworthy authenticated owner. Signing in should not silently claim or erase browser-origin records; design a deliberate migration/deduplication path and preserve local-save feedback until a server save actually succeeds.

Deleting a cloud board must keep the confirmation/failure/draft semantics while awaiting the authoritative response. Define separately whether cloud media is unreferenced, retained, or removed. Do not delete shared provider originals just because a board reference is deleted.

### 15.3 AI research, image search, palette, song, and sound results

| Method | Proposed route            | Request / response contract                                                                                                                                         |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/research-runs`      | Multipart `prompt`, optional `reference`, `includeSongs`, and `includeSounds`; booleans sent as text fields for .NET binding; return 202 with run `id` and `status` |
| GET    | `/api/research-runs/{id}` | Return run `id`, `status`, `progress`, optional completed `board`, and optional `error`                                                                             |
| DELETE | `/api/research-runs/{id}` | Cancel an active authorized run; return 204                                                                                                                         |

`startResearch()` and `getResearchRun()` exist in the inactive adapter; there is no cancel method or UI/job scheduler integration. The running UI expects a single `research()` promise resolving to a completed board. Implement the start/poll/completion path, terminal completed/failed/cancelled handling, timeout/retry/cancellation, and protection from results belonging to replaced boards. Keep the existing `boardVersion` guard and distinguish it from actual job cancellation.

The backend must connect the selected AI service and research/search sources, validate and store the prompt reference as needed, perform image analysis where supported, retrieve permitted images and metadata, generate/extract color palettes, select music and sound sources, and assemble the typed board DTO. The current keyword fixture selector is not deep research, image analysis, a palette extractor, semantic music matching, or generated image output.

Production image/media results need source/creator links, provider/resource IDs, attribution, license/reuse information, image dimensions/variants, and suitable preview URLs. Music requires verified resource IDs/links rather than treating catalog-search URLs as verified tracks. Ambient concepts need licensed recordings or explicitly labeled text-only concepts. Include song/sound choices independently in result generation. Images-only, unsupported-media, no-results, partial-results, provider-unavailable, and source-failure states need real response handling.

The backend owns AI/provider credentials, job execution, provider rate limits, upload validation, retry/cancellation, progress, and authoritative result provenance. The frontend must render returned content safely and support variable result counts; current generated image IDs/placement and fixed fixture content are insufficient for arbitrary production research output. Typography and texture research have no dedicated frontend DTO/renderers yet.

### 15.4 Profile, preferences, and connection status

| Method | Proposed route             | Required connection                                                                                      |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/api/account/profile`     | Load an authenticated profile instead of the local demo defaults                                         |
| PUT    | `/api/account/profile`     | Persist validated display metadata; separate ordinary profile edits from verified identity/email changes |
| GET    | `/api/account/preferences` | Optional authenticated preference read/merge for cross-device use                                        |
| PUT    | `/api/account/preferences` | Optional preference sync; preserve System as a preference resolved on each device                        |
| GET    | `/api/account/connections` | Return real provider statuses/capabilities without access or refresh tokens                              |

The current profile Save handler writes localStorage only. It needs pending/success/error/version behavior from the profile service. Resolve whether local preferences remain device-specific, synchronize by account, or merge on sign-in; currently no account preference request occurs. Connected-service cards must display real disconnected/authorizing/connected/expired/denied/unavailable states only after their backing services exist.

### 15.5 Pinterest authorization and whole-board import

The optional `backend/Scalable.Api` implements the following routes under `/api/integrations/pinterest`. Availability and callback are public; other routes validate the existing Supabase bearer session. Live access is disabled until developer approval, permitted use, and server credentials are configured.

| Method | Suffix | Implemented responsibility |
| --- | --- | --- |
| GET | `/availability` | Deployment availability; no credentials |
| GET | (none) | Actual account status and import-only capability |
| POST | `/authorize` | Browser/user-bound OAuth state and supported authorization URL |
| GET | `/callback` | Single-use/expiry validation, server token exchange, encrypted credential save |
| DELETE | (none) | Delete Scalable credentials and pending state; explain provider-side revocation |
| GET | `/boards` | Paginated owned-board summaries |
| GET | `/boards/{id}/pins` | Ownership-checked paginated pin previews |

See section 8.6 and [Pinterest integration documentation](../docs/PINTEREST-INTEGRATION.md) for setup, scope restrictions, continuous refresh, cursors, cancellation, error states, provenance, and test coverage. Every selected page must finish before canvas import; unsupported pins are counted and excluded. Duplicate references retain every source-board association. Media is displayed only through validated provider preview URLs, with no downloader/cache.

The proposed `/api/pinterest-import-runs` POST/GET/DELETE job contracts remain unimplemented: references are reviewed and copied into the local canvas, and existing local Save persists them. Durable server imports require authorized cloud board storage and a job runner. Pinterest discovery, scraping, search, and AI processing are expressly excluded; future server research tools must enforce the same boundary independently.

### 15.6 Music-provider authorization, library import, and licensed sound

| Method | Proposed route                                | Required responsibility                                                                              |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/api/music/providers`                        | Supported providers and actual capabilities, including manual-link-only status                       |
| GET    | `/api/music/connections`                      | Safe authenticated connection state                                                                  |
| POST   | `/api/music/connections/{provider}/authorize` | Begin supported authorization and return an authorization URL                                        |
| GET    | `/api/music/connections/{provider}/callback`  | Validate OAuth response/state and exchange credentials server-side                                   |
| DELETE | `/api/music/connections/{provider}`           | Disconnect/revoke as supported; keep existing references                                             |
| GET    | `/api/music/connections/{provider}/library`   | Paginated authorized library items, only where supported                                             |
| POST   | `/api/boards/{id}/audio-references`           | Validate board ownership and selected provider resource IDs; return/add authoritative reference DTOs |

Provider-specific work is required for each of Spotify, Amazon Music, Apple Music, and SoundCloud. Confirm current developer access, approval, regions, scopes, library/playlist capabilities, metadata policies, and playback terms before presenting a working Connect action. Amazon Music must not be assumed to expose the same self-service account/library API as Spotify. Unsupported candidates can remain manual-reference-only.

The frontend needs actual authorization redirects and response-driven authorizing/connected/denied/expired/loading/empty/error states. Replace `demoTracks()` with authorized paginated results and authoritative IDs while retaining explicit `sourceKind`, `isSample`, `linkKind`, and provenance distinctions. Preview selection must never set a real Connected status.

Streaming-service playback is a separate integration from catalog/library reads. Add a provider-supported SDK/player or allowed preview URL only after capability and permission checks; do not download/extract streaming audio from imported links. Playlist expansion requires a supported enumerating endpoint, pagination, and a defined single-reference versus imported-track UX. The current manual link parser does not do this.

Licensed ambient-sound retrieval also requires a selected sound catalog/provider and a defined search/preview/provenance contract. No sound-provider route or adapter exists yet. Preserve the distinction between a text sound direction, an imported local recording, a linked reference, and a licensed playable result.

### 15.7 YouTube metadata and optional account connection

Manual YouTube references and user-loaded embeds already work without an API key. If automatic titles/thumbnails, search, playlists, or an authorized library are added, connect the appropriate YouTube metadata/data and authorization services through a defined backend boundary. No routes for those capabilities are currently implemented or defined by `ApiBoardService`.

Validate the supported video ID/source and permissions server-side, retain canonical identity/start times, and render unavailable/private/deleted/embed-restricted states appropriately. Provider quota and cached metadata handling belong in that integration. Keep source-link fallback. Downloading videos or extracting their soundtrack is outside current implemented functionality.

### 15.8 Optional cloud media uploads

| Method | Proposed route       | Required responsibility                                                                                       |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/media/uploads` | Authenticated upload of permitted local image/audio/video media; return a stable authorized media ID/metadata |

The local importers currently validate through browser decoding and use in-memory object URLs. A cloud-upload feature needs independent server file/type/size validation, access controls, storage allocation, ownership, durable IDs, permitted playback URLs, failure/retry/progress UI, and retention/deletion rules. Define retrieval/replacement/deletion routes and media-reference fields when the media service is designed; those are not present in the current adapter.

Preserve local-only import behavior unless cloud upload is explicitly part of the user flow. Do not serialize blob URLs or base64 recordings into SQL board JSON. Prompt research uploads and user-owned board media need clear association/lifetime rules, including what happens when a board is deleted but another board references the same asset.

### 15.9 Cross-service contracts and deployment

Keep frontend DTOs camelCase with string IDs and ISO timestamps. Validate request fields, URLs, nested item types, and ownership on the server regardless of client-side checks. For remote metadata/media resolution, independently validate destinations and redirects; browser hostname allowlists do not secure a server fetch.

Application auth and media-provider auth are separate. Backend services should hold provider secrets/refresh credentials, manage token refresh/revocation, state/PKCE where applicable, and return only safe statuses and permitted resource metadata. No SQL credentials, AI secrets, service-role keys, or provider client secrets should be added to served files.

Same-origin ASP.NET hosting through `wwwroot` or a reverse proxy fits the adapter's current credential mode. Hosting the static site on GitHub Pages with a separate API requires a configured API origin, CORS policy, HTTPS, and an explicit cross-origin auth strategy. Cookie-authenticated mutations require the chosen CSRF protection; bearer-token requests require token attachment/renewal and server validation. None of this is inferred from the existence of `/api` strings in source.

Define service error bodies and frontend handling for validation failure, signed-out/expired sessions, forbidden resources, missing/deleted resources, stale updates, rate limits, provider outages, and server failure. Preserve the current draft on failed saves/research/deletes. Add pending/retry/cancel behavior at each async boundary and base success announcements on confirmed service outcomes.

## 16. Accessibility and interaction conventions

Studio, login, signup, recovery, and account pages have skip links to their main content. Controls use native buttons/inputs, associated labels, fieldsets/legends, and named sections. Filters and pin toggles use `aria-pressed`; selected account navigation uses `aria-current`. Decorative brand/icon/waveform elements are hidden from assistive technology where designated. Image descriptions supply alt text; decorative thumbnails use empty alt text.

Audio and video importer tabs use `tablist`, `tab`, `tabpanel`, selected state, and roving tab index. Left/Right arrows move among tabs; Home/End select the first/last tab. Audio cycles across three tabs; video switches between its two. Native dialogs provide modal focus behavior and Escape dismissal. Close buttons have accessible labels. The general information/saved-list dialog also dismisses on clicks outside its rectangle; specialized import dialogs do not define that extra backdrop-dismiss handler.

Pinterest steps move focus to the selected screen heading and expose `aria-current="step"`. Counts and statuses announce selection/import results. Pin select-all supports indeterminate state. Completed registration/recovery previews move focus to their result panels. Removal focuses the matching importer. Delete confirmation uses `role="alertdialog"`, labeled title/description, safe initial Cancel focus, pending-write Escape protection, and explicit focus after removal.

Status areas use `role="status"` or polite live regions. Prompt/deletion errors use alert regions. Studio toasts stay visible for approximately four seconds; a later toast resets the timeout. The research grid uses `aria-busy`. Password visibility buttons maintain pressed state and accessible labels. External media/source links use new-tab protections, and imported media actions include descriptive labels.

The stylesheet provides visible focus treatments, touch-size adjustments, wrapping for long saved-board titles/actions, responsive dialog sizes, and reduced-motion behavior. Browser tests cover selected keyboard/focus/responsive flows. No full assistive-technology audit or formal WCAG conformance is established by these tests. The password-update page currently lacks the shared skip link/header/customization structure.

## 17. Local development and GitHub Pages

### 17.1 Run the complete site

From the repository root, run:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/` for landing-to-login behavior, or `http://localhost:8080/frontend/index.html` for Studio. Python serves static files only; it is not the planned backend.

To serve Studio at the local URL root instead, use:

```sh
python3 -m http.server 8080 --directory frontend
```

Open `http://localhost:8080/`. This mode omits the repository-root landing page because the served directory is already `frontend/`. Relative login/account/import paths still work within that served directory.

Serve over HTTP/HTTPS rather than `file://`, because the app uses ES modules. A current browser must support modules, native dialogs, structured cloning, UUID generation, object URLs, CSS grid/custom properties, and the relevant media codecs. Clipboard features depend on browser permission/context and include a manual fallback. No exact oldest supported browser version is established. There is no service worker, PWA manifest, offline cache, or production bundle.

### 17.2 Branch-based GitHub Pages

In repository Settings → Pages, choose Deploy from a branch, `front-end-design`, and `/ (root)` to publish this branch directly. The root `.nojekyll` supports plain static hosting. The root landing page redirects to the relative login page under the project path. Branch publishing can expose repository-root files as static content; only public client configuration belongs in this branch.

Setting Pages source/publishing permissions is a repository operation separate from writing documentation. Subsequent pushes deploy according to the repository's configured Pages source. A push alone does not prove a completed live deployment.

### 17.3 Manual Actions deployment

[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) defines **Deploy Studio to GitHub Pages** with only a `workflow_dispatch` trigger. It has no push trigger. GitHub requires the workflow to be available on the default branch for its Run workflow UI. Set the repository Pages source to GitHub Actions and run the workflow with the intended ref. The `github-pages` environment's branch permissions must permit that ref.

The job runs on Ubuntu, checks out the selected ref, configures Pages, prepares a temporary static artifact, uploads it, and deploys it. Only root `index.html`, `.nojekyll`, and all of `frontend/` are copied. Tests, `node_modules`, source documentation, and other repository files are not in this Actions artifact. There is no Node build or .NET runtime step.

Workflow actions are `actions/checkout@v4`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, and `actions/deploy-pages@v4`. Base permissions are contents-read; the deployment job also has pages-write and id-token-write. Concurrency uses the `github-pages` group without cancelling an in-progress deployment. The deployment URL is supplied by the deploy step.

Choose the intended single Pages publishing source in repository settings. Project-relative URLs support a `/Scalable/` deployment path as well as a custom-domain root. Configure Supabase recovery redirect allowlists to match the actual published path. GitHub Pages serves the frontend only; application APIs, SQL, workers, provider credentials, and uploads need separate backend hosting.

## 18. Validation and test coverage

The repository contains standalone CommonJS browser-check scripts, each launching its own temporary static server and Playwright Chromium browser. They are not wired to an npm test command or a test CI job. The Pages workflow deploys without invoking them.

The environment needs Node.js, `playwright` resolvable by `require`, and Chromium. The default browser path is `/usr/bin/chromium`; override it with `CHROMIUM_PATH`. The video/account suite additionally needs FFmpeg, default command `ffmpeg`, overridable with `FFMPEG_PATH`. Playwright/test tooling is a development dependency of the environment rather than a runtime feature of the site.

Run the existing checks from the repository root:

```sh
node tests/studio.browser.cjs
node tests/video-account.browser.cjs
node tests/navigation-theme.browser.cjs
node tests/saved-boards.browser.cjs
```

### 18.1 Studio/audio/Pinterest suite

[`tests/studio.browser.cjs`](../tests/studio.browser.cjs) checks removal of the design switcher, theme defaults/overrides/device changes, preference persistence/reset, expanded customization, collage/grid behavior, and desktop/mobile layouts. Its width matrix includes 1440, 1024, 768, 390, and 320 pixels in light/dark modes and selected layout combinations.

It covers curated songs and ambient concepts, independent song/sound options, catalog-search links, filters/empty states, pin preservation, save/reopen, legacy `music` compatibility, and blocked storage. Audio checks cover supported/rejected URLs, normalization, duplicate prevention, provider previews, local audio decoding/playback, metadata-only saving, reload/reattachment, and removal.

Pinterest checks cover search, whole-library selection, full-board versus selected-pin imports, zero selections, duplicate skip/reimport after removal, save/reload/reopen, pin preservation through refinement, new-board destination, stale research protection, dialog focus, and responsive imported-board layouts. The suite verifies that these local flows do not contact external providers and that no browser page errors occur.

### 18.2 Video/account suite

[`tests/video-account.browser.cjs`](../tests/video-account.browser.cjs) checks YouTube URL rejection/canonicalization, duplicate video moments, explicit embed load/unload, local video validation/playback, metadata persistence, reload/reattachment/removal, refinement preservation, responsive video/login/account layouts, profile persistence, shared appearance, provider deep links, session-ending flow, and blocked storage.

It generates a small playable WebM fixture with FFmpeg. YouTube iframe content is intercepted; it does not test live YouTube playback. Supabase is mocked to avoid live credentials/recovery emails. Checks of login/session/sign-out handlers therefore establish frontend wiring, not successful identity-provider operation.

### 18.3 Navigation/theme/signup suite

[`tests/navigation-theme.browser.cjs`](../tests/navigation-theme.browser.cjs) serves paths under `/Scalable/` and checks root redirect, logo consistency, login/signup/recovery/demo links, shared theme controls, System defaults, explicit overrides, OS changes, cross-tab synchronization, cached-page restoration, legacy MediaQueryList listeners, and JavaScript-disabled links/device styling.

Signup checks required fields, blank/whitespace names, email/length/mismatch constraints, independent visibility toggles, success/reset/retry behavior, no submitted signup data stored/transmitted, blocked storage, and responsive light/dark page combinations. Supabase calls are mocked. The suite does not exercise `update-password.html`.

### 18.4 Saved-board deletion suite

[`tests/saved-boards.browser.cjs`](../tests/saved-boards.browser.cjs) covers text-safe titles, missing-image thumbnails, Cancel/Enter/Escape preservation, default focus, storage-write failure, delayed deletion, duplicate-click protection, Escape protection during a write, selective deletion, unchanged other records, responsive dark dialogs, count/list/empty/focus states, and persisted deletion after reload.

It imports actual local audio, verifies retention when deleting another board and when the active board becomes a fresh draft, then checks that saving the draft creates a new ID. It also tests late-research suppression, an already-deleted record, unmodified legacy records, and the future API adapter's encoded-ID DELETE method against a mocked 204 response. It checks for browser page errors.

### 18.5 Pinterest API and server checks

`node tests/pinterest-api.browser.cjs` exercises the actual async importer and HTTP adapter with mocked API responses: every board/pin page, explicit selection before pin reads, failure/cancel atomicity, unsupported images, deduplication with all source relationships, safe OAuth URLs, local saving, research exclusion/refinement, disconnect, expired/forbidden states, and responsive dialogs. No live provider account is used.

`dotnet test Scalable.sln` runs seven ASP.NET integration checks against synthetic Supabase/Pinterest HTTP handlers. These cover authenticated identity/configuration, encrypted owner-scoped credentials, browser-bound single-use/expired state, denied scopes, board ownership, protected cursors, token refresh and revoked access, rate-limit forwarding, disconnect, and absent research/search routes. A Release publish includes the frontend; the server must keep its data/settings inaccessible to static requests.

### 18.6 Test helpers and verification limits

[`tests/helpers/customize.cjs`](../tests/helpers/customize.cjs) opens the appropriate dialog or account panel and changes theme. [`tests/helpers/mock-supabase.cjs`](../tests/helpers/mock-supabase.cjs) intercepts `supabaseClient.js`, records synthetic sign-in/recovery/session/sign-out calls, and returns success or a null session. It does not implement the password-update `updateUser()` API or emulate a live token lifecycle.

These checks do not establish live AI quality, cloud board SQL persistence, live identity/provider permissions, cloud upload durability, real catalogs, actual email delivery, production deployment success, or real YouTube playback. Pinterest SQL credentials and route authorization are exercised against synthetic identities and provider responses. Documentation-only edits do not require sending credentials or provider requests. Use `git diff --check` for whitespace verification and check Markdown source/anchor links when changing this document.

## 19. Current implementation gaps

This section records unfinished connections and visible behavior to preserve or resolve while building the backend.

| Area                       | Current limitation / remaining work                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deep research              | Keyword-driven local collections; no AI/image analysis/search/progress service                                                                    |
| Reference pictures         | Preview only; not saved, analyzed, added to the board, or accepted as a prompt by themselves                                                      |
| Generated content          | Three reused photos and fixed collection metadata; no dedicated typography/texture results                                                        |
| Authentication consistency | Live Supabase login/recovery/session/sign-out coexist with local-only signup/profile and some stale preview copy                                  |
| Recovery pages             | Login requests live recovery; standalone recovery is a preview; password-update page lacks shared appearance/navigation and robust async handling |
| Signup                     | Validation-only; no registration or verified-email service                                                                                        |
| Authorization              | Studio/account reachable directly; local data is not partitioned by authenticated user                                                            |
| Logout                     | Current control may fail when SDK loading fails and does not inspect a resolved sign-out error                                                    |
| Board persistence          | localStorage only; no SQL/cloud owner scope, autosave, migration, cross-tab transaction, version conflict resolution, backup, or sync             |
| Saved-board management     | Open and confirmed single deletion exist; no rename, search, folders, bulk operations, undo, export, or sharing                                   |
| Unsaved work               | New board/new Pinterest destination replace current unsaved work with explanatory UI; there is no general leave-page/dirty-state confirmation     |
| Variable generated layouts | Generated collage uses fixed IDs/placement hints; production arbitrary results need layout/schema integration                                     |
| Music accounts             | Provider library previews only; no OAuth or real connected state                                                                                  |
| Catalog metadata/playback  | Search links/manual details; no verified API track metadata, playlist expansion, or streaming playback                                            |
| Ambient recordings         | Generated ambient directions have no audio; local imported recordings do play                                                                     |
| Pinterest                  | OAuth/owned-board/pin APIs and local imports implemented; approved live credentials/verification and durable jobs/cloud board storage remain outstanding |
| YouTube                    | Manual single-video references and optional embeds only; no metadata/search/playlist/account-library API                                          |
| Local media persistence    | Metadata only; reattach after memory/navigation lifecycle ends; no cloud media upload                                                             |
| Profile/security           | Local profile metadata and message-only password settings; no profile API or verified-email changes                                               |
| Preferences                | Browser-origin settings; no cross-device/account preference sync                                                                                  |
| Production API wiring      | Inactive HTTP adapter cannot replace `research()` directly and lacks session/CSRF/polling/cancel integration                                      |
| Testing                    | ASP.NET integration tests and Pinterest browser checks use mocked upstreams; no live provider verification or full accessibility audit |
| Hosting                    | Static Pages configuration exists; no API hosting or deployment of server components                                                              |

Older focused handoffs contain some historical preview descriptions. T001 updates the Studio About and account disclaimers to distinguish Supabase sign-in, local profiles/boards, optional approved Pinterest linking, and other provider previews. The existing account Security panel still contains older future-identity wording; it is not changed into a security-settings service by this task.

## 20. Source and asset reference

### 20.1 HTML, styling, configuration, and repository files

| Path                                                                           | Role                                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [`../index.html`](../index.html)                                               | Hosted root login redirect/fallback                                                    |
| [`frontend/index.html`](../frontend/index.html)                                | Studio shell and appearance/audio/video/Pinterest/delete/general dialogs               |
| [`frontend/login.html`](../frontend/login.html)                                | Sign-in and recovery request form                                                      |
| [`frontend/signup.html`](../frontend/signup.html)                              | Create-account validation/result UI                                                    |
| [`frontend/recover.html`](../frontend/recover.html)                            | Standalone recovery preview                                                            |
| [`frontend/update-password.html`](../frontend/update-password.html)            | Live SDK password-update form                                                          |
| [`frontend/account.html`](../frontend/account.html)                            | Four account panels                                                                    |
| [`frontend/styles.css`](../frontend/styles.css)                                | Shared design tokens, layouts, components, states, responsive and reduced-motion rules |
| [`frontend/js/`](../frontend/js/)                                              | ES modules detailed in section 13                                                      |
| [`frontend/assets/README.md`](../frontend/assets/README.md)                    | Sample-photo sources and provenance limitations                                        |
| [`package.json`](../package.json), [`package-lock.json`](../package-lock.json) | Declared Supabase package dependency/lock; no frontend build scripts                   |
| [`.gitignore`](../.gitignore)                                                  | Ignores `.env` and `node_modules/`                                                     |
| [`.nojekyll`](../.nojekyll)                                                    | Static-hosting marker for repository-root Pages publication                            |
| [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)                | Manual static Pages deployment                                                         |
| [`README.md`](../README.md)                                                    | Project vision, roadmap, and development entry point                                   |
| [`tests/`](../tests/)                                                          | Four browser suites and shared helpers                                                 |
| [`documentation/FRONTEND.md`](FRONTEND.md)                                     | This complete audited frontend reference                                               |

### 20.2 Local photography

| Local asset                                         | Source                                                                                                                                           | Current usage                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [`mountains.jpg`](../frontend/assets/mountains.jpg) | `bg-masthead.jpg` from [Start Bootstrap Grayscale](https://github.com/StartBootstrap/startbootstrap-grayscale/tree/master/dist/assets/img)       | Hero “Into the quiet”, login art, Pinterest fixture pins                         |
| [`coast.jpg`](../frontend/assets/coast.jpg)         | `demo-image-01.jpg` from the same Grayscale repository                                                                                           | Detail “The in-between”, Pinterest fixture pins; filename is a sample identifier |
| [`water.jpg`](../frontend/assets/water.jpg)         | `bg-masthead.jpg` from [Start Bootstrap Landing Page](https://github.com/StartBootstrap/startbootstrap-landing-page/tree/master/dist/assets/img) | Water “A moment of blue”, signup art, Pinterest fixture pins                     |

The photographs are local so initial boards/import previews do not need third-party image requests. They are fixed design content, not research results. The source projects license their templates under MIT and credit Unsplash for photography; this repository has not independently established complete photographer/license provenance for each photo. Production asset selection should carry verified source, creator, and usage information per result.

### 20.3 Existing focused handoffs

| Document                                                            | Subject                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`docs/FRONTEND.md`](../docs/FRONTEND.md)                           | Original Studio interactions, customization, and proposed .NET boundary |
| [`docs/MUSIC-INTEGRATION.md`](../docs/MUSIC-INTEGRATION.md)         | Music-provider capabilities and proposed connections                    |
| [`docs/PINTEREST-INTEGRATION.md`](../docs/PINTEREST-INTEGRATION.md) | Pinterest workflow, item fields, and import-service handoff             |
| [`docs/VIDEO-ACCOUNT.md`](../docs/VIDEO-ACCOUNT.md)                 | Video, signup/account/auth integration, and browser validation          |
| [`docs/GITHUB-PAGES.md`](../docs/GITHUB-PAGES.md)                   | Static deployment setup                                                 |

### 20.4 Design captures

These committed PNG files record earlier reviewed frontend states. They are visual references, not live service evidence, and may predate later navigation/copy cleanup.

| Capture             | File                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Studio light        | [studio.png](../docs/design-previews/studio.png)                                         |
| Studio dark         | [studio-dark.png](../docs/design-previews/studio-dark.png)                               |
| Customize           | [studio-customize.png](../docs/design-previews/studio-customize.png)                     |
| Audio import        | [studio-import-audio.png](../docs/design-previews/studio-import-audio.png)               |
| Music services      | [studio-music-services.png](../docs/design-previews/studio-music-services.png)           |
| Provider library    | [studio-library-preview.png](../docs/design-previews/studio-library-preview.png)         |
| Pinterest Connect   | [studio-pinterest-connect.png](../docs/design-previews/studio-pinterest-connect.png)     |
| Pinterest Boards    | [studio-pinterest-boards.png](../docs/design-previews/studio-pinterest-boards.png)       |
| Pinterest Review    | [studio-pinterest-review.png](../docs/design-previews/studio-pinterest-review.png)       |
| Imported canvas     | [studio-pinterest-canvas.png](../docs/design-previews/studio-pinterest-canvas.png)       |
| Video import        | [studio-video-import.png](../docs/design-previews/studio-video-import.png)               |
| Video reference     | [studio-video-reference.png](../docs/design-previews/studio-video-reference.png)         |
| Login               | [studio-login.png](../docs/design-previews/studio-login.png)                             |
| Signup              | [studio-signup.png](../docs/design-previews/studio-signup.png)                           |
| Signup confirmation | [studio-signup-success.png](../docs/design-previews/studio-signup-success.png)           |
| Standalone recovery | [studio-recovery.png](../docs/design-previews/studio-recovery.png)                       |
| Account             | [studio-account.png](../docs/design-previews/studio-account.png)                         |
| Account connections | [studio-account-connections.png](../docs/design-previews/studio-account-connections.png) |
| Saved boards        | [studio-saved-boards.png](../docs/design-previews/studio-saved-boards.png)               |
| Delete confirmation | [studio-delete-board.png](../docs/design-previews/studio-delete-board.png)               |
