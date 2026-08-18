/* Rendering. Each view takes the <main> element and route params, writes its
   markup, then wires its own events. */

import * as store from './store.js';
import {
  ACTIVE_TAGS, FLAG_TAGS,
  lookup, parseIngredients, tagsFor
} from './ingredients.js';
import {
  CATEGORIES, STATUSES, stepsFor, conflictsFor,
  days, EVERY_DAY, daysOf, isEveryDay, describeDays
} from './rules.js';
import { questions, assessSkin } from './analysis.js';
import {
  LANGS, t, plural, applyLang, lang,
  tagLabel, statusLabel, severityLabel, categoryLabel, stepLabel, dayLabel,
  ingredientText
} from './i18n.js';
import { readProducts, lookupIngredients } from './ai.js';
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

/* Dates follow the interface language, so a Chinese page does not print
   "17 August 2026" in the middle of a Chinese sentence. */
const locale = () => (lang() === 'en' ? 'en-GB' : lang());

const fmtDate = s => s
  ? new Date(s + 'T00:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
  : '';

const fmtStamp = iso =>
  new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });

/* Two readings on one day should still be tellable apart. */
const fmtStampTime = iso =>
  fmtStamp(iso) + ' ' + new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

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

/* How a layering note is introduced, by how much it matters. */
const severityWord = sev =>
  (sev === 'high' ? t('common.takeCare') : sev === 'medium' ? t('common.consider') : t('common.note'));

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

const tagChip = (tag, flag) =>
  `<span class="chip ${flag ? 'chip-flag' : 'chip-active'}">${esc(tagLabel(tag))}</span>`;

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

const dropzoneMarkup = (id, caption) => `
  <div class="dropzone" id="${id}">
    <p>${esc(caption || t('form.dropPhoto'))}</p>
    <input type="file" accept="image/*">
  </div>`;

/* ============================================================
   Shelf
   ============================================================ */

const shelfFilters = { category: '', status: '', active: '' };
/* Emptied products stay in the library but drop out of the default view. One
   click brings them back, and the bar says how many are being kept back — a
   product that silently vanishes when you count the last one out is alarming. */
let showEmptied = false;
/* Set when several products are added at once, shown once on the shelf they
   were added to, then cleared — the work happened on another page. */
let shelfNotice = '';

