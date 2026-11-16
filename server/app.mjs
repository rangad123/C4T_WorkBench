// Builds the Practice Store HTTP server. index.mjs starts it; tests call createPracticeServer() directly.
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes } from './api.mjs';
import { createAuth } from './auth.mjs';
import { BUG_IDS, CHANGE_IDS, parseBugList, parseChangeList } from './bugs.mjs';
import { createLive } from './live.mjs';
import { buildOpenApi } from './openapi.mjs';
import { createPages } from './pages.mjs';
import { SEED_USER_IDS, seed } from './store.mjs';
import { HttpError, errorBody, fail, parseCookies, parseMultipart, readBody, safeEqual, sendJson, setCookie, validate } from './util.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MB = 1024 * 1024;
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SIMPLE_TYPES = /^(application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)/i;

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'", "connect-src 'self'",
  "frame-src 'self'", "frame-ancestors 'self'", "form-action 'self'", "base-uri 'self'", "object-src 'none'",
].join('; ');

export function createPracticeServer(opts = {}) {
  const env = process.env;
  const options = {
    publicDir: opts.publicDir ?? join(HERE, '..', 'public'),
    docsDir: opts.docsDir ?? join(HERE, '..', 'docs'),
    bugs: opts.bugs ?? env.BUGS ?? '',
    changes: opts.changes ?? env.CHANGES ?? '',
    resetToken: opts.resetToken ?? env.RESET_TOKEN ?? '',
    secret: opts.secret ?? env.SESSION_SECRET ?? randomBytes(32).toString('hex'),
    loginLimit: opts.loginLimit ?? Number(env.LOGIN_RATE_LIMIT || 10),
    slowMs: opts.slowMs ?? 3000,
    tickMs: opts.tickMs ?? 1000,
    trustProxy: opts.trustProxy ?? env.TRUST_PROXY === '1',
    now: opts.now ?? (() => Date.now()),
  };
  const envBugs = parseBugList(options.bugs);
  const envChanges = parseChangeList(options.changes);

  const app = {
    options, secret: options.secret, state: seed(), now: () => options.now(),
    findUser: (id) => app.state.users.find((u) => u.id === Number(id)),
    product: (id) => app.state.products.find((p) => p.id === Number(id)),
    sendMail(msg) {
      const st = app.state;
      st.mail.push({ id: st.next.mail++, to: msg.to.toLowerCase(), subject: msg.subject, body: msg.body, code: msg.code, link: msg.link, at: new Date(app.now()).toISOString() });
      if (st.mail.length > 5000) st.mail.shift();
    },
    reset() { app.state = seed(app.now()); app.auth.onReset(SEED_USER_IDS); },
    checkResetToken(req) {
      if (!options.resetToken || !safeEqual(req.headers['x-reset-token'], options.resetToken)) fail(403, 'A valid x-reset-token header is required.', { code: 'bad_reset_token' });
    },
    sameOrigin(req, origin) {
      try { return new URL(origin).host === req.headers.host; } catch { return false; }
    },
  };
  app.auth = createAuth(app);
  app.live = createLive(app);
  const pages = createPages(app);
  const openapi = buildOpenApi(routes);
  const openapiChanged = buildOpenApi(routes, { changeApi: true });

  // Switch sets (bugs, changes): env, then ?<name>=... (also stored in a cookie), else header x-<name> and the cookie.
  function switchesFor(name, parse, envSet, req, url, res) {
    const set = new Set(envSet);
    const fromQuery = url.searchParams.get(name);
    const cookieName = `ps_${name}`;
    if (fromQuery !== null) {
      const chosen = parse(fromQuery);
      if (chosen.size) setCookie(res, cookieName, [...chosen].join(','), { httpOnly: false });
      else setCookie(res, cookieName, '', { maxAge: 0, httpOnly: false });
      for (const b of chosen) set.add(b);
      return set;
    }
    for (const b of parse(req.headers[`x-${name}`])) set.add(b);
    for (const b of parse(parseCookies(req.headers.cookie)[cookieName])) set.add(b);
    return set;
  }

  function securityHeaders(req, res, secure) {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  }

  async function handleApi(ctx) {
    const { req, res, url } = ctx;
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    let route = null;
    let match = null;
    const allowed = [];
    for (const r of routes) {
      const m = r.regex.exec(url.pathname);
      if (!m) continue;
      if (r.method === method) { route = r; match = m; break; }
      allowed.push(r.method);
    }
    if (!route) {
      if (allowed.length) fail(405, `Use ${allowed.join(' or ')} for this address.`, { headers: { Allow: allowed.join(', ') } });
      fail(404, 'There is no API route at this address.');
    }
    ctx.route = route;
    ctx.params = {};
    route.keys.forEach((k, i) => {
      const v = match[i + 1];
      if (!/^\d{1,9}$/.test(v)) fail(404, 'Not found.');
      ctx.params[k] = Number(v);
    });

    const who = app.auth.resolve(ctx);
    Object.assign(ctx, { user: who.user, via: who.via, tokenKey: who.tokenKey });

    // Body
    const type = String(req.headers['content-type'] || '').toLowerCase();
    let body = {};
    if (UNSAFE.has(method)) {
      const raw = await readBody(req, route.bodyLimit || MB).catch((e) => {
        if (e instanceof HttpError && e.status === 413 && route.bodyLimitMessage) e.message = route.bodyLimitMessage;
        throw e;
      });
      if (raw.length) {
        if (type.startsWith('application/json')) {
          try { body = JSON.parse(raw.toString('utf8')); } catch { fail(400, 'The request body is not valid JSON.', { code: 'invalid_json' }); }
        } else if (type.startsWith('application/x-www-form-urlencoded')) {
          body = Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
        } else if (type.startsWith('multipart/form-data')) {
          const mp = parseMultipart(raw, String(req.headers['content-type']));
          body = mp.fields;
          ctx.files = mp.files;
        } else if (route.acceptsImage && /^image\//.test(type)) {
          ctx.rawBody = raw;
        } else {
          ctx.unsupported = true;
        }
      }
      // CSRF: cookie-authenticated (non-Bearer) requests from cross-site, or with a form-like content type, need the token.
      if (ctx.via !== 'bearer') {
        const origin = req.headers.origin;
        if (origin && origin !== 'null' && !app.sameOrigin(req, origin)) fail(403, 'Cross-site requests are not allowed.', { code: 'csrf' });
        if (origin === 'null') fail(403, 'Cross-site requests are not allowed.', { code: 'csrf' });
        if (SIMPLE_TYPES.test(type)) {
          const provided = req.headers['x-csrf-token'] || (body && body._csrf);
          if (!app.auth.checkCsrf(ctx, provided)) fail(403, 'The form is missing a valid CSRF token. Reload the page and try again.', { code: 'csrf' });
        }
      }
      if (ctx.unsupported) fail(415, 'Send the request body as JSON.', { code: 'unsupported_media_type' });
      ctx.isForm = /^(application\/x-www-form-urlencoded|multipart\/form-data)/.test(type);
    }

    // Access
    if (route.auth && !ctx.user) fail(401, 'You are not signed in.');
    if (route.auth === 'admin' && ctx.user.role !== 'admin' && !(route.bugAllows && ctx.bug(route.bugAllows))) fail(403, 'You do not have access to this page.');

    // Validation
    ctx.query = route.query ? validate(route.query, Object.fromEntries(url.searchParams), ctx, 'query') : {};
    if (route.body) ctx.body = validate(route.body, body, ctx);
    else ctx.body = {};

    const result = await route.handler(ctx);
    if (!result || res.headersSent) return;
    const status = result.status || 200;
    if (ctx.isForm && route.form && wantsHtml(req)) return redirect(res, result.body?.next && /^\/(?![/\\])/.test(result.body.next) ? result.body.next : '/');
    return sendJson(res, status, result.body ?? { ok: true });
  }

  async function handle(req, res) {
    const secure = options.trustProxy ? req.headers['x-forwarded-proto'] === 'https' : !!req.socket.encrypted;
    securityHeaders(req, res, secure);
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end('Bad request'); }
    const bugs = switchesFor('bugs', parseBugList, envBugs, req, url, res);
    const changes = switchesFor('changes', parseChangeList, envChanges, req, url, res);
    const ip = options.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;
    const ctx = { req, res, url, app, bugs, bug: (id) => bugs.has(id), changes, change: (id) => changes.has(id), ip, secure, query: {}, body: {} };
    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
    try {
      if (isApi) return await handleApi(ctx);
      if (url.pathname === '/openapi.json') return sendJson(res, 200, ctx.change('CHANGE_API') ? openapiChanged : openapi);
      if (url.pathname === '/__reset') {
        if (req.method !== 'GET') fail(405, 'Use GET for this address.', { headers: { Allow: 'GET' } });
        app.checkResetToken(req);
        app.reset();
        return sendJson(res, 200, { ok: true, message: 'The seeded data was restored.' });
      }
      return await pages.handle(ctx);
    } catch (err) {
      if (res.headersSent) { res.destroy(); return; }
      const e = err instanceof HttpError ? err : new HttpError(500, 'Something went wrong on the server.');
      if (!(err instanceof HttpError)) console.error(err);
      if (e.status === 413) res.setHeader('Connection', 'close');
      if (ctx.isForm && ctx.route?.form && wantsHtml(req) && e.status < 500) return redirect(res, backWithError(req, e.message));
      if (!isApi && e.status === 403) return pages.sendHtml(ctx, 403, '403.html');
      return sendJson(res, e.status, errorBody(e), e.headers || {});
    }
  }

  const server = http.createServer({ requestTimeout: 30000, headersTimeout: 15000 }, (req, res) => { handle(req, res); });
  server.on('upgrade', (req, socket) => {
    socket.on('error', () => socket.destroy());
    app.live.handleUpgrade(req, socket);
  });
  server.on('close', () => app.live.closeAll());
  server.app = app;
  server.openapi = openapi;
  server.bugIds = BUG_IDS;
  server.changeIds = CHANGE_IDS;
  const origClose = server.close.bind(server);
  server.close = (cb) => { app.live.closeAll(); server.closeAllConnections?.(); return origClose(cb); };
  return server;
}

function wantsHtml(req) {
  return /text\/html/.test(String(req.headers.accept || ''));
}

function redirect(res, location) {
  res.writeHead(303, { Location: location, 'Content-Length': 0 });
  res.end();
}

function backWithError(req, message) {
  let back = '/login';
  try {
    const ref = new URL(req.headers.referer);
    if (ref.host === req.headers.host) back = ref.pathname + ref.search;
  } catch { /* no usable referer */ }
  const u = new URL(back, 'http://x');
  u.searchParams.set('error', message);
  return u.pathname + u.search;
}
