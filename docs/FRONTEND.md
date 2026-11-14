# Scalable — The Studio frontend documentation

Source baseline: `main` commit `68e573c` (PostgreSQL Identity migration). Audited against the application source on November 14, 2026.

This document records the implemented pages, controls, state transitions, data structures, validation, persistence, styling, modules, deployment configuration, tests, and remaining service connections. Behavior described as **implemented** exists in this checkout. Routes described as **proposed** are backend contracts to implement; they are not running endpoints. GraphQL identity operations, the Node AI endpoint, and explicitly loaded YouTube embeds are identified separately from local provider previews.

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

The application consists of static HTML, one shared CSS file, and native JavaScript ES modules. There is no frontend framework, bundler, transpilation step, or client-side route framework; Node and ASP.NET run the separate server functions described below. Each account/authentication screen is a separate HTML page. Account sections use URL hashes. Studio import shortcuts use a query parameter.

The repository now contains a C# / ASP.NET Core GraphQL identity and Pinterest API host in `Scalable.Api/`, backed by ASP.NET Identity with SQLite locally or configured Npgsql/PostgreSQL. Pinterest uses separate SQLite storage regardless of the Identity provider. GraphQL is the API layer instead of Supabase Auth/browser data access, not a database engine. See [BACKEND.md](BACKEND.md) and [T003](T003.md). A separate Node server hosts the frontend and an OpenAI creative-direction endpoint. Board persistence, research/search jobs, cloud media storage, and other media-provider OAuth remain unimplemented. The frontend itself remains plain static HTML/CSS/native modules without a bundler or framework.

Initial Studio boards and provider previews work locally. Submitting Explore attempts a same-origin AI request after generating its local fallback. Identity operations call the configurable GraphQL API using a session cookie. YouTube is contacted only when an embedded player is explicitly loaded or an external source link is followed.

The root `package.json` now sets `type: "module"` and defines `npm start` as `node server.js`; it has no declared runtime package dependencies. The Node server uses built-in modules and global fetch. Playwright remains separately installed development tooling. There is no npm build or test script.

## 2. Page routes and navigation

Paths in this table are relative to the repository's hosted root. Serving only `frontend/` makes that directory the local URL root instead.

| File / route                                                        | Implemented responsibility                                                                                      | Script entry point                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [`index.html`](../index.html)                                       | Landing page; immediate HTML refresh to `./frontend/login.html`, visible login fallback link, Studio brand link | `frontend/js/theme-init.js`            |
| [`frontend/index.html`](../frontend/index.html)                     | Studio prompt, board canvas, filters, saved boards, customization, and import dialogs                           | `js/app.js` and `js/theme-init.js`     |
| [`frontend/login.html`](../frontend/login.html)                     | GraphQL username/email sign-in, recovery request, create-account link, guest shortcut                           | `js/account.js` and `js/theme-init.js` |
| [`frontend/signup.html`](../frontend/signup.html)                   | Permanent account registration through GraphQL and client validation                                            | `js/account.js` and `js/theme-init.js` |
| [`frontend/recover.html`](../frontend/recover.html)                 | GraphQL password-reset request; actual mail delivery adapter still needed                                       | `js/account.js` and `js/theme-init.js` |
| [`frontend/update-password.html`](../frontend/update-password.html) | GraphQL password reset using email/token from a recovery link                                                   | `js/update-password.js`                |
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

Music-service cards all open the general audio importer; they do not automatically select or authorize the named provider. The YouTube card opens the video importer. None of these links establish a provider connection.

## 3. Studio workspace

Source: [`frontend/index.html`](../frontend/index.html), [`frontend/js/app.js`](../frontend/js/app.js).

### 3.1 Workspace shell

The top bar identifies The Studio and contains Log in and Customize. The sidebar contains the brand, New mood board, Saved boards with a count, an About this prototype button, and the account-profile link. Decorative sidebar copy and artwork are part of the Studio design. The workspace header shows a breadcrumb and a “Sample content · no live AI” badge. The footer identifies Scalable / The Studio.

The profile link initially displays “Your creative space” with a `Y` avatar. At Studio startup, a valid locally saved profile name replaces that text, and the first Unicode character of the trimmed name becomes the uppercase avatar. This is local profile personalization, not a live identity lookup.

About this prototype opens the general dialog. Its explanatory text covers customization, samples, imports, storage, and planned services. It now acknowledges GraphQL sign-in and approved Pinterest imports, but still describes Explore as local collections and live AI research as planned. The Node AI flow generates creative metadata without deep research; sections 10 and 14 distinguish the implemented services.

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
| Explore this feeling                      | Builds a local sample, then requests AI direction using trimmed prompt and audio options; the reference `File` remains local         |
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

The generated sound card, including AI-added concepts, displays a title, decorative waveform, and “Sound concept · no audio.” Its information control explains the direction and the future recording-provider dependency. The waveform is decorative and is not an audio visualization. There is no recording or playback on these generated concepts.

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

A local fallback board contains three images, one palette, and one note, plus one sound concept if requested and three songs if requested. That produces nine items with both options enabled, eight with songs only, six with sound only, or five with neither. Imported items increase these totals.

### 4.2 Explore and refinement

Submitting a nonblank brief increments `boardVersion`, disables the Explore button, changes its label to “Composing a sample…”, sets the grid's `aria-busy` state, and clears the input error. A successful response is applied only if its captured version still matches the current board version.

After the local sample is built, `createCreativeDirection()` posts the prompt/options to `/api/ai/creative-direction`. On success, the response replaces the title, description, palette colors, and note and sets `mode` to `ai`. AI song and ambient-concept items are appended when enabled. The current merge also keeps enabled local sample songs/sounds, so an AI board can contain both curated and AI recommendations. Photographs remain the same local assets; the prompt reference is not sent.

An unavailable AI endpoint, provider failure, or missing key falls back to the local board. An availability toast is attempted, then the final sample-composed toast can replace it. The final version check prevents a stale result from replacing a newer board, but it does not cancel the AI HTTP request or suppress every earlier notification. Audio options are read again during response merging rather than frozen across the entire request.

Before replacement, matching pinned generated images are carried into the next board. All items with `imported: true` are appended to the new generated items, so imported audio, Pinterest images, and videos survive refinement. A new generated board has a new UUID; exploring a previously saved board creates a new direction to save rather than updating the old saved identity automatically. The filter returns to Everything and Save board becomes available as an unsaved action.

On a research error, the current board stays visible and the input error invites retry. The matching request's completion restores the button and busy state. A stale response cannot reset the interface for a newer board operation. This version guard prevents stale board replacement; it does not abort HTTP/provider requests or cancel a server job. Initial-load and New mood board samples do not call the AI endpoint; prompt submission does.

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

