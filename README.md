# Skincare Library

A private shelf for your skincare. Photograph each product, keep its ingredient
list, and read what is actually in it. Separately, record your skin over time and
get a routine built from what you already own.

Everyone at home can have their own profile — their own shelf, readings and
routine — switched from the top of the page and managed under Settings.

Everything lives in this browser — no server, no account. Nothing leaves the
machine unless you connect a model, and even then only what is described under
[Connecting a model](#connecting-a-model).

## Running it

It is a static site, so it needs any local web server (ES modules don't load from
`file://`). From this folder:

```bash
python3 serve.py
```

Then open <http://localhost:8931>. Use `serve.py` rather than
`python3 -m http.server` — it sends `Cache-Control: no-store`, so an edit shows
up on reload instead of the browser quietly serving you the old JavaScript.

## Where things are

| File | What it holds |
|---|---|
| `js/store.js` | IndexedDB — profiles, products, photographs, assessments, routines, settings |
| `js/ingredients.js` | The INCI dictionary: what each ingredient does, and what to watch for |
| `js/rules.js` | Categories, routine step order, concern→ingredient mapping, layering conflicts |
| `js/analysis.js` | The assessment engine, and the single place to add the real Claude call |
| `js/autofill.js` | Optional label reading via the Claude API |
| `js/views.js` | All rendering |
| `js/app.js` | Hash router |

## Profiles

Add people under **Settings → Profiles**; the switcher then appears beside the
wordmark. Each profile keeps its own shelf, assessment history and routine, and
removing one takes all three with it.

They are separated for tidiness, not for privacy — there is no password, so
anyone at this browser can switch to anyone's shelf.

If two people use the same bottle, open the product and use **Copy across**
rather than photographing it twice. That makes an independent second record —
editing or removing one leaves the other alone.

## Back it up

Browser storage is not permanent — clearing site data wipes it. **Settings →
Export a backup** writes a single JSON file with the photographs inlined; the
same page restores it. The API key is deliberately left out of backups.

## The skin assessment

It reads your questionnaire answers and the ingredient lists of the products you
own. It does **not** analyse the photograph — that is stored so you can compare
one month against the next. Every result says so on its face.

To make it real, add a `claude` branch to `assessSkin()` in `js/analysis.js`
returning the same shape. Nothing else needs to change.

## Asking another assistant — no key needed

**Settings → Copy briefing** puts your shelf, routine and last self-assessment on
the clipboard as Markdown, with a prompt already written at the top. Paste it
into Gemini, Claude or ChatGPT along with a photograph of your skin.

The app sends nothing. You paste it yourself, so you can read exactly what you
are sharing first. This is the only AI path that also works in the shared copy.

## Connecting a model

Save a key under **Settings → Connecting a model** and four things switch on:
reading a product label from a photograph, reading your skin, the chat panel,
and monthly Discoveries.

A Gemini key is free from `aistudio.google.com`. If a model name is refused,
your tier may not include it — try `gemini-3.5-flash-lite`.

**What leaves this Mac, and when:**

| Action | What is sent |
|---|---|
| Read the label | That packaging photograph |
| Assessment | Your answers, shelf and routine — the skin photograph **only if you tick the box**, which is off by default |
| Chat | Your shelf and routine, with each message |
| Discoveries | Your shelf and your latest reading |

Google's free tier commonly uses what you submit to improve their products. That
is the trade for it costing nothing. The app sends `store: false` on every
request, which asks Google not to retain it, but that does not override their
terms. Your key stays in this browser and is left out of backups.

None of this is diagnostic. For anything that looks medical, see a dermatologist.

## Discoveries

Looks for Japanese and Korean products that suit your latest reading and fill a
real gap, grounded in a web search so the products actually exist. Cached per
profile and refreshed when it is over a month old — a static local app cannot run
a background job, so "monthly" means it checks when you open the page.
