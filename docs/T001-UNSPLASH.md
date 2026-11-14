# T001 — Retired Unsplash image source (branch history)

This preserves the historical Unsplash implementation record from the feature branch. Unsplash was retired in T007 and is no longer an active provider, route, client, configuration, or test.

## Decisions

- Use Unsplash public photo search with the submitted text; request one candidate, with no pagination, query expansion, fallback search, polling, or retry.
- Hotlink returned image URLs and display photographer/profile and Unsplash/photo links with referral parameters. Trigger the provider's download endpoint before returning a chosen image.
- Reserve two requests atomically before each search to cover search and required tracking. A durable rolling-hour application-wide ceiling of 50 permits at most 25 successful selections per hour. All attempts consume reservations and the source fails closed if budget storage fails.
- Store the access key only in ignored local `.env` or deployment environment variables. Public photo search needs no Secret Key or OAuth.
- Preserve pinned provider photos and imported media through refinement, deduplicate by photo ID, and retain provenance on local save/reopen.
- On missing configuration, exhausted quota, no results, timeout, malformed response, or unavailable server/provider, compose the existing sample and show a persistent source status.

## Validation and outcome

- The feature branch recorded a successful warning-as-error backend build and 38 backend assertions.
- The Unsplash host/browser suite and four existing browser suites passed with fixture-based provider responses; the browser checks covered source validation, attribution, persistence, pins, stale completion, and responsive layouts.
- A live source attempt was unavailable because the environment's network proxy rejected access to `api.unsplash.com`; live authentication/photo retrieval was not verified.
- The recorded validation did not use live provider credentials in routine tests. Deployment must provision the Access Key and persistent quota path separately.
