// Seeded defects. All off by default. docs/BUGS.md documents these ids; keep the two in step.
// Turn on: env BUGS=all | BUGS=ID,ID ; per browser: ?bugs=on|off|ID,ID on any URL (stored in cookie ps_bugs);
// per request: header x-bugs: on|ID,ID.
export const BUGS = [
  { id: 'DISCOUNT_TWICE', where: 'POST /api/cart/discount', does: 'SAVE10 can be applied a second time in the same cart; the discount becomes 20%.', breaks: ['6.7', '6.8'] },
  { id: 'QTY', where: 'POST /api/cart/items, PATCH /api/cart/items/:id', does: 'Quantities from 11 to 99 are accepted (the limit is 1-10).', breaks: ['6.2'] },
  { id: 'ADMIN_API', where: 'GET /api/admin/orders, PATCH /api/admin/orders/:id', does: 'A signed-in customer gets 200 instead of 403.', breaks: ['9.2'] },
  { id: 'CANCEL_SHIPPED', where: 'POST /api/orders/:id/cancel', does: 'A shipped order can be cancelled (delivered still cannot).', breaks: ['7.9'] },
  { id: 'SUBTOTAL', where: 'cart and order totals', does: 'Line totals are truncated to the cent instead of rounded, so a line whose exact total has half a cent or more is one cent low.', breaks: ['6.6'] },
  { id: 'NOTE_403', where: 'GET/PATCH/DELETE /api/notes/:id, POST /api/notes/:id/share', does: 'Someone who is neither owner nor reader gets 403 instead of 404.', breaks: ['10.5'] },
];

export const BUG_IDS = BUGS.map((b) => b.id);

export function parseBugList(value) {
  const v = String(value ?? '').trim();
  if (!v || /^(off|none|0|false)$/i.test(v)) return new Set();
  if (/^(on|all|1|true)$/i.test(v)) return new Set(BUG_IDS);
  return new Set(v.split(',').map((s) => s.trim().toUpperCase()).filter((s) => BUG_IDS.includes(s)));
}

// Changes: not defects. Off by default; they simulate a new release so repair/healing and API-change detection can be tested.
// Turn on: env CHANGES=all | CHANGES=ID,ID ; per browser: ?changes=on|off|ID,ID (cookie ps_changes) ; per request: header x-changes.
// Pages read the active ids from <html data-changes="CHANGE_UI ..."> (space separated, empty when none), from
// <meta name="ps-changes" content="__CHANGES__"> if a page has it, or from GET /api/csrf {changes:[...]}.
export const CHANGES = [
  { id: 'CHANGE_UI', where: '/login page (builder B)', does: 'The sign-in button reads "Log in" instead of "Sign in" and the email field\'s data-testid moves; the server only exposes the switch.' },
  { id: 'CHANGE_API', where: 'GET /api/products, GET /api/products/:id, /openapi.json', does: 'Products carry `title` instead of `name` and a new field `sku`; /openapi.json documents the changed shape while the switch is on (e.g. /openapi.json?changes=on).' },
];
export const CHANGE_IDS = CHANGES.map((c) => c.id);

export function parseChangeList(value) {
  const v = String(value ?? '').trim();
  if (!v || /^(off|none|0|false)$/i.test(v)) return new Set();
  if (/^(on|all|1|true)$/i.test(v)) return new Set(CHANGE_IDS);
  return new Set(v.split(',').map((s) => s.trim().toUpperCase()).filter((s) => CHANGE_IDS.includes(s)));
}
