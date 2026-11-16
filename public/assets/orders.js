import { api, el, listOf, amount, money, show, errorText, requireSignIn } from '/assets/common.js';

if (await requireSignIn()) {
  const r = await api('/api/orders');
  if (!r.ok) show(document.getElementById('orders-error'), errorText(r, 'Orders could not be loaded.'));
  else {
    const orders = listOf(r.data, 'orders');
    document.getElementById('orders-empty').hidden = !!orders.length;
    document.getElementById('orders-wrap').hidden = !orders.length;
    document.getElementById('orders-rows').replaceChildren(...orders.map((o) => el('tr', { 'data-testid': 'order-row' },
      el('td', {}, el('a', { href: '/orders/' + encodeURIComponent(o.id), 'data-testid': 'order-link' }, 'Order ' + (o.number || o.id))),
      el('td', {}, o.createdAt ? new Date(o.createdAt).toLocaleString() : ''),
      el('td', {}, el('span', { class: 'status', 'data-testid': 'order-status' }, o.status)),
      el('td', { class: 'num' }, money(amount(o, 'total'))))));
  }
}
