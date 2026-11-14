# Video imports and account screens

These additions use plain HTML/CSS/JavaScript and the Studio's shared appearance preferences. The account backend is implemented in C# / ASP.NET Core with GraphQL/ASP.NET Identity; video files still have no cloud storage.

## Video references

Use **Import video** in **02 / A World Taking Shape**, above the canvas, or open the Videos filter:

- **YouTube:** Paste an HTTPS watch, Shorts, embed, or youtu.be video URL and provide a title. The importer validates the hostname/video ID and normalizes optional numeric or `1m30s` start times. Equivalent links to the same video/start time are duplicates. Playlists and channel/library imports are not supported.
- **On-demand embed:** Saving the reference makes no YouTube request and fetches no thumbnail or metadata. Click **Load YouTube player** to create a `youtube-nocookie.com` iframe; **Unload player** removes it. The source link remains available when embedding is disabled, a video is unavailable, or network restrictions prevent playback. Loading an embed contacts YouTube; no account connection is implied.
- **Local video:** Import a browser-decodable MP4, WebM, or MOV up to 100 MB. The importer requires a real video track, not just a matching filename. Native controls play the file locally. Codec support varies by browser.
- **Persistence:** Board JSON stores source links or file details only. Video bytes, blob URLs, and base64 media are never saved. Reopen a saved board after a reload and use **Reattach video** to play a local file again.
- **Editing:** Imported videos survive brief refinement, appear in Everything/Videos, and can be removed. Unused local URLs are revoked when removing references or replacing boards. Rerendering stops local media and unloads embedded players. Local audio/video playback pauses other local audio/video players; embedded players are independently controlled by YouTube.

`frontend/js/video-library.js` handles validation, local object URLs, metadata decoding, import UI, and rendering. Local URLs stay in its in-memory map. DTOs extend existing board items:

```js
// Linked video
{ id, type: 'video', title, imported: true, sourceKind: 'youtube',
  provider: 'youtube', sourceUrl, videoId, startSeconds,
  sourceKey: 'youtube:<id>:<start>', isSample: false }

// Local video reference
{ id, type: 'video', title, imported: true, sourceKind: 'local-video',
  provider: 'local', fileInfo: { name, size, mimeType, lastModified, width, height, duration },
  sourceKey, isSample: false }
```

A future upload service should use authenticated media IDs and object storage with validation, permissions, and retention/deletion rules. Do not store recordings in persisted board JSON. Revalidate YouTube URLs server-side if later resolving metadata or fetching content. The current frontend does neither. Downloading YouTube videos or authenticated YouTube library access is not implemented.

## Login, registration, and recovery

