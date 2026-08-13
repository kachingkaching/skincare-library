/* Rendering. Each view takes the <main> element and route params, writes its
   markup, then wires its own events. */

import * as store from './store.js';
import {
  TAG_LABEL, ACTIVE_TAGS, FLAG_TAGS,
  lookup, parseIngredients, tagsFor
} from './ingredients.js';
import { CATEGORIES, STATUSES, STATUS_LABEL, stepsFor, conflictsFor } from './rules.js';
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
      <div class="view-head"><h1 class="page-title">The Shelf</h1></div>
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

  let expiryNotice = '';
  if (p.openedAt && p.paoMonths) {
    const due = new Date(p.openedAt + 'T00:00:00');
    due.setMonth(due.getMonth() + Number(p.paoMonths));
    const past = due < new Date();
    const dueText = due.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    expiryNotice = `<div class="notice"><strong>${past ? 'Past its date — ' + esc(dueText) + '.' : 'Use by ' + esc(dueText) + '.'}</strong>
      Opened ${esc(fmtDate(p.openedAt))}, with ${Number(p.paoMonths)} months after opening.</div>`;
  }

  const spec = [
    ['Category', p.category],
    ['Status', STATUS_LABEL[p.status] || p.status],
    ['Size', p.size],
    ['Price', p.price],
    ['Purchased', fmtDate(p.purchasedAt)],
    ['Opened', fmtDate(p.openedAt)],
    ['Rating', p.rating ? '★'.repeat(Number(p.rating)) + '☆'.repeat(5 - Number(p.rating)) : '']
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

        ${expiryNotice}

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
      <h1 class="page-title">${editing ? 'Edit product' : 'Add a product'}</h1>
    </div>

    <form class="form-grid" id="product-form" autocomplete="off">
      <div>
        ${dropzoneMarkup('photo')}
        <div class="btn-row" style="margin-top:16px">
          <button type="button" class="btn btn-quiet" id="autofill" ${AI_FEATURES && settings.apiKey ? '' : 'hidden'}>Read the label</button>
        </div>
        <p class="field-hint" id="photo-hint">${AI_FEATURES && settings.apiKey
          ? 'A key is configured — Claude can read brand, name and ingredients from a photograph of the packaging.'
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

        <div class="field-pair">
          <div class="field">
            <label for="paoMonths">Period after opening (months)</label>
            <input type="number" id="paoMonths" min="1" max="60" value="${esc(p?.paoMonths)}">
          </div>
          <div class="field">
            <label for="rating">Rating</label>
            <select id="rating">
              ${option('', 'Unrated', p?.rating || '')}
              ${[1, 2, 3, 4, 5].map(n => option(String(n), '★'.repeat(n), String(p?.rating || ''))).join('')}
            </select>
          </div>
        </div>

        <div class="field">
          <label for="notes">Notes</label>
          <textarea id="notes" placeholder="How it wears, what it sits well under, whether you would buy it again.">${esc(p?.notes)}</textarea>
        </div>

        <div class="field">
          <label for="ingredients">Ingredients</label>
          <textarea id="ingredients" placeholder="Paste the list straight from the packaging. Commas are enough.">${esc((p?.ingredients || []).join(', '))}</textarea>
          <div class="field-hint" id="parse-summary"></div>
          <div class="chips" id="parse-chips" style="margin-top:12px"></div>
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

        const merge = list => {
          const already = parseIngredients(ingField.value);
          const seen = new Set(already.map(i => i.toLowerCase()));
          const added = list.filter(i => !seen.has(i.toLowerCase()));
          ingField.value = [...already, ...added].join(', ');
          refreshParse();
          return added.length;
        };

        if (read.ingredients?.length) {
          hint.textContent = `Read ${merge(read.ingredients)} ingredients off the pack. `
            + 'Check them before saving.';
        } else {
          /* Nothing legible on the pack — go and look the product up instead. */
          const brand = root.querySelector('#brand').value.trim();
          const name = root.querySelector('#name').value.trim();

          if (!name && !brand) {
            hint.textContent = 'No ingredient list was legible, and there is no product name to look up.';
          } else {
            hint.innerHTML = `No list visible on the pack. Looking up ${esc([brand, name].filter(Boolean).join(' '))}${dots()}`;
            const found = await lookupIngredients({ brand, name });

            if (!found.ingredients.length) {
              hint.textContent = 'No ingredient list was legible, and none could be found online. '
                + 'Try a close, straight-on photograph of the back of the pack.';
            } else {
              const count = merge(found.ingredients);
              hint.innerHTML = found.grounded
                ? `Found ${count} ingredients online for this product — <strong>not read off your pack</strong>, so check them against it. `
                  + `${found.note ? esc(found.note) + ' ' : ''}`
                  + (found.sources?.length
                    ? found.sources.slice(0, 3).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noreferrer noopener" style="text-decoration:underline">${esc(s.title)}</a>`).join(', ')
                    : '')
                : `Found ${count} ingredients, but <strong>web search was unavailable</strong>, so these came from the model’s memory rather than a source. Formulations change — check them against your pack carefully.`;
            }
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
      paoMonths: val('#paoMonths'),
      rating: val('#rating'),
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
  const providerName = PROVIDERS.find(p => p.id === settings.provider)?.label || settings.provider;

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
      <div class="view-head"><h1 class="page-title">${esc(fmtStampTime(record.date))}</h1>
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

  const historyMarkup = history.length ? `
    <div class="block">
      <h2 class="section-title">Previous readings</h2>
      <div class="history">
        ${history.map(a => `
          <button class="history-row" data-id="${esc(a.id)}">
            <span class="history-date">${esc(fmtStampTime(a.date))}</span>
            <span class="muted">${a.result.concerns.length
              ? esc(a.result.concerns.slice(0, 3).map(c => c.label).join(', '))
              : 'Nothing marked'}</span>
          </button>`).join('')}
      </div>
    </div>` : '';

  root.innerHTML = `
    <div class="view-head">
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
          </div>
          <p class="field-hint">Off, the reading comes from your answers and your shelf and the
            photograph never leaves this Mac. On, it is sent to ${esc(providerName)} to be read.</p>`
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

  root.querySelectorAll('.history-row').forEach(btn => {
    btn.onclick = () => { location.hash = `#/assess/${btn.dataset.id}`; };
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
    root.innerHTML = `<div class="view-head"><h1 class="page-title">Routine</h1></div>
      <div class="empty"><p>A routine is assembled from what is on the shelf. Add a product first.</p>
      <a class="btn" href="#/add">Add a product</a></div>`;
    return;
  }

  /* Everything below edits this draft; Save writes it. */
  const draft = { am: [...(saved.am || [])], pm: [...(saved.pm || [])] };
  const inStep = (period, key) => draft[period].filter(e => e.step === key);

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
        <span class="grow">${esc(p.brand ? p.brand + ' · ' : '')}${esc(p.name)}</span>
        ${i > 0 ? `<button class="link-btn" data-up="${esc(period)}|${esc(step.key)}|${i}">Move up</button>` : ''}
        <button class="link-btn" data-drop="${esc(period)}|${esc(entry.productId)}|${esc(step.key)}">Remove</button>
      </div>`;
    }).join('');

    const adder = canAdd
      ? `<div class="picker-row">
          <span class="picker-step" style="min-width:110px">${chosen.length ? '' : esc(step.label)}</span>
          <span class="grow">
            <select class="step-add" data-add="${esc(period)}|${esc(step.key)}"
                    style="width:100%;background:none;border:none;border-bottom:1px solid var(--rule);padding:4px 0;border-radius:0">
              ${option('', chosen.length ? '＋ add another' : '—', '')}
              ${candidates.map(p => option(p.id, `${p.brand ? p.brand + ' · ' : ''}${p.name}`, '')).join('')}
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
      <h2 class="section-title">${esc(title)}</h2>
      <div class="picker">
        ${stepsFor(period).map(step => stepRows(period, step)).join('')}
      </div>
      <div id="conflicts-${period}" class="block" style="margin-top:32px"></div>
    </div>`;

  const draw = () => {
    root.innerHTML = `
      <div class="view-head">
        <h1 class="page-title">Routine</h1>
        <div class="btn-row">
          <button class="btn" id="save-routine">Save</button>
          <span class="field-hint" style="margin:0" id="routine-note"></span>
        </div>
      </div>
      <div class="routine-cols">
        ${column('am', 'Morning')}
        ${column('pm', 'Evening')}
      </div>`;

    for (const period of ['am', 'pm']) {
      const chosen = draft[period].map(e => byId[e.productId]).filter(Boolean);
      const notes = conflictsFor(chosen, period);
      root.querySelector(`#conflicts-${period}`).innerHTML = notes.length
        ? `<h2 class="section-title">Worth knowing</h2>${notes.map(n =>
            `<div class="notice"><strong>${n.severity === 'high' ? 'Take care' : n.severity === 'medium' ? 'Consider' : 'Note'}</strong> — ${esc(n.text)}</div>`).join('')}`
        : (chosen.length ? '<p class="muted" style="font-size:13px">Nothing conflicts in this routine.</p>' : '');
    }
    wire();
  };

  function wire() {
    root.querySelectorAll('.step-add').forEach(sel => {
      sel.onchange = () => {
        if (!sel.value) return;
        const [period, stepKey] = sel.dataset.add.split('|');
        draft[period].push({ step: stepKey, productId: sel.value });
        draw();
      };
    });

    root.querySelectorAll('[data-drop]').forEach(btn => {
      btn.onclick = () => {
        const [period, productId, stepKey] = btn.dataset.drop.split('|');
        const i = draft[period].findIndex(e => e.productId === productId && e.step === stepKey);
        if (i > -1) draft[period].splice(i, 1);
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
        draw();
      };
    });

    root.querySelector('#save-routine').onclick = async () => {
      await store.setRoutine({ am: draft.am, pm: draft.pm });
      root.querySelector('#routine-note').textContent = 'Saved.';
    };
  }

  draw();
}

/* ============================================================
   Discoveries
   ============================================================ */

export async function discoveries(root) {
  const { apiKey } = await aiSettings();
  const products = await store.getProducts();
  const cached = await store.getPicks();

  if (!AI_FEATURES || !apiKey) {
    root.innerHTML = `
      <div class="view-head"><h1 class="page-title">Discoveries</h1></div>
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
        <div class="picks">
          ${(picks.items || []).map(item => `
            <div class="pick">
              <div>
                <div class="pick-brand">${esc(item.brand || '')}</div>
                <div class="pick-name">${esc(item.product || '')}</div>
                <div class="pick-kind">${esc(item.kind || '')}</div>
              </div>
              <div>
                <div class="pick-why">${esc(item.why || '')}</div>
                ${item.actives ? `<div class="pick-meta"><strong>Actives</strong> — ${esc(item.actives)}</div>` : ''}
                ${item.caution ? `<div class="pick-meta"><strong>Caution</strong> — ${esc(item.caution)}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>
        ${(picks.sources || []).length ? `<div class="block">
          <h2 class="section-title">Where this came from</h2>
          <div class="chips">
            ${picks.sources.map(s => `<a class="chip" href="${esc(s.url)}" target="_blank" rel="noreferrer noopener">${esc(s.title)}</a>`).join('')}
          </div>
        </div>` : ''}`
      : `<div class="empty"><p>Nothing looked up yet.</p></div>`}`;

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
    <div class="view-head"><h1 class="page-title">Settings</h1></div>

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
