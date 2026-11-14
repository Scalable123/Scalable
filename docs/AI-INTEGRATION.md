# AI integration

This document describes the implemented Node AI prompt flow. It is separate from the ASP.NET GraphQL/Identity and Pinterest API; GraphQL is the application account API instead of Supabase. See [BACKEND.md](BACKEND.md) for current service boundaries and [T003](T003.md) for validation.

## Local setup

1. Supply `OPENAI_API_KEY` through the Node environment or ignored root `.env`. It is read only by `server.js` and is never sent to browser code.
2. Optionally set `OPENAI_MODEL`; the default is `gpt-4.1-mini`.
3. Start the application with `npm start`.
4. Open `http://localhost:3000/`. The server serves `frontend/` and the API from the same origin.

Node serves the contents of `frontend/` at its URL root, so login is `/login.html`, not `/frontend/login.html`. Run the .NET API separately for accounts/Pinterest. `PORT` overrides 3000.

The existing `python3 -m http.server ... --directory frontend` preview remains available, but it cannot call the AI endpoint because it does not run the backend.

## Request flow

`frontend/index.html` already contains the prompt form. Its module, `frontend/js/app.js`, calls `frontend/js/ai-service.js`, which posts to:

`POST /api/ai/creative-direction`

The server validates the prompt, calls the OpenAI Responses API, and returns a strict JSON direction containing a title, description, note, five palette colors, optional song recommendations, and optional ambient sounds. The frontend replaces the title, description, palette, and note, sets `mode: "ai"`, and appends enabled AI songs/sounds while retaining enabled curated songs/sounds and the same local photos. No live image search, catalog verification, or image analysis occurs.

If the API key is missing, the provider fails, or the app is opened through a static-only server, the local fallback board remains usable. The attempted availability toast can be replaced by the final sample-composed toast. Version checks stop stale board replacement but do not abort an AI request.

## Security and boundaries

- Never add `OPENAI_API_KEY` to browser JavaScript or expose it through frontend configuration.
- The endpoint currently has no authentication or rate limiting; add both before production use.
- AI songs are creative recommendations with catalog-search links, not verified provider results.
- Reference images remain local and are not uploaded to the AI provider. Pinterest imports are never included in the frontend request; browser research-policy guards reject Pinterest inputs. The Node endpoint itself has no equivalent Pinterest-specific server guard, which remains required before expanding research/tools.
- The endpoint limits prompt requests to 2,000 characters and the accumulated request-body string to 20,000 characters (not a byte-counted 20 KB limit). Invalid prompts return 400; JSON/size/provider failures return 502.
