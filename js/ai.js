/* The four AI operations, over whichever provider is configured.

   Nothing here runs unless a key is saved in Settings. Every operation is
   written so its caller can fall back to the offline behaviour if it throws. */

import * as store from './store.js';
import * as gemini from './providers/gemini.js';
import { autofillFromLabel as anthropicReadLabel } from './autofill.js';
import { activesIn, flagsIn, TAG_LABEL } from './ingredients.js';
import { stepsFor, CONCERNS, CATEGORIES } from './rules.js';

export const PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', hint: 'Free tier, rate-limited.' },
  { id: 'anthropic', label: 'Anthropic Claude', hint: 'Paid per use.' }
];

/* Settings used to be just {apiKey} for Anthropic; keep those working. */
export async function aiSettings() {
  const raw = await store.getSettings();
  const provider = raw.provider || (raw.apiKey ? 'anthropic' : 'gemini');
  return {
    provider,
    apiKey: raw.apiKey || '',
    model: raw.model || gemini.MODELS.standard,
    chatModel: raw.chatModel || gemini.MODELS.fast,
    sendPhoto: raw.sendPhoto === true          // opt in, never assumed
  };
}

export const hasKey = async () => Boolean((await aiSettings()).apiKey);

/* ---------- compact context, so prompts stay cheap and legible ---------- */

const named = p => `${p.brand ? p.brand + ' ' : ''}${p.name}`;

export function shelfDigest(products) {
  if (!products.length) return 'The shelf is empty.';
  return products.map(p => {
    const actives = activesIn(p.ingredients || []).map(t => TAG_LABEL[t] || t);
    const flags = flagsIn(p.ingredients || []).map(t => TAG_LABEL[t] || t);
    return [
      `- id:${p.id} | ${p.category || 'Uncategorised'} | ${named(p)}`,
      actives.length ? `  actives: ${actives.join(', ')}` : '  actives: none recognised',
      flags.length ? `  watch: ${flags.join(', ')}` : null
    ].filter(Boolean).join('\n');
  }).join('\n');
}

export function routineDigest(routine, byId) {
  const lines = [];
  for (const [period, title] of [['am', 'Morning'], ['pm', 'Evening']]) {
    const steps = [];
    for (const step of stepsFor(period)) {
      for (const entry of (routine[period] || []).filter(e => e.step === step.key)) {
        const p = byId[entry.productId];
        if (p) steps.push(`  ${steps.length + 1}. ${step.label}: ${named(p)} (id:${p.id})`);
      }
    }
    lines.push(`${title}:`);
    lines.push(steps.length ? steps.join('\n') : '  nothing recorded');
  }
  return lines.join('\n');
}

const answersDigest = answers => Object.entries(answers || {})
  .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
  .join('\n') || 'not given';

/* ---------- shared framing ---------- */

const CARE = `You are helping someone with cosmetic skincare. Hold to these rules:
- This is skincare guidance, not medical advice. Never diagnose a condition.
- If something in a photograph looks like it needs a doctor rather than a product — a changing mole, a persistent or painful lesion, signs of infection — say so plainly and briefly, and do not attempt to identify it.
- Judge only what you can actually see. If lighting, focus or framing makes something impossible to assess, say so instead of guessing. Never invent detail to sound thorough.
- Recommend only from the products given to you, by their id. Do not invent products.
- Be specific about ingredients and concise in prose.`;

/* ---------- 1. read a product label ---------- */

