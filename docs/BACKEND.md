# Backend architecture and integration status

## Selected direction

The selected application backend uses **GraphQL instead of Supabase for application data access**, with C# / ASP.NET Core for server logic and AI/media orchestration. GraphQL is an API query language and execution layer, not a database engine. The underlying database engine, ORM, GraphQL server library, hosting, and replacement identity service remain undecided. Earlier SQL/EF Core suggestions are candidates, not implemented dependencies.

This is an architecture decision and implementation handoff. There is no backend project, GraphQL schema/server/client, database schema/migration, research worker, or cloud media service in this repository. The proposed `/graphql` path and operation names below are design contracts, not deployed endpoints or a finalized executable schema.

## Verified current behavior

| Area | Current implementation | Required integration |
| --- | --- | --- |
| Boards | `DemoBoardService` uses localStorage `scalable.boards.v1` | GraphQL queries/mutations backed by owner-scoped server persistence |
| Research | Local keyword-selected fixture collections | GraphQL run lifecycle with server-side research jobs |
| Authentication | Browser Supabase Auth calls for login, recovery, session lookup, password update, and sign-out | Deliberate identity/session migration; GraphQL alone does not provide authentication |
| Signup | Client-side validation preview only | Real registration and verified-email workflow |
| Profile/preferences | Browser-origin records | Authorized profile service and optional preference sync |
| Provider libraries | Music/Pinterest fixtures; YouTube references with on-demand embeds | Supported provider APIs, server OAuth, pagination, and truthful connection states |
| Media | Local files/object URLs in memory; metadata saved with boards | Optional authenticated object storage and stable media IDs |
| Existing API adapter | Inactive REST-shaped `ApiBoardService` in `board-service.js` | Replace/adapt transport and lifecycle before enabling GraphQL |

Supabase is **not the selected application database/backend**. Its existing SDK dependency, public client configuration, and auth calls are legacy integration facts that remain in source. There are no Supabase table queries or storage-bucket uploads in the application. Removing the SDK without replacing login/recovery/session/password-update/sign-out would break those paths; this documentation task does not perform that migration.

Read [the complete frontend reference](../documentation/FRONTEND.md), [frontend handoff](FRONTEND.md), and the relevant [music](MUSIC-INTEGRATION.md), [Pinterest](PINTEREST-INTEGRATION.md), or [video/account](VIDEO-ACCOUNT.md) guide before implementing those areas.

## Proposed GraphQL application contract

Use a GraphQL endpoint such as `POST /graphql`, with named operations, variables, explicit field selections, and server validation. The following names describe required capabilities; exact argument/input/output types must be agreed and captured in an executable schema during implementation.

| Kind | Proposed field | Responsibility |
| --- | --- | --- |
| Query | `session` | Safe authenticated identity/session summary without tokens |
| Mutation | `registerAccount`, `login`, `logout` | Identity-service-backed registration/session lifecycle |
| Mutation | `requestPasswordReset`, `completePasswordReset` | Neutral recovery request and validated recovery completion |
| Query | `boards`, `board` | Paginated owner-scoped summaries and authorized full board detail |
| Mutation | `saveBoard` | Validate typed board items and persist with an expected version |
| Mutation | `deleteBoard` | Confirm authorized deletion; distinguish deleted/already absent |
| Mutation | `startResearch`, `cancelResearch` | Start/cancel a bounded authorized job using prompt, optional media ID, and independent song/sound flags |
| Query | `researchRun` | Run ID, status, progress, partial/completed board, and safe errors |
| Query | `profile`, `preferences`, `connections` | Authorized profile, optional preference sync, safe provider status |
| Mutation | `updateProfile`, `updatePreferences` | Validate metadata/preferences; email identity changes require separate verification |
| Query | `pinterestConnection`, `pinterestBoards`, `pinterestPins` | Capabilities and cursor-paginated authorized library data |
| Mutation | `authorizePinterest`, `disconnectPinterest` | Start supported OAuth or revoke/disconnect while keeping imported references |
| Mutation | `startPinterestImport`, `cancelPinterestImport` | Start/cancel authorized whole-board or selected-pin imports |
| Query | `pinterestImportRun` | Progress, added/skipped/failed counts, destination, and terminal state |
| Query | `musicProviders`, `musicConnections`, `musicLibrary` | Actual provider capabilities, safe status, and paginated authorized items |
| Mutation | `authorizeMusic`, `disconnectMusic`, `addAudioReferences` | Supported OAuth, revocation, and owner-checked imports using authoritative provider IDs |

