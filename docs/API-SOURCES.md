# Candidate quote and music sources

This catalog records provider candidates for future source adapters. A listed API is not automatically an authorization to copy, cache, redistribute, or use its content for AI training. New adapters must preserve the source URL, creator/artist attribution, license or terms metadata, provider ID, retrieval time, rate limits, and failure state.

## Quotes

- [Wikiquote](https://en.wikiquote.org/) — sourced quotations
  - API: `https://en.wikiquote.org/w/api.php`

Quote integration uses short, attributed Wikiquote page excerpts or links. Wikiquote content and individual quotations still require attribution and source verification.

## Music discovery

- [Jamendo Developer API](https://developer.jamendo.com/v3.0) — independent-music catalog and search
- [SoundCloud Developers](https://developers.soundcloud.com/docs) — public-resource search and provider-supported playback/linking
- [Spotify Web API](https://developer.spotify.com/documentation/web-api) — catalog metadata and search subject to Spotify developer terms

The current branch has server-side catalog search adapters for Jamendo, SoundCloud, and Spotify, plus a bounded Wikiquote page-excerpt adapter for sourced quote references.

## Adapter rules

- Keep credentials and OAuth tokens on the server; never place them in `frontend/`, board JSON, logs, or documentation.
- Use provider-supported metadata and outbound links. Do not scrape HTML, bypass authentication, or download streaming audio.
- Keep search bounded by query length, result count, timeout, and provider rate limits.
- Treat provider responses as untrusted data and validate URLs, IDs, strings, and content length before rendering.
- Preserve a manual-link fallback when a provider is unavailable or a result cannot be legally/technically verified.