export async function shelf(root) {
  const products = (await store.getProducts()).sort(byShelfOrder);

  if (!products.length) {
    const who = (await store.getActiveProfile())?.name;
    root.innerHTML = `
      <div class="view-head">${headerArt('shelf')}<h1 class="page-title">${esc(t('shelf.title'))}</h1></div>
      <div class="empty">
        <p>${esc(who ? t('shelf.emptyNamed', { name: who }) : t('shelf.empty'))}</p>
        <a class="btn" href="#/add">${esc(t('shelf.addFirst'))}</a>
      </div>`;
    return;
  }

  const activesPresent = new Set();
  products.forEach(p => tagsFor(p.ingredients || []).forEach(tag => {
    if (ACTIVE_TAGS.includes(tag)) activesPresent.add(tag);
  }));

  const matches = products.filter(p =>
    (!shelfFilters.category || p.category === shelfFilters.category) &&
    (!shelfFilters.status || p.status === shelfFilters.status) &&
    (!shelfFilters.active || tagsFor(p.ingredients || []).has(shelfFilters.active))
  );
  // Asking for Finished explicitly means you want to see them.
  const keepEmptied = showEmptied || shelfFilters.status === 'finished';
  const visible = keepEmptied ? matches : matches.filter(p => p.quantity > 0);
  const emptiedHidden = matches.length - visible.length;

  const onHand = products.reduce((n, p) => n + p.quantity, 0);

  const categoriesPresent = [...new Set(products.map(p => p.category).filter(Boolean))].sort();

  root.innerHTML = `
    <div class="view-head">
      ${headerArt('shelf')}
      <h1 class="page-title">${esc(t('shelf.title'))}</h1>
      <div class="btn-row"><a class="btn" href="#/add">${esc(t('shelf.add'))}</a></div>
    </div>

    <div class="filter-bar">
      <div class="filter">
        <label for="f-cat">${esc(t('shelf.filterCategory'))}</label>
        <select id="f-cat">
          ${option('', t('common.all'), shelfFilters.category)}
          ${categoriesPresent.map(c => option(c, categoryLabel(c), shelfFilters.category)).join('')}
        </select>
      </div>
      <div class="filter">
        <label for="f-status">${esc(t('shelf.filterStatus'))}</label>
        <select id="f-status">
          ${option('', t('common.all'), shelfFilters.status)}
          ${STATUSES.map(s => option(s, statusLabel(s), shelfFilters.status)).join('')}
        </select>
      </div>
      <div class="filter">
        <label for="f-active">${esc(t('shelf.filterContains'))}</label>
        <select id="f-active">
          ${option('', t('common.anything'), shelfFilters.active)}
          ${[...activesPresent].map(x => option(x, tagLabel(x), shelfFilters.active)).join('')}
        </select>
      </div>
      <span class="filter-count">${esc(t('shelf.count', { shown: visible.length, total: products.length }))}
        · ${esc(t('shelf.onHand', { n: onHand }))}</span>
    </div>

    ${shelfNotice ? `<div class="notice">${esc(shelfNotice)}</div>` : ''}
    ${emptiedHidden ? `<p class="field-hint" style="margin:-32px 0 32px">
      ${esc(t('shelf.emptiedHidden', { n: emptiedHidden }))}
      <button class="link-btn" id="show-emptied">${esc(t('shelf.showEmptied'))}</button></p>` : ''}
    ${showEmptied && !emptiedHidden ? `<p class="field-hint" style="margin:-32px 0 32px">
      <button class="link-btn" id="hide-emptied">${esc(t('shelf.hideEmptied'))}</button></p>` : ''}

    <div class="shelf" id="shelf-grid"></div>
    ${visible.length ? '' : `<p class="muted">${esc(t('shelf.noMatch'))}</p>`}`;

  shelfNotice = '';        // said once, on arrival

  const grid = root.querySelector('#shelf-grid');
  for (const p of visible) {
    const blob = await store.getImage(p.imageId);
    const item = document.createElement('div');
    item.className = `shelf-item${p.quantity === 0 ? ' is-empty' : ''}`;
    item.innerHTML = `
      <a class="shelf-link" href="#/product/${esc(p.id)}">
        <div class="shelf-frame">
          ${blob ? `<img src="${imgUrl(blob)}" alt="${esc(p.name)}">` : `<span class="no-image">${esc(t('shelf.noPhoto'))}</span>`}
          ${p.quantity > 1 ? `<span class="shelf-tally">${esc(String(p.quantity))}</span>` : ''}
        </div>
        <div class="shelf-brand">${esc(p.brand || '—')}</div>
        <div class="shelf-name">${esc(p.name)}</div>
        <div class="shelf-meta">${esc(p.category ? categoryLabel(p.category) : '')}${p.status && p.status !== 'active' ? ' · ' + esc(statusLabel(p.status)) : ''}</div>
      </a>
      <div class="stepper">
        <button class="step-btn" data-less="${esc(p.id)}" ${p.quantity === 0 ? 'disabled' : ''}
                aria-label="${esc(t('shelf.oneFewer', { name: p.name }))}">−</button>
        <span class="stepper-count" data-count="${esc(p.id)}">${esc(String(p.quantity))}</span>
        <button class="step-btn" data-more="${esc(p.id)}"
                aria-label="${esc(t('shelf.oneMore', { name: p.name }))}">＋</button>
      </div>`;
    grid.appendChild(item);
  }

  /* Counting up and down happens in place — redrawing the whole shelf would
     lose your scroll position and rebuild every image URL. Only when a product
     empties, or refills, does the card need to change class. */
  const stepBy = async (id, delta) => {
    const before = products.find(x => x.id === id);
    const updated = await store.setQuantity(id, (before?.quantity ?? 1) + delta);
    if (!updated) return;
    if (before) { before.quantity = updated.quantity; before.status = updated.status; }

    const card = root.querySelector(`[data-count="${CSS.escape(id)}"]`)?.closest('.shelf-item');
    if (!card) return;
    card.querySelector(`[data-count="${CSS.escape(id)}"]`).textContent = String(updated.quantity);
    card.querySelector(`[data-less="${CSS.escape(id)}"]`).disabled = updated.quantity === 0;
    card.classList.toggle('is-empty', updated.quantity === 0);

    const frame = card.querySelector('.shelf-frame');
    frame.querySelector('.shelf-tally')?.remove();
    if (updated.quantity > 1) {
      const tally = document.createElement('span');
      tally.className = 'shelf-tally';
      tally.textContent = String(updated.quantity);
      frame.appendChild(tally);
    }
    const meta = card.querySelector('.shelf-meta');
    meta.textContent = `${updated.category ? categoryLabel(updated.category) : ''}`
      + (updated.status && updated.status !== 'active' ? ' · ' + statusLabel(updated.status) : '');
  };

  root.querySelectorAll('[data-less]').forEach(b => { b.onclick = () => stepBy(b.dataset.less, -1); });
  root.querySelectorAll('[data-more]').forEach(b => { b.onclick = () => stepBy(b.dataset.more, +1); });

  const showBtn = root.querySelector('#show-emptied');
  if (showBtn) showBtn.onclick = () => { showEmptied = true; shelf(root); };
  const hideBtn = root.querySelector('#hide-emptied');
  if (hideBtn) hideBtn.onclick = () => { showEmptied = false; shelf(root); };

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
    root.innerHTML = `<div class="empty"><p>${esc(t('product.gone'))}</p>
      <a class="btn" href="#/">${esc(t('chrome.backToShelf'))}</a></div>`;
    return;
  }
  if (p.profileId !== activeId) {
    root.innerHTML = `<div class="empty">
      <p>${esc(t('product.otherProfile'))}</p>
      <a class="btn" href="#/">${esc(t('product.backToThisShelf'))}</a></div>`;
    return;
  }

  const others = (await store.getProfiles()).filter(x => x.id !== activeId);

  const blob = await store.getImage(p.imageId);
  const ingredients = p.ingredients || [];
  const tags = tagsFor(ingredients);
  const actives = ACTIVE_TAGS.filter(tag => tags.has(tag));
  const flags = FLAG_TAGS.filter(tag => tags.has(tag));
  const matched = ingredients.filter(i => lookup(i)).length;

  const spec = [
    [t('product.category'), p.category ? categoryLabel(p.category) : ''],
    [t('product.status'), statusLabel(p.status)],
    [t('product.quantity'), String(p.quantity)],
    [t('product.size'), p.size],
    [t('product.price'), p.price],
    [t('product.purchased'), fmtDate(p.purchasedAt)],
    [t('product.opened'), fmtDate(p.openedAt)]
  ].filter(([, v]) => v);

  root.innerHTML = `
    <p class="label muted" style="margin:0 0 32px"><a href="#/">${esc(t('product.back'))}</a></p>
    <div class="detail">
      <div class="detail-frame">
        ${blob ? `<img src="${imgUrl(blob)}" alt="${esc(p.name)}">` : `<span class="no-image">${esc(t('shelf.noPhoto'))}</span>`}
      </div>
      <div>
        <div class="detail-brand">${esc(p.brand || '—')}</div>
        <h1 class="detail-title">${esc(p.name)}</h1>

        ${actives.length ? `<div class="chips" style="margin-bottom:16px">${actives.map(tag => tagChip(tag, false)).join('')}</div>` : ''}
        ${flags.length ? `<div class="chips" style="margin-bottom:32px">${flags.map(tag => tagChip(tag, true)).join('')}</div>` : ''}

        <dl class="spec">
          ${spec.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
        </dl>

        ${p.notes ? `<div class="block">
          <h2 class="section-title">${esc(t('product.notes'))}</h2>
          <p class="prose" style="white-space:pre-wrap;margin:0">${esc(p.notes)}</p>
        </div>` : ''}

        <div class="block">
          <h2 class="section-title">${esc(ingredients.length
            ? t('product.ingredientsAnnotated', { matched, total: ingredients.length })
            : t('product.ingredients'))}</h2>
          ${ingredients.length ? `<div class="ing-list">${ingredients.map((name, i) => {
            const entry = lookup(name);
            const flagged = entry && entry.t.some(tag => FLAG_TAGS.includes(tag));
            return `<div class="ing ${entry ? '' : 'ing-unknown'} ${flagged ? 'ing-flagged' : ''}">
              <div class="ing-index">${i + 1}</div>
              <div>
                <div class="ing-name">${esc(entry ? entry.n : name)}</div>
                ${entry && entry.n.toLowerCase() !== name.toLowerCase()
                  ? `<div class="tag" style="border:none;margin-top:2px">${esc(name)}</div>` : ''}
                ${entry ? `<div class="ing-tags">${entry.t.map(tag =>
                    `<span class="tag ${FLAG_TAGS.includes(tag) ? 'tag-flag' : ''}">${esc(tagLabel(tag))}</span>`).join('')}</div>` : ''}
              </div>
              <div class="ing-fn">${esc(entry ? ingredientText(entry) : t('product.notInReference'))}</div>
            </div>`;
          }).join('')}</div>`
          : `<p class="muted">${esc(t('product.noIngredients'))}</p>`}
        </div>

        ${others.length ? `<div class="block">
          <h2 class="section-title">${esc(t('product.shared'))}</h2>
          <p class="muted" style="font-size:13px;margin:0 0 20px">${esc(t('product.sharedNote'))}</p>
          <div class="btn-row">
            <select id="copy-target" style="background:none;border:none;border-bottom:1px solid var(--rule);padding:4px 0;border-radius:0">
              ${others.map(o => option(o.id, o.name, others[0].id)).join('')}
            </select>
            <button class="btn btn-quiet" id="copy-across">${esc(t('product.copyAcross'))}</button>
            <span class="field-hint" style="margin:0" id="copy-note"></span>
          </div>
        </div>` : ''}

        <div class="block btn-row">
          <a class="btn" href="#/edit/${esc(p.id)}">${esc(t('common.edit'))}</a>
          <button class="btn btn-quiet btn-danger" id="delete">${esc(t('product.delete'))}</button>
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
        root.querySelector('#copy-note').textContent = t('product.copiedTo', { name });
      } catch (err) {
        root.querySelector('#copy-note').textContent = err.message;
      } finally {
        copyBtn.disabled = false;
      }
    };
  }

  root.querySelector('#delete').onclick = async () => {
    if (!confirm(t('product.confirmDelete', { name: `${p.brand ? p.brand + ' ' : ''}${p.name}` }))) return;
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
    root.innerHTML = `<div class="empty"><p>${esc(t('product.gone'))}</p>
      <a class="btn" href="#/">${esc(t('chrome.backToShelf'))}</a></div>`;
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
      <h1 class="page-title">${esc(editing ? t('form.editTitle') : t('form.addTitle'))}</h1>
    </div>

    <form class="form-grid" id="product-form" autocomplete="off">
      <div>
        ${dropzoneMarkup('photo')}
        <div class="btn-row" style="margin-top:16px">
          <button type="button" class="btn btn-quiet" id="autofill" ${AI_FEATURES && settings.apiKey ? '' : 'hidden'}>${esc(t('form.readLabel'))}</button>
        </div>
        <p class="field-hint" id="photo-hint">${esc(AI_FEATURES && settings.apiKey
          ? t('form.readLabelHint') : t('form.photoHint'))}</p>
        <div id="found" hidden></div>
      </div>

      <div>
        <div class="field-pair">
          <div class="field">
            <label for="brand">${esc(t('form.brand'))}</label>
            <input type="text" id="brand" value="${esc(p?.brand)}">
          </div>
          <div class="field">
            <label for="name">${esc(t('form.name'))}</label>
            <input type="text" id="name" required value="${esc(p?.name)}">
          </div>
        </div>

        <div class="field-pair">
          <div class="field">
            <label for="category">${esc(t('product.category'))}</label>
            <select id="category">${CATEGORIES.map(c => option(c, categoryLabel(c), p?.category || 'Serum')).join('')}</select>
          </div>
          <div class="field">
            <label for="status">${esc(t('product.status'))}</label>
            <select id="status">${STATUSES.map(x => option(x, statusLabel(x), p?.status || 'active')).join('')}</select>
          </div>
        </div>

        <div class="field-pair">
          <div class="field">
            <label for="quantity">${esc(t('product.quantity'))}</label>
            <input type="number" id="quantity" min="0" max="99" step="1" value="${esc(String(p?.quantity ?? 1))}">
            <div class="field-hint">${esc(t('form.quantityHint'))}</div>
          </div>
          <div class="field"></div>
        </div>

        <div id="dupe" hidden></div>

        <div class="field">
          <label for="ingredients">${esc(t('product.ingredients'))}</label>
          <textarea id="ingredients" placeholder="${esc(t('form.ingredientsPlaceholder'))}">${esc((p?.ingredients || []).join(', '))}</textarea>
          <div class="btn-row" style="margin-top:12px">
            <button type="button" class="btn btn-quiet" id="lookup" ${AI_FEATURES && settings.apiKey ? '' : 'hidden'}>${esc(t('form.lookUp'))}</button>
          </div>
          <div class="field-hint" id="parse-summary"></div>
          <div class="chips" id="parse-chips" style="margin-top:12px"></div>
        </div>

        <div class="field-pair">
          <div class="field">
            <label for="size">${esc(t('product.size'))}</label>
            <input type="text" id="size" placeholder="50 ml" value="${esc(p?.size)}">
          </div>
          <div class="field">
            <label for="price">${esc(t('product.price'))}</label>
            <input type="text" id="price" placeholder="£38" value="${esc(p?.price)}">
          </div>
        </div>

        <div class="field-pair">
          <div class="field">
            <label for="purchasedAt">${esc(t('product.purchased'))}</label>
            <input type="date" id="purchasedAt" value="${esc(p?.purchasedAt)}">
          </div>
          <div class="field">
            <label for="openedAt">${esc(t('product.opened'))}</label>
            <input type="date" id="openedAt" value="${esc(p?.openedAt)}">
          </div>
        </div>

        <div class="field">
          <label for="notes">${esc(t('product.notes'))}</label>
          <textarea id="notes" placeholder="${esc(t('form.notesPlaceholder'))}">${esc(p?.notes)}</textarea>
        </div>

        <div class="btn-row">
          <button type="submit" class="btn">${esc(editing ? t('form.submitEdit') : t('form.submitAdd'))}</button>
          <a class="btn btn-quiet" href="${editing ? '#/product/' + esc(id) : '#/'}">${esc(t('common.cancel'))}</a>
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
    img.alt = t('form.selectedPhoto');
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
      ? t('form.parsed', { n: list.length, known: known.length })
      : t('form.parsedNone');
    chips.innerHTML = [
      ...ACTIVE_TAGS.filter(tag => tags.has(tag)).map(tag => tagChip(tag, false)),
      ...FLAG_TAGS.filter(tag => tags.has(tag)).map(tag => tagChip(tag, true))
    ].join('');
  };
  ingField.addEventListener('input', refreshParse);
  refreshParse();

  /* Adding something you already own should add to the count, not put a second
     card on the shelf. Checked whenever the brand or name changes, and again
     after the label is read — but never acted on without being asked, because
     a travel size and a full size share a name and should stay apart. */
  const dupeBox = root.querySelector('#dupe');
  let dupe = null;

  const checkDuplicate = async () => {
    if (!dupeBox) return;
    const brand = root.querySelector('#brand').value.trim();
    const name = root.querySelector('#name').value.trim();
    const found = await store.findProductLike(brand, name);

    // Editing a product is not a duplicate of itself.
    dupe = found && found.id !== p?.id ? found : null;
    if (!dupe) { dupeBox.hidden = true; dupeBox.innerHTML = ''; return; }

    const adding = Math.max(1, Math.round(Number(root.querySelector('#quantity').value) || 1));
    dupeBox.hidden = false;
    dupeBox.innerHTML = `
      <div class="notice">
        <strong>${esc(t('form.alreadyOwn', {
          name: `${dupe.brand ? dupe.brand + ' ' : ''}${dupe.name}`, n: dupe.quantity }))}</strong>
        <div class="btn-row" style="margin-top:12px">
          <button type="button" class="btn btn-quiet" id="merge">${esc(t('form.addToThat', { n: adding }))}</button>
          <span class="field-hint" style="margin:0">${esc(t('form.orKeepSeparate'))}</span>
        </div>
      </div>`;

    dupeBox.querySelector('#merge').onclick = async () => {
      await store.setQuantity(dupe.id, dupe.quantity + adding);
      location.hash = `#/product/${dupe.id}`;
    };
  };

  if (!editing) {
    ['#brand', '#name', '#quantity'].forEach(sel => {
      root.querySelector(sel).addEventListener('change', checkDuplicate);
    });
  }

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

    hint.innerHTML = `${lead}${esc(t('common.lookingUp'))} ${esc([brand, name].filter(Boolean).join(' '))}${dots()}`;
    const found = await lookupIngredients({ brand, name });

    if (!found.ingredients.length) {
      hint.textContent = found.searchRan
        ? t('form.lookupFailedSearched')
        : t('form.lookupFailedNoSearch');
      return found;
    }

    const count = merge(found.ingredients);
    const note = found.note ? esc(found.note) + ' ' : '';
    hint.innerHTML = found.grounded
      ? t('form.foundOnline', { n: count }) + note + sourceLinks(found)
      : t('form.foundFromMemory', { n: count }) + note;
    return found;
  };

  /* Look up on demand, without needing a photograph at all. */
  const lookupBtn = root.querySelector('#lookup');
  if (lookupBtn) {
    lookupBtn.onclick = async () => {
      const restore = waiting(lookupBtn, t('common.lookingUp'));
      try {
        const done = await lookupInto(hint);
        if (!done) hint.textContent = t('form.needBrandOrName');
      } catch (err) {
        hint.textContent = err.message;
      } finally {
        restore();
      }
    };
  }

  /* ---------- several products in one photograph ----------

     Everything found is listed for approval before anything is written: the
     model can misread a name, and a wrong entry is more annoying to clear up
     than a missing one. Each row can be dropped, renamed, recategorised and
     recounted. A row whose brand and name already match something on the shelf
     defaults to adding to that product's count rather than making a second
     card — the same rule the single-product path follows. */
  const foundBox = root.querySelector('#found');

  async function reviewFound(found, sourceBlob) {
    // Which of these do we already own? Asked once, up front.
    const existing = await Promise.all(
      found.map(item => store.findProductLike(item.brand, item.name))
    );

    foundBox.hidden = false;
    foundBox.innerHTML = `
      <div class="found">
        <h2 class="section-title">${esc(t('form.foundHeading', { n: found.length }))}</h2>
        ${found.map((item, i) => `
          <div class="found-row" data-row="${i}">
            <input type="checkbox" class="found-keep" id="keep-${i}" checked
                   aria-label="${esc(t('form.keepThis'))}">
            <div class="found-fields">
              <input type="text" class="found-brand" value="${esc(item.brand)}"
                     placeholder="${esc(t('form.brand'))}" aria-label="${esc(t('form.brand'))}">
              <input type="text" class="found-name" value="${esc(item.name)}"
                     placeholder="${esc(t('form.name'))}" aria-label="${esc(t('form.name'))}">
              <select class="found-category inline-select" aria-label="${esc(t('product.category'))}">
                ${CATEGORIES.map(c => option(c, categoryLabel(c),
                    CATEGORIES.includes(item.category) ? item.category : 'Other')).join('')}
              </select>
              <input type="number" class="found-count" min="1" max="99" value="${esc(String(item.count))}"
                     aria-label="${esc(t('product.quantity'))}">
              ${existing[i] ? `<span class="found-note">${esc(t('form.willAddTo', {
                n: existing[i].quantity })) }</span>` : ''}
            </div>
          </div>`).join('')}
        <div class="btn-row" style="margin-top:24px">
          <button type="button" class="btn btn-lg" id="add-found"></button>
          <button type="button" class="link-btn" id="discard-found">${esc(t('form.discardFound'))}</button>
          <span class="field-hint" style="margin:0" id="found-note"></span>
        </div>
      </div>`;

    const rows = () => [...foundBox.querySelectorAll('.found-row')];
    const kept = () => rows().filter(r => r.querySelector('.found-keep').checked);
    const label = () => {
      const n = kept().length;
      const button = foundBox.querySelector('#add-found');
      button.textContent = t('form.addFound', { n });
      button.disabled = n === 0;
    };
    rows().forEach(r => { r.querySelector('.found-keep').onchange = label; });
    label();

    foundBox.querySelector('#discard-found').onclick = () => {
      foundBox.hidden = true;
      foundBox.innerHTML = '';
      hint.textContent = '';
    };

    foundBox.querySelector('#add-found').onclick = async () => {
      const button = foundBox.querySelector('#add-found');
      const restore = waiting(button, t('common.saving'));
      const note = foundBox.querySelector('#found-note');
      let added = 0;
      let merged = 0;

      try {
        for (const row of kept()) {
          const i = Number(row.dataset.row);
          const brand = row.querySelector('.found-brand').value.trim();
          const name = row.querySelector('.found-name').value.trim();
          if (!name && !brand) continue;
          const quantity = Math.max(1, Math.round(Number(row.querySelector('.found-count').value) || 1));

          // Re-check rather than trust what we looked up before editing — the
          // name in the field may have been corrected since.
          const already = await store.findProductLike(brand, name);
          if (already) {
            await store.setQuantity(already.id, already.quantity + quantity);
            merged += 1;
            continue;
          }

          // Each product gets its own picture, cut out of the group shot.
          let imageId = null;
          try {
            const crop = await store.cropImage(sourceBlob, found[i].box);
            imageId = await store.putImage(crop);
          } catch {
            imageId = null;      // a photograph is not worth failing the save for
          }

          await store.saveProduct({
            id: store.uid(),
            brand,
            name: name || brand,
            category: row.querySelector('.found-category').value,
            status: 'active',
            size: found[i].size || '',
            price: '',
            purchasedAt: '',
            openedAt: '',
            quantity,
            notes: '',
            ingredients: found[i].ingredients || [],
            imageId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          added += 1;
        }
      } catch (err) {
        restore();
        note.textContent = err.message;
        return;
      }

      if (!added && !merged) { restore(); note.textContent = t('form.nothingKept'); return; }
      // Say what happened on the shelf, where the results now are.
      shelfNotice = merged
        ? t('form.addedAndMerged', { added, merged })
        : t('form.addedSeveral', { n: added });
      location.hash = '#/';
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
      if (!blob) { hint.textContent = t('form.needPhoto'); return; }

      const restore = waiting(autofillBtn, t('common.reading'));
      hint.innerHTML = `${esc(t('form.readingPhoto'))}${dots()}`;

      try {
        const found = await readProducts(blob);

        /* A shelf of bottles in one shot becomes a list to look over, not a
           form — there is only one form, and six products will not fit in it. */
        if (found.length > 1) {
          hint.textContent = t('form.foundSeveral', { n: found.length });
          await reviewFound(found, blob);
          return;
        }

        const read = found[0];
        if (!read) { hint.textContent = t('form.nothingRead'); return; }

        // Merge rather than overwrite, so you can read the front for the name,
        // then swap in the back-of-pack photograph for the ingredients.
        const fill = (selector, value) => {
          const field = root.querySelector(selector);
          if (value && !field.value.trim()) field.value = value;
        };
        fill('#brand', read.brand);
        fill('#name', read.name);
        fill('#size', read.size);
        // Two identical bottles in one photograph are two bottles.
        if (read.count > 1) root.querySelector('#quantity').value = String(read.count);
        await checkDuplicate();
        if (read.category && CATEGORIES.includes(read.category) && !root.querySelector('#category').dataset.touched) {
          root.querySelector('#category').value = read.category;
        }

        if (read.ingredients?.length) {
          hint.textContent = t('form.readOff', { n: merge(read.ingredients) });
        } else {
          /* Nothing legible on the pack — go and look the product up instead,
             which is the whole point of having read the brand and name first. */
          const done = await lookupInto(hint, t('form.noListOnPack') + ' ');
          if (!done) hint.textContent = t('form.nothingToLookUp');
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
    if (!val('#name')) { error.textContent = t('form.needName'); return; }

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
      quantity: Math.max(0, Math.round(Number(val('#quantity')) || 0)),
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
    extras.push(`<div class="notice">${t('assess.degraded', { why: esc(result.degraded) })}</div>`);
  }
  if (result.photoUsed && result.photoUsable === false && result.photoNote) {
    extras.push(`<div class="notice">${t('assess.photoHard', { note: esc(result.photoNote) })}</div>`);
  }

  const observations = (result.observations || []).length ? `
    <div class="block" style="margin-top:0">
      <h2 class="section-title">${esc(t('assess.visible'))}</h2>
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
      <h2 class="section-title">${esc(t('assess.working'))}</h2>
      <ul class="prose" style="margin:0;padding-left:18px">
        ${result.working.map(w => `<li style="margin-bottom:8px">${esc(w)}</li>`).join('')}
      </ul>
    </div>` : '';

  const changes = (result.changes || []).length ? `
    <div class="block">
      <h2 class="section-title">${esc(t('assess.changes'))}</h2>
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
          : `<div class="step-product step-empty">${esc(t('assess.nothingSuitable'))}</div>`}
        <div class="step-note">${esc(s.note || '')}</div>
      </div>
    </div>`).join('');

  return `
    <div class="caveat">${esc(result.caveat)}</div>
    ${extras}
    ${observations}

    <div class="block">
      <h2 class="section-title">${esc(t('assess.theReading'))}</h2>
      ${result.concerns.length ? `<div class="reading">${result.concerns.map(c => `
        <div class="reading-row">
          <div>${esc(c.label)}</div>
          <div class="severity ${c.severity === 'marked' ? 'severity-marked' : ''}">${esc(severityLabel(c.severity))}</div>
          <div class="reading-note">${esc(c.evidence)}</div>
        </div>`).join('')}</div>`
        : `<p class="muted">${esc(t('assess.nothingStands'))}</p>`}
    </div>

    ${working}
    ${changes}

    <div class="block">
      <h2 class="section-title">${esc(t('assess.suggests'))}</h2>
      <div class="routine-cols">
        <div>
          <h3 class="step-label" style="margin-bottom:8px">${esc(t('common.morning'))}</h3>
          ${period('am') || `<p class="muted">${esc(t('assess.noMorning'))}</p>`}
        </div>
        <div>
          <h3 class="step-label" style="margin-bottom:8px">${esc(t('common.evening'))}</h3>
          ${period('pm') || `<p class="muted">${esc(t('assess.noEvening'))}</p>`}
        </div>
      </div>
    </div>

    ${result.gaps.length ? `<div class="block">
      <h2 class="section-title">${esc(t('assess.missing'))}</h2>
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
      root.innerHTML = `<div class="empty"><p>${esc(t('assess.gone'))}</p>
        <a class="btn" href="#/assess">${esc(t('assess.back'))}</a></div>`;
      return;
    }
    const blob = await store.getImage(record.photoId);
    root.innerHTML = `
      <p class="label muted" style="margin:0 0 32px"><a href="#/assess">${esc(t('assess.back'))}</a></p>
      <div class="view-head">${headerArt('assess')}<h1 class="page-title">${esc(fmtStampTime(record.date))}</h1>
        <button class="btn btn-quiet btn-danger" id="del-assessment">${esc(t('assess.removeRecord'))}</button></div>
      <div class="assess-grid">
        <div>${blob ? `<div class="shelf-frame"><img src="${imgUrl(blob)}" alt="Skin, ${esc(fmtStamp(record.date))}"></div>`
          : `<div class="shelf-frame"><span class="no-image">${esc(t('shelf.noPhoto'))}</span></div>`}</div>
        <div>${renderResult(record.result, productsById)}</div>
      </div>`;
    root.querySelector('#del-assessment').onclick = async () => {
      if (!confirm(t('assess.confirmRemove'))) return;
      await store.deleteAssessment(record.id);
      location.hash = '#/assess';
    };
    return;
  }

  /* Past readings open in place — comparing this month against last should not
     mean losing your place on the page. */
  const historyMarkup = history.length ? `
    <div class="block">
      <h2 class="block-title">${esc(t('assess.previous', { n: history.length }))}</h2>
      <div class="history">
        ${history.map(a => `
          <div class="history-item">
            <button class="history-row" data-open="${esc(a.id)}" aria-expanded="false"
                    aria-controls="past-${esc(a.id)}">
              <span class="history-date">${esc(fmtStampTime(a.date))}</span>
              <span class="muted grow">${a.result.concerns.length
                ? esc(a.result.concerns.slice(0, 3).map(c => c.label).join(', '))
                : esc(t('assess.nothingMarked'))}</span>
              <span class="history-mark" aria-hidden="true">+</span>
            </button>
            <div class="history-body" id="past-${esc(a.id)}" hidden></div>
          </div>`).join('')}
      </div>
    </div>` : '';

  root.innerHTML = `
    <div class="view-head">
      ${headerArt('assess')}
      <h1 class="page-title">${esc(t('assess.title'))}</h1>
      <div class="btn-row">
        <button class="btn btn-quiet" id="brief-here">${esc(t('assess.copyBriefing'))}</button>
        <span class="field-hint" style="margin:0" id="brief-here-note"></span>
      </div>
    </div>
    <div class="assess-grid">
      <div>
        ${dropzoneMarkup('skin-photo', t('assess.photoPrompt'))}
        <p class="field-hint">${esc(t('assess.photoHint'))}</p>
        ${AI_FEATURES && keyConfigured ? `
          <div class="choices" style="margin-top:20px">
            <input type="checkbox" id="send-photo" ${sendPhotoDefault ? 'checked' : ''}>
            <label for="send-photo">${esc(t('assess.letModelLook'))}</label>
          </div>`
        : ''}
      </div>
      <div>
        <form id="assess-form">
          ${questions().map(q => `
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
            <button type="submit" class="btn">${esc(t('assess.submit'))}</button>
            <span class="field-hint" style="margin:0">${esc(t('assess.staysHere'))}</span>
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
        img.alt = t('assess.skinPhotoAlt');
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
            <button class="btn btn-quiet btn-danger" data-forget="${esc(id)}">${esc(t('assess.removeRecord'))}</button>
          </div>`;
        body.dataset.filled = '1';
        body.querySelector('[data-forget]').onclick = async () => {
          if (!confirm(t('assess.confirmRemove'))) return;
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
      briefNote.textContent = copied ? t('assess.briefingCopied') : t('assess.briefingFailed');
    } catch (err) {
      briefNote.textContent = err.message;
    }
  };

  root.querySelector('#assess-form').onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const answers = {};
    for (const q of questions()) {
      answers[q.key] = q.multi ? fd.getAll(q.key) : (fd.get(q.key) || '');
    }

    const photoBlob = photoJob ? await photoJob : null;
    const sendPhoto = Boolean(root.querySelector('#send-photo')?.checked);
    const submit = ev.target.querySelector('button[type="submit"]');
    const restore = submit ? waiting(submit, t('common.reading')) : () => {};

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
        <button class="btn" id="adopt">${esc(t('assess.adopt'))}</button>
        <span class="field-hint" style="margin:0" id="adopt-note">${esc(t('assess.archived'))}</span>
      </div></div>`;
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });

    out.querySelector('#adopt').onclick = async () => {
      const entries = period => (result.routine[period] || [])
        .filter(s => s.productId)
        .map(s => ({ step: s.stepKey || null, productId: s.productId }));
      await store.setRoutine({ am: entries('am'), pm: entries('pm') });
      out.querySelector('#adopt-note').textContent = t('assess.adopted');
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
    root.innerHTML = `<div class="view-head">${headerArt('routine')}<h1 class="page-title">${esc(t('routine.title'))}</h1></div>
      <div class="empty"><p>${esc(t('routine.emptyShelf'))}</p>
      <a class="btn" href="#/add">${esc(t('shelf.add'))}</a></div>`;
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
  const saveNote = () => (dirty ? t('routine.unsaved') : message);

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

  /* What a step will take.

     Its own categories come first, because that is what you almost always
     want. Everything else follows after a rule, because a routine is yours:
     a mask, a spot treatment or a body cream matches no step in the canonical
     order and would otherwise be impossible to record at all, and there is no
     good reason the app should refuse a second moisturiser. Nothing here is
     forbidden — the natural answer is merely the easiest to reach. */
  const offerFor = (period, step, taken) => {
    const free = products.filter(p => !taken.has(p.id));
    const natural = free.filter(p => step.categories.includes(p.category));
    const rest = free.filter(p => !step.categories.includes(p.category));
    const opt = p => `<option value="${esc(step.key)}|${esc(p.id)}">${esc(productLabel(p))}</option>`;
    if (!free.length) return '';
    return natural.map(opt).join('')
      + (rest.length
        ? `<option disabled>${esc(t('routine.otherProducts'))}</option>${rest.map(opt).join('')}`
        : '');
  };

  /* One select for the whole period, grouped by step — eight separate menus
     for eight steps would bury the two you actually use. */
  const dayAdder = (period, day) => {
    const groups = stepsFor(period).map(step => {
      const taken = new Set(draft[period]
        .filter(e => e.step === step.key && daysOf(e).includes(day))
        .map(e => e.productId));
      const options = offerFor(period, step, taken);
      if (!options) return '';
      return `<optgroup label="${esc(stepLabel(step))}">${options}</optgroup>`;
    }).join('');

    if (!groups) return '';
    return `<div class="picker-row">
      <span class="picker-step" style="min-width:110px"></span>
      <span class="grow">
        <select class="inline-select" data-dayadd="${esc(period)}|${day}">
          <option value="">${esc(t('routine.addProduct'))}</option>${groups}
        </select>
      </span>
    </div>`;
  };

  /* Inside Monday, a chip reading "Mon" says nothing. What is worth knowing is
     whether this product turns up on other days too. */
  const scheduleOf = (entry, day) => {
    if (isEveryDay(entry)) return '';
    const days = daysOf(entry);
    return days.length === 1 && days[0] === day ? t('routine.thisDayOnly') : describeDays(entry);
  };

  const dayColumn = (period, title, day) => {
    const rows = entriesOn(period, day).map(({ entry, step }) => `
      <div class="picker-row">
        <span class="picker-step" style="min-width:110px">${esc(stepLabel(step))}</span>
        <span class="grow">${esc(productLabel(byId[entry.productId]))}</span>
        <span class="picker-step">${esc(scheduleOf(entry, day))}</span>
        <button class="link-btn" data-dayoff="${esc(period)}|${esc(step.key)}|${esc(entry.productId)}|${day}">${esc(t('common.remove'))}</button>
      </div>`).join('');

    return `<div>
      <h3 class="section-title">${esc(title)}</h3>
      <div class="picker">
        ${rows || `<div class="picker-row"><span class="grow muted">${esc(t('routine.nothingOnDay'))}</span></div>`}
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
        ${day === todayIndex ? `<span class="day-card-today">${esc(t('common.today'))}</span>` : ''}
        <span class="day-card-count">${esc(count ? plural(count, 'routine.stepsOne', 'routine.stepsMany') : t('routine.nothingYet'))}</span>
        ${clashes.length ? `<span class="day-card-clash">${esc(t('common.takeCare'))}</span>` : ''}
      </span>
    </button>`;
  };

  /* The chosen day, opened out under the row of cards. */
  const dayDetail = day => {
    const notes = [...conflictsFor(onDay('am', day), 'am'), ...conflictsFor(onDay('pm', day), 'pm')];
    return `<div class="day-body" id="day-detail">
      <div class="routine-cols">
        ${dayColumn('am', t('common.morning'), day)}
        ${dayColumn('pm', t('common.evening'), day)}
      </div>
      ${notes.map(n => `<div class="notice" style="margin-top:24px">
          <strong>${esc(severityWord(n.severity))}</strong>
          ${esc(n.text)}</div>`).join('')}
      <div class="btn-row day-save">
        <button class="btn btn-lg" data-save>${esc(t('routine.save'))}</button>
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
      ${days().map((label, i) => `
        <button class="day${chosen.has(i) ? ' is-on' : ''}"
                data-day="${esc(id)}|${i}" title="${esc(label)}">${esc(label[0])}</button>`).join('')}
      <button class="link-btn" data-days="${esc(id)}">${esc(t('routine.done'))}</button>
    </span>`;
  };

  const stepRows = (period, step) => {
    const chosen = inStep(period, step.key);
    const taken = new Set(chosen.map(e => e.productId));
    const options = offerFor(period, step, taken);

    const rows = chosen.map((entry, i) => {
      const p = byId[entry.productId];
      if (!p) return '';
      return `<div class="picker-row">
        <span class="picker-step" style="min-width:110px">${i === 0 ? esc(stepLabel(step)) : ''}</span>
        <span class="grow">${esc(productLabel(p))}</span>
        ${dayToggles(period, entry.productId, step.key, entry)}
        ${i > 0 ? `<button class="link-btn" data-up="${esc(period)}|${esc(step.key)}|${i}">${esc(t('routine.moveUp'))}</button>` : ''}
        <button class="link-btn" data-drop="${esc(period)}|${esc(entry.productId)}|${esc(step.key)}">${esc(t('common.remove'))}</button>
      </div>`;
    }).join('');

    const adder = options
      ? `<div class="picker-row">
          <span class="picker-step" style="min-width:110px">${chosen.length ? '' : esc(stepLabel(step))}</span>
          <span class="grow">
            <select class="inline-select step-add" data-add="${esc(period)}|${esc(step.key)}">
              <option value="">${esc(chosen.length ? t('routine.addAnother') : '—')}</option>
              ${options}
            </select>
          </span>
        </div>`
      : (chosen.length ? '' : `<div class="picker-row">
          <span class="picker-step" style="min-width:110px">${esc(stepLabel(step))}</span>
          <span class="grow muted">${esc(t('routine.nothingLeft'))}</span>
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
        <h1 class="page-title">${esc(t('routine.title'))}</h1>
      </div>

      <div class="block" style="margin-top:0">
        <h2 class="block-title">${esc(t('routine.yourWeek'))}</h2>
        <p class="muted" style="font-size:13px;margin:0 0 24px">${esc(t('routine.weekHint'))}</p>
        <div class="week-strip">${days().map((label, day) => dayCard(label, day)).join('')}</div>
        ${dayDetail(openDay)}
      </div>

      <div class="block">
        <button class="day-head" id="open-complete" aria-expanded="${openComplete}" aria-controls="complete">
          <span class="week-day">${esc(t('routine.complete'))}</span>
          <span class="grow muted">${esc(t('routine.completeHint'))}</span>
          <span class="history-mark" aria-hidden="true">${openComplete ? '–' : '+'}</span>
        </button>
        ${openComplete ? `<div class="day-body" id="complete">
          <div class="routine-cols">
            ${column('am', t('common.morning'))}
            ${column('pm', t('common.evening'))}
          </div>
          <div class="btn-row day-save">
            <button class="btn btn-lg" data-save>${esc(t('routine.save'))}</button>
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
            byText.get(note.text).days.push(dayLabel(day));
          }
        }
        const notes = [...byText.values()];
        const anything = draft[period].length;
        root.querySelector(`#conflicts-${period}`).innerHTML = notes.length
          ? `<h3 class="section-title">${esc(t('routine.worthKnowing'))}</h3>${notes.map(n =>
              `<div class="notice"><strong>${esc(severityWord(n.severity))}</strong>
                ${n.days.length === 7 ? '' : `<em>${esc(n.days.join(' · '))}</em> — `}${esc(n.text)}</div>`).join('')}`
          : (anything ? `<p class="muted" style="font-size:13px">${esc(t('routine.noConflicts'))}</p>` : '');
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
        const [period] = sel.dataset.add.split('|');
        // The option carries its own step, so the offer can span every step.
        const [stepKey, productId] = sel.value.split('|');
        draft[period].push({ step: stepKey, productId, days: [...EVERY_DAY] });
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
        message = t('common.saved');
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
      <div class="view-head">${headerArt('discoveries')}<h1 class="page-title">${esc(t('disc.title'))}</h1></div>
      <div class="empty">
        <p>${esc(t('disc.intro'))}</p>
        ${AI_FEATURES
          ? `<p>${esc(t('disc.needsModel'))}</p>
             <a class="btn" href="#/settings">${esc(t('disc.connectOne'))}</a>`
          : `<p>${esc(t('disc.noModelHere'))}</p>
             <a class="btn" href="#/settings">${esc(t('disc.copyBriefing'))}</a>`}
      </div>`;
    return;
  }

  const paint = (picks, note) => {
    const stale = picks && (Date.now() - new Date(picks.generatedAt).getTime()) > 30 * 864e5;
    root.innerHTML = `
      <div class="view-head">
        ${headerArt('discoveries')}
        <h1 class="page-title">${esc(t('disc.title'))}</h1>
        <div class="btn-row">
          <button class="btn" id="look">${esc(picks ? t('disc.lookAgain') : t('disc.look'))}</button>
          <span class="field-hint" style="margin:0" id="pick-note">${esc(note || '')}</span>
        </div>
      </div>

      ${picks ? `
        ${picks.grounded === false ? `<div class="notice">${t('disc.notWebChecked')}</div>` : ''}
        <p class="muted" style="margin-bottom:32px">${esc(t('disc.foundOn', { date: fmtStamp(picks.generatedAt) }))}${esc(stale ? t('disc.stale') : '')}
          ${picks.grounded === false ? '' : esc(t('disc.checkYourself'))}</p>
        <div class="carousel">
          <div class="carousel-bar">
            <button class="link-btn" id="pick-prev">${esc(t('disc.prev'))}</button>
            <span class="carousel-dots" id="pick-dots">
              ${(picks.items || []).map((_, i) => `<button class="carousel-dot${i === 0 ? ' is-on' : ''}" data-go="${i}" aria-label="${esc(t('disc.goTo', { n: i + 1 }))}"></button>`).join('')}
            </span>
            <button class="link-btn" id="pick-next">${esc(t('disc.next'))}</button>
          </div>
          <div class="carousel-track" id="picks-track">
            ${(picks.items || []).map((item, i) => {
              const href = pickUrl(item);
              const title = `${item.brand || ''} ${item.product || ''}`.trim();
              return `
              <article class="pick" aria-roledescription="slide"
                       aria-label="${i + 1} of ${(picks.items || []).length}">
                <a class="pick-link" href="${esc(href)}" target="_blank" rel="noreferrer noopener"
                   title="${esc(item.url ? t('disc.opensFound') : t('disc.opensSearch'))}">
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
                          aria-expanded="false" aria-controls="pick-detail-${i}">${esc(t('common.details'))} +</button>
                  <div class="pick-details" id="pick-detail-${i}" hidden>
                    ${item.kind ? `<div class="pick-meta"><strong>${esc(t('disc.whatItIs'))}</strong> — ${esc(item.kind)}</div>` : ''}
                    ${item.actives ? `<div class="pick-meta"><strong>${esc(t('disc.actives'))}</strong> — ${esc(item.actives)}</div>` : ''}
                    ${item.caution ? `<div class="pick-meta"><strong>${esc(t('disc.caution'))}</strong> — ${esc(item.caution)}</div>` : ''}
                    <div class="pick-meta"><a class="pick-link" href="${esc(href)}" target="_blank"
                      rel="noreferrer noopener" style="text-decoration:underline">${esc(item.url
                        ? t('disc.whereFound') : t('disc.searchFor'))}</a></div>
                  </div>
                </div>
              </article>`;
            }).join('')}
          </div>
        </div>
        ${(picks.sources || []).length ? `<div class="block">
          <h2 class="section-title">${esc(t('disc.sources'))}</h2>
          <div class="chips">
            ${picks.sources.map(s => `<a class="chip" href="${esc(s.url)}" target="_blank" rel="noreferrer noopener">${esc(s.title)}</a>`).join('')}
          </div>
        </div>` : ''}`
      : `<div class="empty"><p>${esc(t('disc.nothingYet'))}</p></div>`}`;

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
          btn.textContent = t('common.details') + (opening ? ' –' : ' +');
        };
      });
    }

    root.querySelector('#look').onclick = async () => {
      const button = root.querySelector('#look');
      const restore = waiting(button, t('common.searching'));
      root.querySelector('#pick-note').innerHTML = `${esc(t('disc.takesAMoment'))}${dots()}`;
      try {
        const assessments = (await store.getAssessments()).sort((a, b) => b.date.localeCompare(a.date));
        const fresh = await discover({ library: products, assessment: assessments[0] });
        await store.setPicks(fresh);
        paint(fresh, t('disc.found', { n: fresh.items.length }));
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
    <div class="view-head">${headerArt('settings')}<h1 class="page-title">${esc(t('set.title'))}</h1></div>

    <div class="prose">
      <h2 class="section-title">${esc(t('set.language'))}</h2>
      <p class="muted">${esc(t('set.languageNote'))}</p>
      <div class="choices" style="margin-top:20px">
        ${LANGS.map(l => `
          <input type="radio" name="lang" id="lang-${esc(l.id)}" value="${esc(l.id)}"${l.id === lang() ? ' checked' : ''}>
          <label for="lang-${esc(l.id)}">${esc(l.label)}</label>`).join('')}
      </div>
    </div>

    <div class="prose block">
      <h2 class="section-title">${esc(t('set.profiles'))}</h2>
      <p class="muted">${esc(t('set.profilesNote'))}</p>

      <div class="picker" style="margin-top:24px">
        ${profiles.map(p => {
          const tally = tallies[p.id] || { products: 0, assessments: 0 };
          return `<div class="picker-row">
            <span class="grow">
              <input type="text" class="profile-name" data-id="${esc(p.id)}" value="${esc(p.name)}"
                     aria-label="${esc(t('set.profileName'))}">
            </span>
            <span class="picker-step">${esc(plural(tally.products, 'set.productsOne', 'set.productsMany'))} · ${esc(plural(tally.assessments, 'set.readingsOne', 'set.readingsMany'))}</span>
            ${p.id === activeId ? `<span class="picker-step" style="color:var(--amber)">${esc(t('set.showing'))}</span>` : ''}
            ${profiles.length > 1 ? `<button class="link-btn" data-remove="${esc(p.id)}">${esc(t('common.remove'))}</button>` : ''}
          </div>`;
        }).join('')}
      </div>

      <div class="field" style="max-width:360px;margin-top:32px">
        <label for="new-profile">${esc(t('set.addSomeone'))}</label>
        <input type="text" id="new-profile" placeholder="${esc(t('set.theirName'))}" autocomplete="off">
      </div>
      <div class="btn-row">
        <button class="btn" id="add-profile">${esc(t('set.addProfile'))}</button>
        <span class="field-hint" style="margin:0" id="profile-note"></span>
      </div>
    </div>

    <div class="prose block">
      <h2 class="section-title">${esc(t('set.yourLibrary'))}</h2>
      <p class="muted">${esc(t('set.libraryNote', {
        products: allProducts.length, assessments: allAssessments.length, profiles: profiles.length }))}</p>
      <div class="btn-row" style="margin:24px 0 8px">
        <button class="btn" id="export">${esc(t('set.export'))}</button>
        <button class="btn btn-quiet" id="import-btn">${esc(t('set.import'))}</button>
        <input type="file" id="import" accept="application/json" style="display:none">
      </div>
      <p class="field-hint" id="backup-note"></p>
    </div>

    <div class="prose block">
      <h2 class="section-title">${esc(t('set.askAnother'))}</h2>
      <p class="muted">${esc(t('set.askAnotherNote'))}</p>
      <div class="btn-row" style="margin-top:24px">
        <button class="btn" id="copy-briefing">${esc(t('set.copyBriefing'))}</button>
        <button class="btn btn-quiet" id="download-briefing">${esc(t('set.downloadBriefing'))}</button>
        <span class="field-hint" style="margin:0" id="briefing-note"></span>
      </div>
    </div>

    ${AI_FEATURES ? `<div class="prose block">
      <h2 class="section-title">${esc(t('set.connecting'))}</h2>
      <p class="muted">${esc(t('set.connectingNote'))}</p>
      <p class="muted">${t('set.privacyNote')}</p>

      <div class="field-pair" style="max-width:640px;margin-top:24px">
        <div class="field">
          <label for="provider">${esc(t('set.provider'))}</label>
          <select id="provider">
            ${PROVIDERS.map(p => option(p.id, p.label, current.provider)).join('')}
          </select>
        </div>
        <div class="field">
          <label for="model">${esc(t('set.model'))}</label>
          <input type="text" id="model" value="${esc(current.model)}" autocomplete="off">
        </div>
      </div>
      <div class="field" style="max-width:640px">
        <label for="api-key">${esc(t('set.apiKey'))}</label>
        <input type="password" id="api-key" placeholder="${current.provider === 'anthropic' ? 'sk-ant-…' : 'AIza…'}" value="${esc(current.apiKey)}">
      </div>
      <div class="btn-row">
        <button class="btn" id="save-key">${esc(t('common.save'))}</button>
        <button class="btn btn-quiet" id="clear-key">${esc(t('set.removeKey'))}</button>
        <span class="field-hint" style="margin:0" id="key-note"></span>
      </div>
      <p class="field-hint">${t('set.keyHint')}</p>
    </div>` : ''}

    <div class="prose block">
      <h2 class="section-title">${esc(t('set.erase'))}</h2>
      <p class="muted">${esc(t('set.eraseNote'))}</p>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn btn-quiet btn-danger" id="wipe">${esc(t('set.eraseAll'))}</button>
      </div>
    </div>`;

  const note = root.querySelector('#backup-note');
  const profileNote = root.querySelector('#profile-note');

  /* Switching language redraws everything, including the masthead. */
  root.querySelectorAll('input[name="lang"]').forEach(radio => {
    radio.onchange = async () => {
      if (!radio.checked) return;
      applyLang(radio.value);
      await store.setLangPref(radio.value);
      rerender();
    };
  });

  root.querySelector('#copy-briefing').onclick = async () => {
    const briefingNote = root.querySelector('#briefing-note');
    try {
      const { copied, text } = await copyBriefing();
      const words = text.split(/\s+/).length;
      briefingNote.textContent = copied
        ? t('set.briefingCopied', { n: words })
        : t('set.briefingClipboardFailed');
    } catch (err) {
      briefingNote.textContent = err.message;
    }
  };

  root.querySelector('#download-briefing').onclick = async () => {
    try {
      await downloadBriefing();
      root.querySelector('#briefing-note').textContent = t('set.briefingSaved');
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
      root.querySelector('#profile-note').textContent = t('set.profileAdded', { name: created.name });
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
      const tally = tallies[id] || { products: 0, assessments: 0 };
      if (!confirm(t('set.confirmRemoveProfile', {
        name: person.name, products: tally.products, readings: tally.assessments
      }))) return;
      try {
        await store.deleteProfile(id);
        await redraw();
        root.querySelector('#profile-note').textContent = t('set.profileRemoved', { name: person.name });
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
    note.textContent = t('set.exported', { n: data.products.length })
      + (data._keyOmitted ? t('set.keyOmitted') : '');
  };

  const fileInput = root.querySelector('#import');
  root.querySelector('#import-btn').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!confirm(t('set.confirmImport'))) {
      fileInput.value = '';
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      const counts = await store.importAll(data);
      const message = t('set.restored', {
        products: counts.products, assessments: counts.assessments, profiles: counts.profiles });
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
      root.querySelector('#key-note').textContent = t('common.saved');
      await settings(root);
    };
    root.querySelector('#clear-key').onclick = async () => {
      await store.setSettings({ ...current, apiKey: '' });
      await settings(root);
      root.querySelector('#key-note').textContent = t('set.keyRemoved');
    };
    /* Switching provider swaps the sensible default model with it. */
    root.querySelector('#provider').onchange = e => {
      const field = root.querySelector('#model');
      field.value = e.target.value === 'anthropic' ? 'claude-opus-5' : 'gemini-3.6-flash';
    };
  }

  root.querySelector('#wipe').onclick = async () => {
    if (!confirm(t('set.confirmErase'))) return;
    if (!confirm(t('set.confirmErase2'))) return;
    await store.wipe();
    location.hash = '#/';
  };
}
