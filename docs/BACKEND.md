# Backend architecture and current implementation

Audited against `main` commit `68e573c` on November 14, 2026. See [T003](T003.md) for decisions and fresh validation results.

## GraphQL and persistence

Scalable uses **the ASP.NET Core GraphQL API and ASP.NET Identity instead of Supabase Auth or a Supabase browser database client**. GraphQL is the API layer, not a database engine. The browser has no Supabase SDK/configuration/dependency. A PostgreSQL hosting vendor is an infrastructure choice, not the application's auth API.

The repository contains three distinct storage boundaries:

| Data | Implemented storage | Scope |
| --- | --- | --- |
| Application users/password hashes | EF Core Identity database; SQLite locally, Npgsql/PostgreSQL selectable by server configuration | Real registration and login accounts |
| Pinterest credentials/OAuth state | Separate `PinterestStore` SQLite database at `<DataPath>/pinterest.db`; credentials encrypted with owner-specific Data Protection purposes | Per authenticated Identity user; still SQLite even if Identity uses PostgreSQL |
| Boards/profile/appearance | Browser localStorage | Origin-specific local records; not partitioned by Identity user |

`AppDbContext` contains Identity entities and a unique normalized-email index, not board/media entities. The GraphQL `boards` query always returns an empty array; the active `DemoBoardService` still saves boards locally. There are no cloud board mutations, board migrations, durable research jobs, or upload/object-storage service.

## Run the two services

Use Node.js with native ES modules/global fetch and a .NET 10 SDK. From the repository root, in separate terminals:

```sh
App__PublicBaseUrl=http://localhost:3000 dotnet run --project Scalable.Api
```

```sh
npm start
```

Open `http://localhost:3000/` for Studio; authentication pages are `/login.html`, `/signup.html`, and `/account.html`. Node serves the contents of `frontend/` at its URL root. The API launch profile uses `http://localhost:5078/graphql`. Node does not start/proxy the .NET API, and the .NET API does not serve the frontend.

The `App__PublicBaseUrl` override above corrects the checked-in `/frontend` suffix for Node's URL layout. With a repository-root Python server on port 8080, use `http://localhost:8080/frontend` instead. It must identify the directory that actually serves `update-password.html`. ASP.NET does not load the root `.env`; only Node reads it.

## Implemented GraphQL contract

All operations use JSON POST `/graphql`. `graphqlRequest()` includes cookies, rejects non-OK HTTP responses and GraphQL `errors`, and returns `data`. Auth payload `succeeded` must also be checked; HTTP 200 alone does not establish a successful operation.

| Operation | Inputs / result |
| --- | --- |
| Query `serviceStatus` | `name`, `message`, `checkedAt`; public diagnostic |
| Query `boards` | Public scaffold returning an empty summary list, not the browser's saved boards |
| Query `me` | Authorized user `id`, `username`, `email`, `displayName` |
| Mutation `register` | `RegisterInput { username, email, displayName, password }`; `succeeded`, `message`, optional `user` |
| Mutation `login` | `LoginInput { identifier, password }`; same auth payload |
| Mutation `logout` | Clears the Identity cookie; returns boolean |
| Mutation `requestPasswordReset` | `PasswordResetRequestInput { email }`; neutral `succeeded`/`message` |
| Mutation `resetPassword` | `PasswordResetInput { email, token, password }`; `succeeded`/`message` |

Registration rejects duplicate username/email, hashes passwords through Identity, and signs in the new user. Login accepts email when the identifier contains `@`, username otherwise. Identity enforces an eight-character minimum plus its default complexity requirements; failed password attempts use lockout with a threshold of five. Both login and registration use `isPersistent: false`: stored accounts survive restarts when the database persists, but the session is a browser session cookie.

Reset requests generate an Identity token for an existing account and pass its URL to `IAccountEmailSender`. The installed `LoggingAccountEmailSender` logs only a generic message. It neither sends email nor logs the URL, token, or account address. Configure real delivery before treating recovery as usable end to end. Token completion is implemented, but email verification is not.

## Configuration and deployment

| Setting | Current behavior / requirement |
| --- | --- |
| `ConnectionStrings__Default` | Default `Data Source=scalable.db`. Strings beginning `Host=` or `postgres` select Npgsql; other strings select SQLite. Use a provider-valid Npgsql `Host=…;Database=…;Username=…;Password=…` format for PostgreSQL; prefix detection alone does not validate/convert a provider URL. Never commit actual credentials. |
| `DataPath` | Defaults to `data` relative to the ASP.NET content root. Holds separate Pinterest SQLite data and fallback Data Protection keys. Does not relocate the Identity database automatically. |
| `DataProtection__KeysPath` | Explicit persistent key directory; otherwise `<DataPath>/keys` is used in development and as the nondevelopment fallback. The current default is not `.keys`. Protect and retain the key ring across restarts. |
| `App__PublicBaseUrl` | Directory for reset-link `update-password.html`; set for Node root hosting or the actual Pages project path. |
| `Cors__AllowedOrigins__0` and subsequent indices | Exact allowed browser origins, without project paths. Current configuration includes `http://localhost:3000` and `https://scalable123.github.io`. Development also permits HTTP loopback ports. |
| `App__FrontendOrigin` | Additional permitted frontend origin and Pinterest's post-OAuth redirect origin. Must be an origin without a project path. |
| `App__CrossSiteCookies` | `true` sets the Identity cookie to `SameSite=None; Secure`; cross-site deployments require HTTPS and browser permission for those cookies. Default is false. |
| `PublicOrigin` | Public API origin for the Pinterest OAuth callback; defaults to localhost. Configure separately from the frontend. |
| `Pinterest__Enabled`, `Pinterest__ImportUseApproved`, `Pinterest__ClientId`, `Pinterest__ClientSecret` | All required to offer live linking; disabled/empty by default. Follow the [Pinterest handoff](PINTEREST-INTEGRATION.md) before enabling. |
| `AllowedHosts` | Set the intended backend host names for deployment; checked-in value is `*`. |

