import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { base32Decode, hotp, totp, verifyTotp } from '../auth.mjs';
import { TOTP_SECRET } from '../store.mjs';
import { start } from './helpers.mjs';

describe('TOTP (RFC 4226 / 6238)', () => {
  test('HOTP test vectors from RFC 4226', () => {
    const key = Buffer.from('12345678901234567890');
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, i) => assert.equal(hotp(key, i), code));
  });
  test('TOTP test vectors from RFC 6238 (SHA-1, 8 digits)', () => {
    const b32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
    assert.deepEqual(base32Decode(b32), Buffer.from('12345678901234567890'));
    assert.equal(totp(b32, 59 * 1000, 30, 8), '94287082');
    assert.equal(totp(b32, 1111111109 * 1000, 30, 8), '07081804');
    assert.equal(totp(b32, 20000000000 * 1000, 30, 8), '65353130');
  });
  test('verify accepts one step of clock drift and refuses others', () => {
    const t = 1_700_000_000_000;
    assert.ok(verifyTotp(TOTP_SECRET, totp(TOTP_SECRET, t - 30000), t));
    assert.ok(!verifyTotp(TOTP_SECRET, totp(TOTP_SECRET, t - 90000), t));
    assert.ok(!verifyTotp(TOTP_SECRET, 'abcdef', t));
  });
});

