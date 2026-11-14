# Authentication integration worklog

## End goal

Provide permanent application accounts backed by the .NET GraphQL API and its server-side Identity database (SQLite locally, configurable PostgreSQL). A user must be able to register once, close/reopen the app, sign in with either their username or email plus password, and query the authenticated account through GraphQL. Passwords must only be handled by ASP.NET Identity as hashes; the browser must not store or transmit passwords except in the registration/login request to the API over the configured transport.

The authenticated session is an ASP.NET Identity cookie. GraphQL requests include credentials so `me` and later user-owned data can be authorized server-side. The existing local Studio content and provider previews remain separate from identity until ownership-backed storage is implemented.

## Current implementation checklist

- [x] Persist users with ASP.NET Identity/EF Core using SQLite locally or configured Npgsql/PostgreSQL.
- [x] Hash passwords through `UserManager.CreateAsync`.
- [x] Reject duplicate usernames and emails.
- [x] Resolve login identifiers as email when they contain `@`, otherwise as username.
- [x] Verify passwords with `SignInManager.PasswordSignInAsync` and enable lockout on failure.
- [x] Return a generic invalid-credentials message.
- [x] Create an authenticated cookie on successful registration and login.
- [x] Expose the authenticated user through the authorized GraphQL `me` query.
- [x] Send cookies from the frontend GraphQL client.
- [x] Request password resets through GraphQL with a neutral response.
- [x] Reset passwords through a single-use ASP.NET Identity token.
- [x] Remove the legacy browser auth SDK, config, mocks, and package dependency.
- [x] Add a PostgreSQL Identity migration/model snapshot and apply migrations at startup.
- [ ] Validate migration application on configured providers and the upgrade from existing SQLite databases created with `EnsureCreated`.
- [ ] Replace the development logging email adapter with a production email provider.
- [ ] Add email verification, CSRF protection appropriate to the deployment, and rate limiting before production launch.
- [ ] Move boards/profile/preferences from browser-only storage to authenticated, user-owned backend records.

## Current deployment handoff

The application account authority is the ASP.NET **GraphQL API and ASP.NET Identity instead of Supabase Auth/browser database access**. GraphQL is the API layer, not the underlying database. The Supabase SDK/configuration/dependency is removed. See [BACKEND.md](BACKEND.md) for the authoritative configuration/storage table and [T003](T003.md) for this main audit's fresh checks.

`graphqlClient.js` uses `window.GRAPHQL_ENDPOINT` when set. Otherwise loopback hosts use `http://localhost:5078/graphql`, and other hosts use the source-configured Render URL `https://scalable-5rgd.onrender.com/graphql`. This records configuration, not verified Render availability. `ApiPinterestService` has a separate localhost-only default: explicitly set the global before modules initialize to align the two clients on hosted frontends.

The browser sends `credentials: "include"`. The checked-in CORS list includes `http://localhost:3000` and `https://scalable123.github.io`; Development also permits HTTP loopback ports. A Pages project path is not part of its browser origin. Cross-site hosting needs HTTPS and `App__CrossSiteCookies=true` (`SameSite=None; Secure`), matching origins, and browser cookie support. Pinterest's `/api` Origin check/rate limiter does not cover `/graphql`; GraphQL CSRF/request limits remain unfinished.

Run `App__PublicBaseUrl=http://localhost:3000 dotnet run --project Scalable.Api` in a POSIX shell and `npm start` separately. Node serves frontend files at the URL root. The checked-in `App:PublicBaseUrl=http://localhost:3000/frontend` does not match that layout; set the override for working reset-link paths. Repository-root Python hosting instead needs its actual `/frontend` directory URL. ASP.NET does not read root `.env`.

`ConnectionStrings__Default` selects SQLite by default, or Npgsql when it begins `Host=` or `postgres`. Use a provider-valid Npgsql connection string; detection is not URL conversion. PostgreSQL for Identity does not migrate Pinterest's separate `<DataPath>/pinterest.db`. Startup now calls `Database.Migrate()` and a PostgreSQL `InitialIdentity` migration/model snapshot is checked in. SQLite/provider compatibility and upgrades from previously created databases need validation; no backend tests ran in this audit.

`DataProtection__KeysPath` selects an explicit persistent key directory; otherwise current code uses `<DataPath>/keys` (default `Scalable.Api/data/keys`), not the older `.keys` path. Keep both data and protected keys persistent. The Dockerfile builds from `Scalable.Api/` and listens on container port 8080; it serves no frontend or Node AI process.

