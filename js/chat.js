/* The floating chat panel.

   Mounted once, opens over whatever view you are on, and carries the active
   profile's shelf, routine and latest reading as context — plus the product you
   happen to be looking at, which is the reason it floats rather than living on
   its own page. History is kept per profile. */

import * as store from './store.js';
import { chatStream, shelfDigest, routineDigest, aiSettings } from './ai.js';
import { esc, dots } from './views.js';
import { t } from './i18n.js';

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
    ? history.map(turn => `
        <div class="chat-turn chat-${turn.role}">
          <div class="chat-who">${esc(turn.role === 'user' ? t('chat.you') : t('chat.reply'))}</div>
          <div class="chat-text">${turn.pending && !turn.text
            ? dots()
            : esc(turn.text).replace(/\n/g, '<br>')}</div>
        </div>`).join('')
    : `<p class="muted" style="font-size:13px">${esc(t('chat.empty'))}</p>`;

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
    if (!streamed) history[index].text = t('chat.noReply');
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
  relabel();
  const { apiKey } = await aiSettings();
  el('chat-launch').hidden = !apiKey;
  if (!apiKey) el('chat-panel').hidden = true;

  const stored = await store.getChat();
  if (JSON.stringify(stored) !== JSON.stringify(history)) {
    history = Array.isArray(stored) ? stored : [];
    draw();
  }
}

/* The panel is mounted once and outlives every render, so its own furniture has
   to be re-labelled when the language changes rather than rebuilt. */
function relabel() {
  const launch = el('chat-launch');
  if (!launch) return;
  launch.setAttribute('aria-label', t('chat.launcher'));
  launch.querySelector('text').textContent = t('chat.ask');
  el('chat-panel').setAttribute('aria-label', t('chat.launcher'));
  el('chat-panel').querySelector('.label').textContent = t('chat.ask');
  el('chat-clear').textContent = t('common.clear');
  el('chat-close').textContent = t('common.close');
  el('chat-input').placeholder = t('chat.placeholder');
  el('chat-form').querySelector('button[type="submit"]').textContent = t('common.send');
  draw();
}

export function mountChat() {
  if (mounted) return;

  const holder = document.createElement('div');
  holder.innerHTML = `
    <button class="chat-launch" id="chat-launch" hidden aria-label="${esc(t('chat.launcher'))}">
      <svg viewBox="0 0 120 96" aria-hidden="true" focusable="false">
        <g class="cloud">
          <rect x="4" y="8" width="104" height="56" rx="28"/>
          <path d="M62 50 92 88 84 50z"/>
        </g>
        <text x="56" y="42">${esc(t('chat.ask'))}</text>
      </svg>
    </button>
    <section class="chat-panel" id="chat-panel" hidden aria-label="${esc(t('chat.launcher'))}">
      <header class="chat-head">
        <span class="label">${esc(t('chat.ask'))}</span>
        <span style="flex:1"></span>
        <button class="link-btn" id="chat-clear">${esc(t('common.clear'))}</button>
        <button class="link-btn" id="chat-close">${esc(t('common.close'))}</button>
      </header>
      <div class="chat-log" id="chat-log"></div>
      <form class="chat-form" id="chat-form">
        <input type="text" id="chat-input" placeholder="${esc(t('chat.placeholder'))}" autocomplete="off">
        <button class="btn" type="submit">${esc(t('common.send'))}</button>
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