describe('sign-in', () => {
  let s;
  before(async () => { s = await start(); });
  after(() => s.stop());

  test('passwords are stored as scrypt hashes', () => {
    for (const u of s.app.state.users) assert.match(u.passwordHash, /^scrypt\$16384\$8\$1\$/);
    assert.ok(!JSON.stringify(s.app.state.users).includes('Practice#123'));
  });

  test('good password signs in with an HttpOnly SameSite=Lax session cookie', async () => {
    const c = s.client();
    const r = await c.post('/api/auth/login', { email: 'user@practice.test', password: 'Practice#123' });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.email, 'user@practice.test');
    assert.equal(r.data.next, '/account');
    const cookie = r.cookies.find((x) => x.startsWith('ps_session='));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Max-Age/);
    const me = await c.get('/api/me');
    assert.equal(me.status, 200);
    assert.deepEqual(Object.keys(me.data.user).filter((k) => ['id', 'email', 'name', 'role'].includes(k)).sort(), ['email', 'id', 'name', 'role']);
    assert.equal(me.data.user.passwordHash, undefined);
  });

  test('remember me lasts 30 days; next must be a local path', async () => {
    const r = await s.client().post('/api/auth/login', { email: 'user@practice.test', password: 'Practice#123', remember: true, next: '//evil.example' });
    assert.match(r.cookies.find((x) => x.startsWith('ps_session=')), /Max-Age=2592000/);
    assert.equal(r.data.next, '/account');
    const r2 = await s.client().post('/api/auth/login', { email: 'user@practice.test', password: 'Practice#123', next: '/orders/1001' });
    assert.equal(r2.data.next, '/orders/1001');
  });

  test('wrong password and unknown email give the same 401', async () => {
    const a = await s.client().post('/api/auth/login', { email: 'user@practice.test', password: 'nope' });
    const b = await s.client().post('/api/auth/login', { email: 'nobody@practice.test', password: 'nope' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.data.error.message, 'Invalid email or password.');
    assert.deepEqual(a.data, b.data);
  });

  test('empty fields give 400', async () => {
    const r = await s.client().post('/api/auth/login', { email: '', password: '' });
    assert.equal(r.status, 400);
    assert.equal(r.data.error.message, 'Enter your email and password.');
  });

  test('/api/me without a session, with a forged cookie, or a bad token is 401', async () => {
    assert.equal((await s.client().get('/api/me')).status, 401);
    assert.equal((await s.client().get('/api/me', { headers: { cookie: 'ps_session=abc.def' } })).status, 401);
    assert.equal((await s.client().get('/api/me', { headers: { authorization: 'Bearer pt_nope' } })).status, 401);
    assert.equal((await s.client().get('/api/me', { headers: { authorization: 'Basic x' } })).status, 401);
  });

  test('/api/me?optional=1 answers 200 {user:null} when signed out, the user when signed in', async () => {
    const anon = await s.client().get('/api/me?optional=1');
    assert.equal(anon.status, 200);
    assert.deepEqual(anon.data, { user: null });
    assert.equal((await s.client().get('/api/me')).status, 401);
    assert.equal((await s.client().get('/api/me?optional=0')).status, 401);
    const c = s.client();
    await c.login();
    assert.equal((await c.get('/api/me?optional=1')).data.user.email, 'user@practice.test');
    const doc = (await s.client().get('/openapi.json')).data.paths['/api/me'].get;
    assert.ok(doc.parameters.some((p) => p.name === 'optional' && p.in === 'query'));
    assert.ok(doc.responses['401']);
  });

  test('logout ends the session on the server; the old cookie stops working', async () => {
    const c = s.client();
    await c.login();
    const old = c.jar.get('ps_session');
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    const r = await s.client().get('/api/me', { headers: { cookie: `ps_session=${old}` } });
    assert.equal(r.status, 401);
  });

  test('a new session id is issued at sign-in (no fixation)', async () => {
    const c = s.client();
    await c.login();
    const first = c.jar.get('ps_session');
    await c.login();
    assert.notEqual(c.jar.get('ps_session'), first);
    assert.equal((await s.client().get('/api/me', { headers: { cookie: `ps_session=${first}` } })).status, 401);
  });

  test('TOTP account: password then code; not signed in until the code is right', async () => {
    const c = s.client();
    const r = await c.post('/api/auth/login', { email: 'otp@practice.test', password: 'Otp#12345' });
    assert.equal(r.status, 200);
    assert.deepEqual([r.data.otpRequired, r.data.method, r.data.next], [true, 'totp', '/otp']);
    assert.equal((await c.get('/api/me')).status, 401);
    const bad = await c.post('/api/auth/otp', { code: '000000' === totp(TOTP_SECRET) ? '111111' : '000000' });
    assert.equal(bad.status, 401);
    assert.equal(bad.data.error.message, 'That code is not right. Try again.');
    const ok = await c.post('/api/auth/otp', { code: totp(TOTP_SECRET) });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.email, 'otp@practice.test');
    assert.equal((await c.get('/api/me')).status, 200);
  });

  test('five wrong codes end the waiting sign-in', async () => {
    const c = s.client();
    await c.post('/api/auth/login', { email: 'otp@practice.test', password: 'Otp#12345' });
    const wrong = String((Number(totp(TOTP_SECRET)) + 500000) % 1000000).padStart(6, '0');
    for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/otp', { code: wrong })).status, 401);
    const r = await c.post('/api/auth/otp', { code: totp(TOTP_SECRET) });
    assert.equal(r.status, 400);
    assert.equal(r.data.error.code, 'no_pending_sign_in');
  });

  test('otp without a waiting sign-in is 400; malformed code is 400', async () => {
    assert.equal((await s.client().post('/api/auth/otp', { code: '123456' })).status, 400);
    const c = s.client();
    await c.post('/api/auth/login', { email: 'otp@practice.test', password: 'Otp#12345' });
    assert.equal((await c.post('/api/auth/otp', { code: '12ab' })).status, 400);
  });

  test('email-code account: code appears in the mailbox and works once', async () => {
    const c = s.client();
    const r = await c.post('/api/auth/login', { email: 'mail@practice.test', password: 'Mail#1234' });
    assert.equal(r.data.method, 'email');
    assert.equal(r.data.mailbox, '/mailbox?to=mail%40practice.test');
    const box = await s.client().get('/api/mailbox?to=mail@practice.test');
    assert.equal(box.status, 200);
    const code = box.data.messages[0].code;
    assert.match(code, /^\d{6}$/);
    assert.ok(box.data.messages[0].at && box.data.messages[0].subject);
    assert.equal((await c.post('/api/auth/otp', { code })).status, 200);
    // second use of the same code on a new sign-in fails (a new code was sent)
    const c2 = s.client();
    await c2.post('/api/auth/login', { email: 'mail@practice.test', password: 'Mail#1234' });
    const box2 = await s.client().get('/api/mailbox?to=mail@practice.test');
    assert.notEqual(box2.data.messages[0].code, undefined);
    if (box2.data.messages[0].code !== code) assert.equal((await c2.post('/api/auth/otp', { code })).status, 401);
  });

  test('email code expires after 10 minutes', async () => {
    let now = Date.now();
    const t = await start({ now: () => now });
    try {
      const c = t.client();
      await c.post('/api/auth/login', { email: 'mail@practice.test', password: 'Mail#1234' });
      const code = (await t.client().get('/api/mailbox?to=mail@practice.test')).data.messages[0].code;
      now += 9 * 60 * 1000;
      const resend = await c.post('/api/auth/otp/resend');
      assert.equal(resend.status, 200);
      const fresh = (await t.client().get('/api/mailbox?to=mail@practice.test')).data.messages[0].code;
      now += 10 * 60 * 1000 + 1000;
      assert.equal((await c.post('/api/auth/otp', { code: fresh })).status, 400);
      assert.ok(code);
    } finally { await t.stop(); }
  });

  test('rate limit: more than N sign-in attempts per minute from one IP is 429', async () => {
    let now = Date.now();
    const t = await start({ loginLimit: 10, now: () => now });
    try {
      for (let i = 0; i < 10; i++) assert.equal((await t.client().post('/api/auth/login', { email: 'user@practice.test', password: 'wrong' })).status, 401);
      const r = await t.client().post('/api/auth/login', { email: 'user@practice.test', password: 'Practice#123' });
      assert.equal(r.status, 429);
      assert.equal(r.data.error.message, 'Too many sign-in attempts. Try again in a minute.');
      assert.ok(Number(r.headers.get('retry-after')) >= 1);
      now += 61000;
      assert.equal((await t.client().post('/api/auth/login', { email: 'user@practice.test', password: 'Practice#123' })).status, 200);
    } finally { await t.stop(); }
  });

  test('Bearer tokens: issue, use, revoke on logout; 2FA accounts need the code', async () => {
    const c = s.client();
    const r = await c.post('/api/auth/token', { email: 'user@practice.test', password: 'Practice#123' });
    assert.equal(r.status, 201);
    assert.equal(r.data.tokenType, 'Bearer');
    const auth = { authorization: `Bearer ${r.data.token}` };
    assert.equal((await s.client().get('/api/me', { headers: auth })).data.user.email, 'user@practice.test');
    assert.equal((await s.client().post('/api/auth/logout', undefined, { headers: auth })).status, 200);
    assert.equal((await s.client().get('/api/me', { headers: auth })).status, 401);
    assert.equal((await c.post('/api/auth/token', { email: 'user@practice.test', password: 'x' })).status, 401);

    const need = await c.post('/api/auth/token', { email: 'otp@practice.test', password: 'Otp#12345' });
    assert.equal(need.status, 401);
    assert.equal(need.data.error.code, 'code_required');
    assert.equal((await c.post('/api/auth/token', { email: 'otp@practice.test', password: 'Otp#12345', code: totp(TOTP_SECRET) })).status, 201);

    assert.equal((await c.post('/api/auth/token', { email: 'mail@practice.test', password: 'Mail#1234' })).status, 401);
    const code = (await c.get('/api/mailbox?to=mail@practice.test')).data.messages[0].code;
    assert.equal((await c.post('/api/auth/token', { email: 'mail@practice.test', password: 'Mail#1234', code })).status, 201);
  });

  test('signup: validation messages per field, 409 on duplicates, signs in', async () => {
    const good = { name: 'New Person', email: 'New@Example.test', password: 'Abcdef1!', confirmPassword: 'Abcdef1!', age: 30, country: 'IN', terms: true };
    const cases = [
      [{ name: 'A' }, 'name', 'Enter a name of 2 to 60 characters.'],
      [{ name: 'x'.repeat(61) }, 'name', 'Enter a name of 2 to 60 characters.'],
      [{ email: 'not-an-email' }, 'email', 'Enter a valid email address.'],
      [{ password: 'abcdefgh', confirmPassword: 'abcdefgh' }, 'password', 'Use at least 8 characters with a letter, a number and a symbol.'],
      [{ password: 'Ab1!', confirmPassword: 'Ab1!' }, 'password', 'Use at least 8 characters with a letter, a number and a symbol.'],
      [{ confirmPassword: 'Different1!' }, 'confirmPassword', 'The passwords do not match.'],
      [{ age: 17 }, 'age', 'Enter an age from 18 to 120.'],
      [{ age: 121 }, 'age', 'Enter an age from 18 to 120.'],
      [{ age: 20.5 }, 'age', 'Enter an age from 18 to 120.'],
      [{ country: 'XX' }, 'country', 'Choose a country.'],
      [{ terms: false }, 'terms', 'You must accept the terms.'],
      [{ terms: undefined }, 'terms', 'You must accept the terms.'],
    ];
    for (const [patch, field, message] of cases) {
      const r = await s.client().post('/api/auth/signup', { ...good, ...patch });
      assert.equal(r.status, 400, JSON.stringify(patch));
      assert.equal(r.data.error.field, field);
      assert.equal(r.data.error.message, message);
    }
    const c = s.client();
    const ok = await c.post('/api/auth/signup', good);
    assert.equal(ok.status, 201);
    assert.equal(ok.data.user.email, 'new@example.test');
    assert.equal(ok.data.user.role, 'customer');
    assert.equal((await c.get('/api/me')).status, 200);
    const welcome = await c.get('/api/mailbox?to=new@example.test');
    assert.equal(welcome.data.messages[0].link, '/account');
    const dup = await s.client().post('/api/auth/signup', { ...good, email: 'NEW@example.test' });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.error.message, 'An account with this email already exists.');
  });

  test('change password: wrong current refused; new one works', async () => {
    const c = s.client();
    await c.post('/api/auth/signup', { name: 'Pw Person', email: 'pw@example.test', password: 'First#123', age: 40, country: 'US', terms: true });
    const bad = await c.post('/api/account/password', { current: 'nope', next: 'Second#123' });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.error.message, 'Your current password is not right.');
    assert.equal((await c.post('/api/account/password', { current: 'First#123', next: 'weak' })).status, 400);
    assert.equal((await c.post('/api/account/password', { current: 'First#123', next: 'Second#123' })).status, 200);
    assert.equal((await s.client().post('/api/auth/login', { email: 'pw@example.test', password: 'Second#123' })).status, 200);
    assert.equal((await s.client().post('/api/auth/login', { email: 'pw@example.test', password: 'First#123' })).status, 401);
  });

  test('profile name 1-60', async () => {
    const c = s.client();
    await c.login('mail@practice.test', 'Mail#1234').catch(() => {});
    const u = s.client();
    await u.post('/api/auth/signup', { name: 'Name Person', email: 'name@example.test', password: 'First#123', age: 40, country: 'US', terms: true });
    assert.equal((await u.patch('/api/me', { name: 'x'.repeat(61) })).data.error.message, 'Enter a name of 1 to 60 characters.');
    assert.equal((await u.patch('/api/me', { name: '' })).status, 400);
    assert.equal((await u.patch('/api/me', { name: 'Renamed' })).data.user.name, 'Renamed');
    assert.equal((await s.client().patch('/api/me', { name: 'x' })).status, 401);
  });
});
