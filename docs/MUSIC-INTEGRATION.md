# Music services: frontend handoff

The current implementation is a UI prototype plus working manual references and local audio playback. **No music accounts are connected.** Preview fixtures are hand-picked examples, not user library data. Provider names in the interface indicate integration candidates, not confirmed API availability. The selected application backend is ASP.NET Core with **GraphQL instead of Supabase for application data access**; it is not implemented. Existing Supabase Auth is legacy application-login code, separate from music OAuth. See [BACKEND.md](BACKEND.md) for the shared contract and migration status.

## Boundaries to retain

- Treat songs, ambient sounds, albums, and playlists as explicit references. Manual playlist imports are one reference until a supported library API can enumerate tracks.
- Keep `sourceKind`, `linkKind`, `isSample`, `provider`, and source metadata explicit so demo data, manual references, and authenticated library items remain distinguishable.
- The frontend uses JSON board items; local audio has an in-memory object-URL registry keyed by item ID. File bytes do not go into board DTOs, localStorage, or provider requests.
- Local-file playback is available now. Service playback, library reads, OAuth, cloud audio upload/storage, and playlist writes are not implemented.

## Future ASP.NET Core GraphQL integration

Choose providers only after checking their current developer programs, API access/approval, supported regions, library capabilities, scopes, and playback terms. In particular, do not assume Amazon Music offers the same self-service account/library access as Spotify. Some candidates may remain manual-link-only integrations.

A future provider service would expose these proposed GraphQL fields at `/graphql` (exact schema pending):

| Kind | Field | Purpose |
| --- | --- | --- |
| Query | `musicProviders` | Actual capabilities, including manual-link-only status |
| Query | `musicConnections` | Authenticated user's connection summaries without tokens |
| Mutation | `authorizeMusic` | Begin supported OAuth; return an authorization URL |
| Mutation | `disconnectMusic` | Disconnect/revoke as supported; preserve board references |
| Query | `musicLibrary` | Bounded cursor-paginated authorized items for a provider |
| Mutation | `addAudioReferences` | Validate board ownership and provider IDs; add authoritative reference DTOs |

These are proposed operations only. OAuth callbacks can use separately implemented protocol-specific HTTP routes for state validation and code exchange. Replace preview fixtures with an async provider adapter after that service exists. Handle HTTP and GraphQL `errors` (including HTTP 200 and partial `data`) before showing success. Render signed-out, authorizing, connected, expired, denied, unavailable, loading, empty-library, and failed states from actual responses. Never show a connected state just because someone clicked a button.

The server should handle authorization, state/PKCE where applicable, token refresh/revocation, rate limits, pagination, and provider errors. Keep provider secrets and refresh tokens off the frontend and out of logs/localStorage. Scope requests to the minimum needed operations and show the requested access before redirecting. Use the application's authentication/CSRF strategy for mutations.

Validate imported URLs again on the server. If later resolving metadata or fetching remote media, add independent destination validation and redirect handling; a frontend hostname check is not server-side fetch protection. Do not copy audio from streaming services or treat an imported link as a reuse license. Only expose permitted preview URLs and controls through the provider-supported flow.

If persisting local uploads later, introduce a separate authenticated upload transport and stable media ID for GraphQL variables, with validation, access controls, file limits, and retention/deletion rules. Do not persist browser blob URLs or base64 recordings in board JSON. The underlying database/ORM is undecided.

## Validation

`node tests/studio.browser.cjs` covers URL rejection/normalization, duplicate prevention, all four provider previews, local audio decoding/playback, metadata-only persistence, reload/reattachment, removal, blocked storage, and responsive dialogs. No live provider account, GraphQL API, database, or cloud upload is exercised. See [T001](T001.md) for the documentation audit results.
