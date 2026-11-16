import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { asAdmin, asUser, start } from './helpers.mjs';

let s;
before(async () => { s = await start(); });
after(() => s.stop());
beforeEach(() => s.app.reset());

const asMail = async () => { const c = s.client(); await c.login('mail@practice.test', 'Mail#1234'); const code = (await s.client().get('/api/mailbox?to=mail@practice.test')).data.messages[0].code; await c.post('/api/auth/otp', { code }); return c; };

test('list shows owned and shared notes, marked owner or reader', async () => {
  const user = await asUser(s);
  const mine = (await user.get('/api/notes')).data.items;
  assert.deepEqual(mine.map((n) => [n.id, n.role]), [[1, 'owner'], [2, 'owner']]);
  assert.deepEqual(mine[0].readers, ['mail@practice.test']);
  const mail = await asMail();
  const shared = (await mail.get('/api/notes')).data.items;
  assert.deepEqual(shared.map((n) => [n.id, n.role]), [[1, 'reader']]);
  assert.equal(shared[0].readers, undefined);
});

test('owner can create, edit and delete; limits are checked', async () => {
  const c = await asUser(s);
  const r = await c.post('/api/notes', { title: 'New', body: 'Text' });
  assert.equal(r.status, 201);
  assert.equal((await c.post('/api/notes', { title: '' })).data.error.message, 'Enter a title of 1 to 80 characters.');
  assert.equal((await c.post('/api/notes', { title: 'x'.repeat(81) })).status, 400);
  assert.equal((await c.post('/api/notes', { title: 'ok', body: 'x'.repeat(2001) })).data.error.message, 'The note can be at most 2,000 characters.');
  assert.equal((await c.post('/api/notes', { title: 'ok', body: 'x'.repeat(2000) })).status, 201);
  assert.equal((await c.patch(`/api/notes/${r.data.id}`, { title: 'Edited' })).data.title, 'Edited');
  assert.equal((await c.del(`/api/notes/${r.data.id}`)).status, 200);
  assert.equal((await c.get(`/api/notes/${r.data.id}`)).status, 404);
});

test('reader can open but not change (403); non-reader gets 404 everywhere', async () => {
  const mail = await asMail();
  assert.equal((await mail.get('/api/notes/1')).data.title, 'Shopping list');
  assert.equal((await mail.patch('/api/notes/1', { title: 'x' })).status, 403);
  assert.equal((await mail.del('/api/notes/1')).status, 403);
  assert.equal((await mail.post('/api/notes/1/share', { email: 'admin@practice.test' })).status, 403);
  const admin = await asAdmin(s);
  for (const [m, b] of [['get'], ['patch', { title: 'x' }], ['del'], ['post', { email: 'admin@practice.test' }]]) {
    const path = m === 'post' ? '/api/notes/1/share' : '/api/notes/1';
    const r = await admin[m](path, b);
    assert.equal(r.status, 404, m);
    assert.equal(r.data.error.message, 'Note not found.');
  }
  // the 404 for an existing note looks exactly like the 404 for a missing one
  assert.deepEqual((await admin.get('/api/notes/1')).data, (await admin.get('/api/notes/9999')).data);
  assert.equal((await s.client().get('/api/notes/1')).status, 401);
});

test('share: by email, unknown email 404, self 400, then the reader can open it', async () => {
  const user = await asUser(s);
  const none = await user.post('/api/notes/2/share', { email: 'ghost@practice.test' });
  assert.equal(none.status, 404);
  assert.equal(none.data.error.message, 'There is no account with this email.');
  assert.equal((await user.post('/api/notes/2/share', { email: 'user@practice.test' })).status, 400);
  assert.equal((await user.post('/api/notes/2/share', { email: 'bad' })).status, 400);
  const admin = await asAdmin(s);
  assert.equal((await admin.get('/api/notes/2')).status, 404);
  assert.deepEqual((await user.post('/api/notes/2/share', { email: 'ADMIN@practice.test' })).data.readers, ['admin@practice.test']);
  assert.equal((await admin.get('/api/notes/2')).data.role, 'reader');
});
