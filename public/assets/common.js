// Shared browser helpers: API calls with the CSRF token, signed-in nav state, the More menu, cookie consent, toasts.

export function csrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  const value = meta ? meta.getAttribute('content') : '';
  if (value && value !== '__CSRF__') return value;
  const m = document.cookie.match(/(?:^|;\s*)ps_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json', ...headers } };
  if (method !== 'GET' && method !== 'HEAD') opts.headers['x-csrf-token'] = csrfToken();
  if (body !== undefined) {
    if (body instanceof FormData || body instanceof Blob) opts.body = body;
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  }
  let res;
  try { res = await fetch(path, opts); } catch (e) { return { ok: false, status: 0, data: { error: 'Network error' } }; }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

export function errorText(r, fallback = 'Something went wrong. Please try again.') {
  const d = r && r.data;
  if (!d) return fallback;
  if (typeof d.error === 'string') return d.error;
  if (d.error && d.error.message) return d.error.message;
  if (d.message) return d.message;
  return fallback;
}

// Change switches: the server lists the ids that are on in <html data-changes="...">.
export function changeOn(id) {
  return (document.documentElement.dataset.changes || '').split(/[\s,]+/).includes(id);
}

// With CHANGE_API on, products carry `title` instead of `name`.
export function productName(p) {
  return (p && (p.name ?? p.title)) || 'Product';
}

export function listOf(d, ...keys) {
  if (Array.isArray(d)) return d;
  if (!d) return [];
  for (const k of [...keys, 'items', 'data', 'results']) if (Array.isArray(d[k])) return d[k];
  return [];
}

// Money fields may arrive as `price` (units) or `priceCents`.
export function amount(obj, key) {
  if (!obj) return null;
  if (obj[key + 'Cents'] != null) return Number(obj[key + 'Cents']) / 100;
  if (obj[key] != null) return Number(obj[key]);
  return null;
}
export function money(n) {
  return n == null || Number.isNaN(n) ? '—' : '$' + Number(n).toFixed(2);
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c.nodeType ? c : String(c));
  return node;
}

export function show(node, message, kind = 'error') {
  if (!node) return;
  node.textContent = message;
  node.hidden = !message;
  node.className = 'notice notice-' + kind;
}

export function toast(message) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = el('div', { id: 'toast-host', class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const t = el('div', { class: 'toast', 'data-testid': 'toast', text: message });
  host.append(t);
  setTimeout(() => t.remove(), 4000);
}

let meCache;
export function me() {
  // ?optional=1 answers 200 {user:null} when signed out, so signed-out pages log no 401 in the console.
  if (!meCache) meCache = api('/api/me?optional=1').then((r) => (r.ok && r.data && r.data.user ? r.data.user : null));
  return meCache;
}

export function goToLogin() {
  location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
}

// Signed-out visitors are sent to /login?next=<this page>.
export async function requireSignIn() {
  const user = await me();
  if (!user) goToLogin();
  return user;
}

export function safeNext(fallback) {
  const n = new URLSearchParams(location.search).get('next');
  return n && n.startsWith('/') && !n.startsWith('//') ? n : fallback;
}

function setupDropdowns() {
  const pairs = [...document.querySelectorAll('.dropdown > button[aria-controls]')]
    .map((btn) => [btn, document.getElementById(btn.getAttribute('aria-controls'))])
    .filter(([, menu]) => menu);
  const close = (btn, menu) => { btn.setAttribute('aria-expanded', 'false'); menu.hidden = true; };
  for (const [btn, menu] of pairs) {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      for (const [b, m] of pairs) close(b, m);
      btn.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const [btn, menu] of pairs) if (!menu.hidden) { close(btn, menu); btn.focus(); }
  });
  document.addEventListener('click', (e) => {
    for (const [btn, menu] of pairs) if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) close(btn, menu);
  });
}

let catCache;
export function categories() {
  if (!catCache) catCache = api('/api/categories').then((r) => {
    const raw = r.ok ? listOf(r.data, 'categories') : [];
    return [...new Set(raw.map((c) => (typeof c === 'string' ? c : c.name || c.id)).filter(Boolean))].sort();
  });
  return catCache;
}

// Fills the "Shop" dropdown with the product categories.
async function fillCategories() {
  const menu = document.getElementById('shop-menu');
  if (!menu) return;
  const cats = await categories();
  for (const c of cats) {
    menu.append(el('li', {}, el('a', { href: '/products?category=' + encodeURIComponent(c), 'data-testid': 'nav-category' }, c)));
  }
}

function setupNav() {
  setupDropdowns();
  fillCategories();
  me().then((user) => {
    const signin = document.getElementById('nav-signin');
    const account = document.getElementById('nav-account');
    const admin = document.getElementById('nav-admin');
    const out = document.getElementById('nav-signout');
    if (user) {
      signin && (signin.hidden = true);
      account && (account.hidden = false);
      out && (out.hidden = false);
      if (admin && user.role === 'admin') admin.hidden = false;
    }
    out?.querySelector('button')?.addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      location.href = '/';
    });
  });
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function setupConsent() {
  if (getCookie('ps_consent')) return;
  const banner = el('section', { class: 'cookie-banner', id: 'cookie-banner', 'aria-label': 'Cookie consent', 'data-testid': 'cookie-banner' },
    el('p', {}, 'We use cookies to keep you signed in and, if you allow it, to remember your preferences. (Practice site: nothing is tracked.)'),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'cookie-accept', id: 'cookie-accept' }, 'Accept all'),
      el('button', { type: 'button', class: 'btn', 'data-testid': 'cookie-reject', id: 'cookie-reject' }, 'Reject all')));
  const choose = (value) => {
    document.cookie = 'ps_consent=' + value + '; path=/; max-age=31536000; SameSite=Lax';
    banner.remove();
    toast(value === 'all' ? 'Cookie choice saved: all accepted.' : 'Cookie choice saved: all rejected.');
  };
  banner.querySelector('#cookie-accept').addEventListener('click', () => choose('all'));
  banner.querySelector('#cookie-reject').addEventListener('click', () => choose('none'));
  // Shown in the page flow (not as an overlay) so the rest of the page stays usable while it is open.
  const header = document.querySelector('.site-header');
  if (header) header.after(banner); else document.body.prepend(banner);
}

setupNav();
setupConsent();
