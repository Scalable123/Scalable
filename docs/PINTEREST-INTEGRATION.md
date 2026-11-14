# Pinterest board import: frontend and backend handoff

The Studio has a Pinterest import experience for starting from whole boards. It is a **frontend-only connection preview**. It does not open Pinterest sign-in, connect an account, scrape pages, read private boards, or fetch Pinterest images. The demo uses three local sample boards and the existing sample photography; no real Pinterest pin URLs or account details are invented. The selected application backend uses ASP.NET Core with **GraphQL instead of Supabase for application data access**; it is not implemented. Legacy Supabase Auth is separate from Pinterest authorization. See [BACKEND.md](BACKEND.md).

## Try the flow

1. Click **Import Pinterest board** in **01 / The Starting Point**, below the reference-image input.
2. Choose **Preview Pinterest connection**. The library remains labeled “not connected.”
3. Search or select one or more sample boards. Select all boards and clear selection work across the library, including boards hidden by a search.
4. Review the pins. Every pin in each selected board is selected by default. Deselect individual pins or use Select every pin; zero selected pins disables import.
5. Add to the current mood board, or start a new named mood board. Starting new replaces the unsaved canvas; the review screen explains this. Existing saved boards remain available.
6. Confirm the import, review the added/skipped counts, and view the updated Studio canvas. Save the mood board to persist references in this browser.

The demo boards have 6, 4, and 5 sample pins. A whole-board import includes every pin in the local fixture, not just its three preview thumbnails. Sample photography is reused for the fixture; these are not distinct images fetched from Pinterest.

Previews: [connection](design-previews/studio-pinterest-connect.png) · [board picker](design-previews/studio-pinterest-boards.png) · [pin review](design-previews/studio-pinterest-review.png) · [imported canvas](design-previews/studio-pinterest-canvas.png).

## Working behavior

- Multi-board selection, search, no-match state, full-board selection, optional pin-level selection, and a review step.
- Current-board and new-board destinations, required new-board title, and explicit confirmation of the destination.
- Stable source keys prevent duplicates when adding the same pins again. A removed pin can be imported again.
- Imported pins use the existing image filter and Studio layout. They can be pinned or removed individually and survive brief refinement along with imported audio.
- New mood boards start with the selected pins and an editable starter prompt. Palette, songs, and sound recommendations arrive when the user explores that brief; the import does not invent research results.
- Save/reopen preserves source-board metadata, demo identity, and pinned states. Ending the connection preview clears its selections without deleting already imported references. A page reload starts disconnected; no connection state is persisted.
- A research result started before a new board is created cannot overwrite the new imported board.
- All dialog controls and images are local. No Pinterest/provider requests or account popups are made.

## Code and DTOs

`frontend/js/pinterest-import.js` owns the sample library, pure pin-to-item conversion, and import flow. `app.js` owns canvas changes and persistence through the existing board service. Appearance preferences remain separate.

Imported items extend the image DTO:

```js
{
  id, type: 'image', title, description, url,
  sourceUrl, sourceLabel, position: 'pinterest', pinned,
  imported: true, provider: 'pinterest', sourceKind: 'pinterest-demo',
  sourceKey: 'pinterest-demo:<sample-pin-id>',
  externalPinId: '<sample-pin-id>',
  sourceBoard: { id: '<sample-board-id>', title, url: null },
  originalPinUrl: null,
  isSample: true
}
```

`sourceUrl` in the demo identifies the sample photography source, not a Pinterest pin. No fictitious live pin/board URL is generated. Production DTOs should distinguish original pin URL, source/creator URL, preview image URL, and source-board metadata, and carry truthful attribution. An imported reference is a copy into the Studio canvas, not a move/delete operation on Pinterest.

`DemoPinterestService.listBoards()` currently returns the complete local library synchronously, including its pins. A real adapter requires an async loading/error/cancellation integration pass; it is not a drop-in URL replacement. The import callback receives selected items, destination, new-board title, and source-board summaries.

## Proposed ASP.NET Core GraphQL boundary — not implemented

Proposed fields at `/graphql`; exact input/output types remain to be defined:

| Kind | Field | Purpose |
| --- | --- | --- |
| Query | `pinterestConnection` | Actual connection/capability status without tokens |
| Mutation | `authorizePinterest` | Start supported OAuth; return the authorization URL |
| Mutation | `disconnectPinterest` | Disconnect/revoke without deleting imported references |
| Query | `pinterestBoards` | Bounded cursor-paginated authorized board summaries |
| Query | `pinterestPins` | Bounded cursor-paginated pin previews for a selected board |
| Mutation | `startPinterestImport` | Authorized board IDs, all-pins or selected-pin mode, destination ID/title |
| Query | `pinterestImportRun` | Progress, added/skipped/failed counts, destination, terminal status |
| Mutation | `cancelPinterestImport` | Cancel an authorized running import |

OAuth callbacks can use separately implemented protocol-specific HTTP routes to validate state and exchange credentials server-side. Handle transport failures, GraphQL `errors` even with HTTP 200, and partial `data`; none alone confirms a complete import. The database/ORM behind the GraphQL service remains undecided.

Before enabling this, verify Pinterest's current developer approval, available board/pin APIs, read permissions, access to the selected boards, limits, and media usage terms. Account/library access is not established by the preview. Do not ask for Pinterest passwords or put app secrets/access tokens into frontend files or browser storage.

The backend must check ownership/access, validate selected pin/board IDs, handle OAuth state and token lifecycle, and fetch **all pages** for a whole-board import. Clearly report partial imports, inaccessible/unsupported pins, rate limits, failures, cancellation, and retry behavior. Never label the first page or a partial import “complete.” Preserve already imported items during retries; use provider pin identity as an idempotent deduplication key. If one pin belongs to several selected boards, retain all source-board associations in the production schema.

Render real disconnected, authorizing, connected, expired, denied, empty-library, loading, partial-result, and failed states from actual responses when the adapter is implemented. Image caching/downloading and any provider-content processing need their own supported implementation and provenance; current local fixture URLs do not establish those capabilities. Respect source access and provider permissions, retain links/attribution, and do not assume that importing references grants image reuse rights.

## Validation

`node tests/studio.browser.cjs` includes board search/selection, whole-board counts, partial pin selection, empty selection, duplicates and reimport after removal, save/reload/reopen, pin persistence through refinement, new-board creation, stale-research protection, dialog focus, and imported-board layouts across five widths in light/dark and collage/grid modes. It also checks that these flows make no external provider requests.
