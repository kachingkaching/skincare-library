/* The assessment engine.

   `assessSkin()` is the only entry point the rest of the app knows about, and
   it always returns the same shape:

     { source, concerns[], routine{am[],pm[]}, gaps[], caveat }

   Two things can fill it. Without a key, `assessFromAnswers()` runs
   deterministic rules over your questionnaire answers and the ingredient tags
   of what you own, and the photograph is never read. With a key, `assessWithAI()`
   in ai.js reads the photograph too — but only if you ticked the box — and adds
   `observations`, `working` and `changes` on top of the same shape.

   If the model call fails, the rules reading is returned with `degraded` set,
   so a bad key or a rate limit costs you detail rather than the whole page. */

import { weightedTags, tagsFor } from './ingredients.js';
import { CONCERNS, STEPS, concernByKey } from './rules.js';
import { assessWithAI, hasKey } from './ai.js';

export const QUESTIONS = [
  {
    key: 'skinType', label: 'How does your skin behave by mid-afternoon?', multi: false,
    options: [
      { value: 'dry', label: 'Tight, flaking' },
      { value: 'normal', label: 'Comfortable' },
      { value: 'combination', label: 'Shine in the centre' },
      { value: 'oily', label: 'Shine throughout' }
    ]
  },
  {
    key: 'sensitivity', label: 'How readily does it react to something new?', multi: false,
    options: [
      { value: 'low', label: 'Rarely' },
      { value: 'moderate', label: 'Sometimes' },
      { value: 'high', label: 'Often' }
    ]
  },
  {
    key: 'state', label: 'How is it at this moment?', multi: false,
    options: [
      { value: 'settled', label: 'Settled' },
      { value: 'unsettled', label: 'Unsettled' },
      { value: 'irritated', label: 'Irritated or stinging' }
    ]
  },
  {
    key: 'texture', label: 'How does the surface feel to the hand?', multi: false,
    options: [
      { value: 'smooth', label: 'Smooth' },
      { value: 'slight', label: 'Slightly uneven' },
      { value: 'rough', label: 'Rough or bumpy' }
    ]
  },
  {
    key: 'sun', label: 'How much daylight do you take on?', multi: false,
    options: [
      { value: 'minimal', label: 'Little' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'high', label: 'A great deal' }
    ]
  },
  {
    key: 'concerns', label: 'What would you most like to change?', multi: true,
    options: CONCERNS.map(c => ({ value: c.key, label: c.label }))
  }
];

const WEIGHT = { marked: 3, moderate: 2, mild: 1 };
export const SEVERITY_LABEL = { marked: 'Marked', moderate: 'Moderate', mild: 'Mild' };

/* ---------- reading the answers ---------- */

function readConcerns(answers) {
  const found = new Map();
  const note = (key, severity, evidence) => {
    const existing = found.get(key);
    if (existing && WEIGHT[existing.severity] >= WEIGHT[severity]) return;
    found.set(key, { key, severity, evidence });
  };

  for (const key of answers.concerns || []) {
    note(key, 'marked', 'You named this directly.');
  }

  if (answers.skinType === 'dry') {
    note('dryness', 'moderate', 'Skin reads tight and flaking by mid-afternoon.');
    note('dehydration', 'mild', 'Tightness usually means water loss as much as oil loss.');
  }
  if (answers.skinType === 'oily' || answers.skinType === 'combination') {
    note('oiliness', answers.skinType === 'oily' ? 'moderate' : 'mild', 'Shine returns through the day.');
    note('pores', 'mild', 'Oilier skin tends to show pores more plainly.');
  }
  if (answers.sensitivity === 'high') {
    note('redness', 'moderate', 'Skin reacts often to new products.');
  }
  if (answers.state === 'irritated') {
    note('barrier', 'marked', 'Skin is currently irritated — the barrier comes first.');
  } else if (answers.state === 'unsettled') {
    note('barrier', 'mild', 'Skin is unsettled at present.');
  }
  if (answers.texture === 'rough') {
    note('texture', 'moderate', 'The surface feels rough to the hand.');
  } else if (answers.texture === 'slight') {
    note('texture', 'mild', 'The surface feels slightly uneven.');
  }
  if (answers.sun === 'high') {
    note('pigmentation', 'mild', 'Considerable daylight exposure.');
    note('lines', 'mild', 'Considerable daylight exposure.');
  }

  return [...found.values()]
    .map(c => ({ ...c, label: concernByKey(c.key)?.label || c.key }))
    .sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity]);
}

/* ---------- scoring products against those concerns ---------- */

function scoreProduct(product, concerns) {
  const weights = weightedTags(product.ingredients || []);
  let score = 0;
  const reasons = [];

  for (const concern of concerns) {
    const def = concernByKey(concern.key);
    if (!def) continue;
    const sev = WEIGHT[concern.severity];
    for (const tag of def.helps) {
      const w = weights.get(tag);
      if (w) {
        score += sev * w;
        reasons.push({ tag, weight: sev * w });
      }
    }
    for (const tag of def.avoids) {
      const w = weights.get(tag);
      if (w) score -= sev * w * 1.5;
    }
  }
  if (product.status === 'active') score += 0.5;
  if (!product.ingredients?.length) score -= 0.5;

  const top = reasons.sort((a, b) => b.weight - a.weight).slice(0, 2).map(r => r.tag);
  return { score, top };
}