Queries for lists should use bounded cursor pagination with `edges`/`pageInfo` or an equivalent agreed shape. Define the board detail selection needed by Open; the current saved-board UI receives full local records and cannot consume summaries without an integration change. Whole-board provider imports must traverse every authorized page and report partial outcomes.

Keep camelCase fields, string IDs, ISO 8601 timestamps, explicit provenance, and separate song/sound content types. Map existing board DTOs to typed GraphQL output objects/unions and validated mutation inputs; GraphQL output unions cannot themselves serve as input types. Define an input discriminator or supported equivalent. A schema and generated/validated operations should become the authoritative contract when implemented.

### Transport and error handling

Check HTTP failures, malformed responses, and GraphQL `errors` even when HTTP status is 200. A partial `data` response does not confirm a successful save/delete/import. Define mutation payloads and safe error codes for validation, unauthenticated/expired sessions, forbidden/missing resources, version conflicts, rate limits, provider failure, and already-deleted records. Preserve the current draft and show success only after the mutation outcome is confirmed.

The current `ApiBoardService.request()` only checks HTTP status and parses JSON. It cannot directly consume a GraphQL envelope. Replace its REST paths, add operation/variable serialization, unwrap the selected `data` field, handle GraphQL/transport errors, and attach the chosen session credentials. Never enable it merely by changing `/api` to `/graphql`.

The UI also needs async detail loading, pagination, start/poll/completion/cancel behavior, pending/duplicate-submit prevention, timeouts/retry, and session-expiry handling. Preserve `boardVersion` stale-result protection, deletion confirmation, failed-write recovery, and the new-ID unsaved draft retained after deleting an open board. Subscriptions are optional and unimplemented; bounded polling is sufficient for the initial job contract.

### Uploads and OAuth callbacks

GraphQL variables should reference stable authorized media IDs rather than `File`, blob URLs, or base64 recordings. Design a separate authenticated upload transport (for example, short-lived signed object-storage upload URLs) with server file/type/size validation and retention rules. No upload transport exists today. The inactive adapter's multipart REST upload is historical code, not the GraphQL upload specification.

Provider OAuth callbacks and identity email/recovery callbacks may use ordinary HTTP routes where required by the protocol. They are separate from GraphQL application data operations and still need explicit server implementation, state/PKCE validation as applicable, safe redirects, and token handling. Do not invent provider capabilities from the preview UI.

## Persistence, identity, and authorization

- Select a database/ORM after requirements are validated; GraphQL resolvers call server services/repositories that own persistence. Never expose database credentials or raw database entities to the browser.
- Derive ownership from the authenticated server identity on every query, mutation, nested resolver, job, import, and media lookup. A client-supplied owner or local demo flag is not authorization.
- Select and document replacement identity/session handling before removing Supabase. Preserve or explicitly migrate existing identities and recovery callbacks; link board ownership to verified server identities. Cookie sessions require CSRF protection; bearer sessions require validated tokens and renewal/expiry handling. No replacement is implemented.
- Local saved boards have no trustworthy authenticated owner. Offer a deliberate local-to-account import with deduplication; signing in must not silently claim, erase, or sync browser records.
- Use version checks for concurrent saves and server-controlled timestamps. Keep research runs separate from editable boards so retries/late results do not overwrite user choices.
- Keep media in authorized object storage, not board JSON. Define shared-reference retention/deletion separately from board deletion. Never delete provider originals through reference deletion.
- Store provider secrets/refresh tokens on the server. Validate URLs and redirect destinations independently before fetching remote content. Retain source, creator, attribution, and permitted-use metadata.
- Bound GraphQL page sizes, query depth/complexity, request cost, and research budgets; apply rate limits and cancellation. Provider approval and media rights remain prerequisites.

## Hosting and acceptance checks

GitHub Pages serves static files only. Host the ASP.NET Core GraphQL API, database, workers, identity integration, and uploads separately. Configure HTTPS, the API origin, explicit CORS, and the chosen credentials strategy; no backend settings or secret values are supplied by the current Pages workflow.

Before enabling production data access, add schema/operation validation and backend tests for resolver ownership (including another user's IDs), input validation, bounded pagination, version conflicts, unauthorized/expired sessions, HTTP-200 GraphQL errors, partial data, duplicate/retried mutations, deletion of absent records, interrupted jobs, and provider failure. Verify upload permissions/limits and full-board pagination. Re-run all four existing browser suites for the local flows and new end-to-end tests against the implemented backend.

Current browser tests mock Supabase/YouTube where applicable and verify local frontend behavior only. They do not prove a working GraphQL API, database, live authentication, provider access, or cloud storage. See [T001](T001.md) for the documentation audit and validation outcome.
