# Handoff — Skincare Library

State of the work as of 17 August 2026 (second pass). `README.md` covers how to *use* the app;
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
| `js/i18n.js` | Three language tables, `t()`, and the label helpers. **Imports nothing but data** |
| `js/ingredients.i18n.js` | Generated: each ingredient's description in both Chinese scripts |
| `tools_generate_ingredient_i18n.py` | Regenerates the above. Traditional is authored there by hand |
| `js/store.js` | IndexedDB v2 — profiles, products, images, assessments, routines, chat, picks, settings, language |
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
- **One photograph, several products** — `readProducts()` in ai.js always
  returns an array, and the prompt decides: one pack close up gives one entry
  with its ingredients transcribed; a shelf of bottles gives one entry each and
  no ingredients, because that print is never legible at that distance. Each
  entry carries `box` — [ymin, xmin, ymax, xmax] on a 0–1000 grid, Gemini's own
  convention — and `cropImage()` in store.js cuts each product out of the group
  shot so every new entry gets its own picture. Finding more than one opens a
  review list on the Add page: every row editable, droppable, and defaulting to
  *add to the count* when it matches something already on the shelf. Nothing is
  written until the list is approved. A missing or nonsensical box falls back to
  the whole photograph rather than a sliver.
- **Inventory** — every product carries a `quantity`. The shelf shows a tally
  over the corner of the photograph above one, a running "N on hand" in the
  filter bar, and a − / ＋ stepper under each card that writes straight to
  IndexedDB without redrawing the grid. Reaching zero marks the product
  **Finished** and drops it out of the default view, with the bar saying how
  many are being kept back and a one-click reveal; stepping back up to one
  makes it active again. The record is never deleted — assessments and the
  routine still point at it. Reading a label counts identical units in the
  photograph (`count` in `readLabel`, clamped to 1–99), and adding something
  whose brand and name already match offers to add to that product's count
  instead of making a second card. Matching is on brand and name only, so a
  travel size and a full size stay apart. Legacy records with no `quantity`
  read back as 1 — `withQuantity()` in store.js normalises on the way out
  rather than by a migration pass, so old backups still import.
- **Profiles** — per-person shelf, assessments, routine; switcher in the masthead
- **Routine** — **the week is the interface.** Seven cards standing across the
  page (`.week-strip`), scrolling sideways below tablet width. One is always
  chosen — today to begin with — and its morning and evening open out directly
  beneath the row. A card carries only the day, a step count and a Today or Take
  care marker; listing product names on each was noise at that size. Editing a
  day puts the product on *that day only*, and removing takes it off that day —
  and off the routine entirely when it was its last. The old every-step builder
  is intact underneath, collapsed as "Complete routine", and still holds the
  per-entry day toggles and the reorder.
  **Any product can go in any step, and any step takes as many as you like.**
  `offerFor()` in views.js lists a step's own categories first, then everything
  else after a rule. Before this, five categories — Mask, Spot treatment, Lip
  care, Body, Other — matched no step in the canonical order and could not be
  recorded in a routine at all, and 14 of the 16 steps accepted a single
  product. `multiple` in rules.js is still read by the assessment engine when it
  *suggests* a routine; it no longer restricts what you may record yourself.
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
- **Three languages** — English, 繁體中文, 简体中文, chosen from a button at the
  right-hand end of the navigation or from Settings, and remembered in
  IndexedDB under `lang`. With nothing stored, a Chinese browser opens in
  Chinese. Switching redraws in place; nothing reloads. The model is told to
  reply in the same language, and to leave brands, product names and INCI
  alone. **INCI names are deliberately never translated** — matching the bottle
  in your hand against the screen matters more than reading the name in your
  own language — but every sentence *about* an ingredient is.
- **Briefing export** — the no-key path, works everywhere including the shared copy

## Verified vs not

**Verified by driving the real UI:** routine multi-serum + day scheduling +
both migrations + reorder + delete cascade, including that per-day conflicts go
quiet when products are alternated; assessment history opening, rendering and
closing in place; header marks on all six views; carousel slides, artwork, dots
and disabled states; briefing content; profile isolation and cascade delete;
backup export/wipe/import incl. images; every route renders with no console
errors; mobile and tablet layouts; the shared build is inert.

**Verified on 17 August (week strip, shelf, and the rest):** the seven cards sit
flat across a 1280 viewport and scroll sideways at 375; choosing a day swaps the
breakdown beneath and the chosen card survives the redraw; adding to one day
leaves the other six alone and only that card's step count moves; the adder
drops a product once that day's step is filled; per-day conflict notices appear
under the chosen day; the shelf is four across, three below 1240 and two below
1080; the step reads "Serum" everywhere. Save writes the draft to
IndexedDB and the note flips from "Unsaved changes." to "Saved."; the complete
routine still opens under the week, listing every step with its day toggles and
its per-period conflicts;
"Previous readings" renders at 21px with no rule under it and the off/on
paragraph is gone; the add form's field order and the two removed fields;
Previous/Next sit above the carousel track; details fold and unfold; and
`pickUrl()` turns a `javascript:` URL, a malformed one and a missing one into a
search link. All six routes render in the flattened share build.

**Verified for the open routine picker:** every step offers every product with
its own categories first and a disabled rule before the rest; two moisturisers
sit in the Moisturise step; a Mask and a Spot treatment — neither of which had
any step before — are recorded under Serum; application order still follows
STEPS; the complete builder lost the same restriction; and it saves and reads
back. In all three languages and in the share build.

