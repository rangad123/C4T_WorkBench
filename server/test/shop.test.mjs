import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { RESET_TOKEN, asAdmin, asUser, start } from './helpers.mjs';

let s;
before(async () => { s = await start(); });
after(() => s.stop());
beforeEach(() => s.app.reset());

const address = { name: 'Pat', street: '1 Road', city: 'Town', postcode: '12345' };

describe('products', () => {
  test('list is paged 12 at a time with totals', async () => {
    const r = await s.client().get('/api/products');
    assert.equal(r.status, 200);
    assert.equal(r.data.items.length, 12);
    assert.equal(r.data.total, 24);
    assert.equal(r.data.pages, 2);
    assert.equal((await s.client().get('/api/products?page=2')).data.items.length, 12);
    assert.equal((await s.client().get('/api/products?page=3')).data.items.length, 0);
    for (const k of ['id', 'name', 'category', 'price', 'stock', 'description']) assert.ok(k in r.data.items[0], k);
  });
  test('search matches the name, case-insensitive; filters work', async () => {
    const q = await s.client().get('/api/products?q=TEA');
    assert.deepEqual(q.data.items.map((p) => p.name), ['Loose Tea (per 100 g)']);
    assert.equal((await s.client().get('/api/products?q=zzzz')).data.total, 0);
    const cat = await s.client().get('/api/products?category=toys');
    assert.ok(cat.data.items.every((p) => p.category === 'toys'));
    const price = await s.client().get('/api/products?minPrice=10&maxPrice=20');
    assert.ok(price.data.items.every((p) => p.price >= 10 && p.price <= 20));
    const stock = await s.client().get('/api/products?inStock=true');
    assert.equal(stock.data.total, 23);
    const sorted = (await s.client().get('/api/products?sort=price')).data.items.map((p) => p.price);
    assert.deepEqual(sorted, [...sorted].sort((a, b) => a - b));
  });
  test('bad query values are 400', async () => {
    assert.equal((await s.client().get('/api/products?page=0')).status, 400);
    assert.equal((await s.client().get('/api/products?page=x')).status, 400);
    assert.equal((await s.client().get('/api/products?category=cars')).status, 400);
    assert.equal((await s.client().get('/api/products?q=' + 'a'.repeat(101))).status, 400);
  });
  test('one product; unknown id is 404', async () => {
    assert.equal((await s.client().get('/api/products/1')).data.id, 1);
    const r = await s.client().get('/api/products/999');
    assert.equal(r.status, 404);
    assert.equal(r.data.error.message, 'Product not found.');
    assert.equal((await s.client().get('/api/products/abc')).status, 404);
    assert.deepEqual((await s.client().get('/api/categories')).data.categories.length, 6);
  });
});

