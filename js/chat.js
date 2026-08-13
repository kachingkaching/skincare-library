/* The floating chat panel.

   Mounted once, opens over whatever view you are on, and carries the active
   profile's shelf, routine and latest reading as context — plus the product you
   happen to be looking at, which is the reason it floats rather than living on
   its own page. History is kept per profile. */

import * as store from './store.js';
import { chatStream, shelfDigest, routineDigest, aiSettings } from './ai.js';
import { esc, dots } from './views.js';

let history = [];
let busy = false;
let mounted = false;

const el = id => document.getElementById(id);

/* What the model is told about you, rebuilt per message so it never goes stale. */
async function buildContext() {
  const [profile, products, routine, assessments] = await Promise.all([
    store.getActiveProfile(), store.getProducts(), store.getRoutine(), store.getAssessments()
  ]);
  const byId = Object.fromEntries(products.map(p => [p.id, p]));
  const latest = assessments.sort((a, b) => b.date.localeCompare(a.date))[0];

  const parts = [
    `This is ${profile?.name || 'the user'}'s own skincare library.`,
    `Their shelf:\n${shelfDigest(products)}`,
    `Their routine:\n${routineDigest(routine, byId)}`
  ];

  if (latest?.result?.concerns?.length) {
    parts.push(`Their most recent reading flagged: ${latest.result.concerns
      .map(c => `${c.label} (${c.severity})`).join(', ')}.`);
  }

  const onProduct = location.hash.match(/^#\/product\/(.+)$/);
  if (onProduct && byId[onProduct[1]]) {
    const p = byId[onProduct[1]];
    parts.push(`They are currently looking at: ${p.brand ? p.brand + ' ' : ''}${p.name} (id:${p.id}).`);
  }

  return parts.join('\n\n');
}

function draw() {
  const log = el('chat-log');
  if (!log) return;

  log.innerHTML = history.length
    ? history.map(t => `
        <div class="chat-turn chat-${t.role}">
          <div class="chat-who">${t.role === 'user' ? 'You' : 'Reply'}</div>
          <div class="chat-text">${t.pending && !t.text
            ? dots()
            : esc(t.text).replace(/\n/g, '<br>')}</div>
        </div>`).join('')
    : `<p class="muted" style="font-size:13px">Ask about anything on your shelf — whether two
       things clash, what to use when your skin is unhappy, what a particular ingredient is for.
       It can see your shelf and your routine.</p>`;

  log.scrollTop = log.scrollHeight;
}

async function send() {
  const field = el('chat-input');
  const message = field.value.trim();
  if (!message || busy) return;

  busy = true;
  field.value = '';
  history.push({ role: 'user', text: message });
  history.push({ role: 'model', text: '', pending: true });
  draw();

  const index = history.length - 1;
  let streamed = '';

  try {
    const context = await buildContext();
    await chatStream({
      history: history.slice(0, -2),
      message,
      context,
      onText: piece => {
        streamed += piece;
        history[index].text = streamed;
        history[index].pending = false;
        draw();
      }
    });
    if (!streamed) history[index].text = 'No reply came back.';
  } catch (err) {
    history[index].text = err.message;
  } finally {
    busy = false;
    history[index].pending = false;
    draw();
    await store.setChat(history);
  }
}

/* Called on every render: shows the launcher only when it can actually work,
   and reloads history when the profile changes underneath it. */
export async function refreshChat() {
  if (!mounted) return;
  const { apiKey } = await aiSettings();
  el('chat-launch').hidden = !apiKey;
  if (!apiKey) el('chat-panel').hidden = true;

  const stored = await store.getChat();
  if (JSON.stringify(stored) !== JSON.stringify(history)) {
    history = Array.isArray(stored) ? stored : [];
    draw();
  }
}

export function mountChat() {
  if (mounted) return;

  const holder = document.createElement('div');
  holder.innerHTML = `
    <button class="chat-launch" id="chat-launch" hidden>Ask</button>
    <section class="chat-panel" id="chat-panel" hidden aria-label="Ask about your skincare">
      <header class="chat-head">
        <span class="label">Ask</span>
        <span style="flex:1"></span>
        <button class="link-btn" id="chat-clear">Clear</button>
        <button class="link-btn" id="chat-close">Close</button>
      </header>
      <div class="chat-log" id="chat-log"></div>
      <form class="chat-form" id="chat-form">
        <input type="text" id="chat-input" placeholder="Ask a question" autocomplete="off">
        <button class="btn" type="submit">Send</button>
      </form>
    </section>`;
  document.body.appendChild(holder);
  mounted = true;

  el('chat-launch').onclick = () => {
    el('chat-panel').hidden = false;
    el('chat-launch').hidden = true;
    el('chat-input').focus();
  };
  el('chat-close').onclick = () => {
    el('chat-panel').hidden = true;
    el('chat-launch').hidden = false;
  };
  el('chat-clear').onclick = async () => {
    history = [];
    await store.setChat(history);
    draw();
  };
  el('chat-form').onsubmit = ev => { ev.preventDefault(); send(); };

  draw();
}
