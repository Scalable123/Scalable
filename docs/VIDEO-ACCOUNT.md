# Video imports and account screens

These additions use plain HTML/CSS/JavaScript and the Studio's shared appearance preferences. The planned backend remains C# / ASP.NET Core with SQL storage.

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

A future upload service should use authenticated media IDs and object storage with validation, permissions, and retention/deletion rules. Do not store recordings in SQL board JSON. Revalidate YouTube URLs server-side if later resolving metadata or fetching content. The current frontend does neither. Downloading YouTube videos or authenticated YouTube library access is not implemented.

## Login page

`frontend/login.html` preserves the remote branch's Supabase sign-in and email-recovery integration. Sign-in sends credentials to Supabase Auth; passwords are not copied into the local demo profile. Recovery uses the entered email and a project-relative `update-password.html` callback. `update-password.js` retains the remote session-checked password-update flow. Actual emails/account sessions are not exercised by the browser tests.

The SDK is loaded lazily so signup, recovery preview, and theme/navigation controls do not depend on SDK availability. The client uses a pinned browser-compatible jsDelivr ES module for the same Supabase package version declared by the remote branch. Login/recovery failures report an unavailable state rather than preventing all page controls from loading. Supabase session persistence remains configured by the remote client; no tokens or project keys are embedded into the signup preview.

The demo-account shortcut remains available. Its tab-scoped `scalable.demoSession` flag is not authentication. The legacy `recover.html` page remains a standalone frontend preview; it does not send mail. Real password recovery from login uses the Supabase hook instead. Local board/profile data is still browser-origin storage and is not automatically secured or partitioned by a Supabase session.

## Create-account page

`frontend/signup.html` is linked from login and the account page's security section. It shares the static logo, device-following theme, and split-screen Studio layout. Its form validates a nonblank display name, email format, an 8-character minimum sample password, and matching confirmation. Both password fields have independent show/hide controls.

Successful validation clears all fields, hides the form, and shows an explicit preview confirmation with links to the account preview and login. **No account is registered, no email is sent, and no signup name, email, password, or session is saved or transmitted.** Existing local profiles, boards, and appearance preferences are preserved. The retry action starts with an empty form.

The form's submit button is enabled only after its validation handlers are ready. With JavaScript unavailable, its notice explains the limit and ordinary login/demo links still work. Inputs have no form names, and the fallback action points to the local preview page, so form values cannot enter fallback GET parameters. Signup is not an authentication or ownership boundary.

Real registration should call a future `POST /api/auth/register` through the .NET identity service, with authoritative validation, account creation, secure password handling, verified-email workflow, and actual success/error responses. Client-side confirmation is a convenience, not proof of account creation.

Previews: [create account](design-previews/studio-signup.png) · [validation confirmation](design-previews/studio-signup-success.png).

## Account page

`frontend/account.html` provides hash-addressable sections:

- **Profile:** Edit local demo display name/email. `scalable.profile.v1` stores these explicitly entered profile details in this browser. The Studio sidebar displays the saved name. This is not an identity change or an email-verification flow.
- **Appearance:** Uses the same theme/accent/spacing/edges/typography/layout/canvas/reading preferences as the Studio. Changes persist through `appearance.js`.
- **Connected services:** Pinterest, Spotify, Amazon Music, Apple Music, SoundCloud, and YouTube all remain **Not connected**. Links open their appropriate Studio import previews. The `?import=` deep link is consumed after opening a known local dialog.
- **Sign-in & security:** Explains the future identity boundary. Password settings are a message-only preview. Ending the demo clears its tab flag and returns to login without deleting boards, profile details, or appearance preferences.

Local boards belong to the browser origin and are not partitioned by these demo profiles. Changing the profile or ending a demo session does not protect or switch their ownership. Real per-user authorization and SQL ownership checks belong in the backend.

`account.js` owns page interactions; `icons.js` supplies the shared vector symbols. Blocked/corrupt storage falls back to the local preview, with failure messages when a save cannot persist. No passwords, provider tokens, or credentials are stored by these screens.

## Future ASP.NET Core contract — not implemented

| Method    | Endpoint                   | Responsibility                                                      |
| --------- | -------------------------- | ------------------------------------------------------------------- |
| GET       | `/api/session`             | Actual authenticated session summary, without tokens                |
| POST      | `/api/auth/login`          | Server identity validation and secure session creation              |
| POST      | `/api/auth/logout`         | Server session invalidation                                         |
| POST      | `/api/auth/password-reset` | Recovery request with neutral response and server-side rate limits  |
| GET / PUT | `/api/account/profile`     | Authorized profile read/update and separate verified-email workflow |
| GET / PUT | `/api/account/preferences` | Optional authenticated preference sync                              |
| GET       | `/api/account/connections` | Real provider status/capabilities without secrets                   |
| POST      | `/api/media/uploads`       | Optional authenticated local-media upload; return a media ID        |

Use the application's supported identity service, secure session handling, appropriate CSRF protections for cookie mutations, server-side input validation, and ownership checks. Replace demo flags/profile storage with service adapters; never treat the presence of browser data as authentication. Keep provider connections separate from application login. Add real loading, success, failure, recovery, and session-expiry behavior only from server responses.

## Validation

Run `node tests/studio.browser.cjs` for the existing Studio/audio/Pinterest regression suite and `node tests/video-account.browser.cjs` for these additions. Both require Playwright and Chromium; the new suite also uses FFmpeg (`FFMPEG_PATH` override) to generate a tiny local WebM fixture.

The new suite checks URL rejection/normalization, duplicate moments, explicit embed load/unload, local video decoding/playback and reattachment after reload, removal, refinement preservation, mobile layouts, login validation, lack of credential persistence/transmission, local profile persistence, shared preferences, service deep links, preview sign-out, and blocked storage. The YouTube iframe route is intercepted by the test; live YouTube playback, identity APIs, provider APIs, SQL, and cloud uploads are not verified or implemented.

Previews: [login](design-previews/studio-login.png) · [account](design-previews/studio-account.png) · [connections](design-previews/studio-account-connections.png) · [video import](design-previews/studio-video-import.png) · [video reference](design-previews/studio-video-reference.png).

Login, signup, recovery, account, and Studio pages share a static logo with the Studio star. System/Light/Dark choices live inside Customize rather than in the navbar; auth pages open a shared settings dialog and the account page uses its Customize tab. System follows the device by default. `theme-init.js` initializes appearance before paint; `appearance.js` handles explicit overrides, device updates, cross-tab synchronization, and cached-page restoration. The navigation/theme suite also verifies legacy MediaQueryList behavior and real links with JavaScript disabled.

The navigation/theme browser suite also checks signup navigation under `/Scalable/`, required/whitespace/email/length/mismatch validation, visibility toggles and reset, no persistence or transmission of submitted details, blocked storage, and light/dark layouts at five widths.

### Remote-branch integration validation

The signup change was rebased over a remote Supabase integration. Browser suites intercept `supabaseClient.js` with `tests/helpers/mock-supabase.cjs` to check the preserved sign-in/recovery/session/sign-out hooks without sending credentials or recovery mail to the live project. The signup path performs no auth-client calls. The pinned SDK URL was checked for successful HTTPS delivery with a JavaScript content type; live project authentication is not claimed as verified.
