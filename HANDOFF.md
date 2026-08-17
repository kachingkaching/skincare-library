# Handoff — Skincare Library

State of the work as of 17 August 2026. `README.md` covers how to *use* the app;
this covers how the code got here, what is proven, and what will bite you.

## What it is

A private skincare library: photograph products, keep their ingredient lists,
read what is actually in them, record a routine, and get a skin assessment.
Vanilla HTML/CSS/JS, no build step, no framework, everything in IndexedDB.

Location: `/Users/ching/Claude Code/Experiments/Skincare library/`
Repo: **https://github.com/kachingkaching/skincare-library** (public, `main`)
Live: **https://kachingkaching.github.io/skincare-library/** via GitHub Pages,
served from `main` / root. Pushing to `main` redeploys it — there is no CI step.
Ching pushes with `git push` from Terminal; credentials are in the macOS keychain,
so no token prompt. There is no `gh` CLI and no SSH key on this machine, so an
assistant cannot push — hand the user the command.

## Running it

```bash
python3 serve.py          # http://localhost:8931
```

**Do not use `python3 -m http.server`.** It sends no cache headers, so browsers
hoard stale JS modules and edits appear not to take effect. This cost hours
across the session, twice for me and once for the user. `serve.py` sends
`Cache-Control: no-store`. If a browser already cached files under the old
server, one hard reload (Cmd+Shift+R) is needed to break out.

## The files

| File | Holds |
|---|---|
| `js/store.js` | IndexedDB v2 — profiles, products, images, assessments, routines, chat, picks, settings |
| `js/ingredients.js` | ~190-entry INCI dictionary: function, tags, cautions, aliases |
| `js/rules.js` | Categories, routine step order, concern→ingredient map, layering conflicts |
| `js/analysis.js` | `assessSkin()` — rules engine, and the AI branch |
| `js/ai.js` | The five operations: read label, look up ingredients, assess, chat, discover |
| `js/providers/gemini.js` | Gemini adapter (the only live provider) |
| `js/autofill.js` | Legacy Anthropic label reader, kept as a second provider |
| `js/briefing.js` | Markdown export for pasting into any assistant — no key needed |
| `js/chat.js` | Floating chat panel |
| `js/views.js` | All rendering. Holds the `AI_FEATURES` build switch |
| `js/app.js` | Hash router |
| `build_share.py` | Flattens everything into one self-contained file |
| `serve.py` | Dev server with no-store |

## What is built

- **Shelf, product dossiers, add/edit** with live ingredient parsing and annotation.
  The add form runs brand/name → category/status → **ingredients** → size/price →
  dates → notes. Period-after-opening and rating were removed from the form and
  from the dossier; `saveProduct` still carries both through untouched so editing
  an older record does not discard what it held.
- **Profiles** — per-person shelf, assessments, routine; switcher in the masthead
- **Routine** — **the week is the interface.** Seven day disclosures, one open at
  a time, today open by default. Opening a day shows that day's morning and
  evening in application order and edits it: adding puts the product on *that day
  only*, removing takes it off that day and off the routine entirely when it was
  its last. The old every-step builder is intact underneath, collapsed as
  "Complete routine", and still holds the per-entry day toggles and the reorder.
  Both sections end in their own Save; edits are held in a draft until then, and
  the note beside Save says "Unsaved changes." until they are written.
  Underneath, entries still carry `days: [0-6]` (Monday first), and **conflicts
  are judged per day** — a retinoid on Mon/Wed/Fri and an acid on Tue/Thu no
  longer warn, because they never meet. `daysOf()` / `describeDays()` in rules.js
  are the accessors; missing `days` means every day.
- **Assessment** — rules engine always; with a key, Gemini reads the photograph
  (opt-in tickbox, **off by default**) and adds observations / what's working /
  what to change
