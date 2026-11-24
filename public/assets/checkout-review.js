import { api, el, money, show, errorText, requireSignIn } from '/assets/common.js';
import { loadCart } from '/assets/cart-shared.js';

const SHIPPING = { standard: { label: 'Standard (free, 5 days)', cost: 0 }, express: { label: 'Express ($12.99, 1 day)', cost: 12.99 } };
const err = document.getElementById('review-error');
const box = document.getElementById('review');
const btn = document.getElementById('place-order');
const p = new URLSearchParams(location.search);
let ship = Object.fromEntries(['name', 'street', 'city', 'postcode', 'shipping'].map((k) => [k, p.get(k) || '']));
if (!ship.name) { try { ship = { ...ship, ...JSON.parse(sessionStorage.getItem('ps_checkout') || '{}') }; } catch { /* ignore */ } }
const method = SHIPPING[ship.shipping] ? ship.shipping : 'standard';

if (await requireSignIn()) {
  const c = await loadCart(method);
  if (!c.r.ok) show(err, errorText(c.r, 'The cart could not be loaded.'));
  else if (!ship.name || !ship.street || !ship.city || !ship.postcode) {
    box.replaceChildren(el('p', {}, 'Shipping details are missing. ', el('a', { href: '/checkout' }, 'Enter them on the checkout page'), '.'));
  } else if (!c.lines.length) {
    box.replaceChildren(el('p', { 'data-testid': 'cart-empty' }, 'Your cart is empty.'));
  } else {
    const shipCost = c.shippingCost ?? SHIPPING[method].cost;
    const total = c.shippingCost != null ? c.total : Math.round((c.subtotal - c.discount + shipCost) * 100) / 100;
    box.replaceChildren(
      el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Order lines' },
        el('table', { 'data-testid': 'review-table' }, el('caption', {}, 'Order lines'),
          el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Product'), el('th', { scope: 'col', class: 'num' }, 'Price'),
            el('th', { scope: 'col', class: 'num' }, 'Quantity'), el('th', { scope: 'col', class: 'num' }, 'Line total'))),
          el('tbody', {}, c.lines.map((l) => el('tr', {}, el('td', {}, l.name), el('td', { class: 'num' }, money(l.price)),
            el('td', { class: 'num' }, String(l.qty)), el('td', { class: 'num' }, money(l.lineTotal))))))),
      el('h2', {}, 'Shipping'),
      el('p', { 'data-testid': 'review-address' }, `${ship.name}, ${ship.street}, ${ship.city} ${ship.postcode}`),
      el('p', { 'data-testid': 'review-shipping' }, SHIPPING[method].label),
      el('div', { class: 'totals', 'data-testid': 'review-totals' }, el('dl', {},
        el('dt', {}, 'Subtotal'), el('dd', { 'data-testid': 'review-subtotal' }, money(c.subtotal)),
        el('dt', {}, 'Discount'), el('dd', { 'data-testid': 'review-discount' }, c.discount ? '−' + money(c.discount) : money(0)),
        el('dt', {}, 'Shipping'), el('dd', { 'data-testid': 'review-shipping-cost' }, money(shipCost)),
        el('dt', {}, 'Total'), el('dd', { 'data-testid': 'review-total' }, money(total)))));
    btn.disabled = false;
  }
}

btn.addEventListener('click', async () => {
  show(err, '');
  btn.disabled = true;
  const r = await api('/api/orders', { method: 'POST', body: {
    shipping: method, address: { name: ship.name, street: ship.street, city: ship.city, postcode: ship.postcode } } });
  if (!r.ok) { btn.disabled = false; return show(err, errorText(r, 'The order could not be placed.')); }
  const order = r.data?.order || r.data;
  try { sessionStorage.removeItem('ps_checkout'); } catch { /* ignore */ }
  location.href = '/orders/' + encodeURIComponent(order.id) + '?placed=1';
});
