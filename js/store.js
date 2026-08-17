/* IndexedDB wrapper. Everything the app persists goes through here.

   Products, assessments and routines belong to a profile, so the whole family
   can share one browser. Reads are scoped to whichever profile is active — the
   views mostly don't need to know profiles exist. Photographs and the API key
   are the exceptions: images are referenced by id, and the key is a property of
   the machine rather than of a person. */

import { stepsFor, EVERY_DAY } from './rules.js';

const DB_NAME = 'skincare';
const DB_VERSION = 2;
const STORES = ['products', 'images', 'assessments', 'profiles', 'meta'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = event => {
      const db = req.result;
      const tx = req.transaction;

      if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('assessments')) db.createObjectStore('assessments', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });

      /* v1 → v2: everything already recorded belonged to one person. */
      if (event.oldVersion >= 1 && event.oldVersion < 2) {
        const id = uid();
        tx.objectStore('profiles').put({ id, name: 'You', createdAt: new Date().toISOString() });

        for (const name of ['products', 'assessments']) {
          tx.objectStore(name).openCursor().onsuccess = e => {
            const cursor = e.target.result;
            if (!cursor) return;
            const value = cursor.value;
            if (!value.profileId) {
              value.profileId = id;
              cursor.update(value);
            }
            cursor.continue();
          };
        }

        const meta = tx.objectStore('meta');
        const existing = meta.get('routine');
        existing.onsuccess = () => {
          if (existing.result) {
            meta.put({ key: routineKey(id), value: existing.result.value });
            meta.delete('routine');
          }
        };
        meta.put({ key: 'activeProfile', value: id });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    if (req) {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      tx.oncomplete = () => resolve();
    }
  }));
}

export const uid = () =>
  Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);

export const get = (store, key) => request(store, 'readonly', s => s.get(key));
export const getAll = store => request(store, 'readonly', s => s.getAll());
export const put = (store, value) => request(store, 'readwrite', s => s.put(value));
export const del = (store, key) => request(store, 'readwrite', s => s.delete(key));
export const clear = store => request(store, 'readwrite', s => s.clear());

/* ---------- meta ---------- */

async function getMeta(key, fallback) {
  const rec = await get('meta', key);
  return rec ? rec.value : fallback;
}

const setMeta = (key, value) => put('meta', { key, value });

function routineKey(profileId) {
  return 'routine:' + profileId;
}

const entryProductId = e => (typeof e === 'string' ? e : e && e.productId);

/* Routines were once a flat list of product ids, one per step. They are now
   {step, productId} entries so a step can hold several products in the order
   they go on. Old lists are matched back onto steps by category — the same rule
   the routine view used to apply when it read them. */
function migrateEntries(entries, period, byId) {
  const kept = [];
  const legacy = [];
  let changed = false;

  for (const e of entries || []) {
    if (typeof e === 'string') { legacy.push(e); changed = true; }
    else if (e && e.productId) {
      // Entries written before the week view applied every day.
      if (!Array.isArray(e.days)) changed = true;
      kept.push({
        step: e.step || null,
        productId: e.productId,
        days: Array.isArray(e.days) ? e.days : [...EVERY_DAY]
      });
    }
  }

  for (const step of stepsFor(period)) {
    const idx = legacy.findIndex(id => byId[id] && step.categories.includes(byId[id].category));
    if (idx > -1) kept.push({ step: step.key, productId: legacy.splice(idx, 1)[0], days: [...EVERY_DAY] });
  }
  // Anything that matched no step still belongs to the person; keep it unplaced.
  for (const id of legacy) if (byId[id]) kept.push({ step: null, productId: id, days: [...EVERY_DAY] });

  return { entries: kept, changed };
}

/* ---------- profiles ---------- */

export const getProfiles = async () =>
  (await getAll('profiles')).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

export const getActiveProfileId = () => getMeta('activeProfile', null);
export const setActiveProfileId = id => setMeta('activeProfile', id);

export const saveProfile = p => put('profiles', p);

export async function getActiveProfile() {
  const id = await getActiveProfileId();
  return (await getProfiles()).find(p => p.id === id) || null;
}

export async function createProfile(name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('A profile needs a name.');
  const existing = await getProfiles();
  if (existing.some(p => p.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`There is already a profile called ${clean}.`);
  }
  const profile = { id: uid(), name: clean, createdAt: new Date().toISOString() };
  await put('profiles', profile);
  return profile;
}

export async function renameProfile(id, name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('A profile needs a name.');
  const profiles = await getProfiles();
  if (profiles.some(p => p.id !== id && p.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`There is already a profile called ${clean}.`);
  }
  const profile = profiles.find(p => p.id === id);
  if (!profile) throw new Error('That profile no longer exists.');
  await put('profiles', { ...profile, name: clean });
}