The dialog is a four-step workflow: Connect, Boards, Review, Done. **Preview Pinterest connection** uses local fixtures and never claims an account is connected. When the GraphQL identity session and approved backend integration are available, the same importer can link Pinterest and retrieve the authenticated user's boards and pins. See [Pinterest integration notes](PINTEREST-INTEGRATION.md) for the API, cookie session, OAuth, and provider constraints.

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

Sources: [`account.js`](../frontend/js/account.js), [`graphqlClient.js`](../frontend/js/config/graphqlClient.js), [`update-password.js`](../frontend/js/update-password.js), the corresponding HTML pages, and [`AccountMutations.cs`](../Scalable.Api/GraphQL/AccountMutations.cs).

### 10.1 GraphQL client and session

`graphqlRequest(query, variables = {})` POSTs JSON to `window.GRAPHQL_ENDPOINT` when set; otherwise loopback hosts use `http://localhost:5078/graphql` and other hosts use `https://scalable-5rgd.onrender.com/graphql`. This is configured source behavior, not a verified live service. Pinterest has a separate localhost-only default, so explicitly set the global to align both clients on hosted frontends. Set the global before modules initialize when deploying to a different API origin. Every call uses `credentials: "include"` and `Content-Type: application/json`. Non-OK HTTP responses throw a generic unavailable error; GraphQL error arrays throw the first message; success returns `payload.data`.

Identity is now ASP.NET Identity with a cookie, not a browser auth SDK. The API selects SQLite locally or configured Npgsql/PostgreSQL. Startup now calls `Database.Migrate()` with a checked-in PostgreSQL Identity migration/model snapshot; provider compatibility needs validation. Identity enforces unique normalized email, password hashing, and a failed-login lockout threshold of five. Password minimum length is eight; Identity's additional default digit/lowercase/uppercase/nonalphanumeric requirements apply and are surfaced through registration errors. Registration and login use `isPersistent: false`, so a permanent account is distinct from a persistent browser session. Browser cookie behavior determines session continuity; credentials are not stored in the local demo profile.

### 10.2 Login

The `#login-email` control is now a text input labeled Username or email, required and capped at 254 characters, with `autocomplete="username"`. Password is required, 8–128 characters. Show/Hide changes masking, pressed state, and accessible labels after JavaScript initializes.

Submit trims the identifier and sends the `login(input: LoginInput!)` mutation with `identifier` and `password`, requesting `succeeded`, `message`, and user `id`, `username`, `email`, `displayName`. The backend chooses email lookup when the identifier contains `@`, username otherwise, and uses password sign-in with lockout on failure. Invalid credentials use one generic message. Service failures show temporary unavailability. Success resets the form and navigates to `account.html`. In-flight submissions are not disabled by the current handler.

Create an account opens signup; Customize opens shared appearance settings; Back to Studio opens the workspace. Continue without an account writes the tab-scoped preview flag when possible and opens Studio directly. It does not sign in or clear a real session. The fallback form action goes to account via GET; inputs have no names, so values are not serialized into that fallback URL. Navigation without JavaScript does not authenticate.

### 10.3 Recovery requested from login

Forgot password uses the entered identifier as an email value. If empty it asks for an email and focuses the input; otherwise it calls `requestPasswordReset(input: PasswordResetRequestInput!)` with `email` and displays the returned message. Users who entered a username must enter their account email for recovery. This path does not construct a client-side callback URL; the backend uses `App:PublicBaseUrl`.

The API returns a neutral response whether the account exists. For an existing user it generates an Identity reset token and calls the email adapter with an escaped email/token URL. The current `LoggingAccountEmailSender` only logs that instructions were generated: it neither sends mail nor logs the reset URL/token. A successful request response therefore does not establish delivery. Configure a trusted email provider to make recovery usable end to end.

### 10.4 Standalone recovery page

`recover.html` now makes the same GraphQL recovery request using a required email input capped at 254 characters. On a resolved request it resets the form, reveals/focuses the result, and displays the server message. A thrown failure reports temporary unavailability. Customize, Back to Studio, and Return to login remain available. Some button/fallback wording still says Preview, but this handler is no longer a local-only confirmation.

The no-JavaScript form fallback returns to `recover.html#recovery-info` and sends no named email field. It cannot perform the GraphQL request. The result's Check your email wording does not override the undelivered-mail limitation of the current backend adapter.

### 10.5 Password update after recovery

`update-password.html` has required 8–128 character password/confirmation inputs. The module reads `email` and `token` query parameters; missing either hides the form and shows invalid/expired-link guidance. It does not require an existing login cookie as proof of recovery authorization. The API validates the token.

Submit checks matching passwords and calls `resetPassword(input: PasswordResetInput!)` with email, token, and password. Network/GraphQL failure shows recovery guidance; a failed payload shows its message; success resets the fields and shows the server message. The backend uses `UserManager.ResetPasswordAsync` and returns neutral invalid/expired guidance on failure.

The page does not redirect/link to login, clear the token from the address bar, disable duplicate submissions, or call logout after success. It still lacks the shared branded header, skip link, theme initialization, theme-color meta, and Customize control. Existing browser suites do not cover this completion page or live token use.

### 10.6 Account registration

Signup now collects required display name (maximum 80), username (3–32, ASCII letters/digits/dots/underscores/hyphens), email (maximum 254), password (8–128), and matching confirmation (8–128). Whitespace-only display names are rejected. Password inputs have independent Show/Hide controls; matching validation updates custom validity, `aria-invalid`, and inline feedback. Submit is enabled after handlers initialize.

After native/custom validation, the handler sends `register(input: RegisterInput!)` with trimmed username/email/displayName and the password. A thrown service error or failed payload keeps the form and displays feedback. The backend validates fields, rejects duplicate username/email, creates a hashed Identity user, reports additional password requirements, and signs in the new user. On success the frontend resets the form/toggle state, announces creation, and navigates to account. No passwords are copied into browser board/profile storage.

The hidden result section and Try the form again handler remain from the earlier preview but are not the current successful registration destination. The guest link now goes directly to Studio. Without JavaScript the submit remains disabled; ordinary login/guest links still navigate. Registration depends on the running GraphQL service; client validity alone does not create an account. Email verification is not implemented.

### 10.7 Account profile

Profile editing remains local despite live identity. Defaults are “Your creative space” and `you@example.com`. A saved name is accepted only as a nonblank string of at most 80 characters, email as a string of at most 254. Malformed/blocked storage falls back to defaults. The panel displays avatar/name, editable local metadata, a local save action, and browser-origin board count.

The page calls authorized `me { id username email displayName }`. When present, it sets Authenticated session and uses the returned email and displayName (or username) in the in-memory profile. A failed request sets Local preview · authentication unavailable. The page is not access-guarded by this query, and a resolved null leaves the preview available.