describe('cart', () => {
  test('needs sign-in', async () => {
    assert.equal((await s.client().get('/api/cart/items')).status, 401);
    assert.equal((await s.client().post('/api/cart/items', { productId: 1, qty: 1 })).status, 401);
  });
  test('add, merge, change, remove, empty; totals round to the cent', async () => {
    const c = await asUser(s);
    let r = await c.post('/api/cart/items', { productId: 15, qty: 1 }); // $2.495
    assert.equal(r.status, 201);
    assert.equal(r.data.items[0].lineTotal, 2.5);
    r = await c.post('/api/cart/items', { productId: 15, qty: 2 });
    assert.equal(r.data.items.length, 1);
    assert.equal(r.data.items[0].qty, 3);
    assert.equal(r.data.items[0].lineTotal, 7.49); // 7.485 -> 7.49
    r = await c.post('/api/cart/items', { productId: 1, qty: 2 }); // 14.99 x 2
    assert.equal(r.data.subtotal, 37.47);
    assert.equal(r.data.total, 37.47);
    assert.equal((await c.get('/api/cart/items?shipping=express')).data.total, 47.46);
    const lineId = r.data.items[0].id;
    r = await c.patch(`/api/cart/items/${lineId}`, { qty: 5 });
    assert.equal(r.data.items[0].qty, 5);
    r = await c.del(`/api/cart/items/${lineId}`);
    assert.equal(r.data.items.length, 1);
    assert.equal((await c.del(`/api/cart/items/${lineId}`)).status, 404);
    r = await c.del('/api/cart/items');
    assert.equal(r.data.items.length, 0);
  });
  test('quantity must be 1-10, also after merging', async () => {
    const c = await asUser(s);
    for (const qty of [0, 11, -1, 2.5, 'x']) {
      const r = await c.post('/api/cart/items', { productId: 1, qty });
      assert.equal(r.status, 400, String(qty));
      assert.equal(r.data.error.message, 'Quantity must be between 1 and 10.');
    }
    assert.equal((await c.post('/api/cart/items', { productId: 1, qty: 10 })).status, 201);
    assert.equal((await c.post('/api/cart/items', { productId: 1, qty: 1 })).status, 400);
    const id = (await c.get('/api/cart/items')).data.items[0].id;
    assert.equal((await c.patch(`/api/cart/items/${id}`, { qty: 11 })).status, 400);
    assert.equal((await c.patch(`/api/cart/items/${id}`, { qty: 0 })).status, 400);
  });
  test('out of stock and unknown product are refused', async () => {
    const c = await asUser(s);
    const r = await c.post('/api/cart/items', { productId: 4, qty: 1 });
    assert.equal(r.status, 409);
    assert.equal((await c.post('/api/cart/items', { productId: 999, qty: 1 })).status, 404);
  });
  test('carts are per user', async () => {
    const a = await asUser(s);
    await a.post('/api/cart/items', { productId: 1, qty: 1 });
    const b = await asAdmin(s);
    assert.equal((await b.get('/api/cart/items')).data.items.length, 0);
    const lineId = (await a.get('/api/cart/items')).data.items[0].id;
    assert.equal((await b.patch(`/api/cart/items/${lineId}`, { qty: 2 })).status, 404);
  });
  test('SAVE10: 10% off once per account, case-insensitive; unknown code 400', async () => {
    const c = await asUser(s);
    await c.post('/api/cart/items', { productId: 1, qty: 1 }); // 14.99
    const bad = await c.post('/api/cart/discount', { code: 'SAVE99' });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.error.message, 'This code is not valid.');
    const ok = await c.post('/api/cart/discount', { code: 'save10' });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.message, 'SAVE10 applied: 10% off');
    assert.equal(ok.data.discount, 1.5);
    assert.equal(ok.data.total, 13.49);
    const again = await c.post('/api/cart/discount', { code: 'SAVE10' });
    assert.equal(again.status, 409);
    assert.equal(again.data.error.message, 'This code is already applied.');
    assert.equal((await c.get('/api/cart/items')).data.discount, 1.5);
    const order = await c.post('/api/orders', { shipping: 'standard', address });
    assert.equal(order.data.order.discountCode, 'SAVE10');
    await c.post('/api/cart/items', { productId: 1, qty: 1 });
    const used = await c.post('/api/cart/discount', { code: 'SAVE10' });
    assert.equal(used.status, 409);
    assert.equal(used.data.error.message, 'This code has already been used.');
  });
});

describe('orders', () => {
  test('place from cart: pending, cart emptied, stock reduced, totals with express', async () => {
    const c = await asUser(s);
    assert.equal((await c.post('/api/orders', { shipping: 'standard', address })).data.error.message, 'Your cart is empty.');
    const before = (await c.get('/api/products/10')).data.stock;
    await c.post('/api/cart/items', { productId: 10, qty: 2 });
    const r = await c.post('/api/orders', { shipping: 'express', address });
    assert.equal(r.status, 201);
    assert.equal(r.data.message, 'Order placed');
    const o = r.data.order;
    assert.equal(o.status, 'pending');
    assert.equal(o.subtotal, 55.98);
    assert.equal(o.shipping.cost, 9.99);
    assert.equal(o.total, 65.97);
    assert.equal((await c.get('/api/cart/items')).data.items.length, 0);
    assert.equal((await c.get('/api/products/10')).data.stock, before - 2);
    const list = await c.get('/api/orders');
    assert.equal(list.data.items[0].id, o.id);
    assert.equal((await c.get(`/api/orders/${o.id}`)).data.id, o.id);
  });
  test('address and shipping are validated', async () => {
    const c = await asUser(s);
    await c.post('/api/cart/items', { productId: 1, qty: 1 });
    assert.equal((await c.post('/api/orders', { shipping: 'drone', address })).status, 400);
    const r = await c.post('/api/orders', { shipping: 'standard', address: { ...address, city: '' } });
    assert.equal(r.status, 400);
    assert.equal(r.data.error.field, 'city');
    assert.equal((await c.post('/api/orders', { shipping: 'standard' })).status, 400);
  });
  test("another user's order is 404", async () => {
    const admin = await asAdmin(s);
    assert.equal((await admin.get('/api/orders/1001')).status, 404);
    assert.equal((await admin.post('/api/orders/1004/cancel')).status, 404);
    assert.equal((await admin.get('/api/account/invoice/1001')).status, 404);
  });
  test('cancel only while pending or paid', async () => {
    const c = await asUser(s);
    assert.equal((await c.post('/api/orders/1004/cancel')).data.status, 'cancelled');
    assert.equal((await c.post('/api/orders/1003/cancel')).data.status, 'cancelled');
    for (const id of [1001, 1002]) {
      const r = await c.post(`/api/orders/${id}/cancel`);
      assert.equal(r.status, 409);
      assert.equal(r.data.error.message, 'This order has already shipped and can no longer be cancelled.');
    }
    assert.equal((await c.post('/api/orders/1005/cancel')).status, 409);
    const shipped = (await c.get('/api/orders/1002')).data;
    assert.equal(shipped.canCancel, false);
  });
  test('invoice is a PDF attachment for the owner', async () => {
    const c = await asUser(s);
    const r = await c.get('/api/account/invoice/1001');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    assert.match(r.headers.get('content-disposition'), /^attachment; filename="invoice-1001.pdf"/);
    assert.ok(r.text.startsWith('%PDF-1.4'));
    assert.equal((await c.get('/api/account/invoice/9999')).status, 404);
    assert.equal((await s.client().get('/api/account/invoice/1001')).status, 401);
  });
});