export async function readLabel(blob) {
  const { provider, apiKey, model } = await aiSettings();
  if (!apiKey) throw new Error('No API key is configured.');

  if (provider === 'anthropic') return anthropicReadLabel(blob, apiKey);

  const schema = {
    type: 'object',
    properties: {
      brand: { type: 'string' },
      name: { type: 'string' },
      size: { type: 'string' },
      category: { type: 'string', enum: CATEGORIES },
      ingredients: { type: 'array', items: { type: 'string' } }
    },
    required: ['brand', 'name', 'size', 'category', 'ingredients']
  };

  const { text } = await gemini.generate({
    apiKey,
    model,
    system: 'Transcribe skincare packaging exactly as printed. Never invent an ingredient that is not visible. Leave any field you cannot read as an empty string or empty list.',
    turns: [gemini.userTurn(
      'Read this photograph of skincare packaging: brand, product name, size, best-fitting category, and the full ingredient list.\n\n'
      + 'The ingredient list is usually the block of small print on the back or side, often beginning with Aqua or Water. Read it carefully, in printed order, transcribing every entry even where the type is very small. If no ingredient list is visible in this photograph, return an empty list rather than recalling one for this product from memory.',
      { base64: await gemini.blobToBase64(blob), mimeType: 'image/jpeg' }
    )],
    schema
  });

  const parsed = gemini.parseJson(text);
  return {
    brand: parsed.brand || '',
    name: parsed.name || '',
    size: parsed.size || '',
    category: parsed.category || '',
    ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients.filter(Boolean) : []
  };
}

/* ---------- 1b. look the ingredients up when the pack does not show them ----

   Used whenever the photograph has no legible list, and available on demand.
   A looked-up list is less trustworthy than a transcribed one — formulations
   change and regional versions differ — so the caller is told where it came
   from and whether a real search backed it up.

   Two passes, because the free tier's search quota is separate from its
   ordinary one and runs out first. The first pass searches and is strict:
   no verified list, no answer. If search was refused outright, or came back
   empty-handed, the second pass asks the model to recall the list from its own
   training and the result is flagged `grounded: false` so every caller can say
   plainly that nobody checked it. An unchecked list the user can verify against
   their pack beats no list at all — but only if it is labelled as such. */

const INGREDIENT_SCHEMA = {
  type: 'object',
  properties: {
    ingredients: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' }
  },
  required: ['ingredients', 'note']
};

export async function lookupIngredients({ brand, name, signal }) {
  const { provider, apiKey, model } = await aiSettings();
  if (!apiKey) throw new Error('No API key is configured.');
  if (provider !== 'gemini') throw new Error('Ingredient lookup currently runs on Gemini.');

  const product = [brand, name].filter(Boolean).join(' ').trim();
  if (!product) throw new Error('A brand or product name is needed to look anything up.');

  const searched = await gemini.generate({
    apiKey,
    model,
    system: `${CARE}
You are retrieving a published INCI ingredient list for a specific product. Return the list in printed order, exactly as the manufacturer publishes it. If you cannot find a list you are confident belongs to this exact product, return an empty array rather than a plausible guess — a wrong ingredient list is worse than none.`,
    turns: [gemini.userTurn(
      `Find the full INCI ingredient list for this skincare product:\n\n${product}\n\n`
      + 'Give the ingredients in printed order. If several versions exist, use the current one and say which in "note". If you cannot find a reliable list, return an empty array.'
    )],
    tools: [{ type: 'google_search' }],
    schema: INGREDIENT_SCHEMA,
    signal
  });

  const first = gemini.parseJson(searched.text);
  const found = Array.isArray(first.ingredients) ? first.ingredients.filter(Boolean) : [];
  const grounded = !searched.dropped.includes('tools');

  if (found.length && grounded) {
    return { ingredients: found, note: first.note || '', grounded: true, sources: searched.citations };
  }

  /* No search, or search found nothing. Ask what the model remembers instead. */
  const recalled = await gemini.generate({
    apiKey,
    model,
    system: `${CARE}
You are recalling a published INCI ingredient list from your own training, without searching. The person asking already knows this is unverified and will check it against the packaging in their hand, so a good-faith recollection is useful to them. Give the list you believe is right, in printed order. Use "note" to say how confident you are and anything that would make it wrong — a reformulation, or regional versions. Only return an empty array if you genuinely do not know this product at all.`,
    turns: [gemini.userTurn(
      `From memory, what is the full INCI ingredient list for this skincare product?\n\n${product}\n\n`
      + 'Printed order. Say in "note" how sure you are and what might have changed since.'
    )],
    schema: INGREDIENT_SCHEMA,
    signal
  });

  const second = gemini.parseJson(recalled.text);
  const remembered = Array.isArray(second.ingredients) ? second.ingredients.filter(Boolean) : [];

  return {
    ingredients: remembered.length ? remembered : found,
    note: (remembered.length ? second.note : first.note) || '',
    grounded: false,
    // Distinguish "search was refused" from "search ran and found nothing" —
    // they warrant different wording to the person reading the result.
    searchRan: grounded,
    sources: searched.citations
  };
}

