// In-memory data, seeded at start and on reset. Prices are in mills (1/1000 dollar); totals in cents.
import { hashPasswordSync } from './auth.mjs';

export const CATEGORIES = ['books', 'games', 'home', 'garden', 'kitchen', 'toys'];
export const COUNTRIES = ['IN', 'GB', 'US', 'DE', 'FR', 'JP', 'AU'];
export const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

const ACCOUNTS = [
  { email: 'user@practice.test', password: 'Practice#123', name: 'Pat Practice', role: 'customer', twoFactor: null },
  { email: 'admin@practice.test', password: 'Admin#123', name: 'Ada Admin', role: 'admin', twoFactor: null },
  { email: 'otp@practice.test', password: 'Otp#12345', name: 'Otto Otp', role: 'customer', twoFactor: 'totp' },
  { email: 'mail@practice.test', password: 'Mail#1234', name: 'Mia Mail', role: 'customer', twoFactor: 'email' },
];
// Hash once per process; reset reuses the hashes.
const HASHES = ACCOUNTS.map((a) => hashPasswordSync(a.password));
export const SEED_USER_IDS = new Set(ACCOUNTS.map((_, i) => i + 1));

// [name, category, price in mills, stock, rating, description]
const PRODUCTS = [
  ['The Patient Tester', 'books', 14990, 25, 4.5, 'A calm guide to finding bugs before your users do.'],
  ['Edge Cases Explained', 'books', 22500, 12, 4.2, 'Every boundary value you forgot, in one paperback.'],
  ['Mystery of the Missing Semicolon', 'books', 9990, 40, 3.9, 'A whodunit set in a code review.'],
  ['Atlas of Small Towns', 'books', 31000, 0, 4.8, 'Maps and stories from places nobody visits. Currently out of stock.'],
  ['Pixel Racers', 'games', 19990, 30, 4.1, 'A two-player racing board game with tiny pixel cars.'],
  ['Puzzle Cube Deluxe', 'games', 12345, 50, 4.4, 'A smooth-turning puzzle cube with a travel case.'],
  ['Castle Siege Cards', 'games', 8750, 18, 3.7, 'A card game about building walls and knocking them down.'],
  ['Word Ladder', 'games', 6005, 22, 4.0, 'Change one letter at a time to climb the ladder.'],
  ['Linen Cushion Cover', 'home', 15990, 35, 4.3, 'Soft linen cover, 45 x 45 cm, sand colour.'],
  ['Desk Lamp Mini', 'home', 27990, 9, 4.6, 'A small LED lamp with three brightness levels.'],
  ['Wool Throw Blanket', 'home', 45000, 6, 4.7, 'A warm throw for the sofa, 130 x 170 cm.'],
  ['Wall Clock Plain', 'home', 18995, 14, 3.8, 'A silent wall clock with a plain white face.'],
  ['Seed Starter Kit', 'garden', 11490, 28, 4.2, 'Trays, soil pellets and labels for 24 seedlings.'],
  ['Watering Can 5 L', 'garden', 13990, 19, 4.0, 'A metal watering can with a long spout.'],
  ['Loose Herb Seeds (per pack)', 'garden', 2495, 100, 4.1, 'Basil, parsley or mint seeds, priced per small pack.'],
  ['Garden Gloves', 'garden', 7490, 45, 3.9, 'Breathable gloves with grippy fingertips.'],
  ['Chef Knife 20 cm', 'kitchen', 39990, 11, 4.8, 'A balanced stainless steel knife.'],
  ['Bamboo Cutting Board', 'kitchen', 16490, 24, 4.4, 'A sturdy board with a juice groove.'],
  ['Loose Tea (per 100 g)', 'kitchen', 4995, 60, 4.5, 'A mild green tea, sold by weight.'],
  ['Measuring Spoons', 'kitchen', 5490, 70, 4.0, 'A set of six stainless steel spoons.'],
  ['Wooden Train Set', 'toys', 34990, 7, 4.9, 'Twenty pieces of track and a small engine.'],
  ['Bouncy Ball Pack', 'toys', 1005, 120, 3.6, 'Five bouncy balls in bright colours.'],
  ['Kite Classic', 'toys', 15500, 15, 4.2, 'A diamond kite with 30 m of line.'],
  ['Building Blocks 100', 'toys', 24990, 20, 4.6, 'One hundred blocks in a storage tub.'],
];

