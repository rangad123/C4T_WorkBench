import { api, listOf, amount } from '/assets/common.js';

// Loads the cart and normalises it: lines with price/qty/lineTotal, plus subtotal, discount, total (server values preferred).
export async function loadCart(shipping) {
  const r = await api('/api/cart/items' + (shipping ? '?shipping=' + encodeURIComponent(shipping) : ''));
  if (!r.ok) return { r };
  const d = r.data || {};
  const lines = listOf(d.cart || d, 'items', 'lines').map((it) => {
    const price = amount(it, 'price') ?? amount(it.product, 'price');
    const qty = Number(it.qty ?? it.quantity ?? 1);
    const lineTotal = amount(it, 'lineTotal') ?? amount(it, 'total') ?? Math.round(price * qty * 100) / 100;
    return { id: it.id ?? it.productId, productId: it.productId ?? it.product?.id, name: it.name || it.title || it.product?.name || it.product?.title || 'Product', price, qty, lineTotal };
  });
  const src = d.cart || d.totals || d;
  const subtotal = amount(src, 'subtotal') ?? Math.round(lines.reduce((s, l) => s + l.lineTotal * 100, 0)) / 100;
  const discount = amount(src, 'discount') ?? 0;
  const shippingCost = src.shipping && typeof src.shipping === 'object' ? amount(src.shipping, 'cost') : null;
  const total = amount(src, 'total') ?? Math.round((subtotal - discount + (shippingCost || 0)) * 100) / 100;
  const code = src.discountCode || src.code || (typeof src.discount === 'object' ? src.discount?.code : null) || null;
  return { r, lines, subtotal, discount, shippingCost, total, code };
}
