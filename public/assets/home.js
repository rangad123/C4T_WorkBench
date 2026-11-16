import { api, listOf, errorText } from '/assets/common.js';
import { productCard } from '/assets/products-shared.js';

const grid = document.getElementById('home-grid');
const status = document.getElementById('home-status');
const r = await api('/api/products?page=1');
if (!r.ok) status.textContent = errorText(r, 'Products could not be loaded.');
else {
  const items = listOf(r.data, 'products').slice(0, 8);
  grid.replaceChildren(...items.map(productCard));
  status.textContent = items.length ? '' : 'No products yet.';
}