Saving trims the fields and writes `scalable.profile.v1`; it does not update the Identity user's name/email or verify an email change. A blank name is rejected; storage failure applies changes for the visit and reports lack of persistence. Reopening account with a live identity can replace locally edited display values again via `me`. Saved-board count is read at page load only. Studio reads the local name at startup, not through live identity or a profile subscription.

### 10.8 Customize and connections

The account Customize panel edits the same eight browser preferences as Studio. Pinterest checks deployment availability and, when enabled, reads actual Identity-cookie-backed connection status and changes its link to Manage Pinterest. The current source duplicates this initialization block, so availability/status can be requested twice. Other services remain Not connected previews. No profile/preference update API exists; Pinterest status is implemented.

### 10.9 Security and logout

Password-settings preview only displays a message. End demo session now calls the GraphQL `logout` mutation. On a thrown HTTP/GraphQL error it shows failure and stays on the page; on resolution it clears the tab-scoped preview flag and navigates to login. It does not inspect the returned boolean. It clears the actual Identity cookie through the API as well as the local preview flag, without deleting local boards/profile/preferences or media in another Studio page.

Some account disclaimer/security copy still describes no active account and a future identity service, even when the heading reports an authenticated session. The label End demo session also predates the live logout behavior. Updating those labels is separate from this documentation change.

## 11. Browser storage and media lifetime

| Storage location / key                | Contents                                      | Lifetime and partitioning                                              |
| ------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| localStorage `scalable.boards.v1`     | JSON array of saved complete board records    | Same browser origin; persists across reloads until removed/cleared     |
| localStorage `scalable.appearance.v1` | Eight validated appearance fields             | Same origin; shared across pages/tabs; explicit synchronization        |
| localStorage `scalable.profile.v1`    | Local demo display name/email                 | Same origin; independent of login identity                             |
| sessionStorage `scalable.demoSession` | String `preview`                              | Tab-scoped demo flag; no authorization role                            |
| ASP.NET Identity application cookie   | Server-issued authentication session cookie   | Sent by credentialed GraphQL requests; separate from localStorage keys |
| `audio-library.js` Map                | Item ID to local audio object URL             | Current document memory only                                           |
| `video-library.js` Map                | Item ID to local video object URL             | Current document memory only                                           |
| `app.js` reference variables          | Prompt reference `File` and preview URL       | Current Studio document; cleared when removed/replaced                 |
| Pinterest importer sets/maps          | Selected board IDs, pin choices, current step | Current Studio document; cleared by End preview or reload              |

Local boards and profiles are not keyed by the authenticated Identity user ID. Signing in as a different user or changing a demo profile does not switch, restrict, or delete them. Browser-origin storage is not SQL ownership enforcement. Two site paths on the same origin share these keys; differing local ports or hostnames use different origins.

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
| `mode`                          | string               | `demo` for samples or `ai` after a successful creative-direction response       |
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

AI direction results use `mode: "ai"`; AI songs have IDs `ai-song-<index>`, catalog-search links, and `isSample: false`. AI sounds have IDs `ai-sound-<index>` and `isSample: false` but still contain no recording. Their other fields use the song/sound structures above. The current merge retains enabled curated items alongside these new items. The AI response schema itself is detailed in section 14.2.

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
| `researchAllowed` | false | Excluded from AI research/analysis |
| `isSample`       | true                             | Demo provenance                                              |
| `sourceLabel`    | string                           | Identifies local sample photography, not Pinterest retrieval |

`sourceUrl` is the image's sample-photography repository source. Future live imports need separate original pin, creator/source, preview, and board URLs. A singular current `sourceBoard` does not represent every association when one real pin belongs to multiple selected boards.

Live Pinterest imports add `sourceKind: "pinterest-api"`, `sourceKey: "pinterest:<pinId>"`, `sourceBoards` (all associations), real original Pin/creator URLs, `researchAllowed: false`, `license: "unknown"`, `importedAt`, and `isSample: false`. Fixtures also carry `researchAllowed: false`. No live board URLs are fabricated. See the [full Pinterest DTO](PINTEREST-INTEGRATION.md#data-and-ai-separation).

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

| Module                                                              | Responsibility                                                                                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`app.js`](../frontend/js/app.js)                                   | Studio state, renderers, filters, prompt/reference events, research version guard, import callbacks, saved-board UI, deletion, local profile display |
| [`board-service.js`](../frontend/js/board-service.js)               | Fixed prompt/collection/song data, local board service, legacy item normalization, future HTTP adapter                                               |
| [`appearance.js`](../frontend/js/appearance.js)                     | Appearance defaults/validation, root attributes, persistence, OS/storage/page restoration listeners                                                  |
| [`theme-init.js`](../frontend/js/theme-init.js)                     | Early independent theme resolution before stylesheet paint                                                                                           |
| [`customize.js`](../frontend/js/customize.js)                       | Shared setting bindings and auth-page dialog construction                                                                                            |
| [`audio-library.js`](../frontend/js/audio-library.js)               | Supported URL parser, provider fixtures, audio import UI, local-audio registry/probe, imported audio cards                                           |
| [`pinterest-import.js`](../frontend/js/pinterest-import.js)         | Local fixtures plus async live picker/review/import UI                                                                       |
| [`video-library.js`](../frontend/js/video-library.js)               | YouTube URL parser, video import UI, local-video registry/probe, explicit iframe loading, video cards                                                |
| [`account.js`](../frontend/js/account.js)                           | GraphQL login/registration/recovery/session/logout, local profile, connection-card generation                                                        |
| [`update-password.js`](../frontend/js/update-password.js)           | Email/token query parsing and GraphQL password-reset flow                                                                                            |
| [`icons.js`](../frontend/js/icons.js)                               | Converts selected text symbols to decorative CSS-masked icons                                                                                        |
| [`config/graphqlClient.js`](../frontend/js/config/graphqlClient.js) | Credentialed GraphQL POST helper and configurable API endpoint                                                                                       |
| [`ai-service.js`](../frontend/js/ai-service.js)                     | Same-origin JSON creative-direction POST helper                                                                                                      |

Additional active modules: [`pinterest-service.js`](../frontend/js/pinterest-service.js) provides the cookie-authenticated REST client, bounded all-page traversal, safe OAuth URLs, and live pin conversion; [`research-policy.js`](../frontend/js/research-policy.js) rejects Pinterest inputs before the board research adapters. The Node AI endpoint does not independently enforce that Pinterest-specific rule.

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

### 13.3 Network helper exports

`graphqlRequest(query, variables = {})` returns the GraphQL `data` object or throws on non-OK HTTP/GraphQL errors. Its endpoint is captured when the module initializes. `createCreativeDirection({ prompt, includeSongs = true, includeSounds = true })` POSTs JSON to `/api/ai/creative-direction` with same-origin credentials. It returns parsed response JSON or throws a response error/default message. Neither helper adds cancellation, retries, a CSRF token, or schema validation.

