// Pages, static files, CSRF, security headers, body limits, OpenAPI, live (SSE + WebSocket), uploads, misc endpoints.
import assert from 'node:assert/strict';
import net from 'node:net';
import { after, before, beforeEach, describe, test } from 'node:test';
import { routes } from '../api.mjs';
import { asAdmin, asUser, start } from './helpers.mjs';

let s;
before(async () => { s = await start(); });
after(() => s.stop());
beforeEach(() => s.app.reset());

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);

function multipart(field, filename, type, data, extra = {}) {
  const b = '----psboundary';
  const parts = [];
  for (const [k, v] of Object.entries(extra)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`), data, Buffer.from(`\r\n--${b}--\r\n`));
  return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${b}` };
}

function rawRequest(port, text) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write(text));
    let out = '';
    sock.on('data', (d) => { out += d; });
    sock.on('end', () => resolve(out));
    sock.on('error', () => resolve(out));
    setTimeout(() => { sock.destroy(); resolve(out); }, 1000);
  });
}

describe('pages', () => {
  test('pretty URLs serve the mapped files', async () => {
    const map = { '/': 'index.html', '/login': 'login.html', '/login-plain': 'login-plain.html', '/products': 'products.html', '/products/3': 'product.html',
      '/widgets': 'widgets.html', '/captcha': 'captcha.html', '/ads': 'ads.html', '/a11y': 'a11y.html', '/broken': 'broken.html', '/mailbox': 'mailbox.html',
      '/frame-form.html': 'frame-form.html', '/fake/recaptcha/api2/aframe.html': 'fake/recaptcha/api2/aframe.html', '/login/': 'login.html' };
    for (const [url, file] of Object.entries(map)) {
      const r = await s.client().get(url);
      assert.equal(r.status, 200, url);
      assert.ok(r.text.includes(`page:${file}`), url);
      assert.match(r.headers.get('content-type'), /^text\/html/);
    }
    const c = await asUser(s);
    const signedIn = { '/cart': 'cart.html', '/checkout': 'checkout.html', '/checkout/review': 'checkout-review.html', '/orders': 'orders.html', '/orders/1001': 'order.html', '/account': 'account.html', '/spa/': 'spa/index.html' };
    for (const [url, file] of Object.entries(signedIn)) assert.ok((await c.get(url)).text.includes(`page:${file}`), url);
  });

  test('/docs/api lists every documented operation for people, is noindex and is linked from no page', async () => {
    const r = await s.client().get('/docs/api');
    assert.equal(r.status, 200);
    assert.match(r.text, /<meta name="robots" content="noindex, nofollow">/);
    const doc = (await s.client().get('/openapi.json')).data;
    const ops = Object.entries(doc.paths).flatMap(([p, m]) => Object.keys(m).map((k) => `<td>${k.toUpperCase()}</td><td><code>${p}</code></td>`));
    for (const op of ops) assert.ok(r.text.includes(op), op);
    assert.ok(r.text.includes('<td>Admins</td>') && r.text.includes('<td>Signed in</td>') && r.text.includes('<td>Anyone</td>'));
    for (const page of ['/', '/products', '/docs/requirements']) assert.ok(!(await s.client().get(page)).text.includes('/docs/api'), page);
  });

  test('signed-in pages send visitors to /login?next=', async () => {
    for (const url of ['/account', '/cart', '/orders/1001', '/admin/users']) {
      const r = await s.client().get(url);
      assert.equal(r.status, 302, url);
      assert.equal(r.headers.get('location'), '/login?next=' + encodeURIComponent(url));
    }
    assert.equal((await s.client().get('/spa')).headers.get('location'), '/spa/');
  });

  test('admin pages: customer gets the 403 page, admin gets the page', async () => {
    const c = await asUser(s);
    const admin = await asAdmin(s);
    for (const [url, file] of [['/admin', 'admin/index.html'], ['/admin/users', 'admin/users.html'], ['/admin/orders', 'admin/orders.html']]) {
      const r = await c.get(url);
      assert.equal(r.status, 403);
      assert.ok(r.text.includes('page:403.html'));
      assert.ok((await admin.get(url)).text.includes(`page:${file}`));
    }
  });

  test('unknown pages, unknown products and other users orders are the 404 page', async () => {
    for (const url of ['/nope', '/products/999', '/products/abc', '/admin.html', '/login.html', '/admin/index.html', '/403.html']) {
      const r = await s.client().get(url);
      assert.equal(r.status, 404, url);
      assert.ok(r.text.includes('page:404.html'), url);
    }
    const admin = await asAdmin(s);
    assert.equal((await admin.get('/orders/1001')).status, 404);
  });

  test('CSRF token placeholder is replaced and the cookie set', async () => {
    const c = s.client();
    const r = await c.get('/login');
    const token = /content="([^"]+)"/.exec(r.text)[1];
    assert.notEqual(token, '__CSRF__');
    assert.equal(decodeURIComponent(c.jar.get('ps_csrf')), token);
    assert.match(r.cookies.find((x) => x.startsWith('ps_csrf=')), /SameSite=Strict/);
  });

  test('/slow waits; /docs/requirements renders the Markdown as escaped HTML', async () => {
    const t0 = Date.now();
    assert.equal((await s.client().get('/slow')).status, 200);
    assert.ok(Date.now() - t0 >= 25);
    const doc = await s.client().get('/docs/requirements');
    assert.equal(doc.status, 200);
    assert.match(doc.text, /<title>Requirements — Practice Store<\/title>/);
    assert.match(doc.text, /<h1 id="requirements">Requirements<\/h1>/);
    assert.match(doc.text, /<p class="req" id="req-1-1"><strong>1.1<\/strong>/);
    assert.match(doc.text, /<p class="req" id="req-1-2">/);
    assert.match(doc.text, /&lt;script&gt;/);
    assert.doesNotMatch(doc.text, /<script>x/);
    assert.match(doc.text, /<th scope="col">a<\/th>/);
    assert.equal((await s.client().get('/docs/accounts')).status, 200);
    assert.equal((await s.client().get('/docs/bugs')).status, 404);
  });

  test('POST to a page is 405', async () => {
    assert.equal((await s.client().post('/login', {})).status, 405);
  });
});

