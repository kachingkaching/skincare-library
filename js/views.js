/* Rendering. Each view takes the <main> element and route params, writes its
   markup, then wires its own events. */

import * as store from './store.js';
import {
  TAG_LABEL, ACTIVE_TAGS, FLAG_TAGS,
  lookup, parseIngredients, tagsFor
} from './ingredients.js';
import {
  CATEGORIES, STATUSES, STATUS_LABEL, stepsFor, conflictsFor,
  DAYS, EVERY_DAY, daysOf, isEveryDay, describeDays
} from './rules.js';
import { QUESTIONS, SEVERITY_LABEL, assessSkin } from './analysis.js';
import { readLabel, lookupIngredients } from './ai.js';
import { copyBriefing, downloadBriefing } from './briefing.js';
import { aiSettings, PROVIDERS, discover } from './ai.js';

/* Everything that talks to a model needs your own key, which only makes sense
   on your own machine. The share build flips this to false, leaving the app
   fully offline — the briefing export deliberately survives it. */
const AI_FEATURES = true;

/* ---------- small helpers ---------- */

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const urls = [];
const imgUrl = blob => {
  const u = URL.createObjectURL(blob);
  urls.push(u);
  return u;
};
export function releaseUrls() {
  urls.forEach(URL.revokeObjectURL);
  urls.length = 0;
}

/* app.js hands us its render function so a profile switch can redraw. */
let rerender = () => {};
export const onRerender = fn => { rerender = fn; };

