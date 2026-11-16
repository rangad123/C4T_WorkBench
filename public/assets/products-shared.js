import { el, amount, money, productName } from '/assets/common.js';

export function productCard(p) {
  const price = amount(p, 'price');
  const stock = Number(p.stock ?? 0);
  return el('li', { class: 'card', 'data-testid': 'product-card' },
    el('img', { src: p.image || '/assets/img/product.svg', alt: '', width: '160', height: '120' }),
    el('h3', {}, el('a', { href: '/products/' + encodeURIComponent(p.id), 'data-testid': 'product-link' }, productName(p))),
    el('p', { class: 'muted' }, p.category || ''),
    el('p', { class: 'price', 'data-testid': 'product-price' }, money(price)),
    el('p', { 'data-testid': 'product-stock' }, stock > 0 ? stock + ' in stock' : 'Out of stock'));
}
