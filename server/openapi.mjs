// /openapi.json, generated from the route table in api.mjs. Routes marked `undocumented` are left out on purpose.
const money = { type: 'number', description: 'US dollars' };
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });

const User = { type: 'object', required: ['id', 'email', 'name', 'role'], properties: {
  id: { type: 'integer' }, email: { type: 'string', format: 'email' }, name: { type: 'string' }, role: { type: 'string', enum: ['customer', 'admin'] },
  twoFactor: { type: ['string', 'null'], enum: ['totp', 'email', null] }, hasAvatar: { type: 'boolean' }, avatarUrl: { type: ['string', 'null'] }, createdAt: { type: 'string', format: 'date-time' } } };
const Product = { type: 'object', properties: {
  id: { type: 'integer' }, name: { type: 'string' }, category: { type: 'string' }, price: { type: 'number', description: 'US dollars, may have a third decimal (per-unit prices)' },
  stock: { type: 'integer' }, inStock: { type: 'boolean' }, rating: { type: 'number' }, description: { type: 'string' } } };
const Cart = { type: 'object', properties: {
  items: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, productId: { type: 'integer' }, name: { type: 'string' }, price: { type: 'number' }, qty: { type: 'integer', minimum: 1, maximum: 10 }, lineTotal: money, stock: { type: 'integer' } } } },
  count: { type: 'integer' }, subtotal: money, discountCode: { type: ['string', 'null'] }, discountPercent: { type: 'integer' }, discount: money,
  shipping: { type: 'object', properties: { method: { type: 'string', enum: ['standard', 'express'] }, cost: money } }, total: money, message: { type: 'string' } } };
const Order = { type: 'object', properties: {
  id: { type: 'integer' }, status: { type: 'string', enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] }, createdAt: { type: 'string', format: 'date-time' },
  lines: { type: 'array', items: { type: 'object', properties: { productId: { type: 'integer' }, name: { type: 'string' }, price: { type: 'number' }, qty: { type: 'integer' }, lineTotal: money } } },
  subtotal: money, discountCode: { type: ['string', 'null'] }, discount: money, shipping: { type: 'object', properties: { method: { type: 'string' }, cost: money } }, total: money,
  address: { type: 'object', properties: { name: { type: 'string' }, street: { type: 'string' }, city: { type: 'string' }, postcode: { type: 'string' } } },
  history: { type: 'array', items: { type: 'object', properties: { status: { type: 'string' }, at: { type: 'string', format: 'date-time' } } } },
  canCancel: { type: 'boolean' }, nextStatuses: { type: 'array', items: { type: 'string' } },
  user: { type: 'object', description: 'admin listings only', properties: { id: { type: 'integer' }, email: { type: 'string' } } } } };
const Note = { type: 'object', properties: {
  id: { type: 'integer' }, title: { type: 'string', maxLength: 80 }, body: { type: 'string', maxLength: 2000 }, role: { type: 'string', enum: ['owner', 'reader'] },
  owner: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string' } } },
  readers: { type: 'array', items: { type: 'string', format: 'email' }, description: 'owner only' },
  createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } };
// CHANGE_API: `name` renamed to `title`, new `sku`.
const CHANGED_PRODUCT = (() => {
  const { name, ...rest } = Product.properties;
  return { type: 'object', properties: { id: rest.id, title: { type: 'string', description: 'was `name` before 1.1.0' }, sku: { type: 'string', example: 'PS-0001' }, ...rest } };
})();
const ChatMessage = { type: 'object', properties: { type: { const: 'chat' }, name: { type: 'string' }, text: { type: 'string', maxLength: 200 }, at: { type: 'string', format: 'date-time' } } };
const list = (item) => ({ type: 'object', properties: { items: { type: 'array', items: ref(item) } } });

