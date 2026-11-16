import { api, el, listOf, show, errorText, requireSignIn } from '/assets/common.js';

const PW = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const fieldError = (id, msg) => {
  const input = document.getElementById(id);
  const out = document.getElementById(id + '-error');
  out.textContent = msg; out.hidden = !msg;
  if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  return !msg;
};

function renderUser(u) {
  const dl = document.getElementById('acc-summary');
  dl.replaceChildren(
    el('dt', {}, 'Name'), el('dd', { 'data-testid': 'account-display-name' }, u.name || ''),
    el('dt', {}, 'Email'), el('dd', { 'data-testid': 'account-email' }, u.email || ''),
    el('dt', {}, 'Role'), el('dd', { 'data-testid': 'account-role' }, u.role || ''));
  document.getElementById('acc-name').value = u.name || '';
  const img = document.getElementById('acc-avatar');
  const src = u.avatarUrl || u.avatar;
  if (src) { img.src = src + (src.includes('?') ? '&' : '?') + 't=' + Date.now(); img.hidden = false; }
}

const user = await requireSignIn();
if (user) {
  renderUser(user);
  const r = await api('/api/orders');
  const orders = r.ok ? listOf(r.data, 'orders') : [];
  document.getElementById('acc-orders-empty').hidden = !!orders.length;
  document.getElementById('acc-orders').replaceChildren(...orders.map((o) => el('li', {},
    el('a', { href: '/orders/' + encodeURIComponent(o.id) }, 'Order ' + (o.number || o.id)), ` (${o.status}) · `,
    el('a', { href: '/api/account/invoice/' + encodeURIComponent(o.id), 'data-testid': 'download-invoice' }, 'Download invoice'))));
}

const nameName = 'acc-name';
document.getElementById(nameName).addEventListener('blur', (e) => {
  const v = e.target.value.trim();
  fieldError(nameName, v.length >= 1 && v.length <= 60 ? '' : 'Enter a name of 1 to 60 characters.');
});
document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('profile-error'); const ok = document.getElementById('profile-ok');
  show(err, ''); show(ok, '', 'ok');
  const name = e.target.name.value.trim();
  if (!fieldError(nameName, name.length >= 1 && name.length <= 60 ? '' : 'Enter a name of 1 to 60 characters.')) return;
  const r = await api('/api/me', { method: 'PATCH', body: { name } });
  if (!r.ok) return show(err, errorText(r, 'Enter a name of 1 to 60 characters.'));
  renderUser(r.data?.user || { ...user, name });
  show(ok, 'Name saved.', 'ok');
});

document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('password-error'); const ok = document.getElementById('password-ok');
  show(err, ''); show(ok, '', 'ok');
  const current = e.target.current.value; const next = e.target.next.value;
  const a = fieldError('pw-current', current ? '' : 'Enter your current password.');
  const b = fieldError('pw-new', PW.test(next) ? '' : 'Use at least 8 characters with a letter, a number and a symbol.');
  if (!a || !b) return;
  const r = await api('/api/account/password', { method: 'POST', body: { current, next } });
  if (!r.ok) return show(err, errorText(r, 'Your current password is not right.'));
  e.target.reset();
  show(ok, 'Password changed.', 'ok');
});

document.getElementById('avatar-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('avatar-error'); const ok = document.getElementById('avatar-ok');
  show(err, ''); show(ok, '', 'ok');
  const file = document.getElementById('avatar-file').files[0];
  if (!file) return fieldError('avatar-file', 'Choose a PNG or JPG image.');
  if (!['image/png', 'image/jpeg'].includes(file.type)) return fieldError('avatar-file', 'Choose a PNG or JPG image.');
  if (file.size > 1024 * 1024) return fieldError('avatar-file', 'The image must be 1 MB or smaller.');
  fieldError('avatar-file', '');
  // Sent as the raw image body (the File carries its own Content-Type).
  const r = await api('/api/account/avatar', { method: 'POST', body: file });
  if (!r.ok) return show(err, errorText(r, r.status === 413 ? 'The image must be 1 MB or smaller.' : 'Choose a PNG or JPG image.'));
  const me = await api('/api/me');
  if (me.ok) renderUser(me.data?.user || me.data);
  show(ok, 'Avatar uploaded.', 'ok');
});
