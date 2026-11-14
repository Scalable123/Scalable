# Candidate quote and music sources

This catalog records provider candidates for future source adapters. A listed API is not automatically an authorization to copy, cache, redistribute, or use its content for AI training. New adapters must preserve the source URL, creator/artist attribution, license or terms metadata, provider ID, retrieval time, rate limits, and failure state.

## Quotes and public-domain texts

- [Wikiquote](https://en.wikiquote.org/) — sourced quotations
  - API: `https://en.wikiquote.org/w/api.php`
- [Wikisource](https://en.wikisource.org/) — public-domain and freely licensed texts
  - API: `https://en.wikisource.org/w/api.php`
- [Project Gutenberg](https://www.gutenberg.org/) — public-domain books
  - Catalog: [Machine-readable catalogs](https://www.gutenberg.org/ebooks/offline_catalogs.html)
- [Gutendex](https://gutendex.com/) — searchable Project Gutenberg catalog API
  - Example: `https://gutendex.com/books/?search=wisdom`

Quote/text integration should begin with short, attributed excerpts or links. Verify the individual work's public-domain or license status; a public catalog does not make every edition, translation, annotation, or cover image public domain.

## Music discovery

- iTunes Search API — catalog discovery and outbound music links
  - Example: `GET https://itunes.apple.com/search?term=lofi+study&media=music&entity=song&limit=10`
- [MusicBrainz](https://musicbrainz.org/) — open music metadata and recording identity
  - Example: `GET https://musicbrainz.org/ws/2/recording/?query=recording:Imagine%20AND%20artist:John%20Lennon&fmt=json`
- [Jamendo Developer API](https://developer.jamendo.com/v3.0) — independent-music catalog and search
- [SoundCloud Developers](https://developers.soundcloud.com/docs) — public-resource search and provider-supported playback/linking
- [Spotify Web API](https://developer.spotify.com/documentation/web-api) — catalog metadata and search subject to Spotify developer terms

The current branch has server-side catalog search adapters for Jamendo, SoundCloud, and Spotify. iTunes and MusicBrainz remain documented candidates; adding them requires a response DTO, attribution behavior, rate-limit handling, tests, and a confirmed terms/licensing review.

## Adapter rules

- Keep credentials and OAuth tokens on the server; never place them in `frontend/`, board JSON, logs, or documentation.
- Use provider-supported metadata and outbound links. Do not scrape HTML, bypass authentication, or download streaming audio.
- Keep search bounded by query length, result count, timeout, and provider rate limits.
- Treat provider responses as untrusted data and validate URLs, IDs, strings, and content length before rendering.
- Preserve a manual-link fallback when a provider is unavailable or a result cannot be legally/technically verified.
