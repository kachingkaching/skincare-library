/* Gemini adapter — the current /v1beta/interactions API.

   Verified against Google's docs rather than memory, because this API changed
   shape: it is no longer models/{id}:generateContent with contents/parts.

     POST https://generativelanguage.googleapis.com/v1beta/interactions
     x-goog-api-key: <key>
     { model, system, input: [turns], tools, response_format, store }

   Text comes back at steps[type=model_output].content[type=text].text.

   `store: false` is sent on every request: it asks Google not to retain the
   interaction. It does not undo the free tier's terms, but it is the one dial
   the API gives us and there is no reason not to turn it. */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/* Free-tier model availability is not published in the docs — it is shown in
   the AI Studio dashboard — so these are defaults the user can override in
   Settings rather than assumptions baked into the code. */
export const MODELS = {
  standard: 'gemini-3.6-flash',
  fast: 'gemini-3.5-flash-lite'
};

export const PROVIDER = 'gemini';

/* ---------- shaping requests ---------- */

export function userTurn(text, image) {
  const content = [];
  if (text) content.push({ type: 'text', text });
  if (image) content.push({ type: 'image', data: image.base64, mime_type: image.mimeType });
  return { type: 'user_input', content };
}

export const modelTurn = text => ({
  type: 'model_output',
  content: [{ type: 'text', text }]
});

export const blobToBase64 = blob => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(',')[1]);
  fr.onerror = () => reject(new Error('That photograph could not be read.'));
  fr.readAsDataURL(blob);
});

/* ---------- reading responses ---------- */

export function extractText(input) {
  // Responses have been seen both bare and array-wrapped; accept either.
  const data = Array.isArray(input) ? input[0] : input;
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  return steps
    .filter(s => s.type === 'model_output')
    .flatMap(s => (Array.isArray(s.content) ? s.content : []))
    .filter(c => c.type === 'text' && typeof c.text === 'string')
    .map(c => c.text)
    .join('');
}

/* Google Search grounding returns citations as annotations on the output. */
export function extractCitations(input) {
  const data = Array.isArray(input) ? input[0] : input;
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const seen = new Map();
  for (const step of steps) {
    for (const block of (Array.isArray(step.content) ? step.content : [])) {
      for (const a of (block.annotations || [])) {
        if (a.type === 'url_citation' && a.url && !seen.has(a.url)) {
          seen.set(a.url, { url: a.url, title: a.title || a.url });
        }
      }
    }
  }
  return [...seen.values()];
}

/* Errors come back array-wrapped — [{"error":{…}}] — not as a bare object.
   Reading and phrasing them lives in errorInfo() and friendlyError() below. */

function body({ model, system, turns, tools, schema }) {
  const payload = {
    model,
    store: false,
    input: turns
  };
  if (system) payload.system_instruction = system;
  if (tools?.length) payload.tools = tools;
  if (schema) {
    payload.response_format = {
      type: 'text',
      mime_type: 'application/json',
      schema
    };
  }
  return payload;
}

/* This API is newer than my knowledge of it, and a wrong field name costs the
   user a dead feature rather than a warning. So when it tells us a parameter is
   unknown, drop that parameter and try again — folding the system prompt into
   the conversation, or asking for JSON in words, so the request still does its
   job without the field. */
const UNKNOWN_PARAM = /unknown (?:parameter|field|name)\s*['"`]?([\w.]+)['"`]?/i;

function foldSystemIntoTurns(turns, systemText) {
  if (!systemText) return turns;
  const copy = turns.map(t => ({ ...t }));
  const first = copy.find(t => t.type === 'user_input');
  if (!first) return copy;
  const preface = { type: 'text', text: `${systemText}\n\n---\n` };
  first.content = Array.isArray(first.content)
    ? [preface, ...first.content]
    : [preface, { type: 'text', text: String(first.content) }];
  return copy;
}

function askForJsonInWords(turns, schema) {
  const copy = turns.map(t => ({ ...t }));
  const last = [...copy].reverse().find(t => t.type === 'user_input');
  if (!last) return copy;
  const ask = {
    type: 'text',
    text: `\n\nReply with JSON only, inside a \`\`\`json code block, matching this shape:\n${JSON.stringify(schema)}`
  };
  last.content = Array.isArray(last.content) ? [...last.content, ask] : [{ type: 'text', text: String(last.content) }, ask];
  return copy;
}

/* Returns a new payload with `param` removed and its job done another way. */
function withoutParam(payload, param, systemText) {
  const next = { ...payload };
  if (param === 'system_instruction' || param === 'system') {
    delete next.system_instruction;
    delete next.system;
    next.input = foldSystemIntoTurns(next.input, systemText);
    return next;
  }
  if (param === 'response_format') {
    const schema = next.response_format?.schema;
    delete next.response_format;
    if (schema) next.input = askForJsonInWords(next.input, schema);
    return next;
  }
  delete next[param];
  return next;
}

async function errorInfo(response) {
  try {
    const parsed = await response.json();
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    return { message: first?.error?.message || '', status: first?.error?.status || '' };
  } catch {
    return { message: '', status: '' };
  }
}

/* One request, retried only to shed parameters this API does not know.
   Returns what it had to give up, so callers can be honest about it. */
async function send({ apiKey, payload, systemText, sse, signal }) {
  const url = sse ? `${ENDPOINT}?alt=sse` : ENDPOINT;
  let current = payload;
  const dropped = [];

  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(current),
        signal
      });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new Error('Could not reach Gemini. Check your connection.');
    }

    if (response.ok) return { response, dropped };

    const info = await errorInfo(response);

    const unknown = info.message.match(UNKNOWN_PARAM)?.[1];
    if (unknown && unknown in current) {
      dropped.push(unknown);
      current = withoutParam(current, unknown, systemText);
      continue;
    }

    /* Search grounding has its own free-tier quota, separate from ordinary
       requests — so a 429 on a grounded call often means "no search left",
       not "slow down". Shed the tool and try again; losing the web check is
       worth reporting, not worth failing over. */
    const groundingRefused = /google_search|grounding|tool/i.test(info.message);
    const quotaHit = response.status === 429 || info.status === 'RESOURCE_EXHAUSTED';
    if (current.tools && (groundingRefused || quotaHit)) {
      dropped.push('tools');
      current = { ...current };
      delete current.tools;
      continue;
    }

    throw friendlyError(response.status, info);
  }
  throw new Error('Gemini kept rejecting the request shape. Tell Claude what this says.');
}