- **Chat** — floating panel, streamed, carries shelf + routine + latest reading.
  The launcher is a large drawn speech cloud. Its body and tail are two
  overlapping filled shapes, not one path: a single outline leaves a visible nick
  where the tail meets the curve at that size.
- **Discoveries** — monthly J/K-beauty picks via Google Search grounding, shown
  as a scroll-snap carousel with Previous/Next **above** the images. Each pick
  gets a silhouette drawn deterministically from its name and kind (`pickArt()`
  in views.js) — real photographs are not obtainable client-side, so this is
  deliberate, not a placeholder awaiting images. The picture and the name link
  out to where the product was found; the model is asked for a `url` and
  `pickUrl()` **treats it as untrusted** — anything that is not http(s), and
  every pick cached before this existed, falls back to a search by product name.
  Only the blurb shows; kind, actives, caution and the source fold away under
  "Details".
- **Header marks** — one hairline line drawing per view (`headerArt()`, `ART` in
  views.js), decorative and `aria-hidden`
- **Briefing export** — the no-key path, works everywhere including the shared copy

## Verified vs not

**Verified by driving the real UI:** routine multi-serum + day scheduling +
both migrations + reorder + delete cascade, including that per-day conflicts go
quiet when products are alternated; assessment history opening, rendering and
closing in place; header marks on all six views; carousel slides, artwork, dots
and disabled states; briefing content; profile isolation and cascade delete;
backup export/wipe/import incl. images; every route renders with no console
errors; mobile and tablet layouts; the shared build is inert.

**Verified on 17 August (day-first routine and the rest):** adding to one day
leaves the other six alone; the adder drops a product once that day's step is
filled; per-day conflict notices appear inside the open day and mark the closed
header; the accordion opens one day at a time; Save writes the draft to
IndexedDB and the note flips from "Unsaved changes." to "Saved."; the complete
routine still lists every step with its day toggles and per-period conflicts;
"Previous readings" renders at 21px with no rule under it and the off/on
paragraph is gone; the add form's field order and the two removed fields;
Previous/Next sit above the carousel track; details fold and unfold; and
`pickUrl()` turns a `javascript:` URL, a malformed one and a missing one into a
search link. All six routes render in the flattened share build.

