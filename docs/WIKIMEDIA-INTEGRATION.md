# Wikimedia Commons image source

Implemented in `frontend/js/wikimedia-source.js`, `WikimediaBoardService`, and the Studio image renderer. Decision history: [T001](T001.md). Backend boundary: [BACKEND](BACKEND.md).

## Access and current provider limits

The public Commons Action API at `https://commons.wikimedia.org/w/api.php` supports anonymous reads. This integration needs **no API key, developer account, OAuth token, or paid subscription**. It does not use the deprecated API Portal host. See the [Commons API](https://commons.wikimedia.org/wiki/Commons:API) and [Action API FAQ](https://www.mediawiki.org/wiki/API:FAQ).

Verified against official documentation on November 14, 2026:

| Access class | Documented API requests/minute |
| --- | ---: |
| Unidentified client | 10 |
| Unauthenticated web browser | 200 |
| Unauthenticated client with compliant User-Agent | 200 |

These are shared infrastructure ceilings, not an allocation reserved for this app. Limits can change and shared-IP traffic can consume availability. Always obey provider responses, including HTTP 429/503 and `Retry-After`. See [Wikimedia rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits) and [API etiquette](https://www.mediawiki.org/wiki/API:Etiquette).

The browser sends `Api-User-Agent: ScalableStudio/1.0 (https://github.com/Scalable123/Scalable)`; it retains its genuine browser User-Agent. Server clients must supply their own descriptive User-Agent/contact. See the [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy).

## Prompt behavior and budget

- Only an explicit nonblank **Explore this feeling** submission searches. Initial load, New mood board, saved-board opening, filters, and local import previews do not search.
- Add **zero or one new Wikimedia image per submitted prompt**. Existing pinned Wikimedia images survive later refinements; a board may contain images retained from multiple submissions. Unpinned prior Wikimedia results are replaced. Matching page IDs are deduplicated and keep their pin state.
- Make at most one GET request, combining search and image metadata for up to three ranked candidates. Use the first supported result, and load only its image file. No pagination, second search, or automatic retry occurs. Candidate metadata is not three imported images.
- Extract up to eight distinct search words from the brief and combine them as quoted alternatives with `filetype:bitmap`. Search operators from user input are not executed. This is keyword search, not AI interpretation or image analysis.
- A Web Lock prevents simultaneous lookups across tabs on this origin. `scalable.wikimedia.nextRequestAt.v1` stores the next request time. Start requests at least 6.1 seconds apart, conservatively below even the unidentified-client ceiling. Unsupported locking, blocked storage, or corrupt budget data skips the lookup.
- HTTP 429/503, or API `maxlag`/`ratelimited`/`readonly`, pauses requests until the exposed `Retry-After` deadline (seconds or HTTP date), with a minimum local interval. Missing/invalid/unexposed headers use a 60-second cooldown. Never shorten a provider deadline or switch credentials/IPs to evade it.
- Cache up to 20 recent searches, including empty results, for ten minutes in document memory. Cache hits make no API call. Cached results are cloned before use. Saved boards retain references, not downloaded file bytes.
- Abort at eight seconds. New/Open/import-to-new/delete-active-board abort an old request; the existing version guard prevents stale results replacing newer work. Duplicate in-flight form submissions are ignored.

The local gate applies to the browser origin, not all users worldwide or all programs sharing an IP. The eventual server must enforce its own aggregate quota; client controls are not authoritative backend enforcement.

## Reuse, attribution, and data

Commons files have individual licenses; Wikimedia does not own most of them. Use the file description and license links when assessing a planned reuse. See [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).

This adapter accepts JPEG/PNG/WebP previews only, with positive dimensions, readable creator/title, a Commons file-page source, an `upload.wikimedia.org/wikipedia/commons/` thumbnail, and a canonical HTTPS Creative Commons license URL. Supported licenses: CC BY and CC BY-SA versions 1.0/2.0/2.5/3.0/4.0, CC0 1.0, and Public Domain Mark 1.0. Noncommercial/no-derivatives, unfamiliar/ported/missing licenses, absent creators, unsafe URLs, bad-file flags, non-free/deletion flags, and nonempty reuse restrictions are skipped. This deliberately excludes some otherwise reusable files. Community metadata can be incomplete; automated checks do not resolve every permission or jurisdictional issue.

[`imageinfo`](https://www.mediawiki.org/wiki/API:Imageinfo) and [`CommonsMetadata`](https://www.mediawiki.org/wiki/Extension:CommonsMetadata) supply provenance. Cards show full plain-text creator, supplied credit/custom attribution/copyright, safe HTTPS author/credit links, original file-page link, and linked license. Excessively large credits are rejected rather than truncated. Inert HTML parsing removes markup/scripts; provider HTML is never inserted into the live DOM. Previews use `object-fit: contain`, so the application does not crop or alter the supplied image. Attribution stays readable on mobile, dark themes, both layouts, and Images/Everything filters. Restored Wikimedia URLs/licenses/credit links are revalidated before rendering. A failed image request retains the credit/license/source with a preview-unavailable notice.

Wikimedia image DTO additions:

```js
{
  id: 'wikimedia-<pageid>', type: 'image', provider: 'wikimedia',
  sourceKind: 'wikimedia-commons', sourceKey: 'wikimedia:<pageid>',
  externalId: '<pageid>', url, sourceUrl, sourceLabel: 'Wikimedia Commons',
  title, description, creator, credit, attribution, copyright,
  attributionLinks: [{ label, url }], // validated HTTPS credit/author links
  license: { name, url }, width, height, retrievedAt,
  position: 'wikimedia', pinned: false, isSample: false
}
```

`sourceResults.wikimedia` contains `status`, optional `cached`, and optional numeric `retryAt`; image data lives only in `items`. A persistent status region explains found, no-results, rate-limited, busy, timeout, and unavailable outcomes. Failure leaves curated samples and earlier pinned/imported choices available. Prompt reference images stay local; the interface explains that search words and the browser's network request are sent to Wikimedia.

No new runtime dependencies, secrets, .NET routes, SQL tables, account connections, image proxy, image rehosting, AI service, export feature, or deployment are introduced.

## Validation

Run `node tests/wikimedia.browser.cjs`. It covers input budgets, metadata/URL/license validation, HTML safety, empty results, API/HTTP/network failures, timeout/abort, locking/storage/cooldowns, cache cloning/expiry, one new result, attribution, pin/save/reopen/refinement, cross-tab limits, stale-board suppression, and 40 viewport/theme/layout/filter combinations. External responses and image files are mocked.

Also run `node tests/studio.browser.cjs`, `node tests/saved-boards.browser.cjs`, `node tests/video-account.browser.cjs`, and `node tests/navigation-theme.browser.cjs`. The first three mock empty Commons responses so existing local-feature checks remain deterministic; the dedicated suite verifies lookup wiring.

The implementation environment's network proxy rejected a direct live Commons API request with HTTP 403 at CONNECT; the web lookup tool could read official policies but could not fetch that API response either. Tests establish behavior against documented/mocked responses, not successful live Wikimedia delivery or current search relevance. Before rollout, smoke-test a real prompt on the intended hosting origin, including CORS/preflight, the image request, and credit links. This branch is for human review/merge; it is not deployed.