describe('static files', () => {
  test('assets are served with a content type', async () => {
    const r = await s.client().get('/assets/site.css');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/css/);
  });
  test('path traversal and dotfiles are refused with 404', async () => {
    const port = s.server.address().port;
    for (const p of ['/../server/index.mjs', '/..%2f..%2fserver%2findex.mjs', '/assets/..%2f..%2foutside-secret.txt', '/%2e%2e/outside-secret.txt',
      '/assets/%2e%2e%2f%2e%2e%2foutside-secret.txt', '/.secret', '/assets/..\\..\\x.txt', '/assets/%00.css', '/%c0%ae%c0%ae/x.txt']) {
      const r = await s.client().get(p);
      assert.equal(r.status, 404, p);
      assert.doesNotMatch(r.text, /outside|hidden|createPracticeServer/, p);
    }
    const raw = await rawRequest(port, 'GET /../../outside-secret.txt HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    assert.match(raw, /^HTTP\/1.1 404/);
    assert.doesNotMatch(raw, /outside\s*$/);
  });
});

describe('security headers', () => {
  test('CSP and friends on pages, assets, API and errors', async () => {
    for (const p of ['/', '/assets/site.css', '/api/health', '/nope', '/api/nope', '/openapi.json']) {
      const h = (await s.client().get(p)).headers;
      assert.match(h.get('content-security-policy'), /default-src 'self'; script-src 'self'/, p);
      assert.match(h.get('content-security-policy'), /frame-ancestors 'self'/, p);
      assert.equal(h.get('x-content-type-options'), 'nosniff', p);
      assert.equal(h.get('x-frame-options'), 'SAMEORIGIN', p);
      assert.equal(h.get('referrer-policy'), 'same-origin', p);
      assert.ok(h.get('permissions-policy'), p);
    }
    assert.equal((await s.client().get('/api/health')).headers.get('cache-control'), 'no-store');
  });
  test('Secure cookie and HSTS behind an https proxy when TRUST_PROXY is on', async () => {
    const t = await start({ trustProxy: true });
    try {
      const r = await t.client().post('/api/auth/login', { email: 'user@practice.test', password: 'Practice#123' }, { headers: { 'x-forwarded-proto': 'https' } });
      assert.match(r.cookies.find((x) => x.startsWith('ps_session=')), /; Secure/);
      assert.ok(r.headers.get('strict-transport-security'));
    } finally { await t.stop(); }
  });
});