`App:PublicBaseUrl` identifies the reset page directory. The installed email adapter logs only that instructions were generated; it does not deliver mail or log the URL, account email, or token. Production recovery needs a real mail adapter. Registration and login use `isPersistent: false`; stored accounts survive process restarts with persistent storage, while session continuity depends on browser cookie lifetime. Frontend confirmation matching is not server password verification.

## Decisions

1. The .NET GraphQL API is the application identity authority for registration, login, sessions, and password recovery.
2. SQLite is the current localhost database, configured by `Scalable.Api/appsettings.json`; deployment can provide a PostgreSQL connection string through `ConnectionStrings__Default` without changing the GraphQL contract. The API selects Npgsql for PostgreSQL strings and SQLite otherwise.
3. Username and email are both accepted at login. Email lookup uses ASP.NET Identity normalization; username lookup uses the Identity user store.
4. Login failures use one generic message so the API does not reveal whether an account exists.
5. Registration signs the user in immediately after successful creation. This preserves a useful first-run flow while still creating a real database account.
6. Demo/preview language is removed from the authentication path. Existing Studio sample content is unrelated to account identity and is not treated as authentication.
7. Password reset requests always return the same message whether or not the email exists. The current email adapter does not deliver or log reset URLs; configure a trusted mail provider to deliver them.
8. Development Data Protection keys currently default to ignored `Scalable.Api/data/keys` (or explicit `DataProtection:KeysPath`) so local Identity cookies and reset tokens are not tied to an unavailable user-profile key ring. Production must provide protected, persistent key storage.
9. Deployment configuration is environment-specific and is not hard-coded into the authentication mutations. The SQLite database and no-delivery email adapter are development defaults; hosted endpoint/provider/cookie/key settings are described above.
10. The authentication contract remains GraphQL-based for deployment. A hosting platform may provide the database, key storage, mail delivery, and TLS, but it must not move password handling into browser storage or replace Identity's server-side hash verification.
11. GitHub Pages is a static frontend host, so its exact browser origin is allowlisted in backend CORS, while the API URL remains a separate deployment value. The GitHub Pages path (`/Scalable/frontend/login.html`) is not itself a CORS origin.

## Run log

Earlier run entries below are historical upstream observations, not checks rerun by this audit. Current endpoint, provider, and key-path settings are described above; [T003](T003.md) records fresh test failures and the SDK limitation.

### 2026-11-14 — initial integration pass

- Inspected the existing Identity/GraphQL implementation and frontend account flow.
- Confirmed that registration already calls the backend and creates persistent Identity users.
- Found and fixed the frontend login handler's undeclared GraphQL result variable.
- Updated login and registration copy to describe permanent GraphQL accounts, not demo account creation.
- Added verification steps for build, API persistence, username login, email login, invalid password handling, and the authenticated `me` query.
- Verified live GraphQL behavior: registration, username login, email login, cookie-backed `me`, invalid-password rejection, and duplicate-account rejection.
- Replaced the recovery preview and SDK hooks with GraphQL request/reset mutations using ASP.NET Identity reset tokens.
- Removed the SDK package, browser client/config files, test mock, and stale documentation references.
- Added the development email adapter and isolated development Data Protection key ring after live token generation exposed stale profile-key decryption failures.
- Browser regression execution was attempted but is currently unavailable because the workspace does not have the `playwright` package installed.
- Local API launch was aligned to `http://localhost:5078`, matching the frontend GraphQL endpoint; development CORS accepts HTTP origins on loopback hosts (`localhost`, `127.0.0.1`, and `::1`) so IDE dev-server ports work without enabling a production-wide wildcard.

### 2026-11-14 — deployment handoff clarification

- Confirmed the backend builds successfully on this branch and that the
  localhost Identity/GraphQL flow is already implemented.
- Documented the deployment boundary: production must supply its own exact
  frontend origin, persistent database/migrations, public reset-link URL,
  trusted email delivery, protected Data Protection keys, and TLS/cookie
  settings appropriate to its hosting topology.
- Kept production-host and provider choices open because none were specified;
  no deployment was represented as complete.

## Verification commands

From the repository root:

```powershell
dotnet build --no-restore Scalable.Api/Scalable.Api.csproj
```

Run the API and frontend servers, then register once, stop/restart the API, and sign in again. Verify both identifiers and query:

```graphql
query { me { id username email displayName } }
```

Password recovery uses:

```graphql
mutation { requestPasswordReset(input: { email: "you@example.com" }) { succeeded message } }
mutation { resetPassword(input: { email: "you@example.com", token: "...", password: "NewValidPass1!" }) { succeeded message } }
```

Do not commit `Scalable.Api/scalable.db` or any password, cookie, or access token.