**Verified for the multi-product read** (against a mocked reply, with a
synthetic three-panel photograph): three products come back as three editable
rows; unticking one dims it and retitles the button; editing a name is what
gets saved; each entry's crop centres on the right part of the picture, checked
by sampling the pixel at the middle of each; a null box falls back to the whole
photograph; a row matching the shelf says so and merges (2 + 2 = 4) instead of
making a second card; the shelf reports "2 products added, and 1 added to what
you already had"; and a single-product photograph still fills the form in place
with its ingredients, review list untouched. Renders in all three languages and
in the flattened share build.

**Verified for the inventory:** a record written without `quantity` reads back
as 1; the stepper writes through to IndexedDB and updates the card in place;
zero marks Finished, disables the minus, dims the card and hides it from the
default view behind a labelled reveal; stepping back up restores In use; the
duplicate notice matches across differing case and spacing, tracks the quantity
field, disappears when the name changes, and merging folds 3 + 2 into one
record of 5 and lands on it; `readLabel` returns 2 for two bottles and clamps a
missing, negative or absurd count to 1–99. All of it renders in the three
languages and in the flattened share build.

**Verified for the three languages:** every route renders in all three with no
console errors, in both the module build and the flattened one; `missingKeys()`
returns empty for both Chinese tables; the navigation button opens its menu,
marks the current language and switches in place without a reload; the choice
survives a reload and a browser with no stored choice opens in Chinese from
`navigator.languages`; the rules engine returns translated concerns, evidence,
step notes, gaps and caveat, and the layering warnings come back translated
with product names left alone; a product page shows INCI in Latin with Chinese
tags and Chinese descriptions; and English round-trips back unchanged.

**Verified against a mocked API** (no key in my browser — by design, the key
lives only in the user's): the self-correcting retry, SSE streaming and its
fallbacks, grounding-quota degradation, all three ingredient-source states.

**Confirmed working by the user with a real key:** label reading (brand, name,
category), chat.

**Not exercised against a live model:** the two-pass ingredient lookup, the
`url` field now asked of `discover()`, and whether the model actually honours
the "reply in this language" instruction. All three were driven with fixtures
only. The Chinese wording throughout is mine and has not been read by a native
speaker of either script — worth a pass before anyone else sees it.

**Still unconfirmed end to end:** the skin assessment with the photo tickbox on.
Discoveries returns results but the user's free tier has no grounding quota, so
they arrive flagged "Not web-checked". The carousel's actual scrolling is
unverified — the automation pane collapses to zero width and a zero-width
container refuses to scroll; only the index maths was checked standalone.

## Gotchas

**`js/i18n.js` must not import anything but data.** Everything else needs
`t()` — store.js, rules.js, analysis.js, views.js — so anything i18n imported
back would close a cycle. ES modules tolerate that; the flattened share build,
which is one scope of `const`, throws on load instead. This is why reading and
writing the stored preference is the caller's job (`chooseLang` / `applyLang`
in app.js) rather than i18n's, and why `MODULES` in build_share.py puts
`ingredients.i18n.js` and `i18n.js` at the very top.

**Language is read at boot, then held in a module variable.** Views build their
markup synchronously and cannot await, so `t()` is synchronous by necessity.
`boot()` in app.js settles the language before the first render. Anything that
is mounted once and outlives a render has to be re-labelled by hand rather than
rebuilt — see `relabel()` in chat.js and `chrome()` in app.js, which is why the
masthead and the chat panel change language along with everything else.

**English is the source of truth for strings.** `t()` falls back to English for
a missing key and returns the key itself if English has not got it either, so a
gap shows up in the interface as a visible `like.this` rather than as a blank.
`missingKeys()` is exported for checking from the console; both tables were
complete at the time of writing.

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
5. The bounding boxes have only ever been exercised against a mocked reply.
   Whether Gemini's boxes are tight enough on a real shelf photograph is
   unknown — `cropImage()` pads them by 4% to compensate, which is a guess.
   If crops come back badly framed, the padding and the prompt's "enclosing the
   whole container including its cap" are the two things to adjust.
6. Copying a product to another profile resets its count to 1 on purpose — the
   same bottle on two shelves is still one bottle. If two people genuinely each
   own one, that is what you want; if it is a shared stash, the count is now
   wrong on one of the shelves.
7. The Chinese has not been proofread by a native speaker, and the Simplified
   half is OpenCC-converted from the Traditional for the ingredient
   descriptions (the interface strings are authored separately in both, because
   the vocabulary differs — 設定/设置, 洗面/洁面 — not only the characters).
8. The carousel's scrolling has never run in a real viewport — see above. The
   same session that built the day-first routine lost its viewport partway
   through, so that work was verified by reading the DOM rather than by
   screenshot from the point the pane collapsed.
9. Republishing the artifact only keeps its URL from the conversation that created
   it. From a new session, pass the URL as the Artifact tool's `url` parameter, or
   a second artifact is minted and the shared link quietly stops updating.

## Working with this person

Prefers concise answers and low token spend. Privacy-conscious — the photo
tickbox defaults off for that reason, and they should never be asked to paste an
API key anywhere. They dismiss option-questions they do not want to answer;
recommend and proceed rather than re-asking.