const DAY = 24 * 3600 * 1000;

export function seed(now = Date.now()) {
  const iso = (t) => new Date(t).toISOString();
  const users = ACCOUNTS.map((a, i) => ({
    id: i + 1, email: a.email, name: a.name, role: a.role, twoFactor: a.twoFactor,
    totpSecret: a.twoFactor === 'totp' ? TOTP_SECRET : null, passwordHash: HASHES[i],
    usedCodes: [], avatar: null, createdAt: iso(now - 90 * DAY),
  }));
  const products = PRODUCTS.map(([name, category, priceMills, stock, rating, description], i) => ({
    id: i + 1, name, category, priceMills, stock, rating, description,
  }));
  const p = (id) => products[id - 1];
  const line = (pid, qty) => ({ productId: pid, name: p(pid).name, priceMills: p(pid).priceMills, qty });
  const address = { name: 'Pat Practice', street: '1 Test Street', city: 'Sampleton', postcode: '12345' };
  const mkOrder = (id, daysAgo, status, lines, history) => {
    const subtotal = lines.reduce((s, l) => s + Math.round((l.priceMills * l.qty) / 10), 0);
    const at = now - daysAgo * DAY;
    return {
      id, userId: 1, lines: lines.map((l) => ({ ...l, lineTotal: Math.round((l.priceMills * l.qty) / 10) })),
      subtotal, discountCode: null, discount: 0, shipping: { method: 'standard', cost: 0 }, total: subtotal, address, status,
      history: history.map((s, i) => ({ status: s, at: iso(at + i * DAY / 2) })), createdAt: iso(at),
    };
  };
  const orders = [
    mkOrder(1001, 30, 'delivered', [line(1, 1), line(19, 2)], ['pending', 'paid', 'shipped', 'delivered']),
    mkOrder(1002, 10, 'shipped', [line(5, 1)], ['pending', 'paid', 'shipped']),
    mkOrder(1003, 5, 'paid', [line(13, 2)], ['pending', 'paid']),
    mkOrder(1004, 2, 'pending', [line(22, 3), line(15, 1)], ['pending']),
    mkOrder(1005, 20, 'cancelled', [line(9, 1)], ['pending', 'cancelled']),
  ];
  const notes = [
    { id: 1, ownerId: 1, title: 'Shopping list', body: 'Tea, seeds, gloves.', readers: [4], createdAt: iso(now - 7 * DAY), updatedAt: iso(now - 7 * DAY) },
    { id: 2, ownerId: 1, title: 'Gift ideas', body: 'A kite for the summer.', readers: [], createdAt: iso(now - 3 * DAY), updatedAt: iso(now - 3 * DAY) },
    { id: 3, ownerId: 2, title: 'Admin reminders', body: 'Ship pending orders on Monday.', readers: [], createdAt: iso(now - 1 * DAY), updatedAt: iso(now - 1 * DAY) },
  ];
  return {
    users, products, orders, notes,
    carts: new Map(), // userId -> { items: [{id, productId, qty}], codes: [] }
    mail: [],
    next: { user: users.length + 1, order: 1006, note: 4, cartItem: 1, mail: 1 },
  };
}

export function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, twoFactor: u.twoFactor, hasAvatar: !!u.avatar, avatarUrl: u.avatar ? '/api/account/avatar' : null, createdAt: u.createdAt };
}

export function publicProduct(p, changeApi = false) {
  if (changeApi) return { id: p.id, title: p.name, sku: `PS-${String(p.id).padStart(4, '0')}`, category: p.category, price: p.priceMills / 1000, stock: p.stock, inStock: p.stock > 0, rating: p.rating, description: p.description };
  return { id: p.id, name: p.name, category: p.category, price: p.priceMills / 1000, stock: p.stock, inStock: p.stock > 0, rating: p.rating, description: p.description };
}