**Verified against a mocked API** (no key in my browser — by design, the key
lives only in the user's): the self-correcting retry, SSE streaming and its
fallbacks, grounding-quota degradation, all three ingredient-source states.

**Confirmed working by the user with a real key:** label reading (brand, name,
category), chat.

**Not exercised against a live model:** the two-pass ingredient lookup, and the
`url` field now asked of `discover()`. Both were driven with fixtures only.

**Still unconfirmed end to end:** the skin assessment with the photo tickbox on.
Discoveries returns results but the user's free tier has no grounding quota, so
they arrive flagged "Not web-checked". The carousel's actual scrolling is
unverified — the automation pane collapses to zero width and a zero-width
container refuses to scroll; only the index maths was checked standalone.

## Gotchas

**Ingredient lookup runs twice on purpose.** The free tier's *search* quota is
separate from its ordinary one and empties first. The first pass searches and is
strict — no verified source, no list — which on an exhausted quota meant the
label reader always came back "could not find an ingredient list", which is what
it was doing before 17 August. So a second pass now asks the model to recall the
list from training, and the result is returned `grounded: false` with
`searchRan` telling the caller *why*, so the UI can say plainly that nobody
checked it. Do not quietly drop that flagging: an unchecked ingredient list read
as a checked one is the worst outcome this app can produce.

**The Gemini API is newer than the model's training.** It is *not*
`models/{id}:generateContent` with `contents`/`parts`. It is:

```
POST https://generativelanguage.googleapis.com/v1beta/interactions
x-goog-api-key: <key>
{ model, system_instruction, input: [turns], tools, response_format, store: false }
```

- Text out: `steps[type=model_output].content[type=text].text`
- Streaming (`?alt=sse` + `stream:true`) is a *different shape*:
  `{event_type:"step.delta", delta:{text:"…"}}`, incremental
- Errors are **array-wrapped**: `[{"error":{…}}]`
- Models are the 3.x series (`gemini-3.6-flash`, `gemini-3.5-flash-lite`)

I got `system` and the streaming shape wrong from docs summaries. Verify against
`ai.google.dev` before changing request shapes, and prefer raw curl examples over
prose. The adapter now **self-corrects**: on "Unknown parameter 'x'" it drops `x`
and retries, folding the system prompt into the conversation or asking for JSON
in words. It also sheds `tools` on a grounding quota error and reports it via
`dropped`, so callers can label results honestly.

**The flattened share build shares one scope.** Two modules each declaring
`fmtDate` throws at load and renders a blank page. `build_share.py` now detects
duplicate top-level declarations and refuses to build. It also asserts no API
hostname survives, and **stubs out every network-touching module** — so any new
import from `ai.js`/`chat.js` must be added to `STUBS` or the shared copy breaks.

**The automation browser is not a fair test of layout.** Its pane is often hidden,
which collapses the viewport to zero width. In that state `getBoundingClientRect()`
returns zeros, screenshots come back blank, the Clipboard API refuses to write
because the document is unfocused, and a zero-width container will not scroll.
None of those are bugs in the app. Verify layout by reading the DOM and computed
styles, and say plainly when something could not be exercised rather than
reporting a false pass.

**Routine migrations run on read, in `store.getRoutine()`.** There have been two:
flat product ids to `{step, productId}` entries, then adding `days`. Both detect
the old shape, convert, and write back. Any further change belongs in
`migrateEntries()` and must tolerate every earlier shape, because old backups can
still be imported.

## The shared copy

`python3 build_share.py` → `dist/skincare-library.html`, one self-contained file
with `AI_FEATURES = false`, zero external URLs, and the briefing export intact.

Published as an artifact at
**https://claude.ai/code/artifact/c16ffa1b-37fa-4eea-bca3-36d660088c7e**
(private until shared from the page's share menu). Republishing the same file
path from the conversation that created it keeps the URL; from a new conversation,
pass that URL as the `url` parameter or you will mint a second artifact.

## Two deployments, and which is which

| | Full app | Shared copy |
|---|---|---|
| Where | GitHub Pages, and `serve.py` locally | Artifact, and `dist/skincare-library.html` |
| AI | works with the viewer's own key | none — `AI_FEATURES = false`, zero external URLs |
| For | Ching, and anyone willing to get a free Gemini key | Ching's mum |

Both are built from the same source. The GitHub Pages one is now the better link
to share, because the recipient can add their own key and get everything; the
artifact remains for anyone who should not have to.

## Open items

1. Confirm the photo assessment works with a real key and the tickbox on.
2. Discoveries is ungrounded on the free tier — grounding quota is separate from
   ordinary requests and appears to be exhausted. Retry another day, or use the
   briefing with the Gemini consumer app, which has search and no API quota.
3. Clipboard copy of the briefing is unverified — the automation browser cannot
   focus a document, and the Clipboard API refuses to write when unfocused. The
   download path works.
4. `index.html` carries `?v=2` on the app script to break a cache entry poisoned
   before `serve.py` existed. Harmless; removable once nobody has that stale copy.
5. The carousel's scrolling has never run in a real viewport — see above. The
   same session that built the day-first routine lost its viewport partway
   through, so that work was verified by reading the DOM rather than by
   screenshot from the point the pane collapsed.
6. Republishing the artifact only keeps its URL from the conversation that created
   it. From a new session, pass the URL as the Artifact tool's `url` parameter, or
   a second artifact is minted and the shared link quietly stops updating.

## Working with this person

Prefers concise answers and low token spend. Privacy-conscious — the photo
tickbox defaults off for that reason, and they should never be asked to paste an
API key anywhere. They dismiss option-questions they do not want to answer;
recommend and proceed rather than re-asking.
