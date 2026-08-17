/* Categories, routine order, concern mapping and layering conflicts.
   The assessment engine reads from here, and so does the routine view. */

import { tagsFor, normalize } from './ingredients.js';
import { t, dayLabel } from './i18n.js';

export const CATEGORIES = [
  'Oil cleanser', 'Cleanser', 'Exfoliant', 'Toner', 'Essence', 'Serum',
  'Treatment', 'Eye cream', 'Moisturiser', 'Face oil', 'Sunscreen',
  'Mask', 'Mist', 'Spot treatment', 'Lip care', 'Body', 'Other'
];

export const STATUSES = ['active', 'backup', 'finished', 'retired'];

export const STATUS_LABEL = {
  active: 'In use',
  backup: 'In reserve',
  finished: 'Finished',
  retired: 'Set aside'
};

/* Canonical order of application. `essential` steps produce a gap when unmet;
   `multiple` steps hold more than one product, in the order they go on. */
export const STEPS = [
  { key: 'pm-oil-cleanse', period: 'pm', label: 'First cleanse', categories: ['Oil cleanser'], essential: false },
  { key: 'am-cleanse',     period: 'am', label: 'Cleanse',       categories: ['Cleanser'], essential: true },
  { key: 'pm-cleanse',     period: 'pm', label: 'Cleanse',       categories: ['Cleanser'], essential: true },
  { key: 'pm-exfoliate',   period: 'pm', label: 'Exfoliate',     categories: ['Exfoliant'], essential: false },
  { key: 'am-tone',        period: 'am', label: 'Tone',          categories: ['Toner', 'Mist'], essential: false },
  { key: 'pm-tone',        period: 'pm', label: 'Tone',          categories: ['Toner', 'Mist'], essential: false },
  { key: 'am-essence',     period: 'am', label: 'Essence',       categories: ['Essence'], essential: false },
  { key: 'pm-essence',     period: 'pm', label: 'Essence',       categories: ['Essence'], essential: false },
  { key: 'am-treat',       period: 'am', label: 'Serum', categories: ['Serum', 'Treatment'], essential: true, multiple: true },
  { key: 'pm-treat',       period: 'pm', label: 'Serum', categories: ['Serum', 'Treatment'], essential: true, multiple: true },
  { key: 'am-eye',         period: 'am', label: 'Eye',           categories: ['Eye cream'], essential: false },
  { key: 'pm-eye',         period: 'pm', label: 'Eye',           categories: ['Eye cream'], essential: false },
  { key: 'am-moisturise',  period: 'am', label: 'Moisturise',    categories: ['Moisturiser'], essential: true },
  { key: 'pm-moisturise',  period: 'pm', label: 'Moisturise',    categories: ['Moisturiser'], essential: true },
  { key: 'pm-oil',         period: 'pm', label: 'Seal',          categories: ['Face oil'], essential: false },
  { key: 'am-protect',     period: 'am', label: 'Protect',       categories: ['Sunscreen'], essential: true }
];

export const stepsFor = period => STEPS.filter(s => s.period === period);

/* Days of the week, Monday first. A routine entry carries the days it applies
   to, so an alternated retinoid is recorded honestly rather than as if it were
   used nightly — which also stops the conflict rules crying wolf. */
export const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6];
/* Read through i18n on every call — the language can change between renders. */
export const days = () => DAY_KEYS.map(dayLabel);
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export const daysOf = entry =>
  Array.isArray(entry?.days) && entry.days.length ? entry.days : EVERY_DAY;

export const isEveryDay = entry => daysOf(entry).length === 7;

/* "Mon · Wed · Fri", or "Every day". */
export function describeDays(entry) {
  if (isEveryDay(entry)) return t('routine.everyDay');
  const chosen = daysOf(entry);
  if (!chosen.length) return t('routine.noDays');
  return chosen.slice().sort((a, b) => a - b).map(dayLabel).join(' · ');
}

/* ---------- concerns ---------- */