const SCHEMAS = {
  Error: { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, field: { type: 'string' } } } } },
  Ok: { type: 'object', properties: { ok: { type: 'boolean' }, message: { type: 'string' } } },
  User, UserResult: { type: 'object', properties: { user: { oneOf: [ref('User'), { type: 'null' }] }, next: { type: 'string' } } },
  LoginResult: { oneOf: [
    { type: 'object', properties: { user: ref('User'), next: { type: 'string' } } },
    { type: 'object', properties: { otpRequired: { const: true }, method: { type: 'string', enum: ['totp', 'email'] }, next: { const: '/otp' }, mailbox: { type: 'string' } } },
  ] },
  UserList: list('User'), Product, ProductList: { type: 'object', properties: { items: { type: 'array', items: ref('Product') }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' }, pages: { type: 'integer' } } },
  Categories: { type: 'object', properties: { categories: { type: 'array', items: { type: 'string' } } } },
  Cart, Order, OrderList: list('Order'), OrderResult: { type: 'object', properties: { order: ref('Order'), message: { type: 'string' } } },
  Note, NoteList: list('Note'), ChatMessage, ChatList: list('ChatMessage'),
  Mailbox: { type: 'object', properties: { to: { type: 'string' }, messages: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, code: { type: 'string' }, link: { type: 'string' }, at: { type: 'string', format: 'date-time' } } } } } },
  Csrf: { type: 'object', properties: { csrfToken: { type: 'string' }, changes: { type: 'array', items: { type: 'string' } } } },
  Health: { type: 'object', required: ['ok'], properties: { ok: { const: true }, uptimeSeconds: { type: 'integer' }, bugs: { type: 'array', items: { type: 'string' } }, changes: { type: 'array', items: { type: 'string' } } } },
};
const MEDIA = { Pdf: 'application/pdf', Image: 'image/png', EventStream: 'text/event-stream' };
const DESCR = { 200: 'OK', 201: 'Created', 101: 'Switching Protocols (WebSocket)', 400: 'Invalid input', 401: 'Not signed in', 403: 'Not allowed (or missing CSRF token on a form post)', 404: 'Not found', 409: 'Conflict with the current state', 413: 'Too large', 426: 'Upgrade required', 429: 'Too many attempts', 500: 'Server error' };

function clean(schema) {
  if (Array.isArray(schema)) return schema.map(clean);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'x-bug' || k === 'x-trim') continue;
    out[k] = clean(v);
  }
  return out;
}

export function buildOpenApi(routes, { changeApi = false } = {}) {
  const paths = {};
  for (const r of routes) {
    if (r.undocumented) continue;
    const p = r.path.replace(/:(\w+)/g, '{$1}');
    const op = { summary: r.summary, tags: [r.tag], operationId: `${r.method.toLowerCase()}_${r.path.replace(/^\/api\//, '').replace(/[/:]+/g, '_')}` };
    const params = r.keys.map((k) => ({ name: k, in: 'path', required: true, schema: { type: 'integer' } }));
    for (const [k, s] of Object.entries(r.query?.properties || {})) params.push({ name: k, in: 'query', required: (r.query.required || []).includes(k), schema: clean(s) });
    params.push(...(r.params || []));
    if (params.length) op.parameters = params;
    if (r.body) op.requestBody = { required: true, content: { 'application/json': { schema: clean(r.body) }, 'application/x-www-form-urlencoded': { schema: clean(r.body) } } };
    if (r.acceptsImage) op.requestBody = { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { avatar: { type: 'string', format: 'binary' } } } }, 'image/png': {}, 'image/jpeg': {} } };
    op.responses = {};
    for (const [code, name] of Object.entries(r.responses || { 200: 'Ok' })) {
      const resp = { description: DESCR[code] || 'Response' };
      if (MEDIA[name]) resp.content = { [MEDIA[name]]: { schema: { type: 'string', format: 'binary' } } };
      else if (SCHEMAS[name]) resp.content = { 'application/json': { schema: ref(name) } };
      op.responses[code] = resp;
    }
    if (r.auth) {
      op.security = [{ cookieAuth: [] }, { bearerAuth: [] }];
      op.responses[401] ||= { description: DESCR[401], content: { 'application/json': { schema: ref('Error') } } };
      if (r.auth === 'admin') op.responses[403] ||= { description: 'Admins only', content: { 'application/json': { schema: ref('Error') } } };
    }
    (paths[p] ||= {})[r.method.toLowerCase()] = op;
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Practice Store API', version: changeApi ? '1.1.0' : '1.0.0', description: 'Practice site for automated testing — not a real shop. All data is fake and in memory. Errors are {"error":{"code","message","field?"}}. Form posts (urlencoded, multipart) need the CSRF token (header x-csrf-token or field _csrf, matching cookie ps_csrf).' },
    servers: [{ url: '/' }],
    paths,
    components: {
      schemas: changeApi ? { ...SCHEMAS, Product: CHANGED_PRODUCT } : SCHEMAS,
      securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'ps_session' }, bearerAuth: { type: 'http', scheme: 'bearer' } },
    },
  };
}