/* The masthead switcher. Rebuilt on every render, and after any profile edit. */
export async function profileBar() {
  const select = document.getElementById('profile-select');
  if (!select) return;

  const [profiles, active] = await Promise.all([store.getProfiles(), store.getActiveProfileId()]);
  select.innerHTML = profiles.map(p => option(p.id, p.name, active)).join('');
  select.hidden = profiles.length < 2;   // no point offering a choice of one

  select.onchange = async () => {
    await store.setActiveProfileId(select.value);
    // Deep links belong to whoever we just left, so return to the shelf.
    if (/^#\/(product|edit|assess)\//.test(location.hash)) location.hash = '#/';
    else rerender();
  };
}

const fmtDate = s => s
  ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  : '';

const fmtStamp = iso =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/* Two readings on one day should still be tellable apart. */
const fmtStampTime = iso =>
  fmtStamp(iso) + ', ' + new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const byShelfOrder = (a, b) =>
  (a.brand || '').localeCompare(b.brand || '') || (a.name || '').localeCompare(b.name || '');

/* ---------- header marks ----------

   One small line drawing per view. Hairline strokes in the muted ink, no fill,
   no colour — closer to a printer's device on a title page than an icon. They
   sit behind the page title and are decorative only, so they are hidden from
   screen readers. */

const ART = {
  shelf: `<path d="M14 44V20a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v24"/><path d="M12 44h20"/>
          <path d="M19 14V9h6v5"/>
          <path d="M40 44V26a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v18"/><path d="M38 44h16"/>
          <path d="M43 21v-4h6v4"/>
          <path d="M62 44V31a4 4 0 0 1 4-4h1a4 4 0 0 1 4 4v13"/><path d="M60 44h15"/>`,
  add: `<path d="M44 12c0 0-13 15-13 23a13 13 0 0 0 26 0c0-8-13-23-13-23z"/>
        <path d="M38 35a6 6 0 0 0 6 6"/>
        <path d="M14 30h14M21 23v14"/>`,
  assess: `<circle cx="44" cy="28" r="16"/><circle cx="44" cy="28" r="10"/><circle cx="44" cy="28" r="4"/>
           <path d="M14 44c6-10 14-15 22-16"/><path d="M74 44c-6-10-14-15-22-16"/>`,
  routine: `<circle cx="26" cy="26" r="9"/>
            <path d="M26 11v-5M26 46v-5M11 26h-5M46 26h5M15 15l-4-4M37 37l4 4M37 15l4-4M15 37l-4 4"/>
            <path d="M72 30a12 12 0 1 1-13-16 10 10 0 0 0 13 16z"/>`,
  discoveries: `<circle cx="34" cy="28" r="15"/><path d="M45 39l14 14"/>
                <path d="M34 20c-5 4-5 12 0 16 5-4 5-12 0-16z"/>
                <path d="M66 20h10M66 26h6"/>`,
  settings: `<path d="M14 20h60M14 30h44M14 40h52"/>
             <circle cx="62" cy="20" r="4"/><circle cx="34" cy="30" r="4"/><circle cx="52" cy="40" r="4"/>`
};

export function headerArt(name) {
  const marks = ART[name];
  if (!marks) return '';
  return `<svg class="header-art" viewBox="0 0 88 52" aria-hidden="true" focusable="false">${marks}</svg>`;
}

/* Three drifting dots for anything that has gone away to think. */
export const dots = () => '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>';

/* Put a control into its waiting state and hand back the undo. */
export function waiting(button, label) {
  const was = button.innerHTML;
  const wasDisabled = button.disabled;
  button.disabled = true;
  button.innerHTML = `${esc(label)}${dots()}`;
  return () => { button.innerHTML = was; button.disabled = wasDisabled; };
}

const tagChip = (t, flag) =>
  `<span class="chip ${flag ? 'chip-flag' : 'chip-active'}">${esc(TAG_LABEL[t] || t)}</span>`;

const option = (v, label, selected) =>
  `<option value="${esc(v)}"${selected === v ? ' selected' : ''}>${esc(label)}</option>`;

function wireDropzone(zone, onFile) {
  const input = zone.querySelector('input[type="file"]');
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files[0]) onFile(input.files[0]);
  });
  ['dragenter', 'dragover'].forEach(e =>
    zone.addEventListener(e, ev => { ev.preventDefault(); zone.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(e =>
    zone.addEventListener(e, ev => { ev.preventDefault(); zone.classList.remove('is-over'); }));
  zone.addEventListener('drop', ev => {
    const file = ev.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
}

const dropzoneMarkup = (id, caption = 'Drop a photograph, or select one') => `
  <div class="dropzone" id="${id}">
    <p>${esc(caption)}</p>
    <input type="file" accept="image/*">
  </div>`;

/* ============================================================
   Shelf
   ============================================================ */

const shelfFilters = { category: '', status: '', active: '' };

export async function shelf(root) {
  const products = (await store.getProducts()).sort(byShelfOrder);

  if (!products.length) {
    const who = (await store.getActiveProfile())?.name;
    root.innerHTML = `
      <div class="view-head">${headerArt('shelf')}<h1 class="page-title">The Shelf</h1></div>
      <div class="empty">
        <p>${who ? esc(who) + '’s shelf is' : 'The shelf is'} presently empty. Photograph a
           product, record what is in it, and it will be kept here.</p>
        <a class="btn" href="#/add">Add the first product</a>
      </div>`;
    return;
  }

  const activesPresent = new Set();
  products.forEach(p => tagsFor(p.ingredients || []).forEach(t => {
    if (ACTIVE_TAGS.includes(t)) activesPresent.add(t);
  }));

  const visible = products.filter(p =>
    (!shelfFilters.category || p.category === shelfFilters.category) &&
    (!shelfFilters.status || p.status === shelfFilters.status) &&
    (!shelfFilters.active || tagsFor(p.ingredients || []).has(shelfFilters.active))
  );

  const categoriesPresent = [...new Set(products.map(p => p.category).filter(Boolean))].sort();

  root.innerHTML = `
    <div class="view-head">
      ${headerArt('shelf')}
      <h1 class="page-title">The Shelf</h1>
      <div class="btn-row"><a class="btn" href="#/add">Add a product</a></div>
    </div>

    <div class="filter-bar">
      <div class="filter">
        <label for="f-cat">Category</label>
        <select id="f-cat">
          ${option('', 'All', shelfFilters.category)}
          ${categoriesPresent.map(c => option(c, c, shelfFilters.category)).join('')}
        </select>
      </div>
      <div class="filter">
        <label for="f-status">Status</label>
        <select id="f-status">
          ${option('', 'All', shelfFilters.status)}
          ${STATUSES.map(s => option(s, STATUS_LABEL[s], shelfFilters.status)).join('')}
        </select>
      </div>
      <div class="filter">
        <label for="f-active">Contains</label>
        <select id="f-active">
          ${option('', 'Anything', shelfFilters.active)}
          ${[...activesPresent].map(t => option(t, TAG_LABEL[t] || t, shelfFilters.active)).join('')}
        </select>
      </div>
      <span class="filter-count">${visible.length} of ${products.length}</span>
    </div>

    <div class="shelf" id="shelf-grid"></div>
    ${visible.length ? '' : '<p class="muted">Nothing matches that combination.</p>'}`;

  const grid = root.querySelector('#shelf-grid');
  for (const p of visible) {
    const blob = await store.getImage(p.imageId);
    const a = document.createElement('a');
    a.className = 'shelf-item';
    a.href = `#/product/${p.id}`;
    a.innerHTML = `
      <div class="shelf-frame">
        ${blob ? `<img src="${imgUrl(blob)}" alt="${esc(p.name)}">` : '<span class="no-image">No photograph</span>'}
      </div>
      <div class="shelf-brand">${esc(p.brand || '—')}</div>
      <div class="shelf-name">${esc(p.name)}</div>
      <div class="shelf-meta">${esc(p.category || '')}${p.status && p.status !== 'active' ? ' · ' + esc(STATUS_LABEL[p.status]) : ''}</div>`;
    grid.appendChild(a);
  }

  root.querySelector('#f-cat').onchange = e => { shelfFilters.category = e.target.value; shelf(root); };
  root.querySelector('#f-status').onchange = e => { shelfFilters.status = e.target.value; shelf(root); };
  root.querySelector('#f-active').onchange = e => { shelfFilters.active = e.target.value; shelf(root); };
}

/* ============================================================
   Product detail
   ============================================================ */

export async function product(root, { id }) {
  const p = await store.getProduct(id);
  const activeId = await store.getActiveProfileId();

  if (!p) {
    root.innerHTML = `<div class="empty"><p>That product is no longer in the library.</p>
      <a class="btn" href="#/">Return to the shelf</a></div>`;
    return;
  }
  if (p.profileId !== activeId) {
    root.innerHTML = `<div class="empty">
      <p>That product sits on another profile’s shelf. Switch profiles at the top of the page
         to see it.</p>
      <a class="btn" href="#/">Return to this shelf</a></div>`;
    return;
  }

  const others = (await store.getProfiles()).filter(x => x.id !== activeId);

  const blob = await store.getImage(p.imageId);
  const ingredients = p.ingredients || [];
  const tags = tagsFor(ingredients);
  const actives = ACTIVE_TAGS.filter(t => tags.has(t));
  const flags = FLAG_TAGS.filter(t => tags.has(t));
  const matched = ingredients.filter(i => lookup(i)).length;

  const spec = [
    ['Category', p.category],
    ['Status', STATUS_LABEL[p.status] || p.status],
    ['Size', p.size],
    ['Price', p.price],
    ['Purchased', fmtDate(p.purchasedAt)],
    ['Opened', fmtDate(p.openedAt)]
  ].filter(([, v]) => v);

  root.innerHTML = `
    <p class="label muted" style="margin:0 0 32px"><a href="#/">← The shelf</a></p>
    <div class="detail">
      <div class="detail-frame">
        ${blob ? `<img src="${imgUrl(blob)}" alt="${esc(p.name)}">` : '<span class="no-image">No photograph</span>'}
      </div>
      <div>
        <div class="detail-brand">${esc(p.brand || '—')}</div>
        <h1 class="detail-title">${esc(p.name)}</h1>

        ${actives.length ? `<div class="chips" style="margin-bottom:16px">${actives.map(t => tagChip(t, false)).join('')}</div>` : ''}
        ${flags.length ? `<div class="chips" style="margin-bottom:32px">${flags.map(t => tagChip(t, true)).join('')}</div>` : ''}

        <dl class="spec">
          ${spec.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
        </dl>

        ${p.notes ? `<div class="block">
          <h2 class="section-title">Notes</h2>
          <p class="prose" style="white-space:pre-wrap;margin:0">${esc(p.notes)}</p>
        </div>` : ''}

        <div class="block">
          <h2 class="section-title">Ingredients ${ingredients.length ? `— ${matched} of ${ingredients.length} annotated` : ''}</h2>
          ${ingredients.length ? `<div class="ing-list">${ingredients.map((name, i) => {
            const entry = lookup(name);
            const flagged = entry && entry.t.some(t => FLAG_TAGS.includes(t));
            return `<div class="ing ${entry ? '' : 'ing-unknown'} ${flagged ? 'ing-flagged' : ''}">
              <div class="ing-index">${i + 1}</div>
              <div>
                <div class="ing-name">${esc(entry ? entry.n : name)}</div>
                ${entry && entry.n.toLowerCase() !== name.toLowerCase()
                  ? `<div class="tag" style="border:none;margin-top:2px">${esc(name)}</div>` : ''}
                ${entry ? `<div class="ing-tags">${entry.t.map(t =>
                    `<span class="tag ${FLAG_TAGS.includes(t) ? 'tag-flag' : ''}">${esc(TAG_LABEL[t] || t)}</span>`).join('')}</div>` : ''}
              </div>
              <div class="ing-fn">${entry ? esc(entry.f) : 'Not in the reference — recorded as written.'}</div>
            </div>`;
          }).join('')}</div>`
          : '<p class="muted">No ingredient list recorded yet.</p>'}
        </div>

        ${others.length ? `<div class="block">
          <h2 class="section-title">Shared with the household</h2>
          <p class="muted" style="font-size:13px;margin:0 0 20px">If someone else uses this bottle
            too, put a copy on their shelf rather than photographing it twice. The two records are
            separate from then on.</p>
          <div class="btn-row">
            <select id="copy-target" style="background:none;border:none;border-bottom:1px solid var(--rule);padding:4px 0;border-radius:0">
              ${others.map(o => option(o.id, o.name, others[0].id)).join('')}
            </select>
            <button class="btn btn-quiet" id="copy-across">Copy across</button>
            <span class="field-hint" style="margin:0" id="copy-note"></span>
          </div>
        </div>` : ''}

        <div class="block btn-row">
          <a class="btn" href="#/edit/${esc(p.id)}">Edit</a>
          <button class="btn btn-quiet btn-danger" id="delete">Remove from library</button>
        </div>
      </div>
    </div>`;

  const copyBtn = root.querySelector('#copy-across');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const target = root.querySelector('#copy-target');
      const name = target.selectedOptions[0].text;
      copyBtn.disabled = true;
      try {
        await store.copyProductToProfile(p.id, target.value);
        root.querySelector('#copy-note').textContent = `Copied to ${name}’s shelf.`;
      } catch (err) {
        root.querySelector('#copy-note').textContent = err.message;
      } finally {
        copyBtn.disabled = false;
      }
    };
  }

  root.querySelector('#delete').onclick = async () => {
    if (!confirm(`Remove ${p.brand ? p.brand + ' ' : ''}${p.name} from the library? This cannot be undone.`)) return;
    await store.deleteProduct(p.id);
    location.hash = '#/';
  };
}

/* ============================================================
   Add / edit
   ============================================================ */

export async function form(root, { id } = {}) {
  const editing = Boolean(id);
  const p = editing ? await store.getProduct(id) : null;
  if (editing && !p) {
    root.innerHTML = `<div class="empty"><p>That product is no longer in the library.</p>
      <a class="btn" href="#/">Return to the shelf</a></div>`;
    return;
  }

  const settings = await store.getSettings();
  const existingBlob = p ? await store.getImage(p.imageId) : null;
  // Resizing is asynchronous; hold the job so a fast submit still waits for it.
  let photoJob = null;
  // The original is kept only for label reading — ingredient print is tiny, and
  // the copy we store for the shelf is downscaled too far to read it.
  let originalFile = null;
  const pendingPhoto = () => (photoJob ? photoJob : Promise.resolve(null));

  root.innerHTML = `
    <div class="view-head">
      ${headerArt('add')}
      <h1 class="page-title">${editing ? 'Edit product' : 'Add a product'}</h1>
    </div>

    <form class="form-grid" id="product-form" autocomplete="off">
      <div>
        ${dropzoneMarkup('photo')}
        <div class="btn-row" style="margin-top:16px">
          <button type="button" class="btn btn-quiet" id="autofill" ${AI_FEATURES && settings.apiKey ? '' : 'hidden'}>Read the label</button>
        </div>
        <p class="field-hint" id="photo-hint">${AI_FEATURES && settings.apiKey
          ? 'Reads brand, name and ingredients off a photograph of the packaging. If the ingredient '
            + 'print is not legible, it searches the web for the product’s published list instead.'
          : 'Photographs are resized and kept in this browser.'}</p>
      </div>

      <div>
        <div class="field-pair">
          <div class="field">
            <label for="brand">Brand</label>
            <input type="text" id="brand" value="${esc(p?.brand)}">
          </div>
          <div class="field">
            <label for="name">Product name</label>
            <input type="text" id="name" required value="${esc(p?.name)}">
          </div>
        </div>

        <div class="field-pair">
          <div class="field">
            <label for="category">Category</label>
            <select id="category">${CATEGORIES.map(c => option(c, c, p?.category || 'Serum')).join('')}</select>
          </div>
          <div class="field">
            <label for="status">Status</label>
            <select id="status">${STATUSES.map(s => option(s, STATUS_LABEL[s], p?.status || 'active')).join('')}</select>
          </div>
        </div>

        <div class="field">
          <label for="ingredients">Ingredients</label>
          <textarea id="ingredients" placeholder="Paste the list straight from the packaging. Commas are enough.">${esc((p?.ingredients || []).join(', '))}</textarea>
          <div class="btn-row" style="margin-top:12px">
            <button type="button" class="btn btn-quiet" id="lookup" ${AI_FEATURES && settings.apiKey ? '' : 'hidden'}>Look these up online</button>
          </div>
          <div class="field-hint" id="parse-summary"></div>
          <div class="chips" id="parse-chips" style="margin-top:12px"></div>
        </div>

        <div class="field-pair">
          <div class="field">
            <label for="size">Size</label>
            <input type="text" id="size" placeholder="50 ml" value="${esc(p?.size)}">
          </div>
          <div class="field">
            <label for="price">Price</label>
            <input type="text" id="price" placeholder="£38" value="${esc(p?.price)}">
          </div>
        </div>

        <div class="field-pair">
          <div class="field">
            <label for="purchasedAt">Purchased</label>
            <input type="date" id="purchasedAt" value="${esc(p?.purchasedAt)}">
          </div>
          <div class="field">
            <label for="openedAt">Opened</label>
            <input type="date" id="openedAt" value="${esc(p?.openedAt)}">
          </div>
        </div>

        <div class="field">
          <label for="notes">Notes</label>
          <textarea id="notes" placeholder="How it wears, what it sits well under, whether you would buy it again.">${esc(p?.notes)}</textarea>
        </div>

        <div class="btn-row">
          <button type="submit" class="btn">${editing ? 'Save changes' : 'Add to the library'}</button>
          <a class="btn btn-quiet" href="${editing ? '#/product/' + esc(id) : '#/'}">Cancel</a>
          <span class="field-hint" id="form-error" style="margin:0;color:var(--amber)"></span>
        </div>
      </div>
    </form>`;

  const zone = root.querySelector('#photo');
  const hint = root.querySelector('#photo-hint');
  const showPhoto = blob => {
    zone.querySelectorAll('img').forEach(n => n.remove());
    const img = document.createElement('img');
    img.src = imgUrl(blob);
    img.alt = 'Selected photograph';
    zone.appendChild(img);
  };
  if (existingBlob) showPhoto(existingBlob);

  wireDropzone(zone, file => {
    originalFile = file;
    photoJob = store.resizeImage(file)
      .then(blob => { showPhoto(blob); return blob; })
      .catch(err => { hint.textContent = err.message; return null; });
  });

  /* live parse of the ingredient list */
  const ingField = root.querySelector('#ingredients');
  const summary = root.querySelector('#parse-summary');
  const chips = root.querySelector('#parse-chips');
  const refreshParse = () => {
    const list = parseIngredients(ingField.value);
    const known = list.filter(i => lookup(i));
    const tags = tagsFor(list);
    summary.textContent = list.length
      ? `${list.length} ingredients read, ${known.length} recognised.`
      : 'Nothing read yet.';
    chips.innerHTML = [
      ...ACTIVE_TAGS.filter(t => tags.has(t)).map(t => tagChip(t, false)),
      ...FLAG_TAGS.filter(t => tags.has(t)).map(t => tagChip(t, true))
    ].join('');
  };
  ingField.addEventListener('input', refreshParse);
  refreshParse();

  /* Fold a found list into whatever is already typed, and say where it came
     from. Used by the label reader's fallback and by the lookup button. */
  const merge = list => {
    const already = parseIngredients(ingField.value);
    const seen = new Set(already.map(i => i.toLowerCase()));
    const added = list.filter(i => !seen.has(i.toLowerCase()));
    ingField.value = [...already, ...added].join(', ');
    refreshParse();
    return added.length;
  };

  const sourceLinks = found => (found.sources || []).length
    ? found.sources.slice(0, 3).map(s =>
        `<a href="${esc(s.url)}" target="_blank" rel="noreferrer noopener" style="text-decoration:underline">${esc(s.title)}</a>`).join(', ')
    : '';

  /* Look the product up by name. Returns a sentence for the hint, or null if
     there was nothing to go on. */
  const lookupInto = async (hint, lead = '') => {
    const brand = root.querySelector('#brand').value.trim();
    const name = root.querySelector('#name').value.trim();
    if (!name && !brand) return null;

    hint.innerHTML = `${lead}Looking up ${esc([brand, name].filter(Boolean).join(' '))}${dots()}`;
    const found = await lookupIngredients({ brand, name });

    if (!found.ingredients.length) {
      hint.textContent = found.searchRan
        ? 'Searched the web and could not find an ingredient list for this product. '
          + 'Check the brand and product name are right, or photograph the back of the pack.'
        : 'No ingredient list could be found for this product, on the web or from memory. '
          + 'Check the brand and product name are right, or photograph the back of the pack.';
      return found;
    }

    const count = merge(found.ingredients);
    const note = found.note ? esc(found.note) + ' ' : '';
    hint.innerHTML = found.grounded
      ? `Found ${count} ingredients online — <strong>not read off your pack</strong>, so check them against it. ${note}${sourceLinks(found)}`
      : `Found ${count} ingredients, but <strong>web search was unavailable</strong>, so these came from the
         model’s memory rather than a source. Formulations change — check them against your pack
         carefully before trusting them. ${note}`;
    return found;
  };

  /* Look up on demand, without needing a photograph at all. */
  const lookupBtn = root.querySelector('#lookup');
  if (lookupBtn) {
    lookupBtn.onclick = async () => {
      const restore = waiting(lookupBtn, 'Looking up');
      try {
        const done = await lookupInto(hint);
        if (!done) hint.textContent = 'Type a brand or product name first — that is what gets looked up.';
      } catch (err) {
        hint.textContent = err.message;
      } finally {
        restore();
      }
    };
  }

  /* optional label reading */
  const autofillBtn = root.querySelector('#autofill');
  if (autofillBtn) {
    autofillBtn.onclick = async () => {
      // Read from the sharpest copy available. The shelf photo is downscaled
      // to 1600px, which is fine to look at and hopeless for 5pt INCI print.
      const blob = originalFile
        ? await store.resizeImage(originalFile, 2400, 0.92)
        : (await pendingPhoto()) || existingBlob;
      if (!blob) { hint.textContent = 'Add a photograph of the packaging first.'; return; }

      const restore = waiting(autofillBtn, 'Reading');
      hint.innerHTML = `Reading the photograph${dots()}`;

      try {
        const read = await readLabel(blob);

        // Merge rather than overwrite, so you can read the front for the name,
        // then swap in the back-of-pack photograph for the ingredients.
        const fill = (selector, value) => {
          const field = root.querySelector(selector);
          if (value && !field.value.trim()) field.value = value;
        };
        fill('#brand', read.brand);
        fill('#name', read.name);
        fill('#size', read.size);
        if (read.category && CATEGORIES.includes(read.category) && !root.querySelector('#category').dataset.touched) {
          root.querySelector('#category').value = read.category;
        }

        if (read.ingredients?.length) {
          hint.textContent = `Read ${merge(read.ingredients)} ingredients off the pack. `
            + 'Check them before saving.';
        } else {
          /* Nothing legible on the pack — go and look the product up instead,
             which is the whole point of having read the brand and name first. */
          const done = await lookupInto(hint, 'No list visible on the pack. ');
          if (!done) {
            hint.textContent = 'No ingredient list was legible in that photograph, and there is no '
              + 'brand or product name to look one up by. Type either in, or photograph the front '
              + 'of the pack first.';
          }
        }
      } catch (err) {
        hint.textContent = err.message;
      } finally {
        restore();
      }
    };
  }

  root.querySelector('#product-form').onsubmit = async ev => {
    ev.preventDefault();
    const val = sel => root.querySelector(sel).value.trim();
    const error = root.querySelector('#form-error');
    if (!val('#name')) { error.textContent = 'A product name is needed.'; return; }

    const pendingBlob = await pendingPhoto();
    let imageId = p?.imageId || null;
    if (pendingBlob) {
      if (imageId) await store.del('images', imageId).catch(() => {});
      imageId = await store.putImage(pendingBlob);
    }

    await store.saveProduct({
      id: p?.id || store.uid(),
      brand: val('#brand'),
      name: val('#name'),
      category: val('#category'),
      status: val('#status'),
      size: val('#size'),
      price: val('#price'),
      purchasedAt: val('#purchasedAt'),
      openedAt: val('#openedAt'),
      // No longer editable, but carried through so editing an older record
      // does not quietly discard what it already held.
      paoMonths: p?.paoMonths || '',
      rating: p?.rating || '',
      notes: root.querySelector('#notes').value.trim(),
      ingredients: parseIngredients(ingField.value),
      imageId,
      createdAt: p?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    location.hash = p ? `#/product/${p.id}` : '#/';
  };
}

/* ============================================================
   Assessment
   ============================================================ */

function renderResult(result, productsById) {
  const extras = [];

  if (result.degraded) {
    extras.push(`<div class="notice"><strong>Read offline</strong> — the model could not be
      reached (${esc(result.degraded)}), so this is the rules-based reading from your answers.</div>`);
  }
  if (result.photoUsed && result.photoUsable === false && result.photoNote) {
    extras.push(`<div class="notice"><strong>The photograph is hard to judge</strong> — ${esc(result.photoNote)}</div>`);
  }

  const observations = (result.observations || []).length ? `
    <div class="block" style="margin-top:0">
      <h2 class="section-title">What is visible</h2>
      <div class="reading">
        ${result.observations.map(o => `
          <div class="reading-row" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr)">
            <div>${esc(o.area)}</div>
            <div class="reading-note">${esc(o.note)}</div>
          </div>`).join('')}
      </div>
    </div>` : '';

  const working = (result.working || []).length ? `
    <div class="block">
      <h2 class="section-title">Earning its place</h2>
      <ul class="prose" style="margin:0;padding-left:18px">
        ${result.working.map(w => `<li style="margin-bottom:8px">${esc(w)}</li>`).join('')}
      </ul>
    </div>` : '';

  const changes = (result.changes || []).length ? `
    <div class="block">
      <h2 class="section-title">What to change</h2>
      <div class="reading">
        ${result.changes.map(c => `
          <div class="reading-row" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr)">
            <div>${esc(c.change)}</div>
            <div class="reading-note">${esc(c.why)}</div>
          </div>`).join('')}
      </div>
    </div>` : '';

  return renderResultBody(result, productsById, extras.join(''), observations, working, changes);
}

function renderResultBody(result, productsById, extras, observations, working, changes) {
  const period = key => (result.routine[key] || []).map((s, i) => `
    <div class="step">
      <div class="step-num">${String(i + 1).padStart(2, '0')}</div>
      <div>
        <div class="step-label">${esc(s.step)}</div>
        ${s.productId && productsById[s.productId]
          ? `<div class="step-product"><a href="#/product/${esc(s.productId)}">${esc(productsById[s.productId].brand || '')} ${esc(productsById[s.productId].name)}</a></div>`
          : '<div class="step-product step-empty">Nothing suitable on the shelf</div>'}
        <div class="step-note">${esc(s.note || '')}</div>
      </div>
    </div>`).join('');

  return `
    <div class="caveat">${esc(result.caveat)}</div>
    ${extras}
    ${observations}

    <div class="block">
      <h2 class="section-title">The reading</h2>
      ${result.concerns.length ? `<div class="reading">${result.concerns.map(c => `
        <div class="reading-row">
          <div>${esc(c.label)}</div>
          <div class="severity ${c.severity === 'marked' ? 'severity-marked' : ''}">${esc(SEVERITY_LABEL[c.severity])}</div>
          <div class="reading-note">${esc(c.evidence)}</div>
        </div>`).join('')}</div>`
        : '<p class="muted">Nothing stands out from your answers. Keep to what is working.</p>'}
    </div>

    ${working}
    ${changes}

    <div class="block">
      <h2 class="section-title">The routine this suggests</h2>
      <div class="routine-cols">
        <div>
          <h3 class="step-label" style="margin-bottom:8px">Morning</h3>
          ${period('am') || '<p class="muted">No morning routine could be built from the shelf.</p>'}
        </div>
        <div>
          <h3 class="step-label" style="margin-bottom:8px">Evening</h3>
          ${period('pm') || '<p class="muted">No evening routine could be built from the shelf.</p>'}
        </div>
      </div>
    </div>

    ${result.gaps.length ? `<div class="block">
      <h2 class="section-title">What is missing</h2>
      ${result.gaps.map(g => `<div class="notice"><strong>${esc(g.category)}</strong> — ${esc(g.reason)}</div>`).join('')}
    </div>` : ''}`;
}

export async function assess(root, { id } = {}) {
  const products = await store.getProducts();
  const productsById = Object.fromEntries(products.map(p => [p.id, p]));
  const history = (await store.getAssessments()).sort((a, b) => b.date.localeCompare(a.date));
  const settings = await aiSettings();
  const keyConfigured = AI_FEATURES && Boolean(settings.apiKey);
  const sendPhotoDefault = settings.sendPhoto;

  /* Viewing one from the archive. */
  if (id) {
    const record = history.find(a => a.id === id);
    if (!record) {
      root.innerHTML = `<div class="empty"><p>That assessment is no longer kept.</p>
        <a class="btn" href="#/assess">Back to assessment</a></div>`;
      return;
    }
    const blob = await store.getImage(record.photoId);
    root.innerHTML = `
      <p class="label muted" style="margin:0 0 32px"><a href="#/assess">← Assessment</a></p>
      <div class="view-head">${headerArt('assess')}<h1 class="page-title">${esc(fmtStampTime(record.date))}</h1>
        <button class="btn btn-quiet btn-danger" id="del-assessment">Remove this record</button></div>
      <div class="assess-grid">
        <div>${blob ? `<div class="shelf-frame"><img src="${imgUrl(blob)}" alt="Skin, ${esc(fmtStamp(record.date))}"></div>`
          : '<div class="shelf-frame"><span class="no-image">No photograph</span></div>'}</div>
        <div>${renderResult(record.result, productsById)}</div>
      </div>`;
    root.querySelector('#del-assessment').onclick = async () => {
      if (!confirm('Remove this assessment and its photograph?')) return;
      await store.deleteAssessment(record.id);
      location.hash = '#/assess';
    };
    return;
  }

  /* Past readings open in place — comparing this month against last should not
     mean losing your place on the page. */
  const historyMarkup = history.length ? `
    <div class="block">
      <h2 class="block-title">Previous readings — ${history.length}</h2>
      <div class="history">
        ${history.map(a => `
          <div class="history-item">
            <button class="history-row" data-open="${esc(a.id)}" aria-expanded="false"
                    aria-controls="past-${esc(a.id)}">
              <span class="history-date">${esc(fmtStampTime(a.date))}</span>
              <span class="muted grow">${a.result.concerns.length
                ? esc(a.result.concerns.slice(0, 3).map(c => c.label).join(', '))
                : 'Nothing marked'}</span>
              <span class="history-mark" aria-hidden="true">+</span>
            </button>
            <div class="history-body" id="past-${esc(a.id)}" hidden></div>
          </div>`).join('')}
      </div>
    </div>` : '';

  root.innerHTML = `
    <div class="view-head">
      ${headerArt('assess')}
      <h1 class="page-title">Assessment</h1>
      <div class="btn-row">
        <button class="btn btn-quiet" id="brief-here">Copy briefing for another assistant</button>
        <span class="field-hint" style="margin:0" id="brief-here-note"></span>
      </div>
    </div>
    <div class="assess-grid">
      <div>
        ${dropzoneMarkup('skin-photo', 'A photograph of your skin')}
        <p class="field-hint">Even daylight, no makeup, the same angle each time. Kept in this
          browser so you can compare one month against the next.</p>
        ${AI_FEATURES && keyConfigured ? `
          <div class="choices" style="margin-top:20px">
            <input type="checkbox" id="send-photo" ${sendPhotoDefault ? 'checked' : ''}>
            <label for="send-photo">Let the model look at it</label>
          </div>`
        : ''}
      </div>
      <div>
        <form id="assess-form">
          ${QUESTIONS.map(q => `
            <div class="field">
              <label>${esc(q.label)}</label>
              <div class="choices">
                ${q.options.map((o, i) => `
                  <input type="${q.multi ? 'checkbox' : 'radio'}" name="${esc(q.key)}"
                         id="${esc(q.key)}-${i}" value="${esc(o.value)}"${!q.multi && i === 0 ? ' checked' : ''}>
                  <label for="${esc(q.key)}-${i}">${esc(o.label)}</label>`).join('')}
              </div>
            </div>`).join('')}
          <div class="btn-row">
            <button type="submit" class="btn">Read my skin</button>
            <span class="field-hint" style="margin:0">Answers and photograph stay on this machine.</span>
          </div>
        </form>
      </div>
    </div>
    <div id="assess-result"></div>
    ${historyMarkup}`;

  let photoJob = null;
  const zone = root.querySelector('#skin-photo');
  wireDropzone(zone, file => {
    photoJob = store.resizeImage(file, 1200)
      .then(blob => {
        zone.querySelectorAll('img').forEach(n => n.remove());
        const img = document.createElement('img');
        img.src = imgUrl(blob);
        img.alt = 'Skin photograph';
        zone.appendChild(img);
        return blob;
      })
      .catch(err => { zone.querySelector('p').textContent = err.message; return null; });
  });

  /* Expand a past reading inline, rendering it only when first opened. */
  root.querySelectorAll('.history-row').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.open;
      const body = root.querySelector(`#past-${CSS.escape(id)}`);
      const isOpen = !body.hidden;

      if (isOpen) {
        body.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        btn.querySelector('.history-mark').textContent = '+';
        return;
      }

      if (!body.dataset.filled) {
        const record = history.find(a => a.id === id);
        const photo = await store.getImage(record.photoId);
        body.innerHTML = `
          ${photo ? `<div class="history-photo"><img src="${imgUrl(photo)}" alt=""></div>` : ''}
          ${renderResult(record.result, productsById)}
          <div class="btn-row" style="margin-bottom:32px">
            <button class="btn btn-quiet btn-danger" data-forget="${esc(id)}">Remove this record</button>
          </div>`;
        body.dataset.filled = '1';
        body.querySelector('[data-forget]').onclick = async () => {
          if (!confirm('Remove this assessment and its photograph?')) return;
          await store.deleteAssessment(id);
          assess(root);
        };
      }

      body.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.querySelector('.history-mark').textContent = '–';
    };
  });

  root.querySelector('#brief-here').onclick = async () => {
    const briefNote = root.querySelector('#brief-here-note');
    try {
      const { copied } = await copyBriefing();
      briefNote.textContent = copied
        ? 'Copied. Paste it alongside your photograph.'
        : 'Could not reach the clipboard — try Settings.';
    } catch (err) {
      briefNote.textContent = err.message;
    }
  };

  root.querySelector('#assess-form').onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const answers = {};
    for (const q of QUESTIONS) {
      answers[q.key] = q.multi ? fd.getAll(q.key) : (fd.get(q.key) || '');
    }

    const photoBlob = photoJob ? await photoJob : null;
    const sendPhoto = Boolean(root.querySelector('#send-photo')?.checked);
    const submit = ev.target.querySelector('button[type="submit"]');
    const restore = submit ? waiting(submit, 'Reading') : () => {};

    let result;
    try {
      result = await assessSkin({
        imageBlob: photoBlob,
        answers,
        library: products,
        routine: await store.getRoutine(),
        sendPhoto
      });
    } finally {
      restore();
    }

    const record = {
      id: store.uid(),
      date: new Date().toISOString(),
      photoId: photoBlob ? await store.putImage(photoBlob) : null,
      answers,
      result
    };
    await store.saveAssessment(record);

    const out = root.querySelector('#assess-result');
    out.innerHTML = `<div class="block">${renderResult(result, productsById)}
      <div class="btn-row">
        <button class="btn" id="adopt">Adopt this as my routine</button>
        <span class="field-hint" style="margin:0" id="adopt-note">Kept in your archive as of today.</span>
      </div></div>`;
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });

    out.querySelector('#adopt').onclick = async () => {
      const entries = period => (result.routine[period] || [])
        .filter(s => s.productId)
        .map(s => ({ step: s.stepKey || null, productId: s.productId }));
      await store.setRoutine({ am: entries('am'), pm: entries('pm') });
      out.querySelector('#adopt-note').textContent = 'Saved. It is now under Routine.';
    };
  };
}

