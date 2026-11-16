// Each bug switch: off by default (correct behaviour), on via header x-bugs / ?bugs= / env (seeded defect). Also the CHANGE_* switches.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { BUG_IDS, BUGS, CHANGE_IDS, parseBugList } from '../bugs.mjs';
import { asAdmin, asUser, start } from './helpers.mjs';

let s;
before(async () => { s = await start(); });
after(() => s.stop());
beforeEach(() => s.app.reset());

const withBug = (id) => ({ headers: { 'x-bugs': id } });

test('bug list: ids, descriptions, parsing', () => {
  assert.deepEqual(BUG_IDS, ['DISCOUNT_TWICE', 'QTY', 'ADMIN_API', 'CANCEL_SHIPPED', 'SUBTOTAL', 'NOTE_403']);
  for (const b of BUGS) assert.ok(b.does && b.where && b.breaks.length, b.id);
  assert.equal(parseBugList('all').size, BUG_IDS.length);
  assert.equal(parseBugList('off').size, 0);
  assert.deepEqual([...parseBugList('qty, nope ,SUBTOTAL')], ['QTY', 'SUBTOTAL']);
});

describe('each bug: off is correct, on is the defect', () => {
  test('DISCOUNT_TWICE', async () => {
    const c = await asUser(s);
    await c.post('/api/cart/items', { productId: 1, qty: 1 });
    await c.post('/api/cart/discount', { code: 'SAVE10' });
    assert.equal((await c.post('/api/cart/discount', { code: 'SAVE10' })).status, 409);
    const on = await c.post('/api/cart/discount', { code: 'SAVE10' }, withBug('DISCOUNT_TWICE'));
    assert.equal(on.status, 200);
    assert.equal(on.data.discountPercent, 20);
    assert.equal(on.data.discount, 3);
  });

  test('QTY', async () => {
    const c = await asUser(s);
    assert.equal((await c.post('/api/cart/items', { productId: 1, qty: 11 })).status, 400);
    const on = await c.post('/api/cart/items', { productId: 1, qty: 11 }, withBug('QTY'));
    assert.equal(on.status, 201);
    assert.equal(on.data.items[0].qty, 11);
  });

  test('ADMIN_API', async () => {
    const c = await asUser(s);
    assert.equal((await c.get('/api/admin/orders')).status, 403);
    assert.equal((await c.get('/api/admin/orders', withBug('ADMIN_API'))).status, 200);
    assert.equal((await c.patch('/api/admin/orders/1004', { status: 'paid' }, withBug('ADMIN_API'))).status, 200);
    assert.equal((await c.get('/api/admin/users', withBug('ADMIN_API'))).status, 403);
    assert.equal((await s.client().get('/api/admin/orders', withBug('ADMIN_API'))).status, 401);
  });

  test('CANCEL_SHIPPED', async () => {
    const c = await asUser(s);
    assert.equal((await c.post('/api/orders/1002/cancel')).status, 409);
    const on = await c.post('/api/orders/1002/cancel', undefined, withBug('CANCEL_SHIPPED'));
    assert.equal(on.status, 200);
    assert.equal(on.data.status, 'cancelled');
    assert.equal((await c.post('/api/orders/1001/cancel', undefined, withBug('CANCEL_SHIPPED'))).status, 409);
  });

  test('SUBTOTAL', async () => {
    const c = await asUser(s);
    await c.post('/api/cart/items', { productId: 15, qty: 1 }); // 2.495
    assert.equal((await c.get('/api/cart/items')).data.subtotal, 2.5);
    assert.equal((await c.get('/api/cart/items', withBug('SUBTOTAL'))).data.subtotal, 2.49);
    const order = await c.post('/api/orders', { shipping: 'standard', address: { name: 'a', street: 'b', city: 'c', postcode: '123' } }, withBug('SUBTOTAL'));
    assert.equal(order.data.order.total, 2.49);
  });

  test('NOTE_403', async () => {
    const admin = await asAdmin(s);
    assert.equal((await admin.get('/api/notes/1')).status, 404);
    assert.equal((await admin.get('/api/notes/1', withBug('NOTE_403'))).status, 403);
    assert.equal((await admin.get('/api/notes/9999', withBug('NOTE_403'))).status, 404);
  });
});

describe('ways to switch bugs on', () => {
  test('?bugs=on sets a cookie for that browser; ?bugs=off clears it', async () => {
    const c = await asUser(s);
    await c.get('/?bugs=on');
    assert.equal(c.jar.get('ps_bugs'), encodeURIComponent(BUG_IDS.join(',')));
    assert.deepEqual((await c.get('/api/health')).data.bugs, BUG_IDS);
    assert.equal((await c.post('/api/cart/items', { productId: 1, qty: 11 })).status, 201);
    await c.get('/?bugs=off');
    assert.equal(c.jar.has('ps_bugs'), false);
    assert.deepEqual((await c.get('/api/health')).data.bugs, []);
    assert.deepEqual((await s.client().get('/api/health')).data.bugs, []);
  });
  test('env BUGS applies to every visitor', async () => {
    const t = await start({ bugs: 'QTY' });
    try {
      const c = t.client();
      await c.login();
      assert.deepEqual((await c.get('/api/health')).data.bugs, ['QTY']);
      assert.equal((await c.post('/api/cart/items', { productId: 1, qty: 12 })).status, 201);
    } finally { await t.stop(); }
  });
});

describe('change switches (CHANGE_UI, CHANGE_API)', () => {
  test('ids', () => assert.deepEqual(CHANGE_IDS, ['CHANGE_UI', 'CHANGE_API']));

  test('CHANGE_API off: products have name; on: title + sku, and /openapi.json documents it', async () => {
    const off = (await s.client().get('/api/products')).data.items[0];
    assert.ok('name' in off && !('title' in off) && !('sku' in off));
    const on = (await s.client().get('/api/products', { headers: { 'x-changes': 'CHANGE_API' } })).data.items[0];
    assert.ok(!('name' in on) && on.title === off.name && on.sku === 'PS-0001');
    assert.ok('title' in (await s.client().get('/api/products/1', { headers: { 'x-changes': 'CHANGE_API' } })).data);
    const docOff = (await s.client().get('/openapi.json')).data;
    const docOn = (await s.client().get('/openapi.json?changes=on')).data;
    assert.ok(docOff.components.schemas.Product.properties.name);
    assert.ok(!docOn.components.schemas.Product.properties.name);
    assert.ok(docOn.components.schemas.Product.properties.title && docOn.components.schemas.Product.properties.sku);
    assert.equal(docOn.info.version, '1.1.0');
  });

  test('CHANGE_UI is exposed to pages via <html data-changes>, __CHANGES__ and /api/csrf', async () => {
    const c = s.client();
    const off = await c.get('/login');
    assert.match(off.text, /<html lang="en" data-changes="">/);
    assert.deepEqual((await c.get('/api/csrf')).data.changes, []);
    const on = await c.get('/login?changes=CHANGE_UI');
    assert.match(on.text, /data-changes="CHANGE_UI"/);
    // the cookie keeps it on for the next pages of that browser
    assert.match((await c.get('/login')).text, /data-changes="CHANGE_UI"/);
    assert.deepEqual((await c.get('/api/csrf')).data.changes, ['CHANGE_UI']);
    await c.get('/?changes=off');
    assert.match((await c.get('/login')).text, /data-changes=""/);
    const env = await start({ changes: 'all' });
    try { assert.deepEqual((await env.client().get('/api/health')).data.changes, CHANGE_IDS); } finally { await env.stop(); }
  });
});