/* Removing a profile takes its shelf, its photographs and its readings with it. */
export async function deleteProfile(id) {
  const profiles = await getProfiles();
  if (profiles.length <= 1) throw new Error('At least one profile has to remain.');

  for (const p of (await getAll('products')).filter(x => x.profileId === id)) {
    if (p.imageId) await del('images', p.imageId).catch(() => {});
    await del('products', p.id);
  }
  for (const a of (await getAll('assessments')).filter(x => x.profileId === id)) {
    if (a.photoId) await del('images', a.photoId).catch(() => {});
    await del('assessments', a.id);
  }
  await del('meta', routineKey(id));
  await del('meta', 'chat:' + id);
  await del('meta', 'picks:' + id);
  await del('profiles', id);

  if (await getActiveProfileId() === id) {
    await setActiveProfileId(profiles.find(p => p.id !== id).id);
  }
}

/* Called on every render — guarantees there is always somewhere to put things. */
export async function ensureProfile() {
  const profiles = await getProfiles();
  if (!profiles.length) {
    const profile = { id: uid(), name: 'You', createdAt: new Date().toISOString() };
    await put('profiles', profile);
    await setActiveProfileId(profile.id);
    return profile;
  }
  const active = await getActiveProfileId();
  if (!active || !profiles.some(p => p.id === active)) {
    await setActiveProfileId(profiles[0].id);
    return profiles[0];
  }
  return profiles.find(p => p.id === active);
}

/* How much each profile is holding — for the settings list. */
export async function profileTallies() {
  const [products, assessments] = await Promise.all([getAll('products'), getAll('assessments')]);
  const tally = {};
  for (const p of products) {
    tally[p.profileId] = tally[p.profileId] || { products: 0, assessments: 0 };
    tally[p.profileId].products++;
  }
  for (const a of assessments) {
    tally[a.profileId] = tally[a.profileId] || { products: 0, assessments: 0 };
    tally[a.profileId].assessments++;
  }
  return tally;
}

/* ---------- products (scoped to the active profile) ---------- */

/* Quantity arrived after the first shelves were built, so every record written
   before it has none. Normalised on the way out rather than by a migration
   pass: an old backup can still be imported, and a product nobody has counted
   yet is one product. */
const withQuantity = p => (p && !Number.isFinite(p.quantity) ? { ...p, quantity: 1 } : p);

export async function getProducts() {
  const pid = await getActiveProfileId();
  return (await getAll('products')).filter(p => p.profileId === pid).map(withQuantity);
}

/* Two bottles of the same serum are one record with a count, not two records.
   Matched on brand and name only — size and price are exactly what differs
   between a full-size and a travel one, and those should stay apart. */
