# Deploy the Studio frontend to GitHub Pages

The repository root now contains a landing `index.html` that immediately redirects to `./frontend/login.html`. It also includes a visible fallback link and works without JavaScript. All paths are relative, so the site works at a project URL such as `https://<owner>.github.io/Scalable/` as well as at a custom-domain root.

The existing Studio remains at `frontend/index.html`. Login, account, styles, scripts, and media keep their existing relative paths. Visiting the site root opens login; it does not add authentication or restrict direct access to the Studio.

## Option 1: deploy directly from this branch

After committing and pushing these files:

1. Open the GitHub repository's **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Select `front-end-design` and **/ (root)**, then save.
4. Wait for GitHub's Pages build to finish and use the URL reported by GitHub.

The root `.nojekyll` file enables plain static hosting. Future pushes to the selected publishing branch will update the public site. Repository/account permissions and GitHub Pages availability still apply.

## Option 2: manual GitHub Actions deployment

`.github/workflows/pages.yml` provides a manual-only deployment:

1. Make this workflow available on the repository's default branch; GitHub requires that for the **Run workflow** action to appear. You can continue developing on `front-end-design`.
2. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
3. Open **Actions → Deploy Studio to GitHub Pages → Run workflow**, select the desired branch/ref (for example `front-end-design`), and run it.
4. Use the deployment URL produced by GitHub after the workflow completes. If the `github-pages` environment restricts deployment branches, allow the selected ref in its settings.

This workflow publishes only the root landing page, `.nojekyll`, and the `frontend/` directory. There is no Node build or backend process. It has no push trigger, so committing/pushing the workflow alone does not deploy via Actions. The workflow does not change repository Pages settings for you.

Choose one publishing source in Settings. Branch publishing serves the repository root; the Actions workflow instead uploads the smaller prepared site artifact.

## Local check

To test the root entry point rather than opening the Studio directly, run from the repository root:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/`; it should lead straight to `/frontend/login.html`. The **Explore the demo account**, **Back to Studio**, and account service-preview links should stay under the same project path when hosted under `/Scalable/`.

GitHub Pages hosts the static frontend only. Studio prompt submissions can call the public Wikimedia Commons API directly without an API key; credit/license display and request limits work in browser code. Login uses the existing external Supabase integration. Media-account connections and AI research remain previews; C#/.NET APIs and SQL need separate hosting when implemented. Published local-file imports stay in the visitor's browser and need reattachment after reload. See [Wikimedia integration and live smoke-test limits](WIKIMEDIA-INTEGRATION.md).

No Pages settings, repository publishing source, or live deployment are changed by adding these files. Actual publication is a separate step through GitHub.
