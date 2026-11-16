// Test helpers: start a server on an ephemeral port with a fixture public/ folder, and a cookie-keeping client.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createPracticeServer } from '../app.mjs';

export const RESET_TOKEN = 'test-reset-token';

const page = (title) => `<!doctype html><html lang="en"><head><meta name="csrf-token" content="__CSRF__"><title>${title}</title></head><body><header>banner</header><main id="main"><h1>${title}</h1></main></body></html>`;

export function makePublicDir() {
  const dir = mkdtempSync(join(tmpdir(), 'ps-public-'));
  const files = ['index.html', 'login.html', 'login-plain.html', 'signup.html', 'otp.html', 'mailbox.html', 'products.html', 'product.html', 'cart.html',
    'checkout.html', 'checkout-review.html', 'orders.html', 'order.html', 'account.html', 'widgets.html', 'live.html', 'captcha.html', 'ads.html',
    'a11y.html', 'slow.html', 'broken.html', '403.html', '404.html', 'frame-form.html', 'admin/index.html', 'admin/users.html', 'admin/orders.html',
    'spa/index.html', 'fake/recaptcha/api2/aframe.html'];
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), page(`page:${f}`));
  }
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'site.css'), 'body{color:black}');
  writeFileSync(join(dir, '.secret'), 'hidden');
  writeFileSync(join(dirname(dir), 'outside-secret.txt'), 'outside');
  const docs = mkdtempSync(join(tmpdir(), 'ps-docs-'));
  writeFileSync(join(docs, 'REQUIREMENTS.md'), '# Requirements\n\n1.1 Every page has a banner <script>x</script>.\n1.2 Second line.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  writeFileSync(join(docs, 'ACCOUNTS.md'), '# Accounts\n\n- user@practice.test\n');
  return { publicDir: dir, docsDir: docs };
}

export async function start(opts = {}) {
  const server = createPracticeServer({ ...makePublicDir(), resetToken: RESET_TOKEN, loginLimit: 1000, slowMs: 30, tickMs: 40, bugs: '', ...opts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, app: server.app, client: () => client(base), stop: () => new Promise((r) => server.close(r)) };
}

export function client(base) {
  const jar = new Map();
  async function req(method, path, { json, body, headers = {}, csrf, redirect = 'manual' } = {}) {
    const h = { ...headers };
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (csrf && jar.get('ps_csrf')) h['x-csrf-token'] = decodeURIComponent(jar.get('ps_csrf'));
    let b = body;
    if (json !== undefined) { h['content-type'] = 'application/json'; b = JSON.stringify(json); }
    const res = await fetch(base + path, { method, headers: h, body: b, redirect });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      if (attrs.some((a) => /max-age=0/i.test(a.trim())) || v === '') jar.delete(k); else jar.set(k, v);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, headers: res.headers, data, text, cookies: res.headers.getSetCookie() };
  }
  const c = {
    jar, req,
    get: (p, o) => req('GET', p, o),
    post: (p, json, o = {}) => req('POST', p, { json, ...o }),
    patch: (p, json, o = {}) => req('PATCH', p, { json, ...o }),
    del: (p, o) => req('DELETE', p, o),
    async login(email = 'user@practice.test', password = 'Practice#123', extra = {}) {
      const r = await c.post('/api/auth/login', { email, password, ...extra });
      if (r.status !== 200) throw new Error(`login failed ${r.status} ${r.text}`);
      return r;
    },
  };
  return c;
}

export const asAdmin = async (ctx) => { const c = ctx.client(); await c.login('admin@practice.test', 'Admin#123'); return c; };
export const asUser = async (ctx) => { const c = ctx.client(); await c.login(); return c; };