The browser GraphQL client uses `window.GRAPHQL_ENDPOINT` if present; otherwise loopback hosts use `http://localhost:5078/graphql` and other hosts use the configured Render URL `https://scalable-5rgd.onrender.com/graphql`. This records source configuration, not verified deployment health.

**Pinterest currently resolves its API separately:** without that global it still defaults to localhost on every host. Set `window.GRAPHQL_ENDPOINT` to the intended absolute API URL before modules initialize to align both clients. The Pinterest callback always returns to `${App:FrontendOrigin}/index.html?import=pinterest&…`; it does not preserve a Pages project path. Root-hosted frontend routing or an implementation change is needed for reliable OAuth return to `/Scalable/frontend/index.html`.

The Dockerfile's build context is `Scalable.Api/`:

```sh
docker build -f Scalable.Api/Dockerfile -t scalable-api Scalable.Api
```

The container listens on port 8080 and contains the .NET API only. PostgreSQL for Identity does not remove the need for persistent Pinterest SQLite storage and Data Protection keys. Neither Pages nor the container launches Node's AI endpoint. A checked-in PostgreSQL `InitialIdentity` migration/model snapshot now exists under `Scalable.Api/Data/Migrations/`. Startup applies `Database.Migrate()` instead of `EnsureCreated()`. Provider compatibility and upgrading existing SQLite databases created without migration history require .NET validation; no such validation ran in this environment. Do not infer successful SQLite/PostgreSQL startup or a safe existing-data upgrade from the presence of a migration.

## Implemented HTTP integrations

Pinterest remains an explicit REST integration on the same Identity host, not GraphQL fields. `/api/integrations/pinterest/availability` and `/callback` are public; status, authorize, disconnect, boards, and pin pages require the GraphQL-issued Identity cookie. The host applies per-owner Pinterest limits and Origin checks on state-changing `/api` requests when Origin is supplied. Those checks/limits do not cover `/graphql`. See [routes, OAuth, pagination, permitted use, and research exclusion](PINTEREST-INTEGRATION.md).

Node implements `POST /api/ai/creative-direction` separately. It uses `OPENAI_API_KEY` and optional `OPENAI_MODEL` (`gpt-4.1-mini` by default), serves `frontend/`, and returns creative metadata rather than researched images or verified tracks. It is unauthenticated and has no rate limiter. Static Pages cannot run it; its absolute-root frontend URL needs a separately designed proxy/hosting arrangement. See [AI-INTEGRATION.md](AI-INTEGRATION.md).

The optional Unsplash integration is a separate ASP.NET Core application under `backend/`, not a route on the GraphQL/Identity `Scalable.Api` host. It serves the public frontend and `POST /api/image-sources/unsplash`, with a persistent shared request budget. Run it with `bash backend/run.sh` after supplying the server-only `Unsplash__AccessKey` configuration. When the frontend is hosted by Node, the GraphQL API, or static Pages, configure an explicit same-origin route to this host; those services do not proxy Unsplash requests. The Unsplash host does not provide GraphQL identity or Pinterest routes. See [Unsplash implementation and limits](UNSPLASH-INTEGRATION.md).

The inactive REST `ApiBoardService` is a historical scaffold, not a running persistence API. Extending application data access should use the GraphQL service; agree schema/inputs, resolver ownership, pagination, version conflicts, error payloads, local-board import, and media storage before enabling cloud boards. Existing Pinterest and AI REST routes remain implemented exceptions; this documentation audit does not migrate them.

## Verification and remaining work

Run `dotnet test Scalable.sln`, the Unsplash backend checks with `dotnet run --project tests/backend/Scalable.Api.Checks.csproj`, and the browser commands documented in [FRONTEND.md](FRONTEND.md#18-validation-and-test-coverage), including `node tests/unsplash.browser.cjs`. The .NET tests exercise Identity-cookie-backed Pinterest routes and the separate Unsplash host with synthetic providers and temporary storage. Browser suites use mocks/static servers, not real accounts. [T003](T003.md) records the documentation audit's actual pass/fail/blocked outcomes; historical T001/T002 results are not current test guarantees.

Production work includes validating migration application/provider compatibility and existing-data upgrades, durable/protected data and keys, mail delivery, email verification, GraphQL CSRF/rate-limit handling appropriate to the deployment, cross-site session verification, hosted Pinterest routing alignment, cloud board ownership, and current browser regression repairs. No live provider operation, infrastructure change, merge, or deployment is part of this audit.

## Wikimedia Commons image source

The ASP.NET image-source host exposes `POST /api/image-sources/wikimedia` for explicit prompt submissions. Wikimedia Commons read-only search does not require an API key. The server sends `Wikimedia:UserAgent` (default `Scalable/1.0 (https://github.com/Scalable123/Scalable)`), accepts at most one image per prompt, and uses a shared 180-request/minute budget below Wikimedia's documented 200 requests/minute identified-client guidance. Set `Wikimedia:BudgetPath` to override the default budget file.

The adapter accepts only HTTPS image URLs from `upload.wikimedia.org`, Commons file URLs from `commons.wikimedia.org`, and results with creator/license metadata. It does not download or proxy image bytes. The browser keeps the file URL, creator, and license visible. Requests are serialized, use a five-second timeout, disable redirects, and fail closed on malformed responses or provider rate limits. Re-check current Wikimedia policy before increasing volume or adding caching, downloads, exports, or commercial use.
