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

The Node service can run as a Render web service using the repository's `render.yaml`. Set `OPENAI_API_KEY` in the Render dashboard; do not commit it or expose it through browser configuration. Set `FRONTEND_ORIGIN` to the exact deployed frontend origin, such as `https://scalable123.github.io`, so the service permits the GitHub Pages browser request. The browser reads an optional `window.SCALABLE_AI_ORIGIN` value before modules initialize; set it to the deployed Node service origin when the frontend and AI service are on different hosts. When the Studio is served by the Node service itself, it uses the current origin automatically.

The server validates the prompt and optional reference image, calls the OpenAI Responses API, and returns a strict JSON direction containing a title, description, note, five palette colors, up to three visual-search phrases, optional song recommendations, and optional ambient sounds. When a reference is supplied, it is sent as an image input to the provider. The frontend replaces the title, description, and note, leaves the existing palette unchanged, uses the phrases to request up to three Wikimedia references, and appends enabled AI songs/sounds while retaining enabled curated songs/sounds. No generated image file is produced by this flow.

If the API key is missing, the provider fails, or the app is opened through a static-only server, the local fallback board remains usable. The attempted availability toast can be replaced by the final sample-composed toast. Version checks stop stale board replacement but do not abort an AI request. Explicit prompt submissions also query the ASP.NET image-source boundary; Wikimedia Commons is read-only, needs no API key, and contributes at most one image with its Commons file, creator, and license metadata.

## Security and boundaries

- Never add `OPENAI_API_KEY` to browser JavaScript or expose it through frontend configuration.
- The endpoint currently has no authentication or rate limiting; add both before production use. Render CORS is restricted to the configured `FRONTEND_ORIGIN`.
- AI songs are creative recommendations with catalog-search links, not verified provider results.
- Reference images are uploaded only on explicit Explore submission, as validated base64 JPG/PNG/WebP data, and are not persisted by the app. Pinterest imports are never included in the frontend request; browser research-policy guards reject Pinterest inputs. The Node endpoint itself has no equivalent Pinterest-specific server guard, which remains required before expanding research/tools.
- The endpoint limits prompts to 2,000 characters, reference files to 10 MB in the browser, and the encoded JSON request to 15,000,000 characters. Invalid prompts/images return 400; JSON/size/provider failures return 502.
- Wikimedia requests are server-side only. Configure `Wikimedia:UserAgent` and, when needed, `Wikimedia:BudgetPath`; the source uses a conservative 180 requests/minute budget below the documented 200 requests/minute identified-client guidance.
