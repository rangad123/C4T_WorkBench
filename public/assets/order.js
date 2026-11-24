import { api, el, listOf, amount, money, show, errorText, requireSignIn } from '/assets/common.js';

const id = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
const box = document.getElementById('order');
const err = document.getElementById('order-error');
const CANCELLABLE = ['pending', 'paid'];
if (new URLSearchParams(location.search).get('placed')) document.getElementById('order-placed').hidden = false;

const shipLabel = (m) => (m === 'express' ? 'Express ($12.99, 1 day)' : m === 'standard' ? 'Standard (free, 5 days)' : m || '');

async function render() {
  const r = await api('/api/orders/' + encodeURIComponent(id));
  if (!r.ok) {
    document.getElementById('order-title').textContent = r.status === 404 ? 'Order not found' : 'Order could not be loaded';
    return;
  }
  const o = r.data?.order || r.data;
  document.getElementById('order-title').textContent = 'Order ' + (o.number || o.id);
  const lines = listOf(o, 'items', 'lines');
  const a = o.address || {};
  const cancel = el('button', { type: 'button', class: 'btn btn-danger', 'data-testid': 'cancel-order' }, 'Cancel order');
  cancel.addEventListener('click', async () => {
    show(err, '');
    const res = await api('/api/orders/' + encodeURIComponent(o.id) + '/cancel', { method: 'POST' });
    if (!res.ok) return show(err, errorText(res, 'This order has already shipped and can no longer be cancelled.'));
    render();
  });
  box.replaceChildren(
    el('p', {}, 'Status: ', el('span', { class: 'status', 'data-testid': 'order-status' }, o.status)),
    el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Order lines' },
      el('table', {}, el('caption', {}, 'Order lines'),
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Product'), el('th', { scope: 'col', class: 'num' }, 'Price'),
          el('th', { scope: 'col', class: 'num' }, 'Quantity'), el('th', { scope: 'col', class: 'num' }, 'Line total'))),
        el('tbody', {}, lines.map((l) => {
          const price = amount(l, 'price'); const qty = Number(l.qty ?? l.quantity);
          return el('tr', {}, el('td', {}, l.name || l.title || l.product?.name || l.product?.title || ''), el('td', { class: 'num' }, money(price)),
            el('td', { class: 'num' }, String(qty)), el('td', { class: 'num' }, money(amount(l, 'lineTotal') ?? price * qty)));
        })))),
    el('div', { class: 'totals' }, el('dl', {},
      el('dt', {}, 'Subtotal'), el('dd', { 'data-testid': 'order-subtotal' }, money(amount(o, 'subtotal'))),
      el('dt', {}, 'Discount'), el('dd', {}, amount(o, 'discount') ? '−' + money(amount(o, 'discount')) : money(0)),
      el('dt', {}, 'Shipping'), el('dd', {}, money((o.shipping && typeof o.shipping === 'object' ? amount(o.shipping, 'cost') : null) ?? amount(o, 'shippingCost') ?? 0)),
      el('dt', {}, 'Total'), el('dd', { 'data-testid': 'order-total' }, money(amount(o, 'total'))))),
    el('h2', {}, 'Shipping'),
    el('p', { 'data-testid': 'order-shipping' }, shipLabel(typeof o.shipping === 'string' ? o.shipping : o.shipping?.method)),
    el('p', { 'data-testid': 'order-address' }, [a.name, a.street, a.city, a.postcode].filter(Boolean).join(', ')),
    el('div', { class: 'actions' },
      (o.canCancel ?? CANCELLABLE.includes(o.status)) ? cancel : null,
      el('a', { class: 'btn', href: '/api/account/invoice/' + encodeURIComponent(o.id), 'data-testid': 'download-invoice' }, 'Download invoice')));
}

if (await requireSignIn()) render();
