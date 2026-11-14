# Music services: frontend handoff

The current implementation is a UI prototype plus working manual references and local audio playback. **No music accounts are connected.** Preview fixtures are hand-picked examples, not user library data. Provider names in the interface indicate integration candidates, not confirmed API availability.

## Boundaries to retain

- Treat songs, ambient sounds, albums, and playlists as explicit references. Manual playlist imports are one reference until a supported library API can enumerate tracks.
- Keep `sourceKind`, `linkKind`, `isSample`, `provider`, and source metadata explicit so demo data, manual references, and authenticated library items remain distinguishable.
- The frontend uses JSON board items; local audio has an in-memory object-URL registry keyed by item ID. Files do not go into the board DTO, localStorage, or provider requests.
- Local-file playback is available now. Service playback, library reads, OAuth, cloud audio upload/storage, and playlist writes are not implemented.

The implemented application account authority is ASP.NET GraphQL/Identity instead of Supabase; music accounts remain separate and unconnected. GraphQL is the API layer over the configured Identity database, while saved music references remain browser board metadata. See [BACKEND.md](BACKEND.md) and [T003](T003.md).

## Future integration

Choose providers only after checking their current developer programs, API access/approval, supported regions, library capabilities, scopes, and playback terms. In particular, do not assume Amazon Music offers the same self-service account/library access as Spotify. Some candidates may remain manual-link-only integrations.

The historical REST proposals below describe required capabilities, not implemented routes or the selected application data transport. New account-owned data should extend the GraphQL service; exact music fields/schema are not implemented. Protocol callbacks may remain HTTP routes. A future provider service needs equivalents of:

| Method | Route                                         | Purpose                                                                        |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/api/music/providers`                        | Supported providers and actual capabilities, including manual-link-only status |
| GET    | `/api/music/connections`                      | Authenticated user's connection summaries, with no tokens                      |
| POST   | `/api/music/connections/{provider}/authorize` | Initiate supported OAuth; return an authorization URL                          |
| GET    | `/api/music/connections/{provider}/callback`  | Backend-managed callback, state validation, and code exchange                  |
| DELETE | `/api/music/connections/{provider}`           | Disconnect/revoke as supported; preserve existing board references             |
| GET    | `/api/music/connections/{provider}/library`   | Paginated authorized library items if supported                                |
| POST   | `/api/boards/{id}/audio-references`           | Validate ownership and selected provider IDs; add authoritative reference DTOs |

These are proposed routes only. Replace preview fixtures with a provider adapter after that service exists. Render signed-out, authorizing, connected, expired, denied, unavailable, loading, empty-library, and failed states from actual responses. Never show a connected state just because someone clicked a button.

The server should handle authorization, state/PKCE where applicable, token refresh/revocation, rate limits, pagination, and provider errors. Keep provider secrets and refresh tokens off the frontend and out of logs/localStorage. Scope requests to the minimum needed operations and show the requested access before redirecting. Use the application's authentication/CSRF strategy for mutations.

Validate imported URLs again on the server. If later resolving metadata or fetching remote media, add independent destination validation and redirect handling; a frontend hostname check is not server-side fetch protection. Do not copy audio from streaming services or treat an imported link as a reuse license. Only expose permitted preview URLs and controls through the provider-supported flow.

If persisting local uploads later, introduce a separate authenticated upload endpoint and media ID, with validation, access controls, file limits, and retention/deletion rules. Do not persist browser blob URLs or base64 recordings in persisted board JSON.