/* ============================================================
   Routine
   ============================================================ */

export async function routine(root) {
  const products = (await store.getProducts()).sort(byShelfOrder);
  const saved = await store.getRoutine();
  const byId = Object.fromEntries(products.map(p => [p.id, p]));

  if (!products.length) {
    root.innerHTML = `<div class="view-head">${headerArt('routine')}<h1 class="page-title">Routine</h1></div>
      <div class="empty"><p>A routine is assembled from what is on the shelf. Add a product first.</p>
      <a class="btn" href="#/add">Add a product</a></div>`;
    return;
  }

  /* Everything below edits this draft; Save writes it. */
  const draft = { am: [...(saved.am || [])], pm: [...(saved.pm || [])] };
  const inStep = (period, key) => draft[period].filter(e => e.step === key);
  const productLabel = p => `${p.brand ? p.brand + ' · ' : ''}${p.name}`;

  const expanded = new Set();          // day toggles open, inside the full builder
  const todayIndex = (new Date().getDay() + 6) % 7;   // DAYS is Monday-first
  let openDay = todayIndex;            // a day is always chosen; today to begin with
  let openComplete = false;
  let dirty = false;
  let message = '';
  const saveNote = () => (dirty ? 'Unsaved changes.' : message);

  /* ---------- the week, one day at a time ----------

     The day is what a person actually lives, so it is what they edit. Each day
     lists what goes on that morning and evening in application order, and a
     product added here is scheduled for that day alone — the other days keep
     whatever they had. */

  /* Entries applying on one day, in the order they go on. */
  const entriesOn = (period, day) => stepsFor(period).flatMap(step =>
    draft[period]
      .filter(e => e.step === step.key && daysOf(e).includes(day) && byId[e.productId])
      .map(entry => ({ entry, step })));

  const onDay = (period, day) => entriesOn(period, day).map(({ entry }) => byId[entry.productId]);

  const addOnDay = (period, stepKey, productId, day) => {
    const already = draft[period].find(e => e.step === stepKey && e.productId === productId);
    if (already) already.days = [...new Set([...daysOf(already), day])].sort((a, b) => a - b);
    else draft[period].push({ step: stepKey, productId, days: [day] });
  };

  /* Taking a product off one day leaves it on the others. Taking it off its
     last remaining day is a removal, not an empty schedule. */
  const removeOnDay = (period, stepKey, productId, day) => {
    const i = draft[period].findIndex(e => e.step === stepKey && e.productId === productId);
    if (i < 0) return;
    const left = daysOf(draft[period][i]).filter(d => d !== day);
    if (left.length) draft[period][i].days = left;
    else draft[period].splice(i, 1);
  };

  /* One select for the whole period, grouped by step — eight separate menus
     for eight steps would bury the two you actually use. */
  const dayAdder = (period, day) => {
    const groups = stepsFor(period).map(step => {
      const already = draft[period].filter(e => e.step === step.key && daysOf(e).includes(day));
      if (!step.multiple && already.length) return '';        // that slot is taken
      const taken = new Set(already.map(e => e.productId));
      const candidates = products.filter(p => step.categories.includes(p.category) && !taken.has(p.id));
      if (!candidates.length) return '';
      return `<optgroup label="${esc(step.label)}">${candidates.map(p =>
        `<option value="${esc(step.key)}|${esc(p.id)}">${esc(productLabel(p))}</option>`).join('')}</optgroup>`;
    }).join('');

    if (!groups) return '';
    return `<div class="picker-row">
      <span class="picker-step" style="min-width:110px"></span>
      <span class="grow">
        <select class="inline-select" data-dayadd="${esc(period)}|${day}">
          <option value="">＋ add a product</option>${groups}
        </select>
      </span>
    </div>`;
  };

  /* Inside Monday, a chip reading "Mon" says nothing. What is worth knowing is
     whether this product turns up on other days too. */
  const scheduleOf = (entry, day) => {
    if (isEveryDay(entry)) return '';
    const days = daysOf(entry);
    return days.length === 1 && days[0] === day ? 'This day only' : describeDays(entry);
  };

  const dayColumn = (period, title, day) => {
    const rows = entriesOn(period, day).map(({ entry, step }) => `
      <div class="picker-row">
        <span class="picker-step" style="min-width:110px">${esc(step.label)}</span>
        <span class="grow">${esc(productLabel(byId[entry.productId]))}</span>
        <span class="picker-step">${esc(scheduleOf(entry, day))}</span>
        <button class="link-btn" data-dayoff="${esc(period)}|${esc(step.key)}|${esc(entry.productId)}|${day}">Remove</button>
      </div>`).join('');

    return `<div>
      <h3 class="section-title">${esc(title)}</h3>
      <div class="picker">
        ${rows || '<div class="picker-row"><span class="grow muted">Nothing on this day</span></div>'}
        ${dayAdder(period, day)}
      </div>
    </div>`;
  };

  /* Seven cards standing across the page. The card itself carries only the day
     — a list of product names in each was noise at this size, and the day you
     have chosen shows its whole routine directly beneath the row anyway. */
  const dayCard = (label, day) => {
    const clashes = [...conflictsFor(onDay('am', day), 'am'), ...conflictsFor(onDay('pm', day), 'pm')]
      .filter(n => n.severity === 'high');
    const chosen = openDay === day;
    const count = onDay('am', day).length + onDay('pm', day).length;

    return `<button class="day-card${chosen ? ' is-on' : ''}${clashes.length ? ' has-clash' : ''}"
              data-openday="${day}" aria-pressed="${chosen}" aria-controls="day-detail">
      <span class="day-card-name">${esc(label)}</span>
      <span class="day-card-foot">
        ${day === todayIndex ? '<span class="day-card-today">Today</span>' : ''}
        <span class="day-card-count">${count ? `${count} step${count === 1 ? '' : 's'}` : 'Nothing yet'}</span>
        ${clashes.length ? '<span class="day-card-clash">Take care</span>' : ''}
      </span>
    </button>`;
  };

  /* The chosen day, opened out under the row of cards. */
  const dayDetail = day => {
    const notes = [...conflictsFor(onDay('am', day), 'am'), ...conflictsFor(onDay('pm', day), 'pm')];
    return `<div class="day-body" id="day-detail">
      <div class="routine-cols">
        ${dayColumn('am', 'Morning', day)}
        ${dayColumn('pm', 'Evening', day)}
      </div>
      ${notes.map(n => `<div class="notice" style="margin-top:24px">
          <strong>${n.severity === 'high' ? 'Take care' : n.severity === 'medium' ? 'Consider' : 'Note'}</strong>
          ${esc(n.text)}</div>`).join('')}
      <div class="btn-row day-save">
        <button class="btn btn-lg" data-save>Save routine</button>
        <span class="field-hint" style="margin:0">${esc(saveNote())}</span>
      </div>
    </div>`;
  };

  /* ---------- the whole thing at once, for when a day at a time is too slow ---------- */

  const dayToggles = (period, productId, stepKey, entry) => {
    const id = `${period}|${productId}|${stepKey}`;
    const chosen = new Set(daysOf(entry));
    if (!expanded.has(id)) {
      return `<button class="link-btn day-summary${isEveryDay(entry) ? '' : ' day-some'}"
                data-days="${esc(id)}">${esc(describeDays(entry))}</button>`;
    }
    return `<span class="day-picker">
      ${DAYS.map((label, i) => `
        <button class="day${chosen.has(i) ? ' is-on' : ''}"
                data-day="${esc(id)}|${i}" title="${esc(label)}">${esc(label[0])}</button>`).join('')}
      <button class="link-btn" data-days="${esc(id)}">Done</button>
    </span>`;
  };

  const stepRows = (period, step) => {
    const chosen = inStep(period, step.key);
    const taken = new Set(chosen.map(e => e.productId));
    const candidates = products.filter(p => step.categories.includes(p.category) && !taken.has(p.id));
    const canAdd = step.multiple ? candidates.length > 0 : chosen.length === 0 && candidates.length > 0;

    const rows = chosen.map((entry, i) => {
      const p = byId[entry.productId];
      if (!p) return '';
      return `<div class="picker-row">
        <span class="picker-step" style="min-width:110px">${i === 0 ? esc(step.label) : ''}</span>
        <span class="grow">${esc(productLabel(p))}</span>
        ${dayToggles(period, entry.productId, step.key, entry)}
        ${i > 0 ? `<button class="link-btn" data-up="${esc(period)}|${esc(step.key)}|${i}">Move up</button>` : ''}
        <button class="link-btn" data-drop="${esc(period)}|${esc(entry.productId)}|${esc(step.key)}">Remove</button>
      </div>`;
    }).join('');

    const adder = canAdd
      ? `<div class="picker-row">
          <span class="picker-step" style="min-width:110px">${chosen.length ? '' : esc(step.label)}</span>
          <span class="grow">
            <select class="inline-select step-add" data-add="${esc(period)}|${esc(step.key)}">
              ${option('', chosen.length ? '＋ add another' : '—', '')}
              ${candidates.map(p => option(p.id, productLabel(p), '')).join('')}
            </select>
          </span>
        </div>`
      : (chosen.length ? '' : `<div class="picker-row">
          <span class="picker-step" style="min-width:110px">${esc(step.label)}</span>
          <span class="grow muted">Nothing in this category</span>
        </div>`);

    return rows + adder;
  };

  const column = (period, title) => `
    <div>
      <h3 class="section-title">${esc(title)}</h3>
      <div class="picker">
        ${stepsFor(period).map(step => stepRows(period, step)).join('')}
      </div>
      <div id="conflicts-${period}" class="block" style="margin-top:32px"></div>
    </div>`;

  const draw = () => {
    root.innerHTML = `
      <div class="view-head">
        ${headerArt('routine')}
        <h1 class="page-title">Routine</h1>
      </div>

      <div class="block" style="margin-top:0">
        <h2 class="block-title">Your week</h2>
        <p class="muted" style="font-size:13px;margin:0 0 24px">Choose a day to see what you are
          using and change it. What you add belongs to that day alone — the rest of the week
          keeps whatever it had.</p>
        <div class="week-strip">${DAYS.map((label, day) => dayCard(label, day)).join('')}</div>
        ${dayDetail(openDay)}
      </div>

      <div class="block">
        <button class="day-head" id="open-complete" aria-expanded="${openComplete}" aria-controls="complete">
          <span class="week-day">Complete routine</span>
          <span class="grow muted">Every step, and which days each product is used</span>
          <span class="history-mark" aria-hidden="true">${openComplete ? '–' : '+'}</span>
        </button>
        ${openComplete ? `<div class="day-body" id="complete">
          <div class="routine-cols">
            ${column('am', 'Morning')}
            ${column('pm', 'Evening')}
          </div>
          <div class="btn-row day-save">
            <button class="btn btn-lg" data-save>Save routine</button>
            <span class="field-hint" style="margin:0">${esc(saveNote())}</span>
          </div>
        </div>` : ''}
      </div>`;

    /* Conflicts are judged per day — things you alternate never meet, so
       warning about them was crying wolf. */
    if (openComplete) {
      for (const period of ['am', 'pm']) {
        const byText = new Map();
        for (let day = 0; day < 7; day++) {
          for (const note of conflictsFor(onDay(period, day), period)) {
            if (!byText.has(note.text)) byText.set(note.text, { ...note, days: [] });
            byText.get(note.text).days.push(DAYS[day]);
          }
        }
        const notes = [...byText.values()];
        const anything = draft[period].length;
        root.querySelector(`#conflicts-${period}`).innerHTML = notes.length
          ? `<h3 class="section-title">Worth knowing</h3>${notes.map(n =>
              `<div class="notice"><strong>${n.severity === 'high' ? 'Take care' : n.severity === 'medium' ? 'Consider' : 'Note'}</strong>
                ${n.days.length === 7 ? '' : `<em>${esc(n.days.join(', '))}</em> — `}${esc(n.text)}</div>`).join('')}`
          : (anything ? '<p class="muted" style="font-size:13px">Nothing conflicts on any day.</p>' : '');
      }
    }
    wire();
  };

  /* Any edit invalidates what is stored, so the note stops saying "Saved." */
  const touched = () => { dirty = true; message = ''; };

  function wire() {
    /* One day is always chosen — there is nothing useful to show with none. */
    root.querySelectorAll('[data-openday]').forEach(btn => {
      btn.onclick = () => {
        const day = Number(btn.dataset.openday);
        if (day === openDay) return;
        openDay = day;
        draw();
      };
    });

    root.querySelector('#open-complete').onclick = () => {
      openComplete = !openComplete;
      draw();
    };

    root.querySelectorAll('[data-dayadd]').forEach(sel => {
      sel.onchange = () => {
        if (!sel.value) return;
        const [period, dayText] = sel.dataset.dayadd.split('|');
        const [stepKey, productId] = sel.value.split('|');
        addOnDay(period, stepKey, productId, Number(dayText));
        touched();
        draw();
      };
    });

    root.querySelectorAll('[data-dayoff]').forEach(btn => {
      btn.onclick = () => {
        const [period, stepKey, productId, dayText] = btn.dataset.dayoff.split('|');
        removeOnDay(period, stepKey, productId, Number(dayText));
        touched();
        draw();
      };
    });

    root.querySelectorAll('.step-add').forEach(sel => {
      sel.onchange = () => {
        if (!sel.value) return;
        const [period, stepKey] = sel.dataset.add.split('|');
        draft[period].push({ step: stepKey, productId: sel.value, days: [...EVERY_DAY] });
        touched();
        draw();
      };
    });

    /* Open or close a row's day toggles. */
    root.querySelectorAll('[data-days]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.days;
        expanded.has(id) ? expanded.delete(id) : expanded.add(id);
        draw();
      };
    });

    root.querySelectorAll('[data-day]').forEach(btn => {
      btn.onclick = () => {
        const [period, productId, stepKey, dayText] = btn.dataset.day.split('|');
        const day = Number(dayText);
        const entry = draft[period].find(e => e.productId === productId && e.step === stepKey);
        if (!entry) return;
        const days = new Set(daysOf(entry));
        days.has(day) ? days.delete(day) : days.add(day);
        // Never leave an entry on no days at all — that is a removal, not a schedule.
        entry.days = days.size ? [...days].sort((a, b) => a - b) : [...EVERY_DAY];
        expanded.add(`${period}|${productId}|${stepKey}`);
        touched();
        draw();
      };
    });

    root.querySelectorAll('[data-drop]').forEach(btn => {
      btn.onclick = () => {
        const [period, productId, stepKey] = btn.dataset.drop.split('|');
        const i = draft[period].findIndex(e => e.productId === productId && e.step === stepKey);
        if (i > -1) draft[period].splice(i, 1);
        touched();
        draw();
      };
    });

    /* Swap with the entry above it inside the same step. */
    root.querySelectorAll('[data-up]').forEach(btn => {
      btn.onclick = () => {
        const [period, stepKey, indexText] = btn.dataset.up.split('|');
        const within = Number(indexText);
        const positions = draft[period]
          .map((e, i) => (e.step === stepKey ? i : -1))
          .filter(i => i > -1);
        const a = positions[within - 1];
        const b = positions[within];
        [draft[period][a], draft[period][b]] = [draft[period][b], draft[period][a]];
        touched();
        draw();
      };
    });

    root.querySelectorAll('[data-save]').forEach(btn => {
      btn.onclick = async () => {
        await store.setRoutine({ am: draft.am, pm: draft.pm });
        dirty = false;
        message = 'Saved.';
        draw();
      };
    });
  }

  draw();
}

