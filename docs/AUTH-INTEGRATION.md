# Authentication integration worklog

## End goal

Provide permanent application accounts backed by the .NET GraphQL API and its SQLite database. A user must be able to register once, close/reopen the app, sign in with either their username or email plus password, and query the authenticated account through GraphQL. Passwords must only be handled by ASP.NET Identity as hashes; the browser must not store or transmit passwords except in the registration/login request to the API over the configured transport.

The authenticated session is an ASP.NET Identity cookie. GraphQL requests include credentials so `me` and later user-owned data can be authorized server-side. The existing local Studio content and provider previews remain separate from identity until ownership-backed storage is implemented.

## Current implementation checklist

- [x] Persist users with ASP.NET Identity and SQLite.
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
- [ ] Add database migrations for production deployment instead of relying on `EnsureCreated`.
- [ ] Replace the development logging email adapter with a production email provider.
- [ ] Add email verification, CSRF protection appropriate to the deployment, and rate limiting before production launch.
- [ ] Move boards/profile/preferences from browser-only storage to authenticated, user-owned backend records.

## Deployment handoff

The authentication backend is ready for local integration at
`http://localhost:5078/graphql`. The deployed frontend origin is
`https://scalable123.github.io/Scalable/`; its browser origin for CORS is
`https://scalable123.github.io`. The browser client uses
`credentials: "include"` and defaults to that endpoint; a deployed frontend
can override it with `window.GRAPHQL_ENDPOINT` without changing the GraphQL
contract.

The deployment boundary is deliberately server-side:

- The API owns the Identity database, password hashing, account creation,
  login, logout, password reset tokens, and authenticated-user lookup.
- The frontend sends a password only in the registration, login, or password
  reset request. It does not hash, persist, or compare passwords.
- The session is an ASP.NET Identity application cookie. Deployments serving
  the frontend and API from different origins must keep credentialed CORS
  restricted to the exact frontend origin and configure cookie policy/TLS for
  that topology; the localhost policy is not a production allowlist.
- The backend allowlist includes the GitHub Pages origin
  `https://scalable123.github.io` and does not use a wildcard. The deployed
  frontend still requires a public HTTPS GraphQL API URL; it cannot use the
  localhost default from GitHub Pages.
- `ConnectionStrings:Default` selects the durable database. SQLite remains the
  local default; production must supply a persistent database location or a
  supported production provider and must use migrations rather than relying on
  `EnsureCreated`.
- `App:PublicBaseUrl` must be the public frontend URL used in password-reset
  links. The local fallback is only for development.
- The API includes `Scalable.Api/Dockerfile` and listens on container port
  `8080`. A container host should set `ConnectionStrings__Default` to a
  persistent database path, `App__PublicBaseUrl` to
  `https://scalable123.github.io/Scalable/frontend`,
  `Cors__AllowedOrigins__0` to `https://scalable123.github.io`,
  `App__CrossSiteCookies` to `true`, and
  `DataProtection__KeysPath` to persistent storage.
- Production must replace `LoggingAccountEmailSender` with a trusted mail
  provider and provide persistent, protected Data Protection keys so cookies
  and reset tokens survive process restarts and do not share a development key
  directory.

No production API deployment has been claimed here because the public API
host, database provider, and mail provider have not been selected. Those
choices affect infrastructure configuration but not the registration or login
GraphQL inputs and payloads documented below.

## Decisions

1. The .NET GraphQL API is the application identity authority for registration, login, sessions, and password recovery.
2. SQLite is the current localhost database, configured by `Scalable.Api/appsettings.json`; deployment can provide a PostgreSQL connection string through `ConnectionStrings__Default` without changing the GraphQL contract. The API selects Npgsql for PostgreSQL strings and SQLite otherwise.
3. Username and email are both accepted at login. Email lookup uses ASP.NET Identity normalization; username lookup uses the Identity user store.
4. Login failures use one generic message so the API does not reveal whether an account exists.
5. Registration signs the user in immediately after successful creation. This preserves a useful first-run flow while still creating a real database account.
6. Demo/preview language is removed from the authentication path. Existing Studio sample content is unrelated to account identity and is not treated as authentication.
7. Password reset requests always return the same message whether or not the email exists. The current email adapter logs a reset URL for local development; production must send it through a trusted mail provider.
8. Development Data Protection keys are stored in the ignored `Scalable.Api/.keys` directory so local Identity cookies and reset tokens are not tied to an unavailable user-profile key ring. Production must provide protected, persistent key storage.
9. Deployment configuration is environment-specific and is not hard-coded into the authentication mutations. The local endpoint, SQLite database, logging email adapter, and development key directory are defaults for localhost only.
10. The authentication contract remains GraphQL-based for deployment. A hosting platform may provide the database, key storage, mail delivery, and TLS, but it must not move password handling into browser storage or replace Identity's server-side hash verification.
11. GitHub Pages is a static frontend host, so its exact browser origin is allowlisted in backend CORS, while the API URL remains a separate deployment value. The GitHub Pages path (`/Scalable/frontend/login.html`) is not itself a CORS origin.

## Run log

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