The implemented account service is ASP.NET Core GraphQL with ASP.NET Identity instead of Supabase Auth. GraphQL is the API layer over SQLite locally or configured PostgreSQL. The browser has no Supabase SDK/configuration/dependency. See [BACKEND.md](BACKEND.md), [authentication setup](AUTH-INTEGRATION.md), and [the detailed frontend account flow](FRONTEND.md#10-login-signup-recovery-and-account-pages).

- Login sends `login(input: { identifier, password })`; identifier accepts username or email. Success establishes an Identity session cookie and opens account. Requests include cookies; credentials are not copied to local board/profile records.
- Signup collects display name, a required 3–32-character username, email, password, and confirmation. After client validation, it sends `register` and waits for `succeeded`. The backend hashes passwords, rejects duplicates, enforces Identity password requirements, and signs in. Success navigates to account; it no longer reveals the old local-preview result panel. Registration sends credentials to the configured API.
- Login and standalone recovery call `requestPasswordReset`. The response is neutral. The current email adapter neither sends mail nor logs reset URLs/tokens, so acceptance is not delivery.
- `update-password.html` reads email/token from the URL, checks matching passwords, and sends `resetPassword`. Identity validates the token. The page lacks shared appearance/navigation and leaves query tokens in the address bar; existing browser suites do not cover completion.
- Guest navigation opens Studio without authenticating. Both login and registration use session cookies (`isPersistent: false`); persistent database accounts are separate from persistent browser sessions. Email verification is unfinished.

For Node's root-hosted frontend, set `App__PublicBaseUrl=http://localhost:3000` in the .NET environment so reset links match `/update-password.html`. The checked-in `/frontend` suffix is suitable only for a server actually serving that directory path. Hosted GraphQL defaults to the configured Render URL, while Pinterest still defaults to localhost unless `window.GRAPHQL_ENDPOINT` is explicitly set. See the backend guide before cross-origin deployment.

## Account page

`frontend/account.html` provides hash-addressable sections:

- **Profile:** Authorized GraphQL `me` supplies the in-memory name/email when available. Editing still writes `scalable.profile.v1` locally and does not change the Identity account or verify an email. The Studio reads that local profile at startup. Saved-board counts are browser-local.
- **Customize:** Shared theme/accent/spacing/edges/typography/layout/canvas/reading preferences remain local browser settings.
- **Connections:** Pinterest reads actual cookie-authenticated status when the approved backend is configured; its Manage link opens the import flow. Other music/YouTube cards remain Not connected previews. Pinterest imports are excluded from AI research. See [Pinterest setup](PINTEREST-INTEGRATION.md).
- **Security:** Password-settings controls remain message-only. The end-session action calls GraphQL `logout`, clears the tab-scoped demo flag, and returns to login without deleting local boards/profile/preferences. It handles thrown errors but does not inspect the returned boolean. Some labels still describe the earlier preview.

The Studio/account routes remain directly reachable. Local board/profile/preferences are not partitioned by Identity user and are not secured by a successful `me` query. Browser storage failures fall back to the current visit with appropriate persistence messages; provider credentials remain server-side.

## Implemented and future contracts

Current GraphQL operations are `register`, `login`, `logout`, `requestPasswordReset`, `resetPassword`, authorized `me`, diagnostic `serviceStatus`, and the empty `boards` scaffold. Exact inputs/payloads are in [BACKEND.md](BACKEND.md#implemented-graphql-contract). There is no `/api/auth/register` or other REST identity route.

Profile/preference updates, board ownership/persistence, verified-email changes, cloud uploads, and real music-library connections remain future work. Design these against the GraphQL account authority instead of presenting old proposed REST routes as working services. Uploads need authenticated media IDs, access controls, retention rules, and server validation; provider OAuth remains separate from application login.

## Validation

The existing video/account suite uses Playwright/Chromium and FFmpeg (`CHROMIUM_PATH`/`FFMPEG_PATH` overrides). It contains URL/canonicalization/duplicate/embed checks, real local video decoding/playback/reattachment, persistence/removal/refinement, account/theme/deep-link/storage assertions, and mocked GraphQL/YouTube responses.

The fresh T003 run failed at `tests/video-account.browser.cjs:261`: valid username-style login navigated away before a password-toggle assertion written for the old email-only flow. The navigation/theme suite failed during recovery: the mock matches `me` inside `message` and returns the wrong payload; its expected text and later signup assumptions are also outdated. These failures mean the checked-in suites do not establish complete passing account coverage for current main. Signup really transmits a registration request; claims that it never sends form data are obsolete.

See [T003](T003.md) for all five suite outcomes and focused mocked checks. No live accounts/provider playback/email delivery or production database were used. Token-reset completion and actual mail delivery remain unverified.

Previews: [login](design-previews/studio-login.png) · [account](design-previews/studio-account.png) · [connections](design-previews/studio-account-connections.png) · [video import](design-previews/studio-video-import.png) · [video reference](design-previews/studio-video-reference.png).

Login, signup, recovery, account, and Studio pages share a static logo with the Studio star. System/Light/Dark choices live inside Customize rather than in the navbar; auth pages open a shared settings dialog and the account page uses its Customize tab. System follows the device by default. `theme-init.js` initializes appearance before paint; `appearance.js` handles explicit overrides, device updates, cross-tab synchronization, and cached-page restoration. The navigation/theme suite also verifies legacy MediaQueryList behavior and real links with JavaScript disabled.

The navigation/theme suite contains project-path/theme/validation checks, but its obsolete expectations must be repaired before claiming that it passes against current main. Historical screenshots below/above may show the earlier preview and do not establish current auth behavior.
