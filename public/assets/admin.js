import { api, el, listOf, amount, money, show, errorText, me, goToLogin } from '/assets/common.js';

const err = document.getElementById('admin-error');
const ok = document.getElementById('admin-ok');
const NEXT = { pending: 'paid', paid: 'shipped', shipped: 'delivered' };

function denied(r) {
  if (r.status === 401) { goToLogin(); return true; }
  if (r.status === 403) {
    document.querySelector('h1').textContent = 'You do not have access to this page.';
    show(err, '');
    return true;
  }
  return false;
}

async function users() {
  const r = await api('/api/admin/users');
  if (denied(r)) return;
  if (!r.ok) return show(err, errorText(r));
  document.getElementById('admin-users-wrap').hidden = false;
  document.getElementById('admin-users-rows').replaceChildren(...listOf(r.data, 'users').map((u, i) => {
    const sel = el('select', { id: 'role-' + i, 'data-testid': 'role-select' },
      el('option', { value: 'customer', selected: u.role === 'customer' }, 'customer'),
      el('option', { value: 'admin', selected: u.role === 'admin' }, 'admin'));
    const save = el('button', { type: 'button', class: 'btn', 'data-testid': 'role-save' }, 'Save role');
    save.addEventListener('click', async () => {
      show(err, ''); show(ok, '', 'ok');
      const res = await api('/api/admin/users/' + encodeURIComponent(u.id), { method: 'PATCH', body: { role: sel.value } });
      if (!res.ok) { sel.value = u.role; return show(err, errorText(res)); }
      show(ok, `Role of ${u.email} is now ${sel.value}.`, 'ok');
      users();
    });
    return el('tr', { 'data-testid': 'admin-user-row' }, el('td', {}, u.email), el('td', {}, u.name || ''),
      el('td', { 'data-testid': 'user-role' }, u.role),
      el('td', {}, el('div', { class: 'actions' }, el('label', { for: 'role-' + i, class: 'sr-only' }, 'Role for ' + u.email), sel, save)));
  }));
}

async function orders() {
  const r = await api('/api/admin/orders');
  if (denied(r)) return;
  if (!r.ok) return show(err, errorText(r));
  document.getElementById('admin-orders-wrap').hidden = false;
  document.getElementById('admin-orders-rows').replaceChildren(...listOf(r.data, 'orders').map((o) => {
    const next = NEXT[o.status];
    let action = el('span', { class: 'muted' }, '—');
    if (next) {
      action = el('button', { type: 'button', class: 'btn', 'data-testid': 'advance-status' }, 'Mark as ' + next);
      action.addEventListener('click', async () => {
        show(err, ''); show(ok, '', 'ok');
        const res = await api('/api/admin/orders/' + encodeURIComponent(o.id), { method: 'PATCH', body: { status: next } });
        if (!res.ok) return show(err, errorText(res, 'This status change is not allowed.'));
        show(ok, `Order ${o.number || o.id} is now ${next}.`, 'ok');
        orders();
      });
    }
    return el('tr', { 'data-testid': 'admin-order-row' },
      el('td', {}, 'Order ' + (o.number || o.id)), el('td', {}, o.userEmail || o.email || o.user?.email || ''),
      el('td', {}, el('span', { class: 'status', 'data-testid': 'order-status' }, o.status)),
      el('td', { class: 'num' }, money(amount(o, 'total'))), el('td', {}, action));
  }));
}

const user = await me();
if (!user) goToLogin();
else if (user.role !== 'admin') document.querySelector('h1').textContent = 'You do not have access to this page.';
else if (document.getElementById('admin-users-rows')) users();
else if (document.getElementById('admin-orders-rows')) orders();
else document.getElementById('admin-home').hidden = false;
