import { api, el, listOf, amount, money, errorText, categories, productName } from '/assets/common.js';
import { productCard } from '/assets/products-shared.js';

const PER_PAGE = 12;
const form = document.getElementById('filters');
const grid = document.getElementById('products-grid');
const tableWrap = document.getElementById('products-table-wrap');
const rows = document.getElementById('products-rows');
const status = document.getElementById('products-status');
const pager = document.getElementById('pager');
const catSelect = document.getElementById('f-category');
const params = new URLSearchParams(location.search);

form.q.value = params.get('q') || '';
form.minPrice.value = params.get('minPrice') || '';
form.maxPrice.value = params.get('maxPrice') || '';
form.inStock.checked = ['1', 'true'].includes(params.get('inStock'));
const view = params.get('view') === 'table' ? 'table' : 'cards';
document.getElementById(view === 'table' ? 'view-table' : 'view-cards').checked = true;

function applyView(v) {
  grid.hidden = v !== 'cards';
  tableWrap.hidden = v !== 'table';
}
for (const radio of document.querySelectorAll('input[name="view"]')) {
  radio.addEventListener('change', () => {
    applyView(radio.value);
    const u = new URL(location.href);
    u.searchParams.set('view', radio.value);
    history.replaceState(null, '', u);
  });
}

async function loadCategories() {
  const cats = await categories();
  const want = params.get('category') || '';
  if (want && !cats.includes(want)) cats.push(want);
  for (const c of cats) catSelect.append(el('option', { value: c }, c));
  catSelect.value = want;
}

async function load() {
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const q = new URLSearchParams();
  for (const k of ['q', 'category', 'minPrice', 'maxPrice', 'inStock']) if (params.get(k)) q.set(k, params.get(k));
  q.set('page', String(page));
  status.textContent = 'Loading…';
  const r = await api('/api/products?' + q);
  if (!r.ok) { status.textContent = errorText(r, 'Products could not be loaded.'); return; }
  let items = listOf(r.data, 'products');
  // The server filters; these checks only guard the display.
  const min = parseFloat(params.get('minPrice')), max = parseFloat(params.get('maxPrice'));
  items = items.filter((p) => {
    const price = amount(p, 'price');
    if (!Number.isNaN(min) && price < min) return false;
    if (!Number.isNaN(max) && price > max) return false;
    if (form.inStock.checked && !(Number(p.stock) > 0)) return false;
    return true;
  });
  const total = Number(r.data?.total ?? items.length);
  if (!items.length) {
    status.textContent = params.get('q') ? 'No products match your search.' : 'No products match these filters.';
  } else {
    status.textContent = `${total} product${total === 1 ? '' : 's'} found.`;
  }
  grid.replaceChildren(...items.map(productCard));
  rows.replaceChildren(...items.map((p) => el('tr', { 'data-testid': 'product-row' },
    el('td', {}, el('a', { href: '/products/' + encodeURIComponent(p.id) }, productName(p))),
    el('td', {}, p.category || ''),
    el('td', { class: 'num' }, money(amount(p, 'price'))),
    el('td', { class: 'num' }, Number(p.stock) > 0 ? String(p.stock) : 'Out of stock'))));
  const pages = Number(r.data?.pages ?? r.data?.totalPages ?? Math.max(1, Math.ceil(total / PER_PAGE)));
  pager.replaceChildren();
  if (pages > 1) {
    for (let i = 1; i <= pages; i++) {
      const u = new URLSearchParams(params); u.set('page', String(i));
      pager.append(el('a', { href: '?' + u, class: 'btn', 'aria-current': i === page ? 'page' : null, 'data-testid': 'page-link' }, 'Page ' + i));
    }
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const u = new URLSearchParams();
  for (const k of ['q', 'category', 'minPrice', 'maxPrice']) if (form[k].value.trim()) u.set(k, form[k].value.trim());
  if (form.inStock.checked) u.set('inStock', 'true');
  const v = document.querySelector('input[name="view"]:checked').value;
  if (v === 'table') u.set('view', 'table');
  location.search = u.toString();
});

applyView(view);
loadCategories();
load();
