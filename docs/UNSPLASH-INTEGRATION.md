# Unsplash image source

Application ID: **1133409**. The Access Key is server configuration; the Secret Key is not needed or stored. See [backend setup](BACKEND.md). Do not add either key to browser code, documentation, URLs, or Git.

## Implemented flow

1. An explicit **Explore this feeling** submission creates the existing local sample direction and makes one same-origin request to the optional Unsplash backend.
2. The backend atomically reserves **two** of its **50 requests per rolling hour**, shared by all users/processes using its budget file. If a pair is unavailable, it returns `rate_limited` without calling Unsplash.
3. Search `GET https://api.unsplash.com/search/photos` once with the submitted prompt, `per_page=1`, and `content_filter=high`. `Authorization: Client-ID …` and `Accept-Version: v1` stay on the server. There is no query expansion, pagination, fallback search, polling, or retry.
4. Validate the first result's identity and HTTPS media/source/creator/tracking hosts. Call its `links.download_location` once to register the download-like board selection. Redirect following is disabled; only `api.unsplash.com/photos/{id}/download` is accepted, with its original query retained. Never fetch the returned download/image bytes on the server.
5. After successful tracking, return one image DTO. Replace the sample hero with that photo; all other palette/music/sample content stays clearly labeled. This retrieves existing photography; no live AI interpretation or generated imagery is implemented.

Both reservations remain spent even after a single-call failure, no results, cancellation, or failed tracking. This conservative ceiling permits at most **25 successful photo selections per hour**. The last lone request is not spent on a search that cannot be tracked. Unsplash tracking might receive different provider-side accounting; the local ceiling intentionally counts every API call. Provider 429 or `X-Ratelimit-Remaining: 0` blocks new calls for an hour. A successful tracking call reporting zero still returns its photo and blocks subsequent requests. Each API operation has a five-second timeout. The browser allows twelve seconds for the source endpoint.

Startup, page reload, **New mood board**, local save/open, pinning, filters, and asset loading never initiate an Unsplash API request. Existing photo URLs are hotlinked on saved-board reopening; those image/CDN loads are distinct from metadata API calls. A prompt click can produce no new photo if the source is unavailable, returns no results, or is exhausted. Current pinned photos and imported media survive.

## Attribution and source requirements

Unsplash photos hotlink the exact `urls.regular` URL returned by the API, retaining its existing parameters. Each card displays **Photo by [creator] on [Unsplash]**, linking the returned creator profile and photo page, with `utm_source=scalable&utm_medium=referral`. Both links open with `noopener noreferrer`. Provider text uses DOM text nodes; it is never injected as HTML.

Saved metadata includes `provider: "unsplash"`, stable `id: "unsplash-<photoId>"`, `externalPhotoId`, `url`, `title`, `description`, `sourceUrl`, `sourceLabel`, `creatorName`, `creatorUrl`, layout position, and pin state. The board records `mode: "sample-with-unsplash"` and `imageSourceStatus` for its last prompt. This is source provenance, not a grant of rights for every depicted person, trademark, or property. Review the [Unsplash license](https://unsplash.com/license) and [API guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines) for any future export, redistribution, or commercial use.

The official [Unsplash JS SDK documentation](https://github.com/unsplash/unsplash-js#readme) explicitly requires hotlinking, photographer attribution, and download tracking; its tracking example applies the download endpoint after choosing a search result. Direct Unsplash documentation/help pages were blocked with HTTP 403 during implementation, so the official SDK was the available reference. No SDK dependency is needed in this application.

## Refinement, failures, and hosting

A photo's stable provider ID prevents duplicates. Pinned photos remain through later prompts; unpinned provider photos are replaced. Extra retained images use the existing adaptive multi-image collage. Imports, independent song/sound options, local media, saving/reopening, and stale-result guards retain their behavior. Source failures show a persistent status near the canvas and leave the sample direction usable. New board/opening another board prevents late results overwriting that canvas.

Use the ASP.NET host (or a same-origin reverse proxy routing `/api/image-sources/unsplash`) for live search. **GitHub Pages alone cannot run the endpoint or keep a server key.** Static-only hosting receives an unavailable-source status on Explore and continues with samples. No Pages setting, deployment, authentication migration, or merge is part of T001.

## Tests

`tests/backend/` covers concurrent reservations, multiple processes, restart persistence, rolling expiry/clock rollback, upstream quota exhaustion, failed tracking, empty/malformed responses, blocked/unwritable state, missing keys, URL/identity validation, credential placement, hotlink/referral preservation, timeouts, and no retries.

`tests/unsplash.browser.cjs` covers real host validation/origin/body/file isolation and fixture-based one-image submissions, zero-cost startup/new/save/open/filter flows, attribution text safety, pin/deduplication/refinement, metadata persistence, responsive layouts, all fallback statuses, invalid result URLs, and stale completion. No routine test contacts Unsplash. Four existing frontend suites check affected navigation/themes, audio/video/Pinterest imports, deletion, local media, and saved boards.