### 13.4 Appearance and icon exports

| Export                         | Implemented contract                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `getAppearance()`              | Returns a shallow copy of the current eight preferences                                                         |
| `updateAppearance(changes)`    | Applies allowed fields, updates subscribers, attempts storage, returns whether persistence succeeded            |
| `resetAppearance()`            | Applies and persists defaults using the same update path                                                        |
| `onAppearanceChange(listener)` | Registers a listener and immediately invokes it with current preferences; no unsubscribe helper is exposed      |
| `setupCustomization()`         | Binds an existing appearance form; creates an auth-page dialog when a trigger exists without a dialog           |
| `iconify(root)`                | Walks text nodes and replaces `✳`, `↗`, `↘`, `↥`, and `▶` with decorative spans using shared symbol classes |

### 13.5 Importer exports and callbacks

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

The `element` helper creates DOM nodes, applies class names, assigns user-visible strings via `textContent`, and iconifies selected symbols. Import callbacks own mutations of the active board; importer modules do not access SQL or save boards themselves. Fixture initialization remains synchronous, but the importer now uses `ApiPinterestService` for async live board/pin pagination, abort handling, and conversion. See [PINTEREST-INTEGRATION.md](PINTEREST-INTEGRATION.md).

## 14. Existing external connections

### 14.1 .NET GraphQL identity — implemented

The active identity endpoint is `/graphql`; loopback and hosted defaults follow section 10.1. All operations travel as POST JSON with a query document and variables, using an ASP.NET Identity cookie.

| Operation                       | Input / output                                                                          | Frontend caller                              |
| ------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `register` mutation             | `RegisterInput`: username, email, displayName, password; returns succeeded/message/user | Signup                                       |
| `login` mutation                | `LoginInput`: identifier, password; same auth payload                                   | Login                                        |
| `logout` mutation               | Boolean result                                                                          | Account end-session action                   |
| `requestPasswordReset` mutation | `PasswordResetRequestInput`: email; succeeded/message                                   | Login and recovery page                      |
| `resetPassword` mutation        | `PasswordResetInput`: email, token, password; succeeded/message                         | Password-update page                         |
| Authorized `me` query           | User id, username, email, displayName                                                   | Account initialization                       |
| `serviceStatus` query           | name, message, checkedAt                                                                | Available API diagnostic; not used by Studio |
| `boards` query                  | Currently always an empty list of summaries                                             | Scaffold only; not used for saved boards     |

The .NET 10 project uses Hot Chocolate GraphQL, ASP.NET Identity, EF Core SQLite, and selectable Npgsql/PostgreSQL. The data context extends IdentityDbContext with an additional unique normalized-email index. It does not contain board/media persistence entities. Data Protection keys use explicit `DataProtection:KeysPath`, otherwise `<DataPath>/keys` (default `Scalable.Api/data/keys`). Database initialization uses `Database.Migrate()`; `Scalable.Api/Data/Migrations/` contains a PostgreSQL initial migration/model snapshot. SQLite compatibility and migration of previously initialized databases are not verified here.

CORS accepts the configured origin list (including `https://scalable123.github.io`), `App:FrontendOrigin`, and HTTP loopback ports in Development. Cross-site Identity cookies require `App:CrossSiteCookies=true` and HTTPS/browser support; the default is false. Production needs explicit origin/session/HTTPS/CSRF configuration, protected persistent Data Protection keys, validated migration application/upgrade paths, rate limits, and email verification. The password-reset adapter currently delivers no mail and does not expose reset tokens in logs.

### 14.2 Node creative-direction API and OpenAI — implemented wiring

[`server.js`](../server.js) serves `frontend/` and implements **POST `/api/ai/creative-direction`**. [`ai-service.js`](../frontend/js/ai-service.js) sends prompt, includeSongs, and includeSounds as JSON. Prompt must be a nonblank string of no more than 2,000 characters and is trimmed server-side. The request reader limits its accumulated body string to 20,000 characters. Invalid prompts return HTTP 400; parsing/size/provider failures are caught as 502 JSON errors. Non-GET requests outside the implemented POST route return 405.

The Node process reads environment variables and a root `.env` file without overriding already supplied truthy environment values. `OPENAI_API_KEY` stays server-side. `OPENAI_MODEL` defaults to `gpt-4.1-mini`; `PORT` defaults to 3000. The provider request goes to `https://api.openai.com/v1/responses` with a strict JSON schema and a system instruction not to claim verified songs or external research.

| Response field                 | Schema                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `title`, `description`, `note` | Required strings                                                             |
| `palette`                      | Required array of exactly five objects, each with string hex/name            |
| `songs`                        | Required array of at most five objects with title, artist, explanation, tags |
| `sounds`                       | Required array of at most three objects with title, artist, description      |

Schema objects disallow extra properties. The server extracts output_text from the provider response and JSON-parses it. It does not independently validate parsed HEX strings, enforce songs/sounds array emptiness against booleans, run a research/search tool, upload the reference image, retrieve new photos, or verify catalog entries. The client merges title/description/palette/note and appends enabled recommendations to its local board as described in section 4.2.

The endpoint currently lacks authentication, rate limiting, request cancellation/timeouts, and a research job lifecycle. A static-only host has no route implementation and falls back to curated samples. The Node endpoint is separate from the .NET GraphQL server; `npm start` does not start Identity, and `dotnet run` does not start this AI endpoint.

### 14.3 YouTube embeds — explicit network access

The video renderer creates a `https://www.youtube-nocookie.com/embed/` iframe only after Load YouTube player. This is embed hosting, not a Data API or account connection. Adding/restoring a reference does not load remote thumbnails or players. Tests intercept iframe responses; they do not verify live playback or provider restrictions.

### 14.4 Outbound links and absent services

Curated/AI songs open Spotify searches; imported links open their provider source/search; image sources link to sample-photo repositories. These links do not fetch catalog metadata or grant application library access. Live image research, licensed sound search, music OAuth/library APIs, YouTube libraries, SQL-backed board storage, and cloud media uploads remain unconnected. Pinterest account linking and selected board/pin reads are implemented by the ASP.NET API; Pinterest content remains excluded from research. The REST `ApiBoardService` remains inactive.

## 15. Required backend and API connections

Existing GraphQL identity and Node AI operations are documented in section 14. The Pinterest `/api/integrations/pinterest` routes in section 15.5 are implemented in the GraphQL/Identity ASP.NET host and require its authenticated cookie session. Other REST `/api/…` routes in sections 15.2–15.4 and 15.6–15.8 are historical proposals/scaffold mappings, not deployed contracts. New account-owned data should extend the selected GraphQL service; exact fields/schema remain to be agreed. The existing `/api/ai/creative-direction` route is implemented in `server.js`.

### 15.1 Complete deployment of the existing identity service