/* ============================================================
   Discoveries
   ============================================================ */

/* A drawn bottle for each discovery.

   Real product photographs are not available here: search returns citations,
   not images, and nothing client-side can pull a picture off a retailer's page.
   So rather than a broken image or a grey box, each pick gets a silhouette
   drawn from its own name — deterministic, so a product always looks the same,
   and shaped by what kind of product it is. */
function pickArt(item, index) {
  const seed = [...`${item.brand || ''}${item.product || ''}`]
    .reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) || index + 1;

  const kind = `${item.kind || ''} ${item.product || ''}`.toLowerCase();
  const shape = /serum|ampoule|essence|drop|oil/.test(kind) ? 'dropper'
    : /cream|balm|mask|butter|jar/.test(kind) ? 'jar'
    : /cleans|foam|wash|tube|gel/.test(kind) ? 'tube'
    : 'bottle';

  const tints = ['#E3E0D6', '#DCE2E4', '#E6DED3', '#DDE3DC', '#E4DCE0', '#DFE0E6'];
  const tint = tints[seed % tints.length];
  const band = 26 + (seed >> 3) % 16;
  const body = {
    dropper: 'M30 34h20v40a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6z',
    jar:     'M24 44h32v30a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6z',
    tube:    'M31 30h18l3 46a5 5 0 0 1-5 5H33a5 5 0 0 1-5-5z',
    bottle:  'M28 38h24v36a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6z'
  }[shape];
  const cap = {
    dropper: '<rect x="35" y="14" width="10" height="20" rx="1"/>',
    jar:     '<rect x="27" y="34" width="26" height="10" rx="1"/>',
    tube:    '<rect x="34" y="20" width="12" height="10" rx="1"/>',
    bottle:  '<rect x="34" y="22" width="12" height="16" rx="1"/><path d="M31 22h18"/>'
  }[shape];

  return `<svg class="pick-art" viewBox="0 0 80 92" role="img"
               aria-label="${esc(`${item.brand || ''} ${item.product || ''}`.trim() || 'Product')}">
    <rect x="0" y="0" width="80" height="92" fill="${tint}"/>
    <g fill="none" stroke="#1B1A17" stroke-width="1.1" stroke-linejoin="round">
      <path d="${body}"/>
      ${cap}
      <path d="M28 ${band}h24" opacity="0.3"/>
      <path d="M28 ${band + 6}h15" opacity="0.3"/>
    </g>
  </svg>`;
}