const AM_UNSUITABLE = ['retinoid', 'aha', 'bha'];
const EXFOLIATION_CONCERNS = ['texture', 'dullness', 'blemishes', 'pores', 'pigmentation'];

function buildPeriod(period, products, concerns) {
  const steps = STEPS.filter(s => s.period === period);
  const barrierFirst = concerns.some(c => c.key === 'barrier' && c.severity === 'marked');
  const wantsExfoliation =
    !barrierFirst && concerns.some(c => EXFOLIATION_CONCERNS.includes(c.key));
  const used = new Set();
  const out = [];
  const gaps = [];

  for (const step of steps) {
    if (step.key === 'pm-exfoliate' && !wantsExfoliation) continue;

    let candidates = products.filter(
      p => step.categories.includes(p.category) &&
           p.status !== 'finished' && p.status !== 'retired' &&
           !used.has(p.id)
    );

    // Acids and retinoids belong to the evening.
    if (period === 'am' && step.key !== 'am-cleanse' && step.key !== 'am-protect') {
      candidates = candidates.filter(p => {
        const tags = tagsFor(p.ingredients || []);
        return !AM_UNSUITABLE.some(t => tags.has(t));
      });
    }
    // While the barrier is repairing, leave the exfoliants and retinoids alone.
    if (barrierFirst) {
      candidates = candidates.filter(p => {
        const tags = tagsFor(p.ingredients || []);
        return !['retinoid', 'aha', 'bha'].some(t => tags.has(t));
      });
    }

    if (!candidates.length) {
      if (step.essential) {
        // Phrased without the period so a category missing morning and evening
        // is reported once rather than twice.
        gaps.push({
          category: step.categories[0],
          reason: barrierFirst && step.categories[0] !== 'Sunscreen'
            ? `Nothing on this shelf fills the ${step.label.toLowerCase()} step gently enough for skin in this state.`
            : `Nothing on this shelf covers the ${step.label.toLowerCase()} step.`
        });
      }
      continue;
    }

    const ranked = candidates
      .map(p => ({ product: p, ...scoreProduct(p, concerns) }))
      .sort((a, b) => b.score - a.score);

    // A step that holds several products may layer a second one that is
    // actually pulling its weight; every other step takes the best single.
    const picks = step.multiple
      ? ranked.filter((r, i) => i === 0 || r.score > 0).slice(0, 2)
      : ranked.slice(0, 1);

    picks.forEach((pick, i) => {
      used.add(pick.product.id);

      let note;
      if (candidates.length === 1) {
        note = `The only ${step.categories[0].toLowerCase()} on the shelf.`;
      } else if (pick.top.length) {
        note = `Chosen for its ${pick.top.join(' and ')}.`;
      } else {
        note = `Chosen from ${ranked.length} in the same category.`;
      }
      if (i > 0) note = `Layered after the first. ${note}`;

      out.push({ step: step.label, stepKey: step.key, productId: pick.product.id, note });
    });
  }

  return { steps: out, gaps };
}

/* Concerns the library has nothing at all to offer. */
function libraryGaps(products, concerns) {
  const owned = new Set();
  for (const p of products) {
    if (p.status === 'finished' || p.status === 'retired') continue;
    tagsFor(p.ingredients || []).forEach(t => owned.add(t));
  }
  const gaps = [];
  for (const concern of concerns) {
    if (concern.severity === 'mild') continue;
    const def = concernByKey(concern.key);
    if (!def) continue;
    if (!def.helps.some(t => owned.has(t))) {
      gaps.push({
        category: def.label,
        reason: `Nothing on this shelf carries the ingredients that usually address this — look for ${def.helps.slice(0, 3).join(', ')}.`
      });
    }
  }
  return gaps;
}

export function assessFromAnswers({ answers, library }) {
  const concerns = readConcerns(answers || {});
  const products = library || [];

  const am = buildPeriod('am', products, concerns);
  const pm = buildPeriod('pm', products, concerns);

  const seen = new Set();
  const gaps = [...am.gaps, ...pm.gaps, ...libraryGaps(products, concerns)]
    .filter(g => {
      const k = g.category + g.reason;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  return {
    source: 'rules',
    concerns,
    routine: { am: am.steps, pm: pm.steps },
    gaps,
    caveat:
      'This reading is derived from your answers and the ingredient lists of the products you own — the photograph is stored for your own comparison over time, not analysed. It is a considered starting point, not a dermatological opinion.'
  };
}

/* ---------- the single entry point ---------- */

export async function assessSkin({ imageBlob, answers, library, routine, sendPhoto } = {}) {
  if (await hasKey()) {
    try {
      return await assessWithAI({ imageBlob, answers, library, routine: routine || { am: [], pm: [] }, sendPhoto });
    } catch (err) {
      // A reading you can act on beats an error page, so fall back to the rules
      // and say plainly that is what happened.
      const fallback = assessFromAnswers({ answers, library });
      fallback.degraded = err.message;
      return fallback;
    }
  }
  return assessFromAnswers({ answers, library });
}