Use the existing ASP.NET Identity cookie authority. Set `window.GRAPHQL_ENDPOINT` to the deployed API before modules initialize and configure the exact credentialed frontend origin. GraphQL now defaults to the configured Render API off loopback, but Pinterest still defaults to localhost unless the global is supplied. No live deployment health is inferred.

Replace the no-delivery password-reset adapter with a production mail service. Configure `App:PublicBaseUrl` to the directory actually serving update-password.html, including any project path. Deploy protected persistent Data Protection keys and validate the checked-in PostgreSQL migration against the intended database and existing data; add email verification, request limits, the chosen CSRF defense, and identity-expiry/error behavior. Registration already creates users and login accepts username/email; these are not future preview-only features.

Boards/profile/preferences remain local and require owner-backed contracts below. UI disclaimer/security/signup/recovery wording must be aligned with actual service outcomes. Pending/duplicate-submit handling and password-reset completion coverage remain incomplete. Live deployment, credential use, and recovery mail were not exercised during this documentation-only update.

### 15.2 Board persistence and SQL ownership

| Method | Proposed route     | Contract                                                                                   | Existing frontend adapter coverage                                          |
| ------ | ------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| GET    | `/api/boards`      | Authenticated owner's board summaries with pagination                                      | `listBoards()` exists, but current saved-list UI expects full board records |
| GET    | `/api/boards/{id}` | Full authorized board DTO, items, and provenance                                           | No detail method or lazy Open fetch yet                                     |
| PUT    | `/api/boards/{id}` | Validate and persist a board for the authenticated owner; return authoritative DTO/version | `saveBoard(board)` exists; no server implementation                         |
| DELETE | `/api/boards/{id}` | Delete the authenticated owner's saved board and return 204                                | `deleteBoard(id)` exists; active UI still uses local service                |

The saved-list renderer currently needs `items`, image URLs, title, timestamp, prompt, and research options. Returning summaries without changing the renderer will break its thumbnail/Open assumptions. Add an async detail fetch when opening a summary, pending/error/retry UI, and pagination/loading/empty handling for the list.

The server must derive ownership from authenticated identity, enforce it on list/read/write/delete and related imports/media, validate item unions and lengths, and preserve JSON field meaning without exposing raw SQL entities. The client ID alone is not authorization. Add concurrency/version handling for saves, timestamps under the server's policy, and a defined already-deleted response policy. The current HTTP helper throws on a 404; it does not translate one into the local deletion service's false result.

Map boards, typed items, research options, source/provider identities, imported relationships, colors, and media references into SQL entities or validated JSON according to the backend design. The configured Identity database stores users, not boards; the separate Pinterest SQLite database stores integration credentials/state. No board/media schema, migrations, or row ownership model is implemented yet. Binary media belongs behind a media service/object store rather than embedded in board JSON.

Local saved boards need an explicit migration/import decision before cloud storage replaces local persistence. They have no trustworthy authenticated owner. Signing in should not silently claim or erase browser-origin records; design a deliberate migration/deduplication path and preserve local-save feedback until a server save actually succeeds.

Deleting a cloud board must keep the confirmation/failure/draft semantics while awaiting the authoritative response. Define separately whether cloud media is unreferenced, retained, or removed. Do not delete shared provider originals just because a board reference is deleted.

### 15.3 AI research, image search, palette, song, and sound results

| Method | Proposed route            | Request / response contract                                                                                                                                         |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/research-runs`      | Multipart `prompt`, optional `reference`, `includeSongs`, and `includeSounds`; booleans sent as text fields for .NET binding; return 202 with run `id` and `status` |
| GET    | `/api/research-runs/{id}` | Return run `id`, `status`, `progress`, optional completed `board`, and optional `error`                                                                             |
| DELETE | `/api/research-runs/{id}` | Cancel an active authorized run; return 204                                                                                                                         |

`startResearch()` and `getResearchRun()` exist in the inactive adapter; there is no cancel method or UI/job scheduler integration. The running UI expects a single `research()` promise resolving to a completed board. Implement the start/poll/completion path, terminal completed/failed/cancelled handling, timeout/retry/cancellation, and protection from results belonging to replaced boards. Keep the existing `boardVersion` guard and distinguish it from actual job cancellation.

The backend must connect the selected AI service and research/search sources, validate and store the prompt reference as needed, perform image analysis where supported, retrieve permitted images and metadata, generate/extract color palettes, select music and sound sources, and assemble the typed board DTO. The current Node AI endpoint generates creative metadata and recommendations but does not perform deep research, reference image analysis, live image search, catalog verification, or generated image output. The fallback keyword selector remains local.

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

The endpoints described in [Pinterest integration notes](PINTEREST-INTEGRATION.md) are implemented. They reuse ASP.NET Identity's GraphQL-issued cookie session rather than a separate bearer-token identity system. The following table records the API responsibilities and implemented routes; `/api/pinterest-import-runs` remains a proposed durable job contract because board persistence is local.

| Method | Route / implementation status                  | Required responsibility                                                                                            |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/integrations/pinterest/availability`      | Public deployment availability, `researchAllowed: false`                                                            |
| GET    | `/api/integrations/pinterest`                  | Authenticated user's actual connection/capability state                                                            |
| POST   | `/api/integrations/pinterest/authorize`        | Begin supported authorization and return an authorization URL                                                      |
| GET    | `/api/integrations/pinterest/callback`         | Validate authorization response/state and exchange credentials server-side                                         |
| DELETE | `/api/integrations/pinterest`                  | Disconnect/revoke as supported while preserving imported board references                                          |
| GET    | `/api/integrations/pinterest/boards`           | Paginated authorized board summaries                                                                               |
| GET    | `/api/integrations/pinterest/boards/{id}/pins` | Paginated authorized pin previews for review                                                                       |
| POST   | `/api/pinterest-import-runs`                   | Proposed durable import job contract, not implemented                                                              |
| GET    | `/api/pinterest-import-runs/{id}`              | Proposed durable import job contract, not implemented                                                              |
| DELETE | `/api/pinterest-import-runs/{id}`              | Proposed durable import job contract, not implemented                                                              |

Before connecting, confirm Pinterest developer approval, supported board/pin APIs and read permissions, authorized board visibility, pagination, request limits, and permitted media usage. The preview proves none of these provider entitlements.

The importer keeps fixture mode separate from authorized live mode. Live board and pin retrieval is asynchronous, includes pagination, cancellation, loading/error/expired/denied states, and full-board traversal before review. Select all covers the full fetched library, not just the first page.

The backend must validate source/destination access and pin IDs, deduplicate idempotently by provider pin identity, preserve complete source relationships/provenance, and report partial imports, unsupported/inaccessible pins, retryable failures, and cancellation. A production schema should retain multiple source-board associations when needed. Fetching/caching/downloading images needs a supported provider implementation; imported references do not transfer ownership or reuse rights.

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

