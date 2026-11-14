# Backend status and implementation boundary

No C# / ASP.NET Core application, research worker, SQL schema, or application API server exists in this checkout. The existing `ApiBoardService` is an inactive proposed HTTP adapter. GitHub Pages serves static files. Supabase authentication is a separate existing browser integration; boards still persist in browser storage. See [frontend documentation](FRONTEND.md).

## Wikimedia source added in T001

The working static-site fallback calls the public Commons Action API without credentials. `WikimediaImageSource.search(prompt, { signal })` returns a status and at most one image DTO. `WikimediaBoardService` composes this with the existing sample board only when `includeWikimedia: true` is passed by the prompt submit handler. Initial/demo generation stays offline. [Wikimedia integration](WIKIMEDIA-INTEGRATION.md) documents authentication, current limits, metadata requirements, and validation.

When the planned research worker is implemented:

1. Add a server-side Commons provider under research orchestration. Keep the maximum **one newly selected Wikimedia image per user-submitted research run**, independent of AI-suggested queries or retries. Allocate no more than one Commons metadata query for this initial integration.
2. Make quota reservation/idempotency atomic across workers and instances. Enforce aggregate provider/IP budgets, a circuit breaker, cancellation, timeouts, response cooldowns, and cache retention. Reverify current limits before rollout. Do not trust browser storage or `includeWikimedia` to enforce policy.
3. Send a truthful server User-Agent/contact; this anonymous read integration needs no API secret. Any future privileged-provider credentials belong only in server configuration/secret storage.
4. Validate upstream metadata, destinations, redirect targets, file types/dimensions, licenses, and authoritative provenance independently of the client. Preserve creator, supplied credits/custom attribution/copyright, license, source page, provider identity, and retrieval time in the validated source record.
5. Store allowed references and source metadata with the authorized board/research run. Retain pinned user choices and imported media. Do not overwrite a newer board revision with a late result. Do not infer permission to rehost files from their presence in search results.
6. Return partial results and provider status when Commons fails or is exhausted; allow other sources to complete. Keep source failures distinct from AI failure or an authenticated board-save failure.
7. Integrate `/api/research-runs` start/poll/cancel with authentication, authorization, ownership, validation, CSRF/token handling, and UI loading/error states as described in `FRONTEND.md`. Then remove the direct browser lookup from that production path so one submission cannot contact both browser and server adapters.

These are implementation requirements for future backend work, not endpoints or enforcement implemented by this branch. Live AI interpretation and reference-image analysis remain unimplemented.
