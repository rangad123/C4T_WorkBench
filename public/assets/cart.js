import { api, el, money, show, errorText, requireSignIn } from '/assets/common.js';
import { loadCart } from '/assets/cart-shared.js';

const err = document.getElementById('cart-error');
const ok = document.getElementById('cart-ok');

async function render() {
  const c = await loadCart();
  if (!c.r.ok) {
    if (c.r.status === 401) return requireSignIn();
    return show(err, errorText(c.r, 'The cart could not be loaded.'));
  }
  const empty = !c.lines.length;
  document.getElementById('cart-empty').hidden = !empty;
  document.getElementById('cart-wrap').hidden = empty;
  document.getElementById('cart-side').hidden = empty;
  document.getElementById('cart-rows').replaceChildren(...c.lines.map((l, i) => {
    const qid = 'qty-' + i;
    const qty = el('input', { id: qid, type: 'number', min: '1', max: '10', step: '1', value: String(l.qty), inputmode: 'numeric', class: 'qty', 'data-testid': 'cart-qty' });
    const update = el('button', { type: 'button', class: 'btn', 'data-testid': 'cart-update' }, 'Update');
    const remove = el('button', { type: 'button', class: 'btn btn-danger', 'data-testid': 'cart-remove' }, 'Remove');
    const setQty = async () => {
      show(err, ''); show(ok, '', 'ok');
      const r = await api('/api/cart/items/' + encodeURIComponent(l.id), { method: 'PATCH', body: { qty: Number(qty.value) } });
      if (!r.ok) { show(err, errorText(r, 'Quantity must be between 1 and 10.')); qty.value = String(l.qty); return; }
      render();
    };
    update.addEventListener('click', setQty);
    qty.addEventListener('change', setQty);
    remove.addEventListener('click', async () => {
      show(err, '');
      const r = await api('/api/cart/items/' + encodeURIComponent(l.id), { method: 'DELETE' });
      if (!r.ok) return show(err, errorText(r));
      render();
    });
    return el('tr', { 'data-testid': 'cart-line' },
      el('td', {}, l.productId ? el('a', { href: '/products/' + encodeURIComponent(l.productId) }, l.name) : l.name),
      el('td', { class: 'num' }, money(l.price)),
      el('td', {}, el('label', { for: qid, class: 'sr-only' }, 'Quantity for ' + l.name), qty),
      el('td', { class: 'num', 'data-testid': 'cart-line-total' }, money(l.lineTotal)),
      el('td', {}, el('div', { class: 'actions' }, update, remove)));
  }));
  document.getElementById('cart-subtotal').textContent = money(c.subtotal);
  document.getElementById('cart-discount').textContent = c.discount ? '−' + money(c.discount) + (c.code ? ` (${c.code})` : '') : money(0);
  document.getElementById('cart-total').textContent = money(c.total);
}

document.getElementById('discount-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  show(err, ''); show(ok, '', 'ok');
  const code = e.target.code.value.trim();
  if (!code) return show(err, 'This code is not valid.');
  const r = await api('/api/cart/discount', { method: 'POST', body: { code } });
  if (!r.ok) return show(err, errorText(r, 'This code is not valid.'));
  show(ok, r.data?.message || 'SAVE10 applied: 10% off', 'ok');
  render();
});

if (await requireSignIn()) render();
