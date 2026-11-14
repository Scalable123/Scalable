# AI integration

This document describes the isolated AI prompt flow added to the Studio. It does not change the existing music, video, account, or appearance integrations.

## Local setup

1. Keep `OPENAI_API_KEY` in the root `.env` file. It is read only by `server.js` and is never sent to browser code.
2. Optionally set `OPENAI_MODEL`; the default is `gpt-4.1-mini`.
3. Start the application with `npm start`.
4. Open `http://localhost:3000/`. The server serves `frontend/` and the API from the same origin.

The existing `python3 -m http.server ... --directory frontend` preview remains available, but it cannot call the AI endpoint because it does not run the backend.

## Request flow

`frontend/index.html` already contains the prompt form. Its module, `frontend/js/app.js`, calls `frontend/js/ai-service.js`, which posts to:

`POST /api/ai/creative-direction`

The server validates the prompt, calls the OpenAI Responses API, and returns a strict JSON direction containing a title, description, note, five palette colors, optional song recommendations, and optional ambient sounds. The frontend merges those fields into the current board while retaining the existing local image collection and board controls.

If the API key is missing, the provider fails, or the app is opened through a static-only server, the current curated demo board remains usable and the user sees an availability notice.

## Security and boundaries

- Never add `OPENAI_API_KEY` to browser JavaScript or expose it through frontend configuration.
- The endpoint currently has no authentication or rate limiting; add both before production use.
- AI songs are creative recommendations with catalog-search links, not verified provider results.
- Reference images remain local in this first pass and are not uploaded to the AI provider.
- The endpoint limits prompt requests to 2,000 characters and request bodies to 20 KB.
