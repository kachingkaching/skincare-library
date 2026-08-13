/* Hash router and boot. */

import * as store from './store.js';
import * as views from './views.js';
import { mountChat, refreshChat } from './chat.js';

const root = document.getElementById('view');
const nav = document.getElementById('nav');
const count = document.getElementById('colophon-count');

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

async function render() {
  const { head, id } = parseHash();
  const route = ROUTES[head];

  views.releaseUrls();
  await store.ensureProfile();     // there is always somewhere to put things
  await views.profileBar();

  if (!route) {
    root.innerHTML = `<div class="empty"><p>There is nothing at that address.</p>
      <a class="btn" href="#/">Return to the shelf</a></div>`;
    return;
  }

  nav.querySelectorAll('a').forEach(a =>
    a.classList.toggle('is-active', a.dataset.route === route.nav));

  try {
    await route.view(root, { id });
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="empty">
      <p>Something went wrong rendering this page: ${views.esc(err.message)}</p>
      <a class="btn" href="#/">Return to the shelf</a></div>`;
  }

  window.scrollTo({ top: 0 });
  refreshCount();
  refreshChat();
}

async function refreshCount() {
  const products = await store.getProducts();
  count.textContent = products.length
    ? `${products.length} ${products.length === 1 ? 'product' : 'products'}`
    : '';
}

views.onRerender(render);
mountChat();
window.addEventListener('hashchange', render);
render();
