// The API route table. One table drives dispatch, validation and /openapi.json.
import { hashPassword, verifyPassword } from './auth.mjs';
import { CATEGORIES, COUNTRIES, publicProduct, publicUser } from './store.mjs';
import { dollars, fail, fmt } from './util.mjs';
import { makePdf } from './pdf.mjs';

const MB = 1024 * 1024;
const PASSWORD_RULE = '^(?=.*[A-Za-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,128}$';
const PASSWORD_MSG = 'Use at least 8 characters with a letter, a number and a symbol.';
const QTY_MSG = 'Quantity must be between 1 and 10.';
const NO_ACCESS = 'You do not have access to this page.';
const SHIPPING = { standard: 0, express: 1299 };
const PAGE_SIZE = 12;
const NEXT_STATUS = { pending: ['paid', 'cancelled'], paid: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };

const str = (title, extra = {}) => ({ type: 'string', title, ...extra });
const int = (title, extra = {}) => ({ type: 'integer', title, ...extra });
const qtyProp = { type: 'integer', title: 'Quantity', minimum: 1, maximum: 10, 'x-message': QTY_MSG, 'x-bug': { id: 'QTY', maximum: 99 } };
const noteTitle = str('Title', { minLength: 1, maxLength: 80, 'x-message': 'Enter a title of 1 to 80 characters.' });
const noteBody = str('Body', { maxLength: 2000, 'x-message': 'The note can be at most 2,000 characters.' });

const safeNext = (v, dflt) => (typeof v === 'string' && /^\/(?![/\\])[^\s\\]*$/.test(v) ? v : dflt);
const lineCents = (ctx, mills) => (ctx.bug('SUBTOTAL') ? Math.floor(mills / 10) : Math.round(mills / 10));

// ---------- views
function cartOf(ctx) {
  const { carts } = ctx.app.state;
  if (!carts.has(ctx.user.id)) carts.set(ctx.user.id, { items: [], codes: [] });
  return carts.get(ctx.user.id);
}

function cartTotals(ctx, method = 'standard') {
  const cart = cartOf(ctx);
  const items = cart.items.map((it) => {
    const p = ctx.app.product(it.productId);
    return { id: it.id, productId: p.id, name: p.name, price: p.priceMills / 1000, priceMills: p.priceMills, qty: it.qty, lineTotal: lineCents(ctx, p.priceMills * it.qty), stock: p.stock };
  });
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const percent = Math.min(100, cart.codes.length * 10);
  const discount = Math.round((subtotal * percent) / 100);
  const shipping = items.length ? SHIPPING[method] ?? 0 : 0;
  return { cart, items, subtotal, discount, percent, shipping, total: subtotal - discount + shipping, method };
}

function cartView(ctx, method) {
  const t = cartTotals(ctx, method);
  return {
    items: t.items.map(({ priceMills, ...i }) => ({ ...i, lineTotal: dollars(i.lineTotal) })),
    count: t.items.reduce((s, i) => s + i.qty, 0),
    subtotal: dollars(t.subtotal), discountCode: t.cart.codes[0] || null, discountPercent: t.percent, discount: dollars(t.discount),
    shipping: { method: t.method, cost: dollars(t.shipping) }, total: dollars(t.total),
  };
}

function canCancel(ctx, o) {
  return o.status === 'pending' || o.status === 'paid' || (o.status === 'shipped' && ctx.bug('CANCEL_SHIPPED'));
}

function orderView(ctx, o, withUser = false) {
  const v = {
    id: o.id, status: o.status, createdAt: o.createdAt,
    lines: o.lines.map((l) => ({ productId: l.productId, name: l.name, price: l.priceMills / 1000, qty: l.qty, lineTotal: dollars(l.lineTotal) })),
    subtotal: dollars(o.subtotal), discountCode: o.discountCode, discount: dollars(o.discount),
    shipping: { method: o.shipping.method, cost: dollars(o.shipping.cost) }, total: dollars(o.total),
    address: o.address, history: o.history, canCancel: canCancel(ctx, o),
    nextStatuses: NEXT_STATUS[o.status],
  };
  if (withUser) v.user = { id: o.userId, email: ctx.app.findUser(o.userId)?.email ?? null };
  return v;
}

function noteView(ctx, n) {
  const role = n.ownerId === ctx.user.id ? 'owner' : 'reader';
  const owner = ctx.app.findUser(n.ownerId);
  const v = { id: n.id, title: n.title, body: n.body, role, owner: { id: owner?.id, name: owner?.name, email: owner?.email }, createdAt: n.createdAt, updatedAt: n.updatedAt };
  if (role === 'owner') v.readers = n.readers.map((id) => ctx.app.findUser(id)?.email).filter(Boolean);
  return v;
}

// Owner/reader rule: anyone else gets 404 (403 with bug NOTE_403). `need` = 'read' | 'owner'.
function noteFor(ctx, need) {
  const n = ctx.app.state.notes.find((x) => x.id === ctx.params.id);
  if (!n) fail(404, 'Note not found.');
  const isOwner = n.ownerId === ctx.user.id;
  const isReader = n.readers.includes(ctx.user.id);
  if (!isOwner && !isReader) {
    if (ctx.bug('NOTE_403')) fail(403, 'You do not have access to this note.');
    fail(404, 'Note not found.');
  }
  if (need === 'owner' && !isOwner) fail(403, 'Only the owner can change this note.');
  return n;
}