/* Where to send someone who wants to see the real thing.

   The model supplies the address, so it is treated as untrusted: anything that
   is not a plain http(s) URL is dropped, and if there is none — older picks
   were found before this was asked for — we fall back to a search for the
   product by name, which is what the person would type anyway. */
function pickUrl(item) {
  const name = `${item.brand || ''} ${item.product || ''}`.trim();
  const search = 'https://www.google.com/search?q=' + encodeURIComponent(name || 'skincare');
  if (!item.url) return search;
  try {
    const url = new URL(item.url);
    return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : search;
  } catch {
    return search;
  }
}

export async function discoveries(root) {
  const { apiKey } = await aiSettings();
  const products = await store.getProducts();
  const cached = await store.getPicks();

  if (!AI_FEATURES || !apiKey) {
    root.innerHTML = `
      <div class="view-head">${headerArt('discoveries')}<h1 class="page-title">Discoveries</h1></div>
      <div class="empty">
        <p>This looks for Japanese and Korean products that suit your latest reading and fill a
           gap on your shelf.</p>
        ${AI_FEATURES
          ? `<p>It needs a model connected under Settings.</p>
             <a class="btn" href="#/settings">Connect one</a>`
          : `<p>This copy of the library does not talk to any model. Copy a briefing from
               Settings and ask an assistant of your own instead.</p>
             <a class="btn" href="#/settings">Copy a briefing</a>`}
      </div>`;
    return;
  }

  const paint = (picks, note) => {
    const stale = picks && (Date.now() - new Date(picks.generatedAt).getTime()) > 30 * 864e5;
    root.innerHTML = `
      <div class="view-head">
        ${headerArt('discoveries')}
        <h1 class="page-title">Discoveries</h1>
        <div class="btn-row">
          <button class="btn" id="look">${picks ? 'Look again' : 'Look for something new'}</button>
          <span class="field-hint" style="margin:0" id="pick-note">${esc(note || '')}</span>
        </div>
      </div>

      ${picks ? `
        ${picks.grounded === false ? `<div class="notice"><strong>Not web-checked</strong> —
          search was unavailable, so these come from the model's memory. Products may be
          discontinued or misremembered. Verify each one before buying.</div>` : ''}
        <p class="muted" style="margin-bottom:32px">Found ${esc(fmtStamp(picks.generatedAt))}${stale ? ' — over a month ago, worth looking again.' : '.'}
          ${picks.grounded === false ? '' : 'Searched on the web, but check the details yourself before buying.'}</p>
        <div class="carousel">
          <div class="carousel-bar">
            <button class="link-btn" id="pick-prev">← Previous</button>
            <span class="carousel-dots" id="pick-dots">
              ${(picks.items || []).map((_, i) => `<button class="carousel-dot${i === 0 ? ' is-on' : ''}" data-go="${i}" aria-label="Go to ${i + 1}"></button>`).join('')}
            </span>
            <button class="link-btn" id="pick-next">Next →</button>
          </div>
          <div class="carousel-track" id="picks-track">
            ${(picks.items || []).map((item, i) => {
              const href = pickUrl(item);
              const title = `${item.brand || ''} ${item.product || ''}`.trim();
              return `
              <article class="pick" aria-roledescription="slide"
                       aria-label="${i + 1} of ${(picks.items || []).length}">
                <a class="pick-link" href="${esc(href)}" target="_blank" rel="noreferrer noopener"
                   title="Opens ${item.url ? 'where this was found' : 'a search for this product'}">
                  ${pickArt(item, i)}
                </a>
                <div class="pick-body">
                  <div class="pick-brand">${esc(item.brand || '')}</div>
                  <div class="pick-name">
                    <a class="pick-link" href="${esc(href)}" target="_blank" rel="noreferrer noopener">${esc(title)}
                      <span class="pick-out" aria-hidden="true">↗</span></a>
                  </div>
                  <div class="pick-why">${esc(item.why || '')}</div>
                  <button class="link-btn pick-more" data-more="${i}"
                          aria-expanded="false" aria-controls="pick-detail-${i}">Details +</button>
                  <div class="pick-details" id="pick-detail-${i}" hidden>
                    ${item.kind ? `<div class="pick-meta"><strong>What it is</strong> — ${esc(item.kind)}</div>` : ''}
                    ${item.actives ? `<div class="pick-meta"><strong>Actives</strong> — ${esc(item.actives)}</div>` : ''}
                    ${item.caution ? `<div class="pick-meta"><strong>Caution</strong> — ${esc(item.caution)}</div>` : ''}
                    <div class="pick-meta"><a class="pick-link" href="${esc(href)}" target="_blank"
                      rel="noreferrer noopener" style="text-decoration:underline">${item.url
                        ? 'Where this was found ↗' : 'Search for this product ↗'}</a></div>
                  </div>
                </div>
              </article>`;
            }).join('')}
          </div>
        </div>
        ${(picks.sources || []).length ? `<div class="block">
          <h2 class="section-title">Where this came from</h2>
          <div class="chips">
            ${picks.sources.map(s => `<a class="chip" href="${esc(s.url)}" target="_blank" rel="noreferrer noopener">${esc(s.title)}</a>`).join('')}
          </div>
        </div>` : ''}`
      : `<div class="empty"><p>Nothing looked up yet.</p></div>`}`;

    /* Carousel: scroll-snap does the moving, buttons and dots just nudge it. */
    const track = root.querySelector('#picks-track');
    if (track) {
      const slides = [...track.querySelectorAll('.pick')];
      const dots = [...root.querySelectorAll('.carousel-dot')];
      const goTo = i => {
        const target = slides[Math.max(0, Math.min(slides.length - 1, i))];
        if (target) track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: 'smooth' });
      };
      const current = () => {
        const mid = track.scrollLeft + track.clientWidth / 2;
        let best = 0;
        slides.forEach((s, i) => {
          if (s.offsetLeft - track.offsetLeft < mid) best = i;
        });
        return best;
      };
      const mark = () => {
        const i = current();
        dots.forEach((d, n) => d.classList.toggle('is-on', n === i));
        root.querySelector('#pick-prev').disabled = i === 0;
        root.querySelector('#pick-next').disabled = i === slides.length - 1;
      };
      root.querySelector('#pick-prev').onclick = () => goTo(current() - 1);
      root.querySelector('#pick-next').onclick = () => goTo(current() + 1);
      dots.forEach(d => { d.onclick = () => goTo(Number(d.dataset.go)); });
      track.addEventListener('scroll', () => {
        clearTimeout(track.__t);
        track.__t = setTimeout(mark, 90);
      });
      track.tabIndex = 0;
      track.addEventListener('keydown', ev => {
        if (ev.key === 'ArrowRight') { ev.preventDefault(); goTo(current() + 1); }
        if (ev.key === 'ArrowLeft') { ev.preventDefault(); goTo(current() - 1); }
      });
      mark();

      /* Everything but the blurb folds away, so four picks can be compared at
         a glance and read in full one at a time. */
      root.querySelectorAll('.pick-more').forEach(btn => {
        btn.onclick = () => {
          const body = root.querySelector(`#pick-detail-${CSS.escape(btn.dataset.more)}`);
          const opening = body.hidden;
          body.hidden = !opening;
          btn.setAttribute('aria-expanded', String(opening));
          btn.textContent = opening ? 'Details –' : 'Details +';
        };
      });
    }

    root.querySelector('#look').onclick = async () => {
      const button = root.querySelector('#look');
      const restore = waiting(button, 'Searching');
      root.querySelector('#pick-note').innerHTML = `This takes a moment${dots()}`;
      try {
        const assessments = (await store.getAssessments()).sort((a, b) => b.date.localeCompare(a.date));
        const fresh = await discover({ library: products, assessment: assessments[0] });
        await store.setPicks(fresh);
        paint(fresh, `Found ${fresh.items.length}.`);
      } catch (err) {
        restore();
        root.querySelector('#pick-note').textContent = err.message;
      }
    };
  };

  paint(cached, '');
}

