// Passwords (scrypt), TOTP (RFC 6238), signed session cookies, Bearer tokens, CSRF tokens, sign-in rate limit.
import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCb, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fail, parseCookies, safeEqual, setCookie } from './util.mjs';

const scrypt = promisify(scryptCb);
const N = 16384, R = 8, P = 1, KEYLEN = 32;

export function hashPasswordSync(pw) {
  const salt = randomBytes(16);
  const h = scryptSync(pw, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${h.toString('base64')}`;
}

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${h.toString('base64')}`;
}

export async function verifyPassword(pw, stored) {
  const [alg, n, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const got = await scrypt(String(pw), Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p });
  return timingSafeEqual(got, expected);
}

const DUMMY_HASH = hashPasswordSync('not-a-real-password');

// --- TOTP / HOTP (RFC 4226 / 6238, SHA-1)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Decode(s) {
  let bits = 0, value = 0;
  const out = [];
  for (const c of String(s).replace(/[=\s]/g, '').toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('Invalid base32');
    value = ((value << 5) | i) & 0xffff;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function hotp(key, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = (h.readUInt32BE(off) & 0x7fffffff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totp(secretB32, timeMs = Date.now(), step = 30, digits = 6) {
  return hotp(base32Decode(secretB32), Math.floor(timeMs / 1000 / step), digits);
}

export function verifyTotp(secretB32, code, timeMs = Date.now(), window = 1) {
  if (!/^\d{6}$/.test(String(code))) return false;
  const key = base32Decode(secretB32);
  const c = Math.floor(timeMs / 1000 / 30);
  for (let d = -window; d <= window; d++) if (safeEqual(hotp(key, c + d), code)) return true;
  return false;
}

// --- sessions, tokens, CSRF, rate limit
const SESSION_IDLE = 12 * 3600 * 1000;
const REMEMBER = 30 * 24 * 3600 * 1000;
const TOKEN_TTL = 24 * 3600 * 1000;
const MAX_SESSIONS = 20000;
export const EMAIL_CODE_TTL = 10 * 60 * 1000;
const MAX_CODE_TRIES = 5;

export function createAuth(app) {
  const sessions = new Map();
  const tokens = new Map(); // sha256(token) -> { userId, expires }
  const attempts = new Map(); // ip -> [timestamps]
  const now = () => app.now();
  const sign = (v) => createHmac('sha256', app.secret).update(v).digest('base64url');
  const tokenKey = (t) => createHash('sha256').update(t).digest('hex');

  function sessionFromCookie(req) {
    const raw = parseCookies(req.headers.cookie).ps_session;
    if (!raw) return null;
    const i = raw.lastIndexOf('.');
    if (i < 1) return null;
    const sid = raw.slice(0, i);
    if (!safeEqual(raw.slice(i + 1), sign('s:' + sid))) return null;
    const s = sessions.get(sid);
    if (!s) return null;
    const limit = s.remember ? REMEMBER : SESSION_IDLE;
    if (now() - (s.remember ? s.created : s.seen) > limit) { sessions.delete(sid); return null; }
    s.seen = now();
    return s;
  }

  function startSession(ctx, { remember = false } = {}) {
    const old = sessionFromCookie(ctx.req);
    if (old) sessions.delete(old.id);
    if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    const sid = randomBytes(24).toString('base64url');
    const s = { id: sid, userId: null, pending: null, remember, created: now(), seen: now() };
    sessions.set(sid, s);
    setCookie(ctx.res, 'ps_session', `${sid}.${sign('s:' + sid)}`, { maxAge: remember ? REMEMBER / 1000 : undefined, secure: ctx.secure });
    return s;
  }

  function endSession(ctx) {
    const s = sessionFromCookie(ctx.req);
    if (s) sessions.delete(s.id);
    setCookie(ctx.res, 'ps_session', '', { maxAge: 0, secure: ctx.secure });
  }

  // Who is calling: Bearer token first (a bad one is a 401), then the session cookie.
  function resolve(ctx) {
    const authz = ctx.req.headers.authorization;
    if (authz) {
      const m = /^Bearer\s+(\S+)$/i.exec(authz);
      if (!m) fail(401, 'The Authorization header must be "Bearer <token>".');
      const t = tokens.get(tokenKey(m[1]));
      const user = t && t.expires > now() && app.findUser(t.userId);
      if (!user) fail(401, 'That API token is not valid or has expired.');
      return { user, via: 'bearer', tokenKey: tokenKey(m[1]) };
    }
    const session = sessionFromCookie(ctx.req);
    const user = session?.userId ? app.findUser(session.userId) : null;
    return { user: user || null, session, via: user ? 'cookie' : null, hadCookie: !!parseCookies(ctx.req.headers.cookie).ps_session };
  }

  function issueToken(userId) {
    const token = 'pt_' + randomBytes(24).toString('base64url');
    tokens.set(tokenKey(token), { userId, expires: now() + TOKEN_TTL });
    return { token, tokenType: 'Bearer', expiresIn: TOKEN_TTL / 1000 };
  }

  const revokeToken = (key) => tokens.delete(key);

  // Sign-in rate limit: more than `loginLimit` attempts per minute from one IP -> 429.
  function countAttempt(ip) {
    const t = now();
    const list = (attempts.get(ip) || []).filter((x) => t - x < 60000);
    if (list.length >= app.options.loginLimit) {
      const retry = Math.max(1, Math.ceil((60000 - (t - list[0])) / 1000));
      attempts.set(ip, list);
      fail(429, 'Too many sign-in attempts. Try again in a minute.', { headers: { 'Retry-After': String(retry) } });
    }
    list.push(t);
    attempts.set(ip, list);
    if (attempts.size > 50000) attempts.delete(attempts.keys().next().value);
  }

  // Check email + password; returns the user or throws 401 with one message for both cases.
  async function checkPassword(ctx, email, password) {
    countAttempt(ctx.ip);
    const user = app.state.users.find((u) => u.email === String(email).trim().toLowerCase());
    const ok = await verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) fail(401, 'Invalid email or password.', { code: 'invalid_credentials' });
    return user;
  }

  function sendEmailCode(user) {
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    app.sendMail({ to: user.email, subject: 'Your Practice Store sign-in code', body: `Your sign-in code is ${code}. It works once, for 10 minutes.`, code });
    return { code, expires: now() + EMAIL_CODE_TTL };
  }

  // Verify a second-step code for `pending` ({userId, method, emailCode?, tries}). Mutates tries; one-time email codes.
  function checkSecondStep(pending, code) {
    const user = app.findUser(pending.userId);
    let ok = false;
    if (user && pending.method === 'totp') ok = verifyTotp(user.totpSecret, code, now());
    if (user && pending.method === 'email') ok = !!pending.email && pending.email.expires > now() && safeEqual(pending.email.code, code);
    if (!ok) {
      pending.tries = (pending.tries || 0) + 1;
      if (pending.tries >= MAX_CODE_TRIES) pending.dead = true;
      fail(401, 'That code is not right. Try again.', { code: 'invalid_code' });
    }
    if (pending.method === 'email') pending.email = null;
    return user;
  }

  // CSRF: double-submit cookie ps_csrf holding a signed random value.
  function csrfToken(ctx) {
    const existing = parseCookies(ctx.req.headers.cookie).ps_csrf;
    if (existing && validCsrf(existing)) return existing;
    if (ctx.csrfIssued) return ctx.csrfIssued;
    const r = randomBytes(18).toString('base64url');
    const tok = `${r}.${sign('c:' + r)}`;
    setCookie(ctx.res, 'ps_csrf', tok, { httpOnly: false, sameSite: 'Strict', secure: ctx.secure });
    ctx.csrfIssued = tok;
    return tok;
  }
  function validCsrf(tok) {
    const i = String(tok).lastIndexOf('.');
    return i > 0 && safeEqual(tok.slice(i + 1), sign('c:' + tok.slice(0, i)));
  }
  function checkCsrf(ctx, provided) {
    const cookie = parseCookies(ctx.req.headers.cookie).ps_csrf;
    return !!provided && !!cookie && validCsrf(cookie) && safeEqual(provided, cookie);
  }

  function onReset(seedIds) {
    attempts.clear();
    for (const [k, s] of sessions) if (s.pending || (s.userId && !seedIds.has(s.userId))) sessions.delete(k);
    for (const [k, t] of tokens) if (!seedIds.has(t.userId)) tokens.delete(k);
  }

  return {
    sessions, startSession, endSession, resolve, issueToken, revokeToken, checkPassword, sendEmailCode, checkSecondStep,
    csrfToken, checkCsrf, onReset, sessionFromCookie,
  };
}
