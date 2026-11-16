// Small shared helpers: errors, cookies, bodies, JSON-schema-subset validation, money.
import { timingSafeEqual } from 'node:crypto';

const CODES = {
  400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 405: 'method_not_allowed',
  409: 'conflict', 413: 'too_large', 415: 'unsupported_media_type', 423: 'locked', 429: 'rate_limited', 500: 'server_error',
};

export class HttpError extends Error {
  constructor(status, message, { code, field, headers } = {}) {
    super(message);
    this.status = status;
    this.code = code || CODES[status] || 'error';
    this.field = field;
    this.headers = headers;
  }
}

export function fail(status, message, extra) {
  throw new HttpError(status, message, extra);
}

export function errorBody(err) {
  const error = { code: err.code, message: err.message };
  if (err.field) error.field = err.field;
  return { error };
}

export function safeEqual(a, b) {
  const A = Buffer.from(String(a ?? ''));
  const B = Buffer.from(String(b ?? ''));
  return A.length === B.length && timingSafeEqual(A, B);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

export function setCookie(res, name, value, { maxAge, httpOnly = true, sameSite = 'Lax', secure = false } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=${sameSite}`;
  if (maxAge !== undefined) c += `; Max-Age=${Math.floor(maxAge)}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : c);
}

export function sendJson(res, status, body, headers = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store', ...headers });
  res.end(res.req?.method === 'HEAD' ? undefined : data);
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    const tooLarge = () => new HttpError(413, 'The request body must be 1 MB or smaller.');
    if (declared > limit) { req.resume(); return reject(tooLarge()); }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) { done = true; req.resume(); return reject(tooLarge()); }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}

export function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) fail(400, 'The multipart body has no boundary.');
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
  const fields = {};
  const files = [];
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    pos += boundary.length;
    if (buf.subarray(pos, pos + 2).toString() === '--') break;
    pos += 2;
    const headEnd = buf.indexOf('\r\n\r\n', pos);
    if (headEnd < 0) break;
    const head = buf.subarray(pos, headEnd).toString('utf8');
    const next = buf.indexOf(boundary, headEnd + 4);
    if (next < 0) break;
    const data = buf.subarray(headEnd + 4, next - 2);
    const name = /name="([^"]*)"/i.exec(head)?.[1];
    const filename = /filename="([^"]*)"/i.exec(head)?.[1];
    const type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() || '';
    if (filename !== undefined) files.push({ name, filename, type, data });
    else if (name) fields[name] = data.toString('utf8');
    pos = next;
  }
  return { fields, files };
}

// --- validation: a JSON-schema subset (type, required, minLength, maxLength, minimum, maximum, enum, pattern, format email,
// nested objects). Each property may carry `x-message` (the user-facing message) and `x-bug` ({id, ...overrides}).
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validate(schema, value, ctx, where = 'body') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(400, `The request ${where} must be a JSON object.`);
  const out = {};
  for (const [k, raw] of Object.entries(schema.properties || {})) {
    let prop = raw;
    if (prop['x-bug'] && ctx?.bug(prop['x-bug'].id)) prop = { ...prop, ...prop['x-bug'] };
    const v = value[k];
    const msg = prop['x-message'] || `${prop.title || k} is not valid.`;
    const missing = v === undefined || v === null || v === '';
    if (missing) {
      if ((schema.required || []).includes(k)) fail(400, prop['x-message'] || `${prop.title || k} is required.`, { code: 'validation', field: k });
      continue;
    }
    out[k] = checkValue(k, prop, v, msg, ctx);
  }
  return out;
}

function checkValue(k, prop, v, msg, ctx) {
  const bad = () => fail(400, msg, { code: 'validation', field: k });
  switch (prop.type) {
    case 'string': {
      if (typeof v !== 'string') bad();
      const s = prop['x-trim'] === false ? v : v.trim();
      if (prop.minLength !== undefined && [...s].length < prop.minLength) bad();
      if (prop.maxLength !== undefined && [...s].length > prop.maxLength) bad();
      if (prop.pattern && !new RegExp(prop.pattern).test(s)) bad();
      if (prop.format === 'email' && (!EMAIL.test(s) || s.length > 254)) bad();
      if (prop.enum && !prop.enum.includes(s)) bad();
      return s;
    }
    case 'integer':
    case 'number': {
      let n = v;
      if (typeof n === 'string' && /^-?\d+(\.\d+)?$/.test(n.trim())) n = Number(n);
      if (typeof n !== 'number' || !Number.isFinite(n)) bad();
      if (prop.type === 'integer' && !Number.isInteger(n)) bad();
      if (prop.minimum !== undefined && n < prop.minimum) bad();
      if (prop.maximum !== undefined && n > prop.maximum) bad();
      return n;
    }
    case 'boolean': {
      if (v === true || v === 'true' || v === 'on' || v === '1') return true;
      if (v === false || v === 'false' || v === '0') return false;
      return bad();
    }
    case 'object': {
      if (typeof v !== 'object' || Array.isArray(v)) bad();
      return validate(prop, v, ctx, k);
    }
    default:
      return v;
  }
}

// Money: prices are kept in thousandths of a dollar ("mills") so half-cent rounding is real; totals are whole cents.
export const dollars = (cents) => Math.round(cents) / 100;
export const fmt = (cents) => `$${(cents / 100).toFixed(2)}`;