export const CONCERNS = [
  {
    key: 'dehydration', label: 'Dehydration',
    helps: ['humectant', 'barrier', 'ceramide', 'occlusive'],
    avoids: ['alcohol']
  },
  {
    key: 'dryness', label: 'Dryness',
    helps: ['emollient', 'occlusive', 'ceramide', 'barrier', 'humectant'],
    avoids: ['alcohol', 'surfactant']
  },
  {
    key: 'oiliness', label: 'Excess oil',
    helps: ['niacinamide', 'bha', 'anti-acne'],
    avoids: ['occlusive', 'comedogenic']
  },
  {
    key: 'blemishes', label: 'Blemishes',
    helps: ['bha', 'anti-acne', 'retinoid', 'niacinamide'],
    avoids: ['comedogenic', 'essential-oil']
  },
  {
    key: 'pigmentation', label: 'Pigmentation and marks',
    helps: ['vitamin-c', 'brightening', 'niacinamide', 'retinoid', 'aha'],
    avoids: []
  },
  {
    key: 'texture', label: 'Uneven texture',
    helps: ['aha', 'pha', 'enzyme', 'retinoid', 'bha'],
    avoids: []
  },
  {
    key: 'dullness', label: 'Dullness',
    helps: ['vitamin-c', 'aha', 'antioxidant', 'brightening'],
    avoids: []
  },
  {
    key: 'redness', label: 'Redness and reactivity',
    helps: ['soothing', 'ceramide', 'barrier'],
    avoids: ['fragrance', 'essential-oil', 'alcohol', 'aha']
  },
  {
    key: 'lines', label: 'Fine lines',
    helps: ['retinoid', 'peptide', 'vitamin-c', 'antioxidant'],
    avoids: []
  },
  {
    key: 'pores', label: 'Visible pores',
    helps: ['bha', 'retinoid', 'niacinamide'],
    avoids: ['comedogenic']
  },
  {
    key: 'barrier', label: 'Compromised barrier',
    helps: ['ceramide', 'barrier', 'soothing', 'occlusive', 'humectant'],
    avoids: ['aha', 'bha', 'retinoid', 'alcohol', 'fragrance', 'essential-oil']
  }
];

export const concernByKey = key => CONCERNS.find(c => c.key === key);

/* ---------- layering conflicts ---------- */

const hasIngredient = (product, name) =>
  (product.ingredients || []).some(i => normalize(i) === name);

const productTags = product => tagsFor(product.ingredients || []);

/* `products` are the product objects placed in one period of a routine. */
export function conflictsFor(products, period) {
  const notes = [];
  const withTag = tag => products.filter(p => productTags(p).has(tag));

  const retinoids = withTag('retinoid');
  const ahas = withTag('aha').filter(p => p.category !== 'Sunscreen');
  const bhas = withTag('bha');
  const filters = withTag('uv-filter');
  const acids = [...new Set([...ahas, ...bhas])];

  if (retinoids.length && acids.length) {
    notes.push({
      severity: 'high',
      text: t('clash.retinoidAcid', { a: retinoids[0].name, b: acids[0].name })
    });
  }
  if (ahas.length && bhas.length) {
    notes.push({
      severity: 'medium',
      text: t('clash.ahaBha')
    });
  }
  if (retinoids.length > 1) {
    notes.push({ severity: 'medium', text: t('clash.twoRetinoids') });
  }
  if (period === 'am' && (retinoids.length || acids.length)) {
    notes.push({
      severity: 'medium',
      text: t('clash.amActives')
    });
  }
  if (period === 'am' && !filters.length && products.length) {
    notes.push({ severity: 'high', text: t('clash.noSunscreen') });
  }
  const bp = products.filter(p => hasIngredient(p, 'benzoyl peroxide'));
  if (bp.length && retinoids.length) {
    notes.push({ severity: 'medium', text: t('clash.bpRetinoid') });
  }
  const vitc = withTag('vitamin-c');
  if (vitc.length && retinoids.length) {
    notes.push({ severity: 'low', text: t('clash.vitcRetinoid') });
  }
  const fragranced = withTag('fragrance').concat(withTag('essential-oil'));
  if (new Set(fragranced).size >= 3) {
    notes.push({ severity: 'low', text: t('clash.fragrance') });
  }
  return notes;
}