Licensed ambient-sound retrieval also requires a selected sound catalog/provider and a defined search/preview/provenance contract. No licensed sound-provider route or adapter exists yet; AI ambient entries remain text concepts. Preserve the distinction between a text sound direction, an imported local recording, a linked reference, and a licensed playable result.

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

The current deployment keeps the static frontend and Node AI server separate from the ASP.NET GraphQL/Pinterest API. The frontend resolves the GraphQL/API origin from `window.GRAPHQL_ENDPOINT`; cross-origin deployments require the configured frontend origin, credentialed CORS, and HTTPS. Pinterest mutations use the ASP.NET Identity cookie session and validate request origins; do not add bearer-token auth as a second identity system.

Define service error bodies and frontend handling for validation failure, signed-out/expired sessions, forbidden resources, missing/deleted resources, stale updates, rate limits, provider outages, and server failure. Preserve the current draft on failed saves/research/deletes. Add pending/retry/cancel behavior at each async boundary and base success announcements on confirmed service outcomes.

## 16. Accessibility and interaction conventions

Studio, login, signup, recovery, and account pages have skip links to their main content. Controls use native buttons/inputs, associated labels, fieldsets/legends, and named sections. Filters and pin toggles use `aria-pressed`; selected account navigation uses `aria-current`. Decorative brand/icon/waveform elements are hidden from assistive technology where designated. Image descriptions supply alt text; decorative thumbnails use empty alt text.

Audio and video importer tabs use `tablist`, `tab`, `tabpanel`, selected state, and roving tab index. Left/Right arrows move among tabs; Home/End select the first/last tab. Audio cycles across three tabs; video switches between its two. Native dialogs provide modal focus behavior and Escape dismissal. Close buttons have accessible labels. The general information/saved-list dialog also dismisses on clicks outside its rectangle; specialized import dialogs do not define that extra backdrop-dismiss handler.

Pinterest steps move focus to the selected screen heading and expose `aria-current="step"`. Counts and statuses announce selection/import results. Pin select-all supports indeterminate state. Recovery request results move focus to their result panel; successful registration navigates to account. Removal focuses the matching importer. Delete confirmation uses `role="alertdialog"`, labeled title/description, safe initial Cancel focus, pending-write Escape protection, and explicit focus after removal.

Status areas use `role="status"` or polite live regions. Prompt/deletion errors use alert regions. Studio toasts stay visible for approximately four seconds; a later toast resets the timeout. The research grid uses `aria-busy`. Password visibility buttons maintain pressed state and accessible labels. External media/source links use new-tab protections, and imported media actions include descriptive labels.

The stylesheet provides visible focus treatments, touch-size adjustments, wrapping for long saved-board titles/actions, responsive dialog sizes, and reduced-motion behavior. Browser tests cover selected keyboard/focus/responsive flows. No full assistive-technology audit or formal WCAG conformance is established by these tests. The password-update page currently lacks the shared skip link/header/customization structure.

## 17. Local development and GitHub Pages

### 17.1 Run AI and identity services

Run `npm start` from the repository root for the Node server on `http://localhost:3000/` (override with `PORT`). It serves `frontend/` directly, so its root opens Studio rather than the repository landing redirect. Configure `OPENAI_API_KEY` server-side through the host environment or ignored root `.env`; optional `OPENAI_MODEL` defaults to `gpt-4.1-mini`. Do not publish the key in frontend files. Node must support native ES modules and global fetch.

Separately run `dotnet run --project Scalable.Api/Scalable.Api.csproj` with the .NET 10 SDK. The development launch profile uses `http://localhost:5078`, matching the loopback GraphQL default. The API selects SQLite locally and now applies EF migrations at startup; its checked-in migration targets PostgreSQL, so local/provider compatibility and existing SQLite upgrades require validation. `npm start` does not launch this process; neither server proxies the other by default. Set `App__PublicBaseUrl=http://localhost:3000` in the .NET environment for Node root hosting; the checked-in `/frontend` suffix does not match Node paths. For a repository-root Python server, set the actual `/frontend` directory URL instead. See [BACKEND.md](BACKEND.md). No provider key or real account credentials were used in this audit.

Configure `App:PublicBaseUrl` to the actual directory hosting update-password.html. With the Node static root this directory is `http://localhost:3000`; serving the repository root instead puts the page under `/frontend`. The fallback reset URL in code includes `/frontend`, so verify configuration against the chosen server. The current email adapter will not deliver that link until replaced.

### 17.2 Static-only preview

From the repository root, run:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/` for landing-to-login behavior, or `http://localhost:8080/frontend/index.html` for Studio. Python serves static files only; it does not implement the AI endpoint or start the GraphQL API. AI submissions fall back locally; identity can work only with its separately running/configured API.

To serve Studio at the local URL root instead, use:

```sh
python3 -m http.server 8080 --directory frontend
```

Open `http://localhost:8080/`. This mode omits the repository-root landing page because the served directory is already `frontend/`. Relative login/account/import paths still work within that served directory.

Serve over HTTP/HTTPS rather than `file://`, because the app uses ES modules. A current browser must support modules, native dialogs, structured cloning, UUID generation, object URLs, CSS grid/custom properties, and the relevant media codecs. Clipboard features depend on browser permission/context and include a manual fallback. No exact oldest supported browser version is established. There is no service worker, PWA manifest, offline cache, or production bundle.

### 17.3 Branch-based GitHub Pages

After human review/merge, choose the intended publishing branch (for example `main`) and `/ (root)` in Settings → Pages. This documentation review branch does not need to become the publishing source. The root `.nojekyll` supports plain static hosting. The root landing page redirects to the relative login page under the project path. Branch publishing can expose repository-root files as static content; only public client configuration belongs in this branch.

Setting Pages source/publishing permissions is a repository operation separate from writing documentation. Subsequent pushes deploy according to the repository's configured Pages source. A push alone does not prove a completed live deployment.

### 17.4 Manual Actions deployment

[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) defines **Deploy Studio to GitHub Pages** with only a `workflow_dispatch` trigger. It has no push trigger. GitHub requires the workflow to be available on the default branch for its Run workflow UI. Set the repository Pages source to GitHub Actions and run the workflow with the intended ref. The `github-pages` environment's branch permissions must permit that ref.

The job runs on Ubuntu, checks out the selected ref, configures Pages, prepares a temporary static artifact, uploads it, and deploys it. Only root `index.html`, `.nojekyll`, and all of `frontend/` are copied. Tests, `node_modules`, source documentation, and other repository files are not in this Actions artifact. There is no Node build or .NET runtime step.

Workflow actions are `actions/checkout@v4`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, and `actions/deploy-pages@v4`. Base permissions are contents-read; the deployment job also has pages-write and id-token-write. Concurrency uses the `github-pages` group without cancelling an in-progress deployment. The deployment URL is supplied by the deploy step.