describe('CSRF and request bodies', () => {
  test('form posts need a valid token; JSON from the same origin does not', async () => {
    const c = s.client();
    const form = (extra = {}) => new URLSearchParams({ email: 'user@practice.test', password: 'Practice#123', ...extra }).toString();
    const ct = { 'content-type': 'application/x-www-form-urlencoded' };
    let r = await c.req('POST', '/api/auth/login', { body: form(), headers: ct });
    assert.equal(r.status, 403);
    assert.equal(r.data.error.code, 'csrf');
    await c.get('/login');
    r = await c.req('POST', '/api/auth/login', { body: form({ _csrf: 'forged.value' }), headers: ct });
    assert.equal(r.status, 403);
    r = await c.req('POST', '/api/auth/login', { body: form({ _csrf: decodeURIComponent(c.jar.get('ps_csrf')) }), headers: ct });
    assert.equal(r.status, 200);
    r = await c.req('POST', '/api/auth/login', { body: form(), headers: ct, csrf: true });
    assert.equal(r.status, 200);
    // a token minted by another server secret does not pass
    const other = await start();
    try {
      const o = other.client();
      await o.get('/login');
      r = await s.client().req('POST', '/api/auth/login', { body: form({ _csrf: decodeURIComponent(o.jar.get('ps_csrf')) }), headers: { ...ct, cookie: `ps_csrf=${o.jar.get('ps_csrf')}` } });
      assert.equal(r.status, 403);
    } finally { await other.stop(); }
    // text/plain is a form-like type too
    assert.equal((await s.client().req('POST', '/api/auth/logout', { body: 'x', headers: { 'content-type': 'text/plain' } })).status, 403);
  });

  test('cross-site Origin is refused; Bearer requests skip CSRF', async () => {
    const r = await s.client().post('/api/auth/login', { email: 'user@practice.test', password: 'Practice#123' }, { headers: { origin: 'https://evil.example' } });
    assert.equal(r.status, 403);
    const tok = (await s.client().post('/api/auth/token', { email: 'user@practice.test', password: 'Practice#123' })).data.token;
    const b = await s.client().req('POST', '/api/notes', { body: 'title=From+form', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(b.status, 201);
  });

  test('native form sign-in redirects (303) to next, or back with ?error=', async () => {
    const c = s.client();
    await c.get('/login');
    const tokenField = decodeURIComponent(c.jar.get('ps_csrf'));
    const headers = { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html', referer: `${s.base}/login-plain` };
    let r = await c.req('POST', '/api/auth/login', { body: new URLSearchParams({ email: 'user@practice.test', password: 'bad', _csrf: tokenField }).toString(), headers });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/login-plain?error=Invalid+email+or+password.');
    r = await c.req('POST', '/api/auth/login', { body: new URLSearchParams({ email: 'user@practice.test', password: 'Practice#123', _csrf: tokenField, next: '/orders' }).toString(), headers });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/orders');
    assert.equal((await c.get('/api/me')).status, 200);
  });

  test('bodies over 1 MB are 413; bad JSON 400; other types 415; unknown route 404; wrong method 405', async () => {
    const big = JSON.stringify({ title: 'x'.repeat(1024 * 1024 + 10) });
    const c = await asUser(s);
    const r = await c.req('POST', '/api/notes', { body: big, headers: { 'content-type': 'application/json' } });
    assert.equal(r.status, 413);
    assert.equal(r.data.error.code, 'too_large');
    assert.equal((await c.req('POST', '/api/notes', { body: '{bad', headers: { 'content-type': 'application/json' } })).status, 400);
    assert.equal((await c.req('POST', '/api/notes', { body: '<x/>', headers: { 'content-type': 'application/xml' } })).status, 415);
    const nf = await c.get('/api/nope');
    assert.equal(nf.status, 404);
    assert.deepEqual(Object.keys(nf.data.error).sort(), ['code', 'message']);
    const m = await c.req('PUT', '/api/notes');
    assert.equal(m.status, 405);
    assert.match(m.headers.get('allow'), /GET/);
    assert.equal((await c.post('/api/notes', [1, 2])).status, 400);
  });
});

describe('avatar upload', () => {
  test('PNG/JPEG by content, at most 1 MB; multipart needs the CSRF header', async () => {
    const c = await asUser(s);
    await c.get('/account');
    const png = multipart('avatar', 'me.png', 'image/png', PNG);
    assert.equal((await c.req('POST', '/api/account/avatar', { body: png.body, headers: { 'content-type': png.type } })).status, 403);
    let r = await c.req('POST', '/api/account/avatar', { body: png.body, headers: { 'content-type': png.type }, csrf: true });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.hasAvatar, true);
    const img = await c.get('/api/account/avatar');
    assert.equal(img.headers.get('content-type'), 'image/png');
    const fake = multipart('avatar', 'evil.png', 'image/png', Buffer.from('<svg onload=alert(1)>'));
    r = await c.req('POST', '/api/account/avatar', { body: fake.body, headers: { 'content-type': fake.type }, csrf: true });
    assert.equal(r.status, 400);
    assert.equal(r.data.error.message, 'Choose a PNG or JPG image.');
    const huge = multipart('avatar', 'big.jpg', 'image/jpeg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1024 * 1024)]));
    r = await c.req('POST', '/api/account/avatar', { body: huge.body, headers: { 'content-type': huge.type }, csrf: true });
    assert.equal(r.status, 413);
    assert.equal(r.data.error.message, 'The image must be 1 MB or smaller.');
    const tooBig = Buffer.alloc(2 * 1024 * 1024);
    r = await c.req('POST', '/api/account/avatar', { body: tooBig, headers: { 'content-type': 'image/png' } });
    assert.equal(r.status, 413);
    const jpg = await c.req('POST', '/api/account/avatar', { body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]), headers: { 'content-type': 'image/jpeg' } });
    assert.equal(jpg.status, 200);
    assert.equal((await s.client().req('POST', '/api/account/avatar', { body: PNG, headers: { 'content-type': 'image/png' } })).status, 401);
  });
});

describe('avatar upload via real multipart clients', () => {
  const realPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const realJpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]), Buffer.alloc(64, 0x0d), Buffer.from([0xff, 0xd9])]);
  const upload = async (c, blob, name) => {
    const fd = new FormData();
    fd.append('avatar', blob, name);
    return fetch(s.base + '/api/account/avatar', { method: 'POST', body: fd, headers: { cookie: [...c.jar].map(([k, v]) => `${k}=${v}`).join('; '), 'x-csrf-token': decodeURIComponent(c.jar.get('ps_csrf')) } });
  };
  test('FormData (browser-style) PNG and JPG are accepted and served back byte for byte', async () => {
    const c = await asUser(s);
    await c.get('/account');
    let r = await upload(c, new Blob([realPng], { type: 'image/png' }), 'a.png');
    assert.equal(r.status, 200, await r.clone().text());
    let back = Buffer.from(await (await fetch(s.base + '/api/account/avatar', { headers: { cookie: [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ') } })).arrayBuffer());
    assert.deepEqual(back, realPng);
    r = await upload(c, new Blob([realJpg], { type: 'image/jpeg' }), 'a.jpg');
    assert.equal(r.status, 200);
    back = Buffer.from(await (await fetch(s.base + '/api/account/avatar', { headers: { cookie: [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ') } })).arrayBuffer());
    assert.deepEqual(back, realJpg);
    r = await upload(c, new Blob([Buffer.from('GIF89a not a png')], { type: 'image/png' }), 'fake.png');
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error.message, 'Choose a PNG or JPG image.');
    r = await upload(c, new Blob([realPng, Buffer.alloc(1024 * 1024)], { type: 'image/png' }), 'big.png');
    assert.equal(r.status, 413);
    assert.equal((await r.json()).error.message, 'The image must be 1 MB or smaller.');
  });
  test('curl -F style: mixed-case boundary, CRLF bytes inside the file', async () => {
    const c = await asUser(s);
    await c.get('/account');
    const b = '------------------------Ab12CdEf34';
    const data = Buffer.concat([realPng, Buffer.from('\r\n--\r\n')]);
    const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="avatar"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), data, Buffer.from(`\r\n--${b}--\r\n`)]);
    const r = await c.req('POST', '/api/account/avatar', { body, headers: { 'content-type': `multipart/form-data; boundary=${b}` }, csrf: true });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(Buffer.from(await (await fetch(s.base + '/api/account/avatar', { headers: { cookie: [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ') } })).arrayBuffer()), data);
  });
});

describe('OpenAPI', () => {
  test('every route except the two undocumented ones is listed, with responses', async () => {
    const doc = (await s.client().get('/openapi.json')).data;
    assert.match(doc.openapi, /^3\./);
    const listed = new Set(Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`)));
    const undocumented = routes.filter((r) => r.undocumented).map((r) => `${r.method} ${r.path}`).sort();
    assert.deepEqual(undocumented, ['GET /api/internal/stats', 'POST /api/auth/token']);
    for (const r of routes) {
      const key = `${r.method} ${r.path.replace(/:(\w+)/g, '{$1}')}`;
      assert.equal(listed.has(key), !r.undocumented, key);
    }
    for (const p of ['/api/mailbox', '/api/slow', '/api/broken', '/api/health']) assert.ok(doc.paths[p], p);
    const login = doc.paths['/api/auth/login'].post;
    assert.ok(login.requestBody.content['application/json'].schema.properties.email);
    assert.ok(login.responses['401'] && login.responses['429']);
    assert.ok(doc.paths['/api/cart/items/{id}'].patch.parameters.some((x) => x.name === 'id' && x.in === 'path'));
    assert.ok(doc.paths['/api/admin/users'].get.responses['403']);
    assert.doesNotMatch(JSON.stringify(doc), /x-bug|QTY|NOTE_403/);
    // undocumented routes still work
    assert.equal((await s.client().get('/api/internal/stats')).status, 200);
  });
});

describe('misc endpoints', () => {
  test('health, slow, broken, mailbox, csrf', async () => {
    assert.equal((await s.client().get('/api/health')).data.ok, true);
    assert.equal((await s.client().get('/api/slow')).data.ok, true);
    const b = await s.client().get('/api/broken');
    assert.equal(b.status, 500);
    assert.equal(b.data.error.code, 'deliberate_failure');
    assert.equal((await s.client().get('/api/mailbox')).status, 400);
    assert.deepEqual((await s.client().get('/api/mailbox?to=nobody@x.test')).data.messages, []);
    assert.ok((await s.client().get('/api/csrf')).data.csrfToken);
  });
});

describe('live', () => {
  test('SSE sends data: {"count":N} that goes up', async () => {
    const ctrl = new AbortController();
    const res = await fetch(s.base + '/api/live/events', { signal: ctrl.signal });
    assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const reader = res.body.getReader();
    let text = '';
    while ((text.match(/data: \{"count":\d+\}/g) || []).length < 3) text += new TextDecoder().decode((await reader.read()).value);
    const counts = [...text.matchAll(/data: \{"count":(\d+)\}/g)].map((m) => Number(m[1]));
    assert.ok(counts[2] > counts[1]);
    ctrl.abort();
  });

  test('WebSocket chat broadcasts to every client and SSE; long messages refused', async () => {
    const open = (url) => new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const msgs = [];
      ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
      ws.onopen = () => resolve({ ws, msgs });
      ws.onerror = reject;
    });
    const url = s.base.replace('http', 'ws') + '/api/live/ws';
    const a = await open(url);
    const b = await open(url);
    const waitFor = async (list, pred) => { for (let i = 0; i < 100; i++) { const m = list.find(pred); if (m) return m; await new Promise((r) => setTimeout(r, 10)); } throw new Error('timeout'); };
    assert.equal((await waitFor(a.msgs, (m) => m.type === 'hello')).name, 'Guest');
    a.ws.send(JSON.stringify({ type: 'chat', text: 'hi <b>there</b>' }));
    assert.equal((await waitFor(b.msgs, (m) => m.type === 'chat')).text, 'hi <b>there</b>');
    a.ws.send(JSON.stringify({ type: 'chat', text: 'x'.repeat(201) }));
    assert.equal((await waitFor(a.msgs, (m) => m.type === 'error')).error, 'A message can be at most 200 characters.');
    a.ws.send(JSON.stringify({ type: 'ping' }));
    await waitFor(a.msgs, (m) => m.type === 'pong');
    const posted = await s.client().post('/api/live/chat', { text: 'over http' });
    assert.equal(posted.status, 201);
    await waitFor(b.msgs, (m) => m.text === 'over http');
    // a big frame (16-bit length) works too
    a.ws.send(JSON.stringify({ type: 'chat', text: 'y'.repeat(150), pad: 'z'.repeat(300) }));
    await waitFor(b.msgs, (m) => m.text === 'y'.repeat(150));
    a.ws.close(); b.ws.close();
  });

  test('WebSocket refuses bad handshakes and cross-site origins; plain GET is 426', async () => {
    const port = s.server.address().port;
    const hs = (extra) => rawRequest(port, `GET /api/live/ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n${extra}\r\n`);
    assert.match(await hs('Sec-WebSocket-Version: 13\r\n'), /^HTTP\/1.1 400/);
    assert.match(await hs('Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nOrigin: https://evil.example\r\n'), /^HTTP\/1.1 403/);
    const good = await hs('Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n');
    assert.match(good, /^HTTP\/1.1 101/);
    assert.match(good, /Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/); // RFC 6455 example
    assert.equal((await s.client().get('/api/live/ws')).status, 426);
  });
});