describe('admin', () => {
  test('visitor 401, customer 403, admin 200 on every admin route', async () => {
    const cust = await asUser(s);
    const admin = await asAdmin(s);
    const calls = [['get', '/api/admin/users'], ['patch', '/api/admin/users/3', { role: 'admin' }], ['get', '/api/admin/orders'], ['patch', '/api/admin/orders/1004', { status: 'paid' }]];
    for (const [m, p, b] of calls) {
      assert.equal((await s.client()[m](p, b)).status, 401, p);
      const r = await cust[m](p, b);
      assert.equal(r.status, 403, p);
      assert.equal(r.data.error.message, 'You do not have access to this page.');
      assert.equal((await admin[m](p, b)).status, 200, p);
    }
  });
  test('roles: change others, never your own', async () => {
    const admin = await asAdmin(s);
    const users = (await admin.get('/api/admin/users')).data.items;
    assert.equal(users.length, 4);
    assert.ok(users.every((u) => !('passwordHash' in u)));
    assert.equal((await admin.patch('/api/admin/users/1', { role: 'admin' })).data.user.role, 'admin');
    const self = await admin.patch('/api/admin/users/2', { role: 'customer' });
    assert.equal(self.status, 409);
    assert.equal(self.data.error.message, 'You cannot change your own role.');
    assert.equal((await admin.patch('/api/admin/users/1', { role: 'boss' })).status, 400);
    assert.equal((await admin.patch('/api/admin/users/99', { role: 'admin' })).status, 404);
  });
  test('status moves only forward, one step; cancelled and delivered are final', async () => {
    const admin = await asAdmin(s);
    const step = (id, status) => admin.patch(`/api/admin/orders/${id}`, { status });
    const u = await asUser(s);
    await u.post('/api/cart/items', { productId: 1, qty: 1 });
    assert.equal((await u.post('/api/orders', { shipping: 'standard', address })).data.order.id, 1006);
    assert.equal((await step(1004, 'paid')).data.status, 'paid');
    assert.equal((await step(1004, 'shipped')).data.status, 'shipped');
    assert.equal((await step(1004, 'delivered')).data.status, 'delivered');
    const refused = [[1006, 'shipped'], [1006, 'delivered'], [1004, 'pending'], [1004, 'cancelled'], [1003, 'delivered'], [1003, 'pending'], [1005, 'paid'], [1002, 'cancelled'], [1002, 'paid']];
    for (const [id, st] of refused) {
      const r = await step(id, st);
      assert.equal(r.status, 409, `${id} -> ${st}`);
      assert.equal(r.data.error.message, 'This status change is not allowed.');
    }
    assert.equal((await step(1003, 'cancelled')).data.status, 'cancelled');
    assert.equal((await step(9999, 'paid')).status, 404);
    assert.equal((await step(1003, 'lost')).status, 400);
  });
});

describe('reset', () => {
  test('needs the token and restores the seed', async () => {
    const c = await asUser(s);
    await c.post('/api/orders/1004/cancel');
    assert.equal((await s.client().post('/api/reset')).status, 403);
    assert.equal((await s.client().post('/api/reset', undefined, { headers: { 'x-reset-token': 'wrong' } })).status, 403);
    const r = await s.client().post('/api/reset', undefined, { headers: { 'x-reset-token': RESET_TOKEN } });
    assert.equal(r.status, 200);
    assert.equal((await c.get('/api/orders/1004')).data.status, 'pending');
    assert.equal((await s.client().get('/__reset')).status, 403);
    assert.equal((await s.client().get('/__reset', { headers: { 'x-reset-token': RESET_TOKEN } })).status, 200);
  });
  test('reset with no RESET_TOKEN configured is refused', async () => {
    const t = await start({ resetToken: '' });
    try { assert.equal((await t.client().post('/api/reset', undefined, { headers: { 'x-reset-token': '' } })).status, 403); } finally { await t.stop(); }
  });
  test('sessions of accounts created after the seed end on reset', async () => {
    const c = s.client();
    await c.post('/api/auth/signup', { name: 'Temp Person', email: 'temp@example.test', password: 'Temp#1234', age: 33, country: 'GB', terms: true });
    assert.equal((await c.get('/api/me')).status, 200);
    s.app.reset();
    assert.equal((await c.get('/api/me')).status, 401);
  });
});