Choose the intended single Pages publishing source in repository settings. Project-relative URLs support a `/Scalable/` deployment path as well as a custom-domain root. Configure the deployed GraphQL endpoint, allowed frontend origin/cookie policy, and backend recovery public base URL for the actual published path. The absolute-root AI URL also needs an explicitly hosted/proxied endpoint; Pages cannot execute server.js. GitHub Pages serves the frontend only; application APIs, SQL, workers, provider credentials, and uploads need separate backend hosting.

## 18. Validation and test coverage

There are five standalone CommonJS Playwright browser suites and a .NET integration test project. Each browser script starts its own static server and Chromium. Playwright is installed separately; `CHROMIUM_PATH` overrides `/usr/bin/chromium`. Video checks also require FFmpeg (`FFMPEG_PATH` override). There is no npm test script or test step in the Pages workflow.

```sh
dotnet test Scalable.sln
node tests/pinterest-api.browser.cjs
node tests/studio.browser.cjs
node tests/video-account.browser.cjs
node tests/navigation-theme.browser.cjs
node tests/saved-boards.browser.cjs
```

The following results are from the unmodified suites against the initial main snapshot `baf8f3e`; frontend/test sources are unchanged at final main `68e573c`. [T003](T003.md) records details and focused follow-up checks. Earlier logs/screenshots are historical, not current passing results.

### 18.1 Studio/audio/sample Pinterest

The suite contains theme/customization/responsive checks, song/sound flags/filters, pins, save/reopen, legacy items, blocked storage, audio URLs/playback/reattachment, sample provider libraries, and fixture Pinterest import/deduplication/refinement. **Failed** at `tests/studio.browser.cjs:763`: the zero-external-request assertion sees two localhost Pinterest availability probes. Static serving also makes the AI request fail/fall back; this is not AI success verification.

### 18.2 Video/account

The suite contains YouTube parser/embed mocks, real local WebM decode/playback/reattachment, persistence/removal/refinement, responsive pages, profile/appearance/service-link/sign-out/storage checks. **Failed** at `tests/video-account.browser.cjs:261`: username-style sign-in is valid now and navigation detaches the password-toggle element before the old email-only-flow assertion. GraphQL/YouTube are mocked, not live accounts or playback.

### 18.3 Navigation/theme/signup

This suite serves under `/Scalable/` and contains branding, navigation, OS/override/cross-tab/cached-page/legacy themes, JavaScript-disabled fallbacks, responsive layouts, and signup validation/visibility/storage checks. **Failed** at `tests/navigation-theme.browser.cjs:101`: the mock matches `me` inside `message` and returns `{ me: null }` instead of recovery data. The expected recovery text also omits the current response's word “password.” Later tests still expect the old guest account destination and local signup result panel and omit the now-required username. Those paths need repair before the suite can establish current registration coverage.

### 18.4 Saved-board deletion

**Passed.** Checks safe titles/fallback thumbnails, Cancel focus, Cancel/Enter/Escape, storage failure, in-flight/duplicate protection, selective deletion/unchanged records, responsive dialogs, count/list/empty/focus/reload, retained active draft/audio, new draft identity, absent records, legacy preservation, stale-result protection, and mocked inactive REST DELETE. This does not verify cloud boards or live AI cancellation.

### 18.5 Live Pinterest adapter and backend

`tests/pinterest-api.browser.cjs` uses actual frontend modules with mocked cookie-authenticated API responses, pagination, selected pins, atomic failure/cancel checks, provenance, research exclusion, disconnect, errors, and responsive dialogs. **Failed** at line 69 while waiting for “90” retry-after seconds in `#pinterest-status`. The suite stopped there; later assertions are not claimed as passed.

The seven .NET tests use actual ASP.NET routes, GraphQL-issued Identity cookies, temporary SQLite, synthetic Pinterest handlers, OAuth state/replay/expiry, scopes, ownership/cursors, encryption, refresh/revocation, rate limits, and disconnect. **Not run in this audit:** no .NET SDK was installed, and both official channel/pinned SDK download attempts returned HTTP 403. Historical T001 results remain separate.

[`tests/helpers/mock-graphql.cjs`](../tests/helpers/mock-graphql.cjs) returns synthetic auth results/null `me`; it creates no real user/cookie, verifies no password, sends no email, and does not explicitly model password-reset completion. [`tests/helpers/customize.cjs`](../tests/helpers/customize.cjs) opens shared settings. The mock is not an executable GraphQL schema; its substring dispatch incorrectly treats recovery selections containing `message` as the `me` query.

No fresh result establishes live Render/database health, real email delivery/token completion, Pinterest entitlement, media licensing, production CORS/cookies, or full browser/accessibility compatibility. Documentation validation checks links/anchors, source/configuration contracts, tables/fences, and whitespace. Focused local checks use synthetic data only; see T003 for exact scope.

## 19. Current implementation gaps

| Area                | Current limitation / remaining work                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Deep research       | Node AI metadata generation is wired; no web/image research, source verification, image analysis, or job/progress service            |
| Reference pictures  | Local preview only; not saved, analyzed, uploaded, or accepted as the only brief                                                     |
| AI merge            | Retains enabled curated songs/sounds alongside appended AI concepts; photos and some labels remain fixed samples                     |
| Identity deployment | GraphQL/Identity SQLite/PostgreSQL selection, hosted URL and Pages CORS configured; GraphQL CSRF/limits/mail/verification and migration/provider/upgrade validation remain unfinished |
| Recovery delivery   | Token generation/reset wired; current email adapter sends nothing; reset page lacks shared appearance/navigation                     |
| Auth copy           | Some account/Studio/registration helper text and labels still describe prior previews                                                |
| Authorization       | Studio/account reachable directly; boards/profile/preferences remain browser-origin data, not owner-authorized records               |
| Board storage       | No SQL board schema, cloud save, autosave, migration, version conflict resolution, transactional multi-tab writes, backup, or sync   |
| Saved management    | Open/confirmed single deletion exist; no rename, search, folders, bulk operations, undo, export, or sharing                          |
| Unsaved work        | New board/Pinterest new destination replaces unsaved canvas; no general dirty-state leave confirmation                               |
| Layout              | Generated photos retain fixed placement hints; arbitrary research results need layout/schema integration                             |
| Music providers     | Manual links and library previews only; no OAuth, authorized libraries, verified catalog metadata, streaming, or playlist expansion  |
| Ambient recordings  | Local files play; generated/AI ambient concepts have no recording or licensed sound catalog                                          |
| Pinterest           | Live account linking and paginated selected-board reads are implemented; import results and saved boards remain local                 |
| YouTube             | Manual single-video references and optional embeds; no metadata/search/playlist/account-library API                                  |
| Media durability    | Local file metadata only; no cloud upload/store/authorized playback service                                                          |
| Profile/preferences | Local edits/settings only; me supplies live identity display but no profile-update or cross-device preference API                    |
| REST adapter        | Inactive; not equivalent to the current GraphQL identity/Node AI services; polling/auth/CSRF/cancel/detail wiring incomplete         |
| Tests               | Fresh run: four browser-suite failures, saved-board pass; backend tests blocked by SDK download HTTP 403                        |
| Hosting             | Render GraphQL default and Docker configuration exist; Pinterest endpoint/callback paths differ; Node AI remains separate                                                     |

