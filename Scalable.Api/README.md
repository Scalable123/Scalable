# Scalable.Api

.NET 10 ASP.NET Core backend using Hot Chocolate GraphQL and ASP.NET Identity instead of Supabase Auth/browser database access. GraphQL is the API layer; Identity uses EF Core SQLite locally or configured Npgsql/PostgreSQL. Pinterest credentials remain in separate SQLite storage regardless of the Identity provider.

Current setup, configuration, routes, storage boundaries, and deployment limitations are maintained in [docs/BACKEND.md](../docs/BACKEND.md). See [authentication](../docs/AUTH-INTEGRATION.md), [Pinterest](../docs/PINTEREST-INTEGRATION.md), and the [T003 audit](../docs/T003.md) for detailed behavior and fresh test outcomes.

From the repository root, in a POSIX shell:

```sh
App__PublicBaseUrl=http://localhost:3000 dotnet run --project Scalable.Api
```

Run `npm start` separately for the frontend/AI service at `http://localhost:3000/`. The API launch profile uses `http://localhost:5078/graphql`. The public-base override matches Node's root-served password-reset page. For another shell, set that environment variable using its normal syntax before starting dotnet.

Implemented GraphQL fields are queries `serviceStatus`, authorized `me`, and scaffold `boards`, plus mutations `register`, `login`, `logout`, `requestPasswordReset`, and `resetPassword`. `boards` intentionally returns an empty list: local saved boards are not stored in EF Core. Reset tokens are implemented, but the installed email adapter neither delivers mail nor logs reset URLs/tokens.

`ConnectionStrings__Default` selects the Identity provider; use a provider-valid Npgsql `Host=…;Database=…;Username=…;Password=…` string for PostgreSQL. Keep actual credentials in server environment/secret storage. Startup now uses `Database.Migrate()` with the checked-in PostgreSQL `InitialIdentity` migration/model snapshot. SQLite compatibility and upgrades from existing `EnsureCreated` databases are unverified in this audit; preserve data and plan a validated upgrade. Set persistent `DataPath` and `DataProtection__KeysPath`; the default fallback key directory is `<DataPath>/keys`.

The API serves GraphQL and Pinterest HTTP routes, not frontend assets or Node's AI endpoint. Its Docker build context is this directory and its container port is 8080. Run `dotnet test Scalable.sln` from the repository root; T003 records why that command could not be executed in this audit environment.
