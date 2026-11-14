# Deploy the Studio frontend to GitHub Pages

The repository root now contains a landing `index.html` that immediately redirects to `./frontend/login.html`. It also includes a visible fallback link and works without JavaScript. All paths are relative, so the site works at a project URL such as `https://<owner>.github.io/Scalable/` as well as at a custom-domain root.

The existing Studio remains at `frontend/index.html`. Login, account, styles, scripts, and media keep their existing relative paths. Visiting the site root opens login; it does not add authentication or restrict direct access to the Studio.

## Option 1: deploy from a reviewed publishing branch

After human review/merge, choose the intended publishing branch:

1. Open the GitHub repository's **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Select the intended publishing branch (for example `main`) and **/ (root)**, then save. This documentation review branch does not need to become the publishing source.
4. Wait for GitHub's Pages build to finish and use the URL reported by GitHub.

The root `.nojekyll` file enables plain static hosting. Future pushes to the selected publishing branch will update the public site. Repository/account permissions and GitHub Pages availability still apply.

## Option 2: manual GitHub Actions deployment

`.github/workflows/pages.yml` provides a manual-only deployment:

1. Make this workflow available on the repository's default branch; GitHub requires that for the **Run workflow** action to appear. Continue development on separate review branches.
2. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
3. Open **Actions → Deploy Studio to GitHub Pages → Run workflow**, select the desired branch/ref (for example `main`), and run it.
4. Use the deployment URL produced by GitHub after the workflow completes. If the `github-pages` environment restricts deployment branches, allow the selected ref in its settings.

This workflow publishes only the root landing page, `.nojekyll`, and the `frontend/` directory. There is no Node build or backend process. It has no push trigger, so committing/pushing the workflow alone does not deploy via Actions. The workflow does not change repository Pages settings for you.

Choose one publishing source in Settings. Branch publishing serves the repository root; the Actions workflow instead uploads the smaller prepared site artifact.

## Local check

To test the root entry point rather than opening the Studio directly, run from the repository root:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/`; it should lead straight to `/frontend/login.html`. The **Continue without an account**, **Back to Studio**, and account service-preview links should stay under the same project path when hosted under `/Scalable/`.

## GraphQL, cookies, and service routing

Pages serves static files only. The implemented account API uses ASP.NET Core GraphQL/Identity instead of Supabase; GraphQL is the API layer over server SQL persistence. The browser GraphQL client defaults to `https://scalable-5rgd.onrender.com/graphql` on nonlocal hosts and localhost on loopback hosts. That is source configuration, not verified live availability.


Set `App__PublicBaseUrl=https://scalable123.github.io/Scalable/frontend` for reset links when using that published layout. The current email adapter sends no mail and logs no reset URLs/tokens. Do not put a project path into `App__FrontendOrigin`, which must be an origin.

Pages cannot execute `server.js`. Deploy the Node service with `render.yaml`, set its private `OPENAI_API_KEY` and `FRONTEND_ORIGIN=https://scalable123.github.io`. The Studio points nonlocal browsers to `https://scalable-ai.onrender.com`; update that value in `frontend/index.html` if Render assigns a different service hostname. The AI service's CORS policy accepts only the exact configured origin. Without the remote service, Explore falls back locally. Local media files also remain browser-only and need reattachment after reload.


No Pages settings, repository publishing source, or live deployment are changed by adding these files. Actual publication is a separate step through GitHub.

## Hosted image-source API

The hosted ASP.NET GraphQL/Identity API now exposes the Wikimedia endpoint at `/api/image-sources/wikimedia`. Pages still publishes static files only, so the frontend resolves API calls to `https://scalable-5rgd.onrender.com` by default; override this before modules initialize with `window.SCALABLE_API_ORIGIN` when deploying the API elsewhere. The API deployment must allow the exact Pages origin in CORS and persist its data directory for the shared Wikimedia budget. Wikimedia needs no API key; never embed provider credentials into a Pages artifact.