/* ---------- 2. read the skin, against the shelf and the routine ---------- */

const ASSESS_SCHEMA = {
  type: 'object',
  properties: {
    photoUsable: { type: 'boolean' },
    photoNote: { type: 'string' },
    observations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { area: { type: 'string' }, note: { type: 'string' } },
        required: ['area', 'note']
      }
    },
    concerns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          severity: { type: 'string', enum: ['marked', 'moderate', 'mild'] },
          evidence: { type: 'string' }
        },
        required: ['label', 'severity', 'evidence']
      }
    },
    working: { type: 'array', items: { type: 'string' } },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { change: { type: 'string' }, why: { type: 'string' } },
        required: ['change', 'why']
      }
    },
    routine: {
      type: 'object',
      properties: {
        am: { type: 'array', items: { type: 'object', properties: { step: { type: 'string' }, productId: { type: 'string' }, note: { type: 'string' } }, required: ['step', 'productId', 'note'] } },
        pm: { type: 'array', items: { type: 'object', properties: { step: { type: 'string' }, productId: { type: 'string' }, note: { type: 'string' } }, required: ['step', 'productId', 'note'] } }
      },
      required: ['am', 'pm']
    },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { category: { type: 'string' }, reason: { type: 'string' } },
        required: ['category', 'reason']
      }
    }
  },
  required: ['photoUsable', 'photoNote', 'observations', 'concerns', 'working', 'changes', 'routine', 'gaps']
};

export async function assessWithAI({ imageBlob, answers, library, routine, sendPhoto }) {
  const { provider, apiKey, model } = await aiSettings();
  if (!apiKey) throw new Error('No API key is configured.');
  if (provider !== 'gemini') throw new Error('Photo assessment currently runs on Gemini. Change the provider in Settings.');

  const byId = Object.fromEntries(library.map(p => [p.id, p]));
  const stepList = ['am', 'pm']
    .map(period => `${period}: ${stepsFor(period).map(s => s.key).join(', ')}`)
    .join('\n');

  const prompt = `${sendPhoto && imageBlob
    ? 'A photograph of my skin is attached.'
    : 'No photograph is attached — work from my answers and my shelf alone, and leave observations empty.'}

How my skin has been (my own answers):
${answersDigest(answers)}

Everything on my shelf:
${shelfDigest(library)}

The routine I currently follow:
${routineDigest(routine, byId)}

Give me:
- observations: what you can see, by area. Empty if there is no photograph.
- photoUsable / photoNote: whether the photograph is good enough to judge, and what limits it.
- concerns: what stands out, each with a severity and the evidence you based it on.
- working: which products in my current routine are earning their place, naming them.
- changes: what to add, drop or reorder — using only what I own.
- routine: a full morning and evening, each entry using one of these step keys and a productId from my shelf:
${stepList}
- gaps: what my shelf genuinely lacks, described by ingredient rather than brand.

Concern labels should come from this vocabulary where they fit: ${CONCERNS.map(c => c.label).join(', ')}.`;

  const turns = [gemini.userTurn(
    prompt,
    sendPhoto && imageBlob
      ? { base64: await gemini.blobToBase64(imageBlob), mimeType: 'image/jpeg' }
      : null
  )];

  const { text } = await gemini.generate({ apiKey, model, system: CARE, turns, schema: ASSESS_SCHEMA });
  const parsed = gemini.parseJson(text);

  /* Fold into the shape renderResult() already knows, dropping any product the
     model named that is not actually on the shelf. */
  const steps = period => (parsed.routine?.[period] || [])
    .filter(s => s.productId && byId[s.productId])
    .map(s => ({ step: labelForStep(s.step), stepKey: s.step, productId: s.productId, note: s.note || '' }));

  return {
    source: 'gemini',
    photoUsed: Boolean(sendPhoto && imageBlob),
    photoUsable: parsed.photoUsable !== false,
    photoNote: parsed.photoNote || '',
    observations: parsed.observations || [],
    working: parsed.working || [],
    changes: parsed.changes || [],
    concerns: (parsed.concerns || []).map(c => ({
      key: c.label, label: c.label, severity: c.severity || 'mild', evidence: c.evidence || ''
    })),
    routine: { am: steps('am'), pm: steps('pm') },
    gaps: parsed.gaps || [],
    caveat: sendPhoto && imageBlob
      ? 'Read by Gemini from your photograph, your answers and the ingredient lists of what you own. Cosmetic guidance, not a dermatological opinion — see a professional for anything that looks medical.'
      : 'Read by Gemini from your answers and the ingredient lists of what you own. The photograph was not sent. Cosmetic guidance, not a dermatological opinion.'
  };
}

