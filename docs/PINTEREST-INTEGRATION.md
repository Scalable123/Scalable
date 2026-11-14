# Pinterest account linking and board import

Pinterest is available only for **user-directed account linking and importing the user's own boards**. Scalable does not search, crawl, scrape, or use Pinterest content for AI research, image analysis, recommendations, or training. Imports copy references into Scalable; originals on Pinterest are never modified or deleted.

The implementation includes routes on the ASP.NET Core GraphQL/Identity host and an asynchronous browser importer. Pinterest routes use the same ASP.NET Identity cookie session as GraphQL. Live use is **disabled by default**. The separate sample preview still runs on a static server or GitHub Pages. Tests use synthetic responses; a successful live Pinterest connection has not been verified.

## Permitted use and provider requirements

Before enabling live use, the operator must verify Pinterest developer approval, account eligibility, approved read scopes, the app's permitted import/reference-display use, and current media display/retention requirements. Set `Pinterest__ImportUseApproved=true` only after that review establishes permission for this specific use. The switch records operator attestation; it is not a legal determination by the software. If approval does not permit imports, keep live access disabled and use the local samples. Attribution does not grant reuse rights.

Technical reference: [Pinterest's official API description](https://github.com/pinterest/api-description/blob/main/v5/openapi.yaml), consulted November 14, 2026. The developer website was inaccessible under this workspace's network policy; the official specification was the next available reference. Authorization uses `https://www.pinterest.com/oauth/`; server API calls use fixed paths at `https://api.pinterest.com/v5/`.

Only `boards:read`, `pins:read`, and `user_accounts:read` are requested. No write or secret-board scopes, ad-account delegation, public discovery, arbitrary-pin lookup, or generic proxy is exposed. Board owners must match the linked account; group boards owned by others are excluded. Boards unavailable under these permissions remain unavailable.

The specification says `/oauth/token/revoke` currently supports **system-user tokens only**. Ordinary account disconnect removes Scalable's credentials and pending authorizations, and tells the user to remove Scalable in Pinterest account settings to revoke the provider grant. It does not report remote revocation.

## Local setup and deployment

Install a current .NET 10 SDK. From the repository root, start the GraphQL/API host:

```sh
dotnet run --project Scalable.Api
```

In another terminal, start the frontend and AI endpoint with `npm start`, then open `http://localhost:3000`. The frontend sends GraphQL and Pinterest API requests to `http://localhost:5078` by default. Defaults keep live Pinterest access unavailable and offer the sample preview.

Configure these **server-side** environment variables or equivalent deployment settings:

| Setting | Value / responsibility |
| --- | --- |
| `Pinterest__Enabled` | `true` to offer live linking |
| `Pinterest__ImportUseApproved` | `true` only after permitted-use review |
| `Pinterest__ClientId` | Approved Pinterest app ID |
| `Pinterest__ClientSecret` | App secret; never commit or ship to the frontend |
| `PublicOrigin` | Exact external API origin used for the Pinterest callback, e.g. `https://api.example.com`; HTTPS required outside Development loopback |
| `App__FrontendOrigin` | Exact frontend origin allowed to make credentialed GraphQL/Pinterest requests, e.g. `https://studio.example.com` |
| `ConnectionStrings__Default` | Persistent Identity database connection |
| `AllowedHosts` | Deployment's allowed host names |
| `DataPath` | Private persistent directory outside static hosting; defaults to `Scalable.Api/data/` |

Register `${PublicOrigin}/api/integrations/pinterest/callback` in the Pinterest app. ASP.NET does not automatically load `.env` files. Use environment configuration or the deployment secret manager, never browser configuration.

Use one backend instance with persistent Identity and Pinterest SQLite storage and persistent ASP.NET Data Protection keys. Tokens, refresh credentials, username, scopes, and expirations are encrypted with an owner-specific purpose before SQL storage. Protect the private volume/key directory with restrictive permissions and host-appropriate encryption. The file-based development key ring is not independently wrapped with a production KMS. Preserve keys across restarts; losing them requires reconnecting accounts. Multiple API instances require a shared credential store/key management and distributed refresh/disconnect coordination.

Publish the `Scalable.Api` project and keep the Node frontend/API origin configuration aligned with the backend. Set `App__FrontendOrigin` to the deployed frontend origin and configure `window.GRAPHQL_ENDPOINT` to the API origin. The ASP.NET API allows credentialed CORS only for that configured origin (and local loopback origins in development); cookie requests must remain same-site. GitHub Pages alone cannot host the API; its sample preview remains available. Keep query strings out of proxy/APM logs, especially OAuth callback queries.

## User flow

1. Log in to Scalable through the GraphQL identity service. Save unsaved work before leaving for Pinterest authorization; the importer displays this reminder.
2. Open **Import Pinterest board**. Availability is checked without requiring a session. When available, actual authenticated status is read through the GraphQL backend's Identity cookie. Account connection cards also show actual status.
3. Choose **Link Pinterest account**. A credentialed cookie-session POST starts OAuth. A hashed random ten-minute state is bound to the Scalable user and a random HttpOnly/SameSite=Lax browser cookie. Starting again invalidates older pending authorization for that user. Callback validates the binding and atomically consumes state before server-side code exchange. Replay, expiry, and denial cannot create a connection. Fixed callback redirects never contain credentials or codes.
4. All board-summary pages load. Pins are read only after the user selects boards and requests review. Search and Select all cover the full loaded library.
5. Review reads every pin page for each selected board. Progress and Cancel request are available; closing aborts outstanding work. Every page must finish before Review appears. A failed page, rate limit, pagination bound, or cancellation cannot commit earlier pages to the canvas.
6. Review supported image pins, optionally deselect some, and choose the current or a new named Scalable board. Video, carousel, missing-image, and untrusted-image-host pins are excluded and counted. Zero selected pins disables Import. A changing Pinterest board can change during pagination; traversal is not a provider snapshot guarantee.
7. Confirm to copy references locally. Save the Scalable board to persist them in this browser. Original Pin/creator links are retained; previews load directly from validated HTTPS `pinimg.com` hosts without referrers. No image downloader, cache, or AI processing is implemented.

**Preview Pinterest connection** explicitly uses three local boards (6, 4, and 5 pins), local photography, and “not connected” labels. Live failures never silently switch to fixtures. Ending the preview resets selections. Real Disconnect preserves imported references and reports the provider-revocation limitation.

## Implemented API

Routes are under `/api/integrations/pinterest` on the ASP.NET Identity host. Availability and callback are public; all other routes require the same authenticated Identity cookie issued by GraphQL registration/login. The caller cannot choose another owner. Pinterest credentials never enter browser responses/storage. Credentialed CORS is restricted to the configured frontend origin and local loopback in development; state-changing API requests validate their Origin when supplied.

| Method | Suffix | Result |
| --- | --- | --- |
| GET | `/availability` | Deployment availability and `researchAllowed: false` |
| GET | (none) | Status, optional username, `canImport`, `researchAllowed: false` |
| POST | `/authorize` | OAuth URL and browser-binding cookie |
| GET | `/callback` | One-time state validation, code exchange, provider identity, encrypted credential save, fixed redirect |
| DELETE | (none) | Credential/pending-state removal; `providerRevocationRequired: true` |
| GET | `/boards?bookmark=…` | Owned summaries: `{ items, bookmark }` |
| GET | `/boards/{id}/pins?bookmark=…` | Authorized previews: `{ items, bookmark }` |

Provider page size is 100. Opaque bookmarks are protected for the Scalable owner/resource. Numeric board IDs are validated; ownership is checked on each pin page. Tokens refresh before expiry, using continuous refresh and rotated credentials where returned. Invalid refresh credentials and revoked access require reconnection. Missing read scopes or returned write scopes fail linking. Provider redirects are not followed.

Requests have timeouts, bounded response buffers, and a per-owner limit of 60 requests/minute (anonymous routes use remote address). Provider rate limits preserve `Retry-After`; no automatic retry loop runs. Each resource traversal is bounded to 1,000 pages and 50,000 identities. Exceeding limits fails without importing partial data; retry after a limit or select fewer boards. Durable cloud import jobs are not implemented because board saving remains local; `/api/pinterest-import-runs` remains a future contract.

States include unavailable, signed out, disconnected, authorizing, denied/failed callback, connected, expired, empty library, loading, cancellation, forbidden/deleted board, rate limit, incomplete traversal, and provider failure. API responses use `Cache-Control: no-store`. Provider error bodies/secrets are not forwarded.

## Data and AI separation

`pinterest-service.js` owns authenticated HTTP, all-page traversal, OAuth URL validation, and live item conversion. `pinterest-import.js` owns fixtures and the async picker. `app.js` commits local canvas changes and preserves imports during refinement.

```js
{
  id, type: 'image', title, description, url,
  sourceUrl, originalPinUrl, creatorSourceUrl, sourceLabel,
  position: 'pinterest', pinned: false, imported: true,
  provider: 'pinterest', sourceKind: 'pinterest-api',
  sourceKey: 'pinterest:<provider-pin-id>', externalPinId,
  sourceBoard: { id, title, url: null },
  sourceBoards: [{ id, title, url: null }],
  isSample: false, researchAllowed: false, license: 'unknown', importedAt
}
```

The same pin across selected boards yields one item with all source associations. Reimport merges associations without duplicating items; removal permits reimport. Fixtures retain `pinterest-demo:<fixture-id>` identities and `isSample: true`, and also carry `researchAllowed: false`. Live board URLs are not fabricated from IDs.

Imported items remain display references after refinement and are never research request input. Live board titles/descriptions never become research prompts; new live-import boards start with a blank brief. Both current sample research and the future HTTP adapter reject Pinterest/pin.it/pinimg domain inputs. `research-policy.js` also rejects Pinterest-tagged objects or `researchAllowed: false` references in structured inputs. The new backend exposes no research/search/crawl endpoint. Future AI workers must independently enforce exclusion server-side, including tools, redirects, media, derived content, and provider allowlists; client flags alone are not a server security boundary.

## Validation

```sh
dotnet test Scalable.sln
node tests/pinterest-api.browser.cjs
node tests/studio.browser.cjs
node tests/video-account.browser.cjs
node tests/navigation-theme.browser.cjs
node tests/saved-boards.browser.cjs
```

Backend integration tests exercise actual routes with GraphQL-issued Identity cookies, synthetic Pinterest HTTP handlers, SQLite, encryption, replay/expiry, denial/scopes, ownership, scoped bookmarks, refresh/revocation, rate limits, and disconnect. Browser checks use actual modules with mocked APIs to verify cookie-based requests, pagination, atomic cancellation/failure, unsupported pins, source relationships, saving, research exclusion, disconnect, errors, and responsive dialogs. Existing preview behavior remains covered by Studio tests.

Tests do not establish live account access, approval, real token exchange, library entitlement, media licensing, or production deployment. See [T001](T001.md) for decisions and results.