/* ============================================================
   Settings
   ============================================================ */

export async function settings(root) {
  const current = await aiSettings();
  const profiles = await store.getProfiles();
  const activeId = await store.getActiveProfileId();
  const tallies = await store.profileTallies();
  const allProducts = await store.getAll('products');
  const allAssessments = await store.getAll('assessments');

  root.innerHTML = `
    <div class="view-head">${headerArt('settings')}<h1 class="page-title">Settings</h1></div>

    <div class="prose">
      <h2 class="section-title">Profiles</h2>
      <p class="muted">Everyone at home can have their own shelf, readings and routine. Switch
        between them at the top of the page. They are kept apart for tidiness, not for privacy —
        anyone at this browser can look at any of them.</p>

      <div class="picker" style="margin-top:24px">
        ${profiles.map(p => {
          const t = tallies[p.id] || { products: 0, assessments: 0 };
          return `<div class="picker-row">
            <span class="grow">
              <input type="text" class="profile-name" data-id="${esc(p.id)}" value="${esc(p.name)}"
                     aria-label="Profile name">
            </span>
            <span class="picker-step">${t.products} ${t.products === 1 ? 'product' : 'products'} · ${t.assessments} ${t.assessments === 1 ? 'reading' : 'readings'}</span>
            ${p.id === activeId ? '<span class="picker-step" style="color:var(--amber)">Showing</span>' : ''}
            ${profiles.length > 1 ? `<button class="link-btn" data-remove="${esc(p.id)}">Remove</button>` : ''}
          </div>`;
        }).join('')}
      </div>

      <div class="field" style="max-width:360px;margin-top:32px">
        <label for="new-profile">Add someone</label>
        <input type="text" id="new-profile" placeholder="Their name" autocomplete="off">
      </div>
      <div class="btn-row">
        <button class="btn" id="add-profile">Add profile</button>
        <span class="field-hint" style="margin:0" id="profile-note"></span>
      </div>
    </div>

    <div class="prose block">
      <h2 class="section-title">Your library</h2>
      <p class="muted">${allProducts.length} products and ${allAssessments.length} assessments across
        ${profiles.length} ${profiles.length === 1 ? 'profile' : 'profiles'}, held in this browser's
        storage. Clearing site data would remove them, so keep a backup.</p>
      <div class="btn-row" style="margin:24px 0 8px">
        <button class="btn" id="export">Export a backup</button>
        <button class="btn btn-quiet" id="import-btn">Restore from a backup</button>
        <input type="file" id="import" accept="application/json" style="display:none">
      </div>
      <p class="field-hint" id="backup-note"></p>
    </div>

    <div class="prose block">
      <h2 class="section-title">Ask another assistant</h2>
      <p class="muted">Copies your shelf, your routine and your last self-assessment as text you
        can paste into Gemini, Claude or anything else, along with a photograph of your skin.
        Nothing is sent by this app — you paste it yourself, so you can read exactly what you are
        sharing first.</p>
      <div class="btn-row" style="margin-top:24px">
        <button class="btn" id="copy-briefing">Copy briefing</button>
        <button class="btn btn-quiet" id="download-briefing">Download as a file</button>
        <span class="field-hint" style="margin:0" id="briefing-note"></span>
      </div>
    </div>

    ${AI_FEATURES ? `<div class="prose block">
      <h2 class="section-title">Connecting a model</h2>
      <p class="muted">With a key saved here, the app can read product labels for you, read your
        skin photograph, answer questions in the chat panel, and look for new products each month.
        Without one, everything else still works and nothing is ever sent anywhere.</p>
      <p class="muted"><strong>What leaves this Mac, and when.</strong> Reading a label sends that
        photograph. An assessment sends your answers, your shelf and your routine — and your skin
        photograph only if you tick the box, which is off by default. Chat sends your shelf and
        routine with each message. Google’s free tier commonly uses what you submit to improve
        their products; that is the trade for it costing nothing. The app asks Google not to
        retain each request, but that setting does not override their terms. Your key is kept in
        this browser and is left out of backups.</p>

      <div class="field-pair" style="max-width:640px;margin-top:24px">
        <div class="field">
          <label for="provider">Provider</label>
          <select id="provider">
            ${PROVIDERS.map(p => option(p.id, p.label, current.provider)).join('')}
          </select>
        </div>
        <div class="field">
          <label for="model">Model</label>
          <input type="text" id="model" value="${esc(current.model)}" autocomplete="off">
        </div>
      </div>
      <div class="field" style="max-width:640px">
        <label for="api-key">API key</label>
        <input type="password" id="api-key" placeholder="${current.provider === 'anthropic' ? 'sk-ant-…' : 'AIza…'}" value="${esc(current.apiKey)}">
      </div>
      <div class="btn-row">
        <button class="btn" id="save-key">Save</button>
        <button class="btn btn-quiet" id="clear-key">Remove key</button>
        <span class="field-hint" style="margin:0" id="key-note"></span>
      </div>
      <p class="field-hint">A Gemini key is free from <code>aistudio.google.com</code>. If a model
        name is refused, your tier may not include it — try <code>gemini-3.5-flash-lite</code>.</p>
    </div>` : ''}

    <div class="prose block">
      <h2 class="section-title">Erase</h2>
      <p class="muted">Removes every product, photograph, assessment and routine from this browser.</p>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn btn-quiet btn-danger" id="wipe">Erase everything</button>
      </div>
    </div>`;

  const note = root.querySelector('#backup-note');
  const profileNote = root.querySelector('#profile-note');

  root.querySelector('#copy-briefing').onclick = async () => {
    const briefingNote = root.querySelector('#briefing-note');
    try {
      const { copied, text } = await copyBriefing();
      const words = text.split(/\s+/).length;
      briefingNote.textContent = copied
        ? `Copied — about ${words} words. Paste it wherever you like.`
        : 'Could not reach the clipboard. Use the file instead.';
    } catch (err) {
      briefingNote.textContent = err.message;
    }
  };

  root.querySelector('#download-briefing').onclick = async () => {
    try {
      await downloadBriefing();
      root.querySelector('#briefing-note').textContent = 'Saved to your downloads.';
    } catch (err) {
      root.querySelector('#briefing-note').textContent = err.message;
    }
  };
  const redraw = async () => { await profileBar(); await settings(root); };

  root.querySelector('#add-profile').onclick = async () => {
    const field = root.querySelector('#new-profile');
    try {
      const created = await store.createProfile(field.value);
      await store.setActiveProfileId(created.id);
      await redraw();
      root.querySelector('#profile-note').textContent = `${created.name} added, and now showing.`;
    } catch (err) {
      profileNote.textContent = err.message;
    }
  };

  root.querySelectorAll('.profile-name').forEach(field => {
    field.onchange = async () => {
      try {
        await store.renameProfile(field.dataset.id, field.value);
        await redraw();
      } catch (err) {
        profileNote.textContent = err.message;
      }
    };
  });

  root.querySelectorAll('[data-remove]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.remove;
      const person = profiles.find(p => p.id === id);
      const t = tallies[id] || { products: 0, assessments: 0 };
      if (!confirm(
        `Remove ${person.name}? Their ${t.products} products, ${t.assessments} readings and their ` +
        `routine go with them, and this cannot be undone.`
      )) return;
      try {
        await store.deleteProfile(id);
        await redraw();
        root.querySelector('#profile-note').textContent = `${person.name} removed.`;
      } catch (err) {
        profileNote.textContent = err.message;
      }
    };
  });

  root.querySelector('#export').onclick = async () => {
    const data = await store.exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `skincare-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    note.textContent = `Exported ${data.products.length} products.` +
      (data._keyOmitted ? ' The API key was left out.' : '');
  };

  const fileInput = root.querySelector('#import');
  root.querySelector('#import-btn').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!confirm('Restoring replaces everything currently in the library. Continue?')) {
      fileInput.value = '';
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      const counts = await store.importAll(data);
      const message = `Restored ${counts.products} products and ${counts.assessments} assessments `
        + `across ${counts.profiles} ${counts.profiles === 1 ? 'profile' : 'profiles'}.`;
      await profileBar();
      await settings(root);            // redraw so the profile list reflects the restore
      root.querySelector('#backup-note').textContent = message;
    } catch (err) {
      note.textContent = err.message;
    }
    fileInput.value = '';
  };

  if (AI_FEATURES) {
    root.querySelector('#save-key').onclick = async () => {
      await store.setSettings({
        ...current,
        provider: root.querySelector('#provider').value,
        model: root.querySelector('#model').value.trim(),
        apiKey: root.querySelector('#api-key').value.trim()
      });
      root.querySelector('#key-note').textContent = 'Saved.';
      await settings(root);
    };
    root.querySelector('#clear-key').onclick = async () => {
      await store.setSettings({ ...current, apiKey: '' });
      await settings(root);
      root.querySelector('#key-note').textContent = 'Key removed.';
    };
    /* Switching provider swaps the sensible default model with it. */
    root.querySelector('#provider').onchange = e => {
      const field = root.querySelector('#model');
      field.value = e.target.value === 'anthropic' ? 'claude-opus-5' : 'gemini-3.6-flash';
    };
  }

  root.querySelector('#wipe').onclick = async () => {
    if (!confirm('Erase the entire library? Export a backup first if you want to keep it.')) return;
    if (!confirm('This is permanent. Erase everything?')) return;
    await store.wipe();
    location.hash = '#/';
  };
}
