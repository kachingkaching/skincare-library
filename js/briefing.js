/* Export everything the app knows as a Markdown block you can paste into any
   assistant — Gemini, Claude, ChatGPT — alongside a photograph.

   This is the one AI path that needs no key, sends nothing by itself, and shows
   you exactly what you are sharing before you share it. It survives into the
   shared build for the same reason. */

import * as store from './store.js';
import { activesIn, flagsIn, TAG_LABEL } from './ingredients.js';
import { STATUS_LABEL, stepsFor, conflictsFor } from './rules.js';
import { QUESTIONS } from './analysis.js';

const PREAMBLE = `I'd like help with my skincare. Below is everything I own, the routine I follow, and how my skin has been behaving. I've attached a photograph of my skin.

Please:

1. Describe what you can actually see in the photograph. If the lighting, focus or framing makes something impossible to judge, say so plainly rather than guessing.
2. Tell me which products in my routine are earning their place, and why — referring to specific ingredients.
3. Suggest changes using **only what I already own**, including the order I should apply things.
4. Tell me what my shelf is genuinely missing for the concerns listed below, described by ingredient rather than by brand.

Keep this to cosmetic skincare guidance rather than medical diagnosis, and tell me if anything looks like it needs a doctor rather than a product.`;

const formatDay = iso =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const label = tag => TAG_LABEL[tag] || tag;

const named = p => `${p.brand ? p.brand + ' · ' : ''}${p.name}`;

/* The questionnaire stores option values; people read option labels. */
function answerLines(answers) {
  if (!answers) return null;
  const lines = [];
  for (const q of QUESTIONS) {
    const given = answers[q.key];
    if (!given || (Array.isArray(given) && !given.length)) continue;
    const values = Array.isArray(given) ? given : [given];
    const text = values
      .map(v => q.options.find(o => o.value === v)?.label || v)
      .join(', ');
    lines.push(`- ${q.label} **${text}**`);
  }
  return lines.length ? lines : null;
}

export async function buildBriefing() {
  const [profile, products, routine, assessments] = await Promise.all([
    store.getActiveProfile(),
    store.getProducts(),
    store.getRoutine(),
    store.getAssessments()
  ]);

  const byId = Object.fromEntries(products.map(p => [p.id, p]));
  const latest = assessments.sort((a, b) => b.date.localeCompare(a.date))[0];

  const out = [PREAMBLE, '\n---\n'];

  out.push(`# Skincare briefing — ${profile?.name || 'me'}`);
  out.push(`*Exported ${formatDay(new Date().toISOString())}*\n`);

  /* --- how the skin has been --- */
  const answers = answerLines(latest?.answers);
  if (answers) {
    out.push(`## My skin\n\nFrom a self-assessment on ${formatDay(latest.date)}:\n`);
    out.push(answers.join('\n') + '\n');
  } else {
    out.push('## My skin\n\nI have not filled in a self-assessment yet.\n');
  }

  /* --- the shelf --- */
  out.push(`## My shelf — ${products.length} ${products.length === 1 ? 'product' : 'products'}\n`);

  if (!products.length) {
    out.push('Nothing recorded yet.\n');
  } else {
    const ordered = [...products].sort((a, b) =>
      (a.category || '').localeCompare(b.category || '') || named(a).localeCompare(named(b)));

    for (const p of ordered) {
      const actives = activesIn(p.ingredients || []).map(label);
      const flags = flagsIn(p.ingredients || []).map(label);

      out.push(`### ${p.category || 'Uncategorised'} — ${named(p)}`);
      const facts = [STATUS_LABEL[p.status] || p.status, p.size, p.price].filter(Boolean);
      if (facts.length) out.push(`- ${facts.join(' · ')}`);
      out.push(`- Actives: ${actives.length ? actives.join(', ') : 'none the app recognises'}`);
      if (flags.length) out.push(`- Worth watching: ${flags.join(', ')}`);
      if (p.notes) out.push(`- My notes: ${p.notes.replace(/\s+/g, ' ')}`);
      out.push(`- Ingredients: ${(p.ingredients || []).join(', ') || 'not recorded'}\n`);
    }
  }

  /* --- the routine, in application order --- */
  out.push('## My routine\n');
  let anyStep = false;

  for (const [period, title] of [['am', 'Morning'], ['pm', 'Evening']]) {
    const lines = [];
    for (const step of stepsFor(period)) {
      for (const entry of (routine[period] || []).filter(e => e.step === step.key)) {
        const p = byId[entry.productId];
        if (p) lines.push(`${lines.length + 1}. **${step.label}** — ${named(p)}`);
      }
    }
    out.push(`### ${title}\n`);
    out.push(lines.length ? lines.join('\n') + '\n' : '_Nothing recorded._\n');
    if (lines.length) anyStep = true;
  }

  /* --- what the app has already worked out, so the assistant can build on it --- */
  if (anyStep) {
    const notes = [];
    for (const [period, title] of [['am', 'Morning'], ['pm', 'Evening']]) {
      const chosen = (routine[period] || []).map(e => byId[e.productId]).filter(Boolean);
      for (const n of conflictsFor(chosen, period)) notes.push(`- **${title}** — ${n.text}`);
    }
    if (notes.length) {
      out.push('## Layering notes the app already flagged\n');
      out.push(notes.join('\n') + '\n');
    }
  }

  return out.join('\n');
}

/* Clipboard needs a secure context; localhost counts, but fall back anyway. */
export async function copyBriefing() {
  const text = await buildBriefing();
  try {
    await navigator.clipboard.writeText(text);
    return { copied: true, text };
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    return { copied, text };
  }
}

export async function downloadBriefing() {
  const text = await buildBriefing();
  const profile = await store.getActiveProfile();
  const slug = (profile?.name || 'briefing').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const blob = new Blob([text], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `skincare-briefing-${slug}-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}
