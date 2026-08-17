/* Optional: read a product label with Claude's vision.

   This is the only part of the app that talks to a network. It is hidden
   entirely unless you have saved an API key under Settings, and it calls the
   Anthropic API straight from this page — which is why the
   anthropic-dangerous-direct-browser-access header is required. That is a
   reasonable trade for a private tool on your own machine and not something to
   do on a hosted site: the key sits in this browser's storage. */

import { CATEGORIES } from './rules.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5';

const SCHEMA = {
  type: 'object',
  properties: {
    brand: { type: 'string', description: 'Brand name as printed. Empty string if not visible.' },
    name: { type: 'string', description: 'Product name as printed. Empty string if not visible.' },
    size: { type: 'string', description: 'Volume or weight, e.g. "50 ml". Empty string if not visible.' },
    category: { type: 'string', enum: CATEGORIES, description: 'Best-fitting category. "Other" if unclear.' },
    ingredients: {
      type: 'array',
      items: { type: 'string' },
      description: 'The INCI list in printed order, one entry per ingredient. Empty array if no list is legible.'
    }
  },
  required: ['brand', 'name', 'size', 'category', 'ingredients'],
  additionalProperties: false
};

const PROMPT = `Read this photograph of skincare packaging and transcribe what is printed on it.

Transcribe the ingredient list exactly as printed, in order, without correcting
spellings or expanding abbreviations. If part of the list is cut off or
illegible, include only what you can actually read. Never invent an ingredient
that is not visible in the image, and leave any field you cannot read empty.`;

const toBase64 = blob => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(',')[1]);
  fr.onerror = () => reject(new Error('That photograph could not be read.'));
  fr.readAsDataURL(blob);
});

export async function autofillFromLabel(blob, apiKey) {
  if (!apiKey) throw new Error('No API key is configured.');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA }
      },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await toBase64(blob) } },
          { type: 'text', text: PROMPT }
        ]
      }]
    })
  }).catch(() => {
    throw new Error('Could not reach the Anthropic API. Check your connection.');
  });

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body?.error?.message || detail;
    } catch { /* keep the status code */ }
    throw new Error(`The API refused the request: ${detail}`);
  }

  const data = await res.json();

  if (data.stop_reason === 'refusal') {
    throw new Error('Claude declined to read that image. Enter the details by hand.');
  }
  if (data.stop_reason === 'max_tokens') {
    throw new Error('The ingredient list was too long to finish reading. Enter it by hand.');
  }

  const text = (data.content || []).find(b => b.type === 'text')?.text;
  if (!text) throw new Error('Nothing legible came back from the label.');

  try {
    const parsed = JSON.parse(text);
    return {
      brand: parsed.brand || '',
      name: parsed.name || '',
      size: parsed.size || '',
      category: parsed.category || '',
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients.filter(Boolean) : [],
      // This reader does not count units; one is the safe answer.
      count: 1
    };
  } catch {
    throw new Error('The reply could not be read as product details.');
  }
}