function ownOrder(ctx) {
  const o = ctx.app.state.orders.find((x) => x.id === ctx.params.id && x.userId === ctx.user.id);
  if (!o) fail(404, 'Order not found.');
  return o;
}

function restock(ctx, o) {
  for (const l of o.lines) { const p = ctx.app.product(l.productId); if (p) p.stock += l.qty; }
}

function setStatus(ctx, o, status) {
  o.status = status;
  o.history.push({ status, at: new Date(ctx.app.now()).toISOString() });
}

// ---------- routes
export const routes = [
  // auth
  {
    method: 'POST', path: '/api/auth/login', tag: 'auth', summary: 'Sign in with email and password', form: true,
    body: { type: 'object', required: ['email', 'password'], properties: {
      email: str('Email', { maxLength: 254, 'x-message': 'Enter your email and password.' }),
      password: str('Password', { maxLength: 128, 'x-trim': false, 'x-message': 'Enter your email and password.' }),
      remember: { type: 'boolean', title: 'Remember me' },
      next: str('Page to open after sign-in', { maxLength: 500 }),
    } },
    responses: { 200: 'LoginResult', 400: 'Error', 401: 'Error', 403: 'Error', 429: 'Error' },
    async handler(ctx) {
      const { email, password, remember = false } = ctx.body;
      const user = await ctx.app.auth.checkPassword(ctx, email, password);
      const next = safeNext(ctx.body.next, '/account');
      const s = ctx.app.auth.startSession(ctx, { remember });
      if (user.twoFactor) {
        s.pending = { userId: user.id, method: user.twoFactor, remember, started: ctx.app.now(), tries: 0, next };
        if (user.twoFactor === 'email') s.pending.email = ctx.app.auth.sendEmailCode(user);
        const out = { otpRequired: true, method: user.twoFactor, next: '/otp' };
        if (user.twoFactor === 'email') out.mailbox = `/mailbox?to=${encodeURIComponent(user.email)}`;
        return { body: out };
      }
      s.userId = user.id;
      return { body: { user: publicUser(user), next } };
    },
  },
  {
    method: 'POST', path: '/api/auth/otp', tag: 'auth', summary: 'Second sign-in step: authenticator or emailed code', form: true,
    body: { type: 'object', required: ['code'], properties: { code: str('Code', { pattern: '^\\d{6}$', 'x-message': 'That code is not right. Try again.' }) } },
    responses: { 200: 'UserResult', 400: 'Error', 401: 'Error' },
    async handler(ctx) {
      const s = ctx.app.auth.sessionFromCookie(ctx.req);
      const p = s?.pending;
      if (!p || p.dead || ctx.app.now() - p.started > 10 * 60 * 1000) fail(400, 'There is no sign-in waiting for a code. Sign in again.', { code: 'no_pending_sign_in' });
      const user = ctx.app.auth.checkSecondStep(p, ctx.body.code);
      const fresh = ctx.app.auth.startSession(ctx, { remember: p.remember });
      fresh.userId = user.id;
      return { body: { user: publicUser(user), next: p.next || '/account' } };
    },
  },
  {
    method: 'POST', path: '/api/auth/otp/resend', tag: 'auth', summary: 'Send a new emailed code for a waiting sign-in',
    responses: { 200: 'Ok', 400: 'Error' },
    handler(ctx) {
      const p = ctx.app.auth.sessionFromCookie(ctx.req)?.pending;
      if (!p || p.dead || p.method !== 'email') fail(400, 'There is no sign-in waiting for an emailed code. Sign in again.', { code: 'no_pending_sign_in' });
      p.email = ctx.app.auth.sendEmailCode(ctx.app.findUser(p.userId));
      p.started = ctx.app.now();
      return { body: { ok: true } };
    },
  },
  {
    method: 'POST', path: '/api/auth/logout', tag: 'auth', summary: 'Sign out (ends the session or revokes the Bearer token)', form: true,
    responses: { 200: 'Ok' },
    handler(ctx) {
      if (ctx.via === 'bearer') ctx.app.auth.revokeToken(ctx.tokenKey);
      else ctx.app.auth.endSession(ctx);
      return { body: { ok: true, next: '/' } };
    },
  },
  {
    method: 'POST', path: '/api/auth/signup', tag: 'auth', summary: 'Create a customer account and sign in', form: true,
    body: { type: 'object', required: ['name', 'email', 'password', 'age', 'country', 'terms'], properties: {
      name: str('Full name', { minLength: 2, maxLength: 60, 'x-message': 'Enter a name of 2 to 60 characters.' }),
      email: str('Email', { format: 'email', 'x-message': 'Enter a valid email address.' }),
      password: str('Password', { pattern: PASSWORD_RULE, 'x-trim': false, 'x-message': PASSWORD_MSG }),
      confirmPassword: str('Confirm password', { maxLength: 128, 'x-trim': false, 'x-message': 'The passwords do not match.' }),
      age: int('Age', { minimum: 18, maximum: 120, 'x-message': 'Enter an age from 18 to 120.' }),
      country: str('Country', { enum: COUNTRIES, 'x-message': 'Choose a country.' }),
      terms: { type: 'boolean', title: 'I accept the terms', 'x-message': 'You must accept the terms.' },
    } },
    responses: { 201: 'UserResult', 400: 'Error', 409: 'Error' },
    async handler(ctx) {
      const b = ctx.body;
      if (b.confirmPassword !== undefined && b.confirmPassword !== b.password) fail(400, 'The passwords do not match.', { code: 'validation', field: 'confirmPassword' });
      if (b.terms !== true) fail(400, 'You must accept the terms.', { code: 'validation', field: 'terms' });
      const st = ctx.app.state;
      const email = b.email.toLowerCase();
      if (st.users.some((u) => u.email === email)) fail(409, 'An account with this email already exists.', { field: 'email' });
      if (st.users.length >= 5000) fail(503, 'The practice site is full. Ask for a reset.');
      const passwordHash = await hashPassword(b.password);
      if (st !== ctx.app.state || st.users.some((u) => u.email === email)) fail(409, 'An account with this email already exists.', { field: 'email' });
      const user = { id: st.next.user++, email, name: b.name, role: 'customer', twoFactor: null, totpSecret: null, passwordHash, usedCodes: [], avatar: null, age: b.age, country: b.country, createdAt: new Date(ctx.app.now()).toISOString() };
      st.users.push(user);
      ctx.app.sendMail({ to: email, subject: 'Welcome to the Practice Store', body: `Hello ${b.name}, your practice account is ready.`, link: '/account' });
      ctx.app.auth.startSession(ctx).userId = user.id;
      return { status: 201, body: { user: publicUser(user), next: '/account' } };
    },
  },
  {
    method: 'POST', path: '/api/auth/token', tag: 'auth', summary: 'Get a Bearer token for API tests', undocumented: true,
    body: { type: 'object', required: ['email', 'password'], properties: {
      email: str('Email', { maxLength: 254, 'x-message': 'Enter your email and password.' }),
      password: str('Password', { maxLength: 128, 'x-trim': false, 'x-message': 'Enter your email and password.' }),
      code: str('Second-step code', { pattern: '^\\d{6}$', 'x-message': 'That code is not right. Try again.' }),
    } },
    async handler(ctx) {
      const user = await ctx.app.auth.checkPassword(ctx, ctx.body.email, ctx.body.password);
      if (user.twoFactor) {
        const code = ctx.body.code;
        if (!code) {
          if (user.twoFactor === 'email') user.tokenPending = { userId: user.id, method: 'email', email: ctx.app.auth.sendEmailCode(user), tries: 0 };
          fail(401, user.twoFactor === 'email' ? 'This account needs the code just sent to the mailbox. Send it as "code".' : 'This account needs the authenticator code. Send it as "code".', { code: 'code_required' });
        }
        const pending = user.twoFactor === 'totp' ? { userId: user.id, method: 'totp' } : user.tokenPending;
        if (!pending || pending.dead || (pending.method === 'email' && !pending.email)) fail(401, 'Ask for a new code first: send the request without "code".', { code: 'code_required' });
        ctx.app.auth.checkSecondStep(pending, code);
        user.tokenPending = null;
      }
      return { status: 201, body: ctx.app.auth.issueToken(user.id) };
    },
  },
  { method: 'GET', path: '/api/csrf', tag: 'auth', summary: 'Get the CSRF token (also set as cookie ps_csrf)', responses: { 200: 'Csrf' },
    handler: (ctx) => ({ body: { csrfToken: ctx.app.auth.csrfToken(ctx), changes: [...ctx.changes] } }) },
  {
    method: 'GET', path: '/api/me', tag: 'account', summary: 'The signed-in user; 401 when nobody is signed in, or 200 {"user":null} with ?optional=1',
    query: { type: 'object', properties: { optional: { type: 'boolean', title: 'Answer 200 {"user":null} instead of 401 when signed out', 'x-message': 'optional must be 1, true, 0 or false.' } } },
    responses: { 200: 'UserResult', 401: 'Error' },
    handler(ctx) {
      if (ctx.user) return { body: { user: publicUser(ctx.user) } };
      if (ctx.query.optional) return { body: { user: null } };
      fail(401, 'You are not signed in.');
    },
  },
  {
    method: 'PATCH', path: '/api/me', tag: 'account', summary: 'Change your name', auth: 'user',
    body: { type: 'object', required: ['name'], properties: { name: str('Name', { minLength: 1, maxLength: 60, 'x-message': 'Enter a name of 1 to 60 characters.' }) } },
    responses: { 200: 'UserResult', 400: 'Error', 401: 'Error' },
    handler(ctx) { ctx.user.name = ctx.body.name; return { body: { user: publicUser(ctx.user) } }; },
  },
  {
    method: 'POST', path: '/api/account/password', tag: 'account', summary: 'Change your password', auth: 'user',
    body: { type: 'object', required: ['current', 'next'], properties: {
      current: str('Current password', { maxLength: 128, 'x-trim': false, 'x-message': 'Your current password is not right.' }),
      next: str('New password', { pattern: PASSWORD_RULE, 'x-trim': false, 'x-message': PASSWORD_MSG }),
    } },
    responses: { 200: 'Ok', 400: 'Error', 401: 'Error' },
    async handler(ctx) {
      if (!(await verifyPassword(ctx.body.current, ctx.user.passwordHash))) fail(400, 'Your current password is not right.', { code: 'validation', field: 'current' });
      ctx.user.passwordHash = await hashPassword(ctx.body.next);
      return { body: { ok: true } };
    },
  },
  {
    method: 'POST', path: '/api/account/avatar', tag: 'account', summary: 'Upload an avatar (PNG or JPEG, at most 1 MB; multipart field "avatar" or a raw image body)', auth: 'user',
    acceptsImage: true, bodyLimit: MB + 64 * 1024, bodyLimitMessage: 'The image must be 1 MB or smaller.',
    responses: { 200: 'UserResult', 400: 'Error', 401: 'Error', 413: 'Error' },
    handler(ctx) {
      let file;
      if (ctx.files) file = ctx.files.find((f) => f.name === 'avatar') || ctx.files[0];
      else if (ctx.rawBody?.length) file = { data: ctx.rawBody };
      if (!file || !file.data.length) fail(400, 'Choose a PNG or JPG image.', { field: 'avatar' });
      if (file.data.length > MB) fail(413, 'The image must be 1 MB or smaller.', { field: 'avatar' });
      const d = file.data;
      const type = d[0] === 0x89 && d.subarray(1, 4).toString() === 'PNG' ? 'image/png' : d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff ? 'image/jpeg' : null;
      if (!type) fail(400, 'Choose a PNG or JPG image.', { code: 'unsupported_type', field: 'avatar' });
      ctx.user.avatar = { type, data: Buffer.from(d) };
      return { body: { user: publicUser(ctx.user), avatarUrl: '/api/account/avatar' } };
    },
  },
  {
    method: 'GET', path: '/api/account/avatar', tag: 'account', summary: 'Your avatar image', auth: 'user', responses: { 200: 'Image', 401: 'Error', 404: 'Error' },
    handler(ctx) {
      const a = ctx.user.avatar;
      if (!a) fail(404, 'No avatar uploaded yet.');
      ctx.res.writeHead(200, { 'Content-Type': a.type, 'Content-Length': a.data.length, 'Cache-Control': 'no-store' });
      ctx.res.end(a.data);
    },
  },
  {
    method: 'GET', path: '/api/account/invoice/:orderId', tag: 'account', summary: 'Download the invoice of one of your orders', auth: 'user', responses: { 200: 'Pdf', 401: 'Error', 404: 'Error' },
    handler(ctx) {
      const o = ctx.app.state.orders.find((x) => x.id === ctx.params.orderId && x.userId === ctx.user.id);
      if (!o) fail(404, 'Order not found.');
      const lines = ['Practice Store - INVOICE (practice data, not a real invoice)', '', `Invoice for order ${o.id}`, `Date: ${o.createdAt.slice(0, 10)}`, `Customer: ${ctx.user.name} <${ctx.user.email}>`, `Status: ${o.status}`, '',
        ...o.lines.map((l) => `${l.qty} x ${l.name} @ ${fmt(l.priceMills / 10)} = ${fmt(l.lineTotal)}`), '',
        `Subtotal: ${fmt(o.subtotal)}`, `Discount${o.discountCode ? ' (' + o.discountCode + ')' : ''}: -${fmt(o.discount)}`, `Shipping (${o.shipping.method}): ${fmt(o.shipping.cost)}`, `Total: ${fmt(o.total)}`];
      const pdf = makePdf(lines);
      ctx.res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="invoice-${o.id}.pdf"`, 'Content-Length': pdf.length, 'Cache-Control': 'no-store' });
      ctx.res.end(pdf);
    },
  },

  // products
  { method: 'GET', path: '/api/categories', tag: 'products', summary: 'Product categories', responses: { 200: 'Categories' }, handler: () => ({ body: { categories: CATEGORIES } }) },
  {
    method: 'GET', path: '/api/products', tag: 'products', summary: 'Search and list products, 12 per page',
    query: { type: 'object', properties: {
      q: str('Search text (matches the name)', { maxLength: 100, 'x-message': 'Search text can be at most 100 characters.' }),
      category: str('Category', { enum: CATEGORIES, 'x-message': 'Unknown category.' }),
      page: int('Page', { minimum: 1, maximum: 1000, 'x-message': 'Page must be a whole number from 1.' }),
      minPrice: { type: 'number', title: 'Lowest price', minimum: 0, 'x-message': 'Prices must be numbers from 0.' },
      maxPrice: { type: 'number', title: 'Highest price', minimum: 0, 'x-message': 'Prices must be numbers from 0.' },
      inStock: { type: 'boolean', title: 'In stock only', 'x-message': 'inStock must be true or false.' },
      sort: str('Sort', { enum: ['name', 'price', '-price', 'rating'], 'x-message': 'Sort must be name, price, -price or rating.' }),
    } },
    responses: { 200: 'ProductList', 400: 'Error' },
    handler(ctx) {
      const { q, category, page = 1, minPrice, maxPrice, inStock, sort } = ctx.query;
      let items = ctx.app.state.products.filter((p) =>
        (!q || p.name.toLowerCase().includes(q.toLowerCase())) && (!category || p.category === category) &&
        (minPrice === undefined || p.priceMills >= minPrice * 1000) && (maxPrice === undefined || p.priceMills <= maxPrice * 1000) && (!inStock || p.stock > 0));
      const cmp = { name: (a, b) => a.name.localeCompare(b.name), price: (a, b) => a.priceMills - b.priceMills, '-price': (a, b) => b.priceMills - a.priceMills, rating: (a, b) => b.rating - a.rating }[sort];
      if (cmp) items = [...items].sort(cmp);
      const total = items.length;
      return { body: { items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((p) => publicProduct(p, ctx.change('CHANGE_API'))), total, page, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) } };
    },
  },
  { method: 'GET', path: '/api/products/:id', tag: 'products', summary: 'One product', responses: { 200: 'Product', 404: 'Error' },
    handler(ctx) { const p = ctx.app.product(ctx.params.id); if (!p) fail(404, 'Product not found.'); return { body: publicProduct(p, ctx.change('CHANGE_API')) }; } },

  // cart
  {
    method: 'GET', path: '/api/cart/items', tag: 'cart', summary: 'Your cart with totals', auth: 'user',
    query: { type: 'object', properties: { shipping: str('Shipping choice for the total', { enum: ['standard', 'express'], 'x-message': 'Choose standard or express shipping.' }) } },
    responses: { 200: 'Cart', 401: 'Error' },
    handler: (ctx) => ({ body: cartView(ctx, ctx.query.shipping) }),
  },
  {
    method: 'POST', path: '/api/cart/items', tag: 'cart', summary: 'Add a product (adds to the line if it is already in the cart)', auth: 'user',
    body: { type: 'object', required: ['productId'], properties: { productId: int('Product', { minimum: 1, 'x-message': 'Choose a product.' }), qty: qtyProp } },
    responses: { 201: 'Cart', 400: 'Error', 401: 'Error', 404: 'Error', 409: 'Error' },
    handler(ctx) {
      const { productId, qty = 1 } = ctx.body;
      const p = ctx.app.product(productId);
      if (!p) fail(404, 'Product not found.');
      if (p.stock <= 0) fail(409, 'This product is out of stock.', { code: 'out_of_stock' });
      const cart = cartOf(ctx);
      const line = cart.items.find((i) => i.productId === p.id);
      const total = (line?.qty || 0) + qty;
      if (total > (ctx.bug('QTY') ? 99 : 10)) fail(400, QTY_MSG, { code: 'validation', field: 'qty' });
      if (total > p.stock) fail(409, `Only ${p.stock} left in stock.`, { code: 'out_of_stock', field: 'qty' });
      if (line) line.qty = total;
      else { if (cart.items.length >= 50) fail(400, 'Your cart can hold at most 50 different products.'); cart.items.push({ id: ctx.app.state.next.cartItem++, productId: p.id, qty }); }
      return { status: 201, body: cartView(ctx) };
    },
  },
  {
    method: 'DELETE', path: '/api/cart/items', tag: 'cart', summary: 'Empty your cart', auth: 'user', responses: { 200: 'Cart', 401: 'Error' },
    handler(ctx) { const c = cartOf(ctx); c.items = []; c.codes = []; return { body: cartView(ctx) }; },
  },
  {
    method: 'PATCH', path: '/api/cart/items/:id', tag: 'cart', summary: 'Change a line quantity (1-10)', auth: 'user',
    body: { type: 'object', required: ['qty'], properties: { qty: qtyProp } },
    responses: { 200: 'Cart', 400: 'Error', 401: 'Error', 404: 'Error', 409: 'Error' },
    handler(ctx) {
      const line = cartOf(ctx).items.find((i) => i.id === ctx.params.id);
      if (!line) fail(404, 'Cart line not found.');
      const p = ctx.app.product(line.productId);
      if (ctx.body.qty > p.stock) fail(409, `Only ${p.stock} left in stock.`, { code: 'out_of_stock', field: 'qty' });
      line.qty = ctx.body.qty;
      return { body: cartView(ctx) };
    },
  },
  {
    method: 'DELETE', path: '/api/cart/items/:id', tag: 'cart', summary: 'Remove a line', auth: 'user', responses: { 200: 'Cart', 401: 'Error', 404: 'Error' },
    handler(ctx) {
      const c = cartOf(ctx);
      const i = c.items.findIndex((x) => x.id === ctx.params.id);
      if (i < 0) fail(404, 'Cart line not found.');
      c.items.splice(i, 1);
      return { body: cartView(ctx) };
    },
  },
  {
    method: 'POST', path: '/api/cart/discount', tag: 'cart', summary: 'Apply a discount code (SAVE10: 10% off, once per account)', auth: 'user',
    body: { type: 'object', required: ['code'], properties: { code: str('Discount code', { maxLength: 40, 'x-message': 'This code is not valid.' }) } },
    responses: { 200: 'Cart', 400: 'Error', 401: 'Error', 409: 'Error' },
    handler(ctx) {
      const code = ctx.body.code.toUpperCase();
      if (code !== 'SAVE10') fail(400, 'This code is not valid.', { code: 'invalid_code', field: 'code' });
      const cart = cartOf(ctx);
      if (cart.codes.includes(code) && !(ctx.bug('DISCOUNT_TWICE') && cart.codes.length < 2)) fail(409, 'This code is already applied.', { code: 'already_applied', field: 'code' });
      if (ctx.user.usedCodes.includes(code)) fail(409, 'This code has already been used.', { code: 'already_used', field: 'code' });
      cart.codes.push(code);
      return { body: { ...cartView(ctx), message: 'SAVE10 applied: 10% off' } };
    },
  },
  {
    method: 'DELETE', path: '/api/cart/discount', tag: 'cart', summary: 'Remove the discount code', auth: 'user', responses: { 200: 'Cart', 401: 'Error' },
    handler(ctx) { cartOf(ctx).codes = []; return { body: cartView(ctx) }; },
  },

  // orders
  {
    method: 'POST', path: '/api/orders', tag: 'orders', summary: 'Place an order from your cart', auth: 'user',
    body: { type: 'object', required: ['shipping', 'address'], properties: {
      shipping: str('Shipping', { enum: ['standard', 'express'], 'x-message': 'Choose standard or express shipping.' }),
      address: { type: 'object', title: 'Shipping address', 'x-message': 'Enter the shipping address.', required: ['name', 'street', 'city', 'postcode'], properties: {
        name: str('Name', { minLength: 1, maxLength: 60, 'x-message': 'Enter the name for the address.' }),
        street: str('Street', { minLength: 1, maxLength: 100, 'x-message': 'Enter the street.' }),
        city: str('City', { minLength: 1, maxLength: 60, 'x-message': 'Enter the city.' }),
        postcode: str('Postcode', { pattern: '^[A-Za-z0-9 -]{3,10}$', 'x-message': 'Enter a postcode of 3 to 10 letters or digits.' }),
      } },
    } },
    responses: { 201: 'OrderResult', 400: 'Error', 401: 'Error', 409: 'Error' },
    handler(ctx) {
      const st = ctx.app.state;
      const t = cartTotals(ctx, ctx.body.shipping);
      if (!t.items.length) fail(400, 'Your cart is empty.', { code: 'cart_empty' });
      for (const i of t.items) if (i.qty > i.stock) fail(409, `Only ${i.stock} of "${i.name}" left in stock.`, { code: 'out_of_stock' });
      const now = new Date(ctx.app.now()).toISOString();
      const o = {
        id: st.next.order++, userId: ctx.user.id,
        lines: t.items.map((i) => ({ productId: i.productId, name: i.name, priceMills: i.priceMills, qty: i.qty, lineTotal: i.lineTotal })),
        subtotal: t.subtotal, discountCode: t.cart.codes[0] || null, discount: t.discount, shipping: { method: t.method, cost: t.shipping }, total: t.total,
        address: ctx.body.address, status: 'pending', history: [{ status: 'pending', at: now }], createdAt: now,
      };
      for (const i of t.items) ctx.app.product(i.productId).stock -= i.qty;
      if (o.discountCode && !ctx.user.usedCodes.includes(o.discountCode)) ctx.user.usedCodes.push(o.discountCode);
      st.orders.push(o);
      st.carts.delete(ctx.user.id);
      return { status: 201, body: { order: orderView(ctx, o), message: 'Order placed' } };
    },
  },
  { method: 'GET', path: '/api/orders', tag: 'orders', summary: 'Your orders, newest first', auth: 'user', responses: { 200: 'OrderList', 401: 'Error' },
    handler: (ctx) => ({ body: { items: ctx.app.state.orders.filter((o) => o.userId === ctx.user.id).sort((a, b) => b.id - a.id).map((o) => orderView(ctx, o)) } }) },
  { method: 'GET', path: '/api/orders/:id', tag: 'orders', summary: 'One of your orders', auth: 'user', responses: { 200: 'Order', 401: 'Error', 404: 'Error' },
    handler: (ctx) => ({ body: orderView(ctx, ownOrder(ctx)) }) },
  {
    method: 'POST', path: '/api/orders/:id/cancel', tag: 'orders', summary: 'Cancel your order (only while pending or paid)', auth: 'user',
    responses: { 200: 'Order', 401: 'Error', 404: 'Error', 409: 'Error' },
    handler(ctx) {
      const o = ownOrder(ctx);
      if (o.status === 'cancelled') fail(409, 'This status change is not allowed.', { code: 'invalid_transition' });
      if (!canCancel(ctx, o)) fail(409, 'This order has already shipped and can no longer be cancelled.', { code: 'already_shipped' });
      setStatus(ctx, o, 'cancelled');
      restock(ctx, o);
      return { body: orderView(ctx, o) };
    },
  },

  // admin
  { method: 'GET', path: '/api/admin/users', tag: 'admin', summary: 'Every account (admin)', auth: 'admin', responses: { 200: 'UserList', 401: 'Error', 403: 'Error' },
    handler: (ctx) => ({ body: { items: ctx.app.state.users.map(publicUser) } }) },
  {
    method: 'PATCH', path: '/api/admin/users/:id', tag: 'admin', summary: 'Change an account role (admin)', auth: 'admin',
    body: { type: 'object', required: ['role'], properties: { role: str('Role', { enum: ['customer', 'admin'], 'x-message': 'Role must be customer or admin.' }) } },
    responses: { 200: 'UserResult', 400: 'Error', 401: 'Error', 403: 'Error', 404: 'Error', 409: 'Error' },
    handler(ctx) {
      const u = ctx.app.findUser(ctx.params.id);
      if (!u) fail(404, 'User not found.');
      if (u.id === ctx.user.id) fail(409, 'You cannot change your own role.', { code: 'own_role' });
      u.role = ctx.body.role;
      return { body: { user: publicUser(u) } };
    },
  },
  { method: 'GET', path: '/api/admin/orders', tag: 'admin', summary: 'Every order, newest first (admin)', auth: 'admin', bugAllows: 'ADMIN_API', responses: { 200: 'OrderList', 401: 'Error', 403: 'Error' },
    handler: (ctx) => ({ body: { items: [...ctx.app.state.orders].sort((a, b) => b.id - a.id).map((o) => orderView(ctx, o, true)) } }) },
  {
    method: 'PATCH', path: '/api/admin/orders/:id', tag: 'admin', summary: 'Move an order to its next status: pending -> paid -> shipped -> delivered, or cancelled from pending/paid (admin)', auth: 'admin', bugAllows: 'ADMIN_API',
    body: { type: 'object', required: ['status'], properties: { status: str('Status', { enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'], 'x-message': 'Status must be pending, paid, shipped, delivered or cancelled.' }) } },
    responses: { 200: 'Order', 400: 'Error', 401: 'Error', 403: 'Error', 404: 'Error', 409: 'Error' },
    handler(ctx) {
      const o = ctx.app.state.orders.find((x) => x.id === ctx.params.id);
      if (!o) fail(404, 'Order not found.');
      if (!NEXT_STATUS[o.status].includes(ctx.body.status)) fail(409, 'This status change is not allowed.', { code: 'invalid_transition' });
      setStatus(ctx, o, ctx.body.status);
      if (o.status === 'cancelled') restock(ctx, o);
      return { body: orderView(ctx, o, true) };
    },
  },

  // notes
  { method: 'GET', path: '/api/notes', tag: 'notes', summary: 'Notes you own or that were shared with you', auth: 'user', responses: { 200: 'NoteList', 401: 'Error' },
    handler: (ctx) => ({ body: { items: ctx.app.state.notes.filter((n) => n.ownerId === ctx.user.id || n.readers.includes(ctx.user.id)).map((n) => noteView(ctx, n)) } }) },
  {
    method: 'POST', path: '/api/notes', tag: 'notes', summary: 'Create a note', auth: 'user',
    body: { type: 'object', required: ['title'], properties: { title: noteTitle, body: noteBody } },
    responses: { 201: 'Note', 400: 'Error', 401: 'Error' },
    handler(ctx) {
      const st = ctx.app.state;
      if (st.notes.filter((n) => n.ownerId === ctx.user.id).length >= 200) fail(400, 'You can have at most 200 notes.');
      const now = new Date(ctx.app.now()).toISOString();
      const n = { id: st.next.note++, ownerId: ctx.user.id, title: ctx.body.title, body: ctx.body.body || '', readers: [], createdAt: now, updatedAt: now };
      st.notes.push(n);
      return { status: 201, body: noteView(ctx, n) };
    },
  },
  { method: 'GET', path: '/api/notes/:id', tag: 'notes', summary: 'One note (owner or reader; anyone else gets 404)', auth: 'user', responses: { 200: 'Note', 401: 'Error', 404: 'Error' },
    handler: (ctx) => ({ body: noteView(ctx, noteFor(ctx, 'read')) }) },
  {
    method: 'PATCH', path: '/api/notes/:id', tag: 'notes', summary: 'Edit a note (owner only; a reader gets 403, anyone else 404)', auth: 'user',
    body: { type: 'object', properties: { title: noteTitle, body: noteBody } },
    responses: { 200: 'Note', 400: 'Error', 401: 'Error', 403: 'Error', 404: 'Error' },
    handler(ctx) {
      const n = noteFor(ctx, 'owner');
      if (ctx.body.title !== undefined) n.title = ctx.body.title;
      if (ctx.body.body !== undefined) n.body = ctx.body.body;
      n.updatedAt = new Date(ctx.app.now()).toISOString();
      return { body: noteView(ctx, n) };
    },
  },
  {
    method: 'DELETE', path: '/api/notes/:id', tag: 'notes', summary: 'Delete a note (owner only)', auth: 'user', responses: { 200: 'Ok', 401: 'Error', 403: 'Error', 404: 'Error' },
    handler(ctx) {
      const n = noteFor(ctx, 'owner');
      ctx.app.state.notes = ctx.app.state.notes.filter((x) => x !== n);
      return { body: { ok: true } };
    },
  },
  {
    method: 'POST', path: '/api/notes/:id/share', tag: 'notes', summary: 'Share a note with another account as a reader (owner only)', auth: 'user',
    body: { type: 'object', required: ['email'], properties: { email: str('Email', { format: 'email', 'x-message': 'Enter a valid email address.' }) } },
    responses: { 200: 'Note', 400: 'Error', 401: 'Error', 403: 'Error', 404: 'Error' },
    handler(ctx) {
      const n = noteFor(ctx, 'owner');
      const u = ctx.app.state.users.find((x) => x.email === ctx.body.email.toLowerCase());
      if (!u) fail(404, 'There is no account with this email.', { field: 'email' });
      if (u.id === n.ownerId) fail(400, 'You already own this note.', { field: 'email' });
      if (!n.readers.includes(u.id)) n.readers.push(u.id);
      return { body: noteView(ctx, n) };
    },
  },

  // mailbox, live, misc
  {
    method: 'GET', path: '/api/mailbox', tag: 'mailbox', summary: 'The fake mailbox: messages the site "sent" to an address, newest first',
    query: { type: 'object', required: ['to'], properties: { to: str('Email address', { maxLength: 254, 'x-message': 'Add ?to=<email address>.' }) } },
    responses: { 200: 'Mailbox', 400: 'Error' },
    handler(ctx) {
      const to = ctx.query.to.toLowerCase();
      return { body: { to, messages: ctx.app.state.mail.filter((m) => m.to === to).slice().reverse() } };
    },
  },
  { method: 'GET', path: '/api/live/events', tag: 'live', summary: 'Server-sent events: `data: {"count":N}` every second, `event: chat` for chat messages', responses: { 200: 'EventStream' },
    handler(ctx) { ctx.app.live.handleSse(ctx); } },
  { method: 'GET', path: '/api/live/ws', tag: 'live', summary: 'WebSocket chat: send {"type":"chat","text":"..."} (at most 200 characters); every client receives {"type":"chat",...}', responses: { 101: 'Upgrade', 426: 'Error' },
    handler() { fail(426, 'Open this address with a WebSocket connection.', { code: 'upgrade_required' }); } },
  {
    method: 'POST', path: '/api/live/chat', tag: 'live', summary: 'Send a chat message over HTTP (broadcast to WebSocket and SSE clients)',
    body: { type: 'object', required: ['text'], properties: { text: str('Message', { minLength: 1, maxLength: 200, 'x-message': 'A message must be 1 to 200 characters.' }) } },
    responses: { 201: 'ChatMessage', 400: 'Error' },
    handler(ctx) { const r = ctx.app.live.chat(ctx.user?.name || 'Guest', ctx.body.text); if (r.error) fail(400, r.error); return { status: 201, body: r.message }; },
  },
  { method: 'GET', path: '/api/live/messages', tag: 'live', summary: 'The last 20 chat messages', responses: { 200: 'ChatList' },
    handler: (ctx) => ({ body: { items: ctx.app.live.messages } }) },
  { method: 'GET', path: '/api/health', tag: 'system', summary: 'Health check', responses: { 200: 'Health' },
    handler: (ctx) => ({ body: { ok: true, uptimeSeconds: Math.round(process.uptime()), bugs: [...ctx.bugs], changes: [...ctx.changes] } }) },
  {
    method: 'POST', path: '/api/reset', tag: 'system', summary: 'Restore the seeded data (header x-reset-token = RESET_TOKEN)', responses: { 200: 'Ok', 403: 'Error' },
    params: [{ name: 'x-reset-token', in: 'header', required: true, schema: { type: 'string' } }],
    handler(ctx) { ctx.app.checkResetToken(ctx.req); ctx.app.reset(); return { body: { ok: true, message: 'The seeded data was restored.' } }; },
  },
  { method: 'GET', path: '/api/slow', tag: 'system', summary: 'Answers after about 3 seconds', responses: { 200: 'Ok' },
    async handler(ctx) { await new Promise((r) => setTimeout(r, ctx.app.options.slowMs)); return { body: { ok: true, waitedMs: ctx.app.options.slowMs } }; } },
  { method: 'GET', path: '/api/broken', tag: 'system', summary: 'Always fails with 500 (on purpose)', responses: { 500: 'Error' },
    handler() { fail(500, 'This endpoint always fails, on purpose.', { code: 'deliberate_failure' }); } },
  {
    method: 'GET', path: '/api/internal/stats', tag: 'system', summary: 'Internal counters', undocumented: true,
    handler(ctx) {
      const st = ctx.app.state;
      return { body: { users: st.users.length, orders: st.orders.length, notes: st.notes.length, carts: st.carts.size, mail: st.mail.length, sessions: ctx.app.auth.sessions.size, liveCount: ctx.app.live.count } };
    },
  },
];

for (const r of routes) {
  r.keys = [];
  r.regex = new RegExp('^' + r.path.replace(/:(\w+)/g, (_, k) => { r.keys.push(k); return '([^/]+)'; }) + '$');
}

