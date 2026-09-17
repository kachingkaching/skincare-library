/* Hash router and boot. */

import * as store from './store.js';
import * as views from './views.js';
import { mountChat, refreshChat } from './chat.js';
import { LANGS, t, plural, lang, chooseLang, applyLang } from './i18n.js';

const root = document.getElementById('view');
const nav = document.getElementById('nav');
const tabbar = document.getElementById('tabbar');
const count = document.getElementById('colophon-count');

/* The phone bar carries the four things you reach for daily. Everything else
   lives behind More, which is where six flat items had been costing two rows
   of screen before any content appeared. */
const TABS = [
  { route: 'shelf', key: 'nav.shelf' },
  { route: 'routine', key: 'nav.routine' },
  { route: 'add', key: 'nav.addShort' },
  { route: 'assess', key: 'nav.assessShort' }
];

const MORE = [
  { route: 'discoveries', href: '#/discoveries', key: 'nav.discoverShort' },
  { route: 'settings', href: '#/settings', key: 'nav.settings' }
];

/* Which section the current route belongs to, so the drawer can mark itself. */
let currentNav = '';

const ROUTES = {
  '':        { view: views.shelf,    nav: 'shelf' },
  'product': { view: views.product,  nav: 'shelf' },
  'add':     { view: views.form,     nav: 'add' },
  'edit':    { view: views.form,     nav: 'shelf' },
  'assess':  { view: views.assess,   nav: 'assess' },
  'routine': { view: views.routine,  nav: 'routine' },
  'discoveries': { view: views.discoveries, nav: 'discoveries' },
  'settings':{ view: views.settings, nav: 'settings' }
};

function parseHash() {
  const [head, id] = location.hash.replace(/^#\/?/, '').split('/');
  return { head: head || '', id: id ? decodeURIComponent(id) : undefined };
}

/* The masthead is in index.html rather than in a view, so it is relabelled
   here — everything outside <main> passes through this. */
function chrome() {
  document.title = t('app.title');
  document.querySelector('.wordmark').textContent = t('app.wordmark');
  document.getElementById('profile-select').setAttribute('aria-label', t('chrome.whoseShelf'));
  document.getElementById('colophon-note').textContent = t('chrome.colophon');
  nav.querySelectorAll('a[data-route]').forEach(a => {
    a.textContent = t('nav.' + a.dataset.route);
  });

  TABS.forEach(tab => {
    const el = tabbar.querySelector(`[data-tab="${tab.route}"]`);
    if (el) el.textContent = t(tab.key);
  });
  document.getElementById('more-btn').textContent = t('nav.more');

  drawLangButton();
}

/* The drawer is rebuilt each time it opens, so it picks up the language and
   marks whichever section you are actually in. */
function openMore(activeRoute) {
  const inner = document.getElementById('more-inner');
  inner.innerHTML = MORE.map(item => `
    <a class="sheet-link${item.route === activeRoute ? ' is-active' : ''}"
       href="${item.href}">${views.esc(t(item.key))}</a>`).join('');
  inner.querySelectorAll('a').forEach(a => { a.onclick = closeMore; });

  document.getElementById('more-sheet').hidden = false;
  document.getElementById('more-scrim').hidden = false;
  document.getElementById('more-btn').setAttribute('aria-expanded', 'true');
}

function closeMore() {
  const sheet = document.getElementById('more-sheet');
  if (!sheet || sheet.hidden) return;
  sheet.hidden = true;
  document.getElementById('more-scrim').hidden = true;
  document.getElementById('more-btn').setAttribute('aria-expanded', 'false');
}

function wireTabbar() {
  const button = document.getElementById('more-btn');
  button.onclick = ev => {
    ev.stopPropagation();
    const sheet = document.getElementById('more-sheet');
    sheet.hidden ? openMore(currentNav) : closeMore();
  };
  document.getElementById('more-scrim').onclick = closeMore;
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeMore(); });

  // The ingredient sheet floats over every view, so it is dismissed here.
  document.getElementById('ing-scrim').onclick = views.closeIngredient;
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') views.closeIngredient();
  });
}

/* Language lives at the right-hand end of the navigation: a button showing the
   language you are in, and a short menu of the others. */
function drawLangButton() {
  const button = document.getElementById('lang-btn');
  const menu = document.getElementById('lang-menu');
  const chosen = LANGS.find(l => l.id === lang()) || LANGS[0];

  button.textContent = chosen.short;
  button.setAttribute('aria-label', `${t('nav.language')} — ${chosen.label}`);
  button.title = t('nav.language');

  menu.innerHTML = LANGS.map(l => `
    <button class="lang-option${l.id === chosen.id ? ' is-on' : ''}" role="menuitem"
            data-lang="${l.id}" lang="${l.id}">${l.label}</button>`).join('');

  menu.querySelectorAll('[data-lang]').forEach(option => {
    option.onclick = async () => {
      closeLangMenu();
      if (option.dataset.lang === lang()) return;
      applyLang(option.dataset.lang);
      await store.setLangPref(option.dataset.lang);
      render();
    };
  });
}

function openLangMenu() {
  document.getElementById('lang-menu').hidden = false;
  document.getElementById('lang-btn').setAttribute('aria-expanded', 'true');
}

function closeLangMenu() {
  const menu = document.getElementById('lang-menu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  document.getElementById('lang-btn').setAttribute('aria-expanded', 'false');
}

function wireLangMenu() {
  const button = document.getElementById('lang-btn');
  button.onclick = ev => {
    ev.stopPropagation();
    document.getElementById('lang-menu').hidden ? openLangMenu() : closeLangMenu();
  };
  // Anywhere else, or Escape, puts it away again.
  document.addEventListener('click', closeLangMenu);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeLangMenu(); });
  document.getElementById('lang-menu').addEventListener('click', ev => ev.stopPropagation());
}

async function render() {
  const { head, id } = parseHash();
  const route = ROUTES[head];

  views.releaseUrls();
  await store.ensureProfile();     // there is always somewhere to put things
  chrome();
  await views.profileBar();

  if (!route) {
    root.innerHTML = `<div class="empty"><p>${views.esc(t('chrome.noRoute'))}</p>
      <a class="btn" href="#/">${views.esc(t('chrome.backToShelf'))}</a></div>`;
    return;
  }

  currentNav = route.nav;
  closeMore();
  views.closeIngredient();
  nav.querySelectorAll('a').forEach(a =>
    a.classList.toggle('is-active', a.dataset.route === route.nav));
  tabbar.querySelectorAll('a[data-tab]').forEach(a =>
    a.classList.toggle('is-active', a.dataset.tab === route.nav));

  try {
    await route.view(root, { id });
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="empty">
      <p>${views.esc(t('chrome.renderError', { msg: err.message }))}</p>
      <a class="btn" href="#/">${views.esc(t('chrome.backToShelf'))}</a></div>`;
  }

  window.scrollTo({ top: 0 });
  refreshCount();
  refreshChat();
}

async function refreshCount() {
  const products = await store.getProducts();
  count.textContent = products.length
    ? plural(products.length, 'chrome.countOne', 'chrome.countMany')
    : '';
}

/* Language is settled before the first render, so nothing is drawn twice. */
async function boot() {
  applyLang(chooseLang(await store.getLangPref()));
  wireLangMenu();
  wireTabbar();
  views.onRerender(render);
  mountChat();
  window.addEventListener('hashchange', render);
  render();
}

boot();