Focused handoffs are reconciled in [T003](T003.md); screenshots and prior task logs retain historical states. [BACKEND.md](BACKEND.md) records current GraphQL/SQL/storage/deployment boundaries. The audit changes documentation only; current failures and setup limitations remain explicit.

## 20. Source and asset reference

### 20.1 HTML, styling, configuration, and repository files

| Path                                                                           | Role                                                                                                  |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [`../index.html`](../index.html)                                               | Hosted root login redirect/fallback                                                                   |
| [`frontend/index.html`](../frontend/index.html)                                | Studio shell and appearance/audio/video/Pinterest/delete/general dialogs                              |
| [`frontend/login.html`](../frontend/login.html)                                | Sign-in and recovery request form                                                                     |
| [`frontend/signup.html`](../frontend/signup.html)                              | Create-account validation/result UI                                                                   |
| [`frontend/recover.html`](../frontend/recover.html)                            | GraphQL recovery request UI                                                                           |
| [`frontend/update-password.html`](../frontend/update-password.html)            | GraphQL token-based password-reset form                                                               |
| [`frontend/account.html`](../frontend/account.html)                            | Four account panels                                                                                   |
| [`frontend/styles.css`](../frontend/styles.css)                                | Shared design tokens, layouts, components, states, responsive and reduced-motion rules                |
| [`frontend/js/`](../frontend/js/)                                              | ES modules detailed in section 13                                                                     |
| [`frontend/assets/README.md`](../frontend/assets/README.md)                    | Sample-photo sources and provenance limitations                                                       |
| [`package.json`](../package.json), [`package-lock.json`](../package-lock.json) | ES module package and npm start command; no declared runtime dependencies                             |
| [`.gitignore`](../.gitignore)                                                  | Ignores .env, node_modules, .NET bin/obj, SQLite database files, and development Data Protection keys |
| [`.nojekyll`](../.nojekyll)                                                    | Static-hosting marker for repository-root Pages publication                                           |
| [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)                | Manual static Pages deployment                                                                        |
| [`README.md`](../README.md)                                                    | Project vision, roadmap, and development entry point                                                  |
| [`tests/`](../tests/)                                                          | Five browser suites and shared helpers                                                                |

Additional service sources:

| Path                                                                                                          | Role                                                                       |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`server.js`](../server.js)                                                                                   | Frontend static server and OpenAI creative-direction route                 |
| [`Scalable.Api/Program.cs`](../Scalable.Api/Program.cs)                                                       | GraphQL/Identity/SQLite/CORS/key-store registration and endpoint startup   |
| [`Scalable.Api/GraphQL/AccountMutations.cs`](../Scalable.Api/GraphQL/AccountMutations.cs)                     | Account operations, authorized me, inputs and payload types                |
| [`Scalable.Api/Integrations/PinterestIntegration.cs`](../Scalable.Api/Integrations/PinterestIntegration.cs) | Pinterest OAuth, provider API, and encrypted owner-scoped credential flow |
| [`Scalable.Api/Integrations/PinterestStore.cs`](../Scalable.Api/Integrations/PinterestStore.cs)               | SQLite storage for encrypted provider credentials and OAuth state          |
| [`Scalable.Api/GraphQL/Query.cs`](../Scalable.Api/GraphQL/Query.cs)                                           | Service status and currently empty boards scaffold                         |
| [`Scalable.Api/Data/AppDbContext.cs`](../Scalable.Api/Data/AppDbContext.cs)                                   | Identity EF Core database context                                          |
| [`Scalable.Api/Identity/AppUser.cs`](../Scalable.Api/Identity/AppUser.cs)                                     | Identity user with display name                                            |
| [`Scalable.Api/Identity/IAccountEmailSender.cs`](../Scalable.Api/Identity/IAccountEmailSender.cs)             | Email delivery abstraction                                                 |
| [`Scalable.Api/Identity/LoggingAccountEmailSender.cs`](../Scalable.Api/Identity/LoggingAccountEmailSender.cs) | No-delivery adapter that logs no reset credentials                         |
| [`Scalable.Api/Scalable.Api.csproj`](../Scalable.Api/Scalable.Api.csproj)                                     | .NET 10/GraphQL/Identity/EF dependencies                                   |
| [`Scalable.Api/Properties/launchSettings.json`](../Scalable.Api/Properties/launchSettings.json)               | Local API launch profile                                                   |
| [`docs/BACKEND.md`](BACKEND.md) | Current GraphQL/Identity/storage/configuration/deployment reference |
| [`docs/T003.md`](T003.md) | Latest-main audit decisions and fresh verification outcomes |
| [`docs/AUTH-INTEGRATION.md`](../docs/AUTH-INTEGRATION.md)                                                     | Current identity decisions, upstream validation, remaining production work |
| [`docs/AI-INTEGRATION.md`](../docs/AI-INTEGRATION.md)                                                         | Node/OpenAI request flow and configuration                                 |

### 20.2 Local photography

| Local asset                                         | Source                                                                                                                                           | Current usage                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [`mountains.jpg`](../frontend/assets/mountains.jpg) | `bg-masthead.jpg` from [Start Bootstrap Grayscale](https://github.com/StartBootstrap/startbootstrap-grayscale/tree/master/dist/assets/img)       | Hero “Into the quiet”, login art, Pinterest fixture pins                         |
| [`coast.jpg`](../frontend/assets/coast.jpg)         | `demo-image-01.jpg` from the same Grayscale repository                                                                                           | Detail “The in-between”, Pinterest fixture pins; filename is a sample identifier |
| [`water.jpg`](../frontend/assets/water.jpg)         | `bg-masthead.jpg` from [Start Bootstrap Landing Page](https://github.com/StartBootstrap/startbootstrap-landing-page/tree/master/dist/assets/img) | Water “A moment of blue”, signup art, Pinterest fixture pins                     |

Use **Import Pinterest board** in **01 / The Starting Point** to link your account through the GraphQL host's ASP.NET API, select owned boards, read every pin page, and review supported image pins before adding references to the current canvas or a new named mood board. Failed/cancelled retrieval commits nothing. Imports retain Pin/creator links and all source-board associations, can be pinned/removed, survive refinement, and persist locally when saved. New-board creation guards against stale research results. Provider tokens stay encrypted on the server.

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
