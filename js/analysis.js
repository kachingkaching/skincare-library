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
import { t, concernLabel, categoryLabel, stepLabel, tagLabel, listSep } from './i18n.js';

/* Built fresh on each call rather than held as a constant, so switching
   language re-labels the questionnaire without a reload. */
export const questions = () => [
  {
    key: 'skinType', label: t('q.skinType'), multi: false,
    options: ['dry', 'normal', 'combination', 'oily']
      .map(v => ({ value: v, label: t('q.skinType.' + v) }))
  },
  {
    key: 'sensitivity', label: t('q.sensitivity'), multi: false,
    options: ['low', 'moderate', 'high']
      .map(v => ({ value: v, label: t('q.sensitivity.' + v) }))
  },
  {
    key: 'state', label: t('q.state'), multi: false,
    options: ['settled', 'unsettled', 'irritated']
      .map(v => ({ value: v, label: t('q.state.' + v) }))
  },
  {
    key: 'texture', label: t('q.texture'), multi: false,
    options: ['smooth', 'slight', 'rough']
      .map(v => ({ value: v, label: t('q.texture.' + v) }))
  },
  {
    key: 'sun', label: t('q.sun'), multi: false,
    options: ['minimal', 'moderate', 'high']
      .map(v => ({ value: v, label: t('q.sun.' + v) }))
  },
  {
    key: 'concerns', label: t('q.concerns'), multi: true,
    options: CONCERNS.map(c => ({ value: c.key, label: concernLabel(c) }))
  }
];

const WEIGHT = { marked: 3, moderate: 2, mild: 1 };


/* ---------- reading the answers ---------- */

function readConcerns(answers) {
  const found = new Map();
  const note = (key, severity, evidence) => {
    const existing = found.get(key);
    if (existing && WEIGHT[existing.severity] >= WEIGHT[severity]) return;
    found.set(key, { key, severity, evidence });
  };

  for (const key of answers.concerns || []) {
    note(key, 'marked', t('ev.named'));
  }

  if (answers.skinType === 'dry') {
    note('dryness', 'moderate', t('ev.dryness'));
    note('dehydration', 'mild', t('ev.dehydration'));
  }
  if (answers.skinType === 'oily' || answers.skinType === 'combination') {
    note('oiliness', answers.skinType === 'oily' ? 'moderate' : 'mild', t('ev.oiliness'));
    note('pores', 'mild', t('ev.pores'));
  }
  if (answers.sensitivity === 'high') {
    note('redness', 'moderate', t('ev.redness'));
  }
  if (answers.state === 'irritated') {
    note('barrier', 'marked', t('ev.barrierMarked'));
  } else if (answers.state === 'unsettled') {
    note('barrier', 'mild', t('ev.barrierMild'));
  }
  if (answers.texture === 'rough') {
    note('texture', 'moderate', t('ev.textureRough'));
  } else if (answers.texture === 'slight') {
    note('texture', 'mild', t('ev.textureSlight'));
  }
  if (answers.sun === 'high') {
    note('pigmentation', 'mild', t('ev.sun'));
    note('lines', 'mild', t('ev.sun'));
  }

  return [...found.values()]
    .map(c => ({ ...c, label: concernLabel(c.key) }))
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
  const steps = STEPS.filter(s => s.period === period && !s.manualOnly);
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
          category: categoryLabel(step.categories[0]),
          reason: barrierFirst && step.categories[0] !== 'Sunscreen'
            ? t('gap.gentle', { step: stepLabel(step) })
            : t('gap.step', { step: stepLabel(step) })
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
        note = t('note.only', { category: categoryLabel(step.categories[0]) });
      } else if (pick.top.length) {
        note = t('note.chosenFor', { tags: pick.top.map(tagLabel).join(listSep()) });
      } else {
        note = t('note.chosenFrom', { n: ranked.length });
      }
      if (i > 0) note = t('note.layered') + note;

      out.push({ step: stepLabel(step), stepKey: step.key, productId: pick.product.id, note });
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
        category: concernLabel(def),
        reason: t('gap.concern', { tags: def.helps.slice(0, 3).map(tagLabel).join(listSep()) })
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
    caveat: t('caveat.rules')
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
