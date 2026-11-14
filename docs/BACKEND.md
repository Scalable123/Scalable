# Backend

The image-source backend is a minimal C# / ASP.NET Core application targeting .NET 10. It has no third-party runtime packages. It serves the existing `frontend/` as its public web root and implements only the Unsplash source endpoint. AI research jobs, SQL board persistence, account authorization, and other providers remain future work. Supabase browser auth is unchanged.

## Run locally

Install the .NET 10 SDK, then from the repository root:

```sh
cp .env.example .env
# Edit .env and supply Unsplash__AccessKey; keep it private.
bash backend/run.sh
```

Open `http://localhost:5080/` (Studio), `/login.html`, or `/account.html`. The root of this host is the frontend directory, unlike the repository-root Pages login redirect. `run.sh` reads trusted local `.env` shell assignments and starts `dotnet run`. Set `ASPNETCORE_URLS` to configure listening addresses. Configuration values supplied through deployment environment variables work without `.env`.

For production, `dotnet publish backend/Scalable.Api.csproj -c Release -o work/publish` creates the server artifacts. Deploy those with the existing `frontend/` directory and set **FrontendPath** to its absolute location. Run the published DLL with .NET 10. Configure HTTPS/reverse-proxy routing and a persistent quota volume. Secrets and quota files must be outside the public frontend directory. The server exposes only public frontend files; it never serves the repository root.

## Configuration

| Environment variable | Purpose |
| --- | --- |
| `Unsplash__AccessKey` | Server-only Unsplash Access Key; required for real search |
| `Unsplash__ApplicationId` | Optional operator metadata, application 1133409; not used for photo search |
| `Unsplash__BudgetPath` | Absolute persistent quota JSON path, default `backend/data/unsplash-budget.json` in a source checkout |
| `FrontendPath` | Absolute path to public frontend files when deployed separately |
| `ASPNETCORE_URLS` | ASP.NET listener configuration |

No Unsplash Secret Key is needed for public search. `.env`, `.env.*` (except the template), SDK scratch files, binaries, and local quota state are ignored by Git. Provision the Access Key in the deployment's secret environment; pushing the branch does not provision it on a host.

## HTTP boundary

`POST /api/image-sources/unsplash` accepts JSON `{ "prompt": "quiet coast" }`. Prompt text is trimmed and must be 1–2000 characters. The endpoint sends text only; it does not receive or analyze reference files. The request body limit is 16 KiB.

A successful HTTP response contains `{ "status": "available", "image": { ... } }` or `{ "status": "rate_limited" | "not_configured" | "no_results" | "unavailable", "image": null }`. Status describes this optional source; other board content can still be composed. Invalid input returns 400, unsupported content type 415, oversized bodies 413, and cross-origin browser requests 403. Responses are `Cache-Control: no-store`.

Same-origin JSON requests only: no CORS allowance, cross-site Fetch Metadata rejected, and supplied Origin checked against the host. These checks are browser request controls, **not authentication**. The endpoint supports the existing public Studio preview; callers with direct HTTP access can spend its capped shared budget. Before a broader authenticated release, attach the selected Supabase token validation and per-user abuse limits. Do not interpret demo session flags as authorization. Do not expose this host as an unrestricted cross-origin proxy.

## Persistent budget

[Unsplash implementation](UNSPLASH-INTEGRATION.md) defines the two-call reservation and upstream quota behavior. Every process using the same Unsplash application/key must use **the same persistent BudgetPath and lock-capable filesystem**. The state and lock file are not per-browser or per-user. One host or multiple local processes can share them; independent replica disks cannot enforce a combined cap. Use a shared transactional quota store before deploying across independent hosts/regions.

Do not delete/reset the quota state on restarts, redeployments, provider errors, or hourly timers. A rolling window ages reservations out. Invalid/unreadable/unwritable state or lock contention fails closed. Keep permissions restricted to the service account. Filesystem loss or manually deleting state loses usage history; restore history or wait a full hour before resuming. Other applications/tools using the key are outside this local reservation counter; upstream exhausted-quota headers/429 block this source for a further hour.

## Validation

```sh
dotnet build backend/Scalable.Api.csproj
dotnet run --project tests/backend/Scalable.Api.Checks.csproj
node tests/unsplash.browser.cjs
```

The browser suite requires Playwright, Chromium, and the built Debug backend. Override `DOTNET_PATH` or `CHROMIUM_PATH` when needed. The backend checks use a fake HTTP handler and a controlled clock, plus four child processes sharing a real quota file. Host/browser checks use the actual .NET host with an empty key and routed provider fixtures, so ordinary validation spends no Unsplash quota. Existing frontend suites remain required for shared rendering/refinement changes.