function friendlyError(status, info) {
  const message = info.message || `Gemini returned ${status}.`;
  if (status === 400 && /api key/i.test(message)) {
    return new Error('That API key was not accepted. Check it in Settings.');
  }
  if (status === 403) {
    return new Error('That key is not allowed to use this model. Try a different model in Settings.');
  }
  if (status === 429 || info.status === 'RESOURCE_EXHAUSTED') {
    // Keep Google's own wording — "quota exceeded for grounding" and "too many
    // requests per minute" want completely different responses from you.
    return new Error(
      `Gemini’s free tier limit was hit. Google said: ${message}`
    );
  }
  if (status === 404) {
    return new Error('That model name was not recognised. Check the model in Settings.');
  }
  return new Error(message);
}

/* ---------- the two calls everything else is built from ---------- */

export async function generate({ apiKey, model = MODELS.standard, system, turns, tools, schema, signal }) {
  const { response, dropped } = await send({
    apiKey,
    payload: body({ model, system, turns, tools, schema }),
    systemText: system,
    signal
  });

  const data = await response.json();
  return {
    text: extractText(data),
    citations: extractCitations(data),
    usage: data.usage,
    dropped,
    raw: data
  };
}

/* Streaming. The chunk shape is not documented in detail, so rather than assume
   deltas are incremental we re-extract the whole text from each chunk and emit
   only what is new — correct whether the server sends deltas or running totals. */
export async function stream({ apiKey, model = MODELS.fast, system, turns, tools, onText, signal }) {
  const { response } = await send({
    apiKey,
    payload: { ...body({ model, system, turns, tools }), stream: true },
    systemText: system,
    sse: true,
    signal
  });

  /* If `stream` was dropped as an unknown parameter, or the server simply
     answered in one piece, the reply is ordinary JSON rather than SSE. Deliver
     it whole instead of hunting for `data:` lines that will never come. */
  const contentType = response.headers.get('content-type') || '';
  if (!response.body || !contentType.includes('event-stream')) {
    const data = await response.json();
    const text = extractText(data);
    if (text) onText?.(text);
    return text;
  }

  /* Streaming chunks are NOT interaction objects — they are events shaped
     { event_type: "step.delta", delta: { text: "…" } }, and the text is an
     incremental fragment. A terminal event may repeat the finished reply, so
     that is held in reserve rather than appended. */
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let complete = '';

  const consume = payload => {
    if (!payload || payload === '[DONE]') return;
    let chunk;
    try { chunk = JSON.parse(payload); } catch { return; }

    const delta = chunk.delta;
    const kind = String((delta && delta.type) || chunk.step_type || chunk.event_type || '');
    if (/thinking|reasoning/i.test(kind)) return;   // never show working-out as the reply

    let piece = '';
    if (typeof delta === 'string') piece = delta;
    else if (delta && typeof delta.text === 'string') piece = delta.text;

    if (piece) {
      text += piece;
      onText?.(piece);
      return;
    }

    const finished = extractText(chunk);
    if (finished) complete = finished;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) consume(trimmed.slice(5).trim());
    }
  }
  if (buffer.trim().startsWith('data:')) consume(buffer.trim().slice(5).trim());

  if (!text && complete) {
    text = complete;
    onText?.(complete);
  }

  /* Last resort: if the stream gave us nothing readable, ask again without
     streaming. Slower, but a working answer beats an apology. */
  if (!text) {
    const { response: plain } = await send({
      apiKey,
      payload: body({ model, system, turns, tools }),
      systemText: system,
      signal
    });
    text = extractText(await plain.json());
    if (text) onText?.(text);
  }

  if (!text) {
    throw new Error('Gemini answered but nothing readable came back. Tell Claude you saw this.');
  }
  return text;
}

/* JSON asked for via response_format still arrives as text. */
export function parseJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start > -1 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)); } catch { /* fall through */ }
    }
    throw new Error('Gemini’s reply could not be read as structured data.');
  }
}