const matchKey = (brand, name) =>
  `${(brand || '').trim().toLowerCase().replace(/\s+/g, ' ')}|${(name || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;

export async function findProductLike(brand, name) {
  if (!(name || '').trim()) return null;
  const key = matchKey(brand, name);
  return (await getProducts()).find(p => matchKey(p.brand, p.name) === key) || null;
}

/* Clamped at zero, and an emptied product marks itself finished rather than
   disappearing — its ingredients and its history are still referred to by past
   assessments and by the routine. */
export async function setQuantity(id, quantity) {
  const p = withQuantity(await getProduct(id));
  if (!p) return null;
  const next = Math.max(0, Math.round(Number(quantity) || 0));
  p.quantity = next;
  if (next === 0 && p.status === 'active') p.status = 'finished';
  if (next > 0 && p.status === 'finished') p.status = 'active';
  p.updatedAt = new Date().toISOString();
  await put('products', p);
  return p;
}

export const getProduct = async id => withQuantity(await get('products', id));

export async function saveProduct(p) {
  if (!p.profileId) p.profileId = await getActiveProfileId();
  return put('products', p);
}

export async function deleteProduct(id) {
  const product = await getProduct(id);
  if (product?.imageId) await del('images', product.imageId).catch(() => {});
  await del('products', id);

  // Drop it from that profile's routine so we never point at a product that is gone.
  if (product) {
    const routine = await getMeta(routineKey(product.profileId), { am: [], pm: [] });
    const am = (routine.am || []).filter(e => entryProductId(e) !== id);
    const pm = (routine.pm || []).filter(e => entryProductId(e) !== id);
    if (am.length !== (routine.am || []).length || pm.length !== (routine.pm || []).length) {
      await setMeta(routineKey(product.profileId), { am, pm });
    }
  }
}

/* One bottle, two people — copy the record rather than sharing it. */
export async function copyProductToProfile(productId, targetProfileId) {
  const product = await getProduct(productId);
  if (!product) throw new Error('That product is no longer in the library.');

  const blob = await getImage(product.imageId);
  const copy = {
    ...product,
    id: uid(),
    profileId: targetProfileId,
    imageId: blob ? await putImage(blob) : null,
    // The same bottle on two shelves is still one bottle — carrying the count
    // across would double it.
    quantity: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await put('products', copy);
  return copy;
}

/* ---------- images ---------- */

export async function putImage(blob) {
  const id = uid();
  await put('images', { id, blob });
  return id;
}

export async function getImage(id) {
  if (!id) return null;
  const rec = await get('images', id);
  return rec ? rec.blob : null;
}

/* Downscale on the way in — phone photos are far larger than this UI needs. */
export function resizeImage(file, maxEdge = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Could not encode image.'))),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

/* ---------- routine (per profile) ---------- */

export async function getRoutine() {
  const pid = await getActiveProfileId();
  const raw = await getMeta(routineKey(pid), { am: [], pm: [] });
  const byId = Object.fromEntries((await getAll('products')).map(p => [p.id, p]));

  const am = migrateEntries(raw.am, 'am', byId);
  const pm = migrateEntries(raw.pm, 'pm', byId);
  const routine = { am: am.entries, pm: pm.entries };

  if (am.changed || pm.changed) await setMeta(routineKey(pid), routine);
  return routine;
}

export async function setRoutine(r) {
  return setMeta(routineKey(await getActiveProfileId()), r);
}

/* ---------- chat and discoveries (per profile) ---------- */

export const getChat = async () => getMeta('chat:' + (await getActiveProfileId()), []);
export const setChat = async v => setMeta('chat:' + (await getActiveProfileId()), v);

export const getPicks = async () => getMeta('picks:' + (await getActiveProfileId()), null);
export const setPicks = async v => setMeta('picks:' + (await getActiveProfileId()), v);

/* ---------- settings (shared across profiles) ---------- */

export const getSettings = () => getMeta('settings', { apiKey: '' });
export const setSettings = s => setMeta('settings', s);

/* Interface language. Kept apart from settings so it survives clearing a key,
   and shared across profiles — it belongs to the person at the browser. */
export const getLangPref = () => getMeta('lang', null);
export const setLangPref = v => setMeta('lang', v);

/* ---------- assessments (scoped to the active profile) ---------- */

export async function getAssessments() {
  const pid = await getActiveProfileId();
  return (await getAll('assessments')).filter(a => a.profileId === pid);
}

export async function saveAssessment(a) {
  if (!a.profileId) a.profileId = await getActiveProfileId();
  return put('assessments', a);
}

export async function deleteAssessment(id) {
  const rec = await get('assessments', id);
  if (rec?.photoId) await del('images', rec.photoId).catch(() => {});
  await del('assessments', id);
}

/* ---------- backup ---------- */

const blobToDataUrl = blob => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = () => reject(fr.error);
  fr.readAsDataURL(blob);
});

const dataUrlToBlob = url => fetch(url).then(r => r.blob());

/* A backup covers every profile, not just the one you are looking at. */
export async function exportAll() {
  const [products, images, assessments, profiles, settings, activeProfile] = await Promise.all([
    getAll('products'), getAll('images'), getAll('assessments'),
    getProfiles(), getSettings(), getActiveProfileId()
  ]);

  const routines = {};
  for (const p of profiles) {
    routines[p.id] = await getMeta(routineKey(p.id), { am: [], pm: [] });
  }

  const encoded = [];
  for (const rec of images) {
    encoded.push({ id: rec.id, dataUrl: await blobToDataUrl(rec.blob) });
  }

  // The API key is deliberately left out of backups.
  return {
    format: 'skincare-library',
    version: 2,
    exportedAt: new Date().toISOString(),
    profiles,
    activeProfile,
    products,
    images: encoded,
    assessments,
    routines,
    settings: { apiKey: '' },
    _keyOmitted: Boolean(settings.apiKey)
  };
}

export async function importAll(data, { replace = true } = {}) {
  if (!data || data.format !== 'skincare-library') {
    throw new Error('That file is not a Skincare Library backup.');
  }

  let profiles = data.profiles || [];
  let products = data.products || [];
  let assessments = data.assessments || [];
  let routines = data.routines || {};
  let active = data.activeProfile;

  /* A backup written before profiles existed: everything was one person's. */
  if (!profiles.length) {
    const id = uid();
    profiles = [{ id, name: 'You', createdAt: new Date().toISOString() }];
    products = products.map(p => ({ ...p, profileId: id }));
    assessments = assessments.map(a => ({ ...a, profileId: id }));
    routines = { [id]: data.routine || { am: [], pm: [] } };
    active = id;
  }

  if (replace) {
    await Promise.all([
      clear('products'), clear('images'), clear('assessments'), clear('profiles')
    ]);
    for (const row of await getAll('meta')) {
      if (String(row.key).startsWith('routine:')) await del('meta', row.key);
    }
  }

  for (const rec of data.images || []) {
    await put('images', { id: rec.id, blob: await dataUrlToBlob(rec.dataUrl) });
  }
  for (const p of profiles) await put('profiles', p);
  for (const p of products) await put('products', p);
  for (const a of assessments) await put('assessments', a);
  for (const [id, routine] of Object.entries(routines)) {
    await setMeta(routineKey(id), routine);
  }
  await setActiveProfileId(
    active && profiles.some(p => p.id === active) ? active : profiles[0].id
  );

  return {
    profiles: profiles.length,
    products: products.length,
    assessments: assessments.length
  };
}

export async function wipe() {
  await Promise.all(STORES.map(clear));
}
