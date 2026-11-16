import { api, el, amount, money, errorText, show, me, goToLogin, changeOn, productName } from '/assets/common.js';

const id = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
const box = document.getElementById('product');
const err = document.getElementById('product-error');
const ok = document.getElementById('product-ok');

const r = await api('/api/products/' + encodeURIComponent(id));
if (!r.ok) {
  document.getElementById('product-name').textContent = r.status === 404 ? 'Product not found' : 'Product could not be loaded';
  document.title = 'Product not found — Practice Store';
} else {
  const p = r.data?.product || r.data;
  const name = productName(p);
  const stock = Number(p.stock ?? 0);
  document.title = name + ' — Practice Store';
  const qty = el('input', { id: 'qty', name: 'qty', type: 'number', min: '1', max: '10', step: '1', value: '1', inputmode: 'numeric', 'data-testid': 'qty-input' });
  const form = el('form', { id: 'add-form', class: 'row form-wide', novalidate: true, 'data-testid': 'add-to-cart-form' },
    el('div', { class: 'field' }, el('label', { for: 'qty' }, 'Quantity'), qty),
    el('div', { class: 'field' }, el('button', { type: 'submit', class: 'btn btn-primary', disabled: stock <= 0, 'data-testid': 'add-to-cart' }, changeOn('CHANGE_UI') ? 'Add to basket' : 'Add to cart')));
  box.replaceChildren(
    el('h1', { id: 'product-name', 'data-testid': 'product-name' }, name),
    el('img', { src: p.image || '/assets/img/product.svg', alt: name, width: '320', height: '240' }),
    el('p', { 'data-testid': 'product-description' }, p.description || ''),
    el('p', { class: 'muted' }, 'Category: ' + (p.category || '—')),
    el('p', { class: 'price', 'data-testid': 'product-price' }, money(amount(p, 'price'))),
    el('p', { 'data-testid': 'product-stock' }, stock > 0 ? stock + ' in stock' : 'Out of stock'),
    form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    show(err, ''); show(ok, '', 'ok');
    if (!(await me())) return goToLogin();
    const n = Number(qty.value);
    const res = await api('/api/cart/items', { method: 'POST', body: { productId: p.id, qty: n } });
    if (res.status === 401) return goToLogin();
    if (!res.ok) return show(err, errorText(res, 'Quantity must be between 1 and 10.'));
    show(ok, `Added ${n} × ${name} to your cart.`, 'ok');
    ok.append(' ', el('a', { href: '/cart' }, 'View cart'));
  });
}