function labelForStep(key) {
  for (const period of ['am', 'pm']) {
    const found = stepsFor(period).find(s => s.key === key);
    if (found) return found.label;
  }
  return key;
}

/* ---------- 3. chat ---------- */

export async function chatStream({ history, message, context, onText, signal }) {
  const { apiKey, chatModel } = await aiSettings();
  if (!apiKey) throw new Error('No API key is configured.');

  const turns = [];
  for (const turn of history.slice(-12)) {
    turns.push(turn.role === 'user' ? gemini.userTurn(turn.text) : gemini.modelTurn(turn.text));
  }
  turns.push(gemini.userTurn(message));

  return gemini.stream({
    apiKey,
    model: chatModel,
    system: `${CARE}\n\nYou are answering questions about this person's own skincare. Keep replies short and conversational unless asked for detail.\n\n${context}`,
    turns,
    onText,
    signal
  });
}

/* ---------- 4. monthly discoveries ---------- */

export async function discover({ library, assessment, signal }) {
  const { apiKey, model } = await aiSettings();
  if (!apiKey) throw new Error('No API key is configured.');

  const concerns = (assessment?.result?.concerns || [])
    .map(c => `${c.label} (${c.severity})`).join(', ') || 'not yet assessed';

  const prompt = `Recommend 4 Japanese or Korean skincare products I do not already own, suited to my skin.

My concerns: ${concerns}

Already on my shelf — do not recommend these or close duplicates of them:
${shelfDigest(library)}

Search for products that are currently sold, and check what is actually in them. Prefer things that fill a genuine gap rather than duplicating what I have.

For each product give:
- brand, product, kind: what it is.
- why: two sentences at most, addressed to me, saying why this one suits *my* skin in particular. Name the concern of mine it answers, and where it helps, say how it sits with something already on my shelf — filling a gap next to it, or working like something I clearly get on with. Be concrete; do not write generic marketing copy.
- actives: the ingredients that do the work.
- caution: one honest drawback or warning.
- url: where I can read about it or buy it — the brand's own product page by preference, otherwise a reputable retailer or a review that covers this exact product. Give a full https address you actually found, and leave it empty rather than inventing one.

Return JSON only, in a fenced code block:
{"items":[{"brand":"","product":"","kind":"","why":"","actives":"","caution":"","url":""}]}`;

  const { text, citations, dropped } = await gemini.generate({
    apiKey,
    model,
    system: `${CARE}\nYou are recommending products to try. Ground every recommendation in a real, currently sold product found by searching. If you cannot verify a product exists, leave it out.`,
    turns: [gemini.userTurn(prompt)],
    tools: [{ type: 'google_search' }],
    signal
  });

  const parsed = gemini.parseJson(text);
  return {
    generatedAt: new Date().toISOString(),
    items: (parsed.items || []).slice(0, 6),
    sources: citations,
    // If search was refused, these came from memory. Say so rather than let
    // them pass as web-checked.
    grounded: !dropped.includes('tools')
  };
}
