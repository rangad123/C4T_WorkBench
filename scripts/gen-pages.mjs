// One-off generator: writes the shared layout around each page body. Output is plain HTML in public/.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = new URL('../public', import.meta.url).pathname;

const practiceLinks = [
  ['/widgets', 'Widgets'], ['/live', 'Live'], ['/spa/#/dashboard', 'Notes (SPA)'], ['/mailbox', 'Mailbox'],
  ['/login-plain', 'Plain login'], ['/captcha', 'Captcha'], ['/ads', 'Ads'], ['/a11y', 'Accessibility issues'],
  ['/slow', 'Slow page'], ['/broken', 'Broken page'], ['/docs/requirements', 'Requirements'], ['/docs/api', 'Api'],
];

function nav(current) {
  const cur = (href) => (href === current ? ' aria-current="page"' : '');
  return `<header class="site-header">
  <div class="practice-banner" role="note" data-testid="practice-banner">Practice site for automated testing — not a real shop.</div>
  <div class="inner">
    <a class="brand" href="/" data-testid="brand">Practice Store</a>
    <nav class="site-nav" aria-label="Main">
      <ul>
        <li><a href="/"${cur('/')} data-testid="nav-home">Home</a></li>
        <li class="dropdown">
          <button type="button" class="linklike" id="shop-button" aria-expanded="false" aria-controls="shop-menu" data-testid="nav-shop">Shop ▾</button>
          <ul class="dropdown-menu" id="shop-menu" hidden>
            <li><a href="/products"${cur('/products')} data-testid="nav-products">All products</a></li>
          </ul>
        </li>
        <li><a href="/cart"${cur('/cart')} data-testid="nav-cart">Cart</a></li>
        <li><a href="/orders"${cur('/orders')} data-testid="nav-orders">Orders</a></li>
        <li class="dropdown">
          <button type="button" class="linklike" id="practice-button" aria-expanded="false" aria-controls="practice-menu" data-testid="nav-practice">Practice pages ▾</button>
          <ul class="dropdown-menu" id="practice-menu" hidden>
${practiceLinks.map(([h, t]) => `            <li><a href="${h}"${cur(h)}>${t}</a></li>`).join('\n')}
          </ul>
        </li>
        <li id="nav-admin" hidden><a href="/admin"${cur('/admin')} data-testid="nav-admin">Admin</a></li>
        <li id="nav-signin"><a href="/login"${cur('/login')} data-testid="nav-signin">Sign in</a></li>
        <li id="nav-account" hidden><a href="/account"${cur('/account')} data-testid="nav-account">Account</a></li>
        <li id="nav-signout" hidden><button type="button" class="linklike" data-testid="nav-signout">Sign out</button></li>
      </ul>
    </nav>
    <form class="site-search" role="search" action="/products" method="get">
      <label for="site-search-q" class="sr-only">Search products</label>
      <input id="site-search-q" name="q" type="search" maxlength="100" placeholder="Search products" data-testid="search-input">
      <button type="submit" class="btn" data-testid="search-button">Search</button>
    </form>
  </div>
</header>`;
}

function page(file, { title, current, body, script, head = '' }) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf-token" content="__CSRF__">
<title>${title} — Practice Store</title>
<link rel="stylesheet" href="/assets/site.css">
<script type="module" src="/assets/common.js"></script>
${script ? `<script type="module" src="/assets/${script}"></script>\n` : ''}${head}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${nav(current)}
<main id="main">
${body.trim()}
</main>
<footer class="site-footer">Practice Store · fake data only · <a href="/docs/requirements">Requirements</a></footer>
</body>
</html>
`;
  const path = join(OUT, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, html);
}

const notice = (id) => `<p id="${id}" class="notice notice-error" role="alert" hidden data-testid="${id}"></p>`;

page('index.html', {
  title: 'Home', current: '/', script: 'home.js', body: `
<h1>Welcome to the Practice Store</h1>
<p>A pretend shop for practising automated tests. Browse the products, sign in with a seeded account and place an order — nothing is real.</p>
<form class="row form-wide" role="search" action="/products" method="get" aria-label="Find a product">
  <div class="field"><label for="home-q">Find a product</label>
  <input id="home-q" name="q" type="search" maxlength="100" data-testid="home-search-input"></div>
  <div class="field"><button type="submit" class="btn btn-primary" data-testid="home-search-button">Search</button></div>
</form>
<h2>Featured products</h2>
<p id="home-status" class="muted" role="status">Loading products…</p>
<ul id="home-grid" class="grid" data-testid="product-grid"></ul>
<p><a href="/products">See all products</a></p>`,
});

page('login.html', {
  title: 'Sign in', current: '/login', script: 'login.js', body: `
<h1>Sign in</h1>
<form id="login-form" class="form" novalidate data-testid="login-form">
  ${notice('login-error')}
  <div class="field"><label for="login-email">Email</label>
  <input id="login-email" name="email" type="email" autocomplete="username" data-testid="login-email"></div>
  <div class="field"><label for="login-password">Password</label>
  <input id="login-password" name="password" type="password" autocomplete="current-password" data-testid="login-password"></div>
  <div class="field check"><input id="login-remember" name="remember" type="checkbox" data-testid="login-remember">
  <label for="login-remember">Remember me</label></div>
  <div class="actions"><button type="submit" class="btn btn-primary" data-testid="login-submit">Sign in</button></div>
</form>
<p>New here? <a href="/signup" data-testid="signup-link">Create an account</a>.</p>
<p class="muted">Seeded accounts are listed on <a href="/docs/accounts">the accounts page</a>.</p>`,
});

page('login-plain.html', {
  title: 'Login / Signup', current: '/login-plain', script: 'login-plain.js', body: `
<h1>Login or sign up</h1>
<div class="row">
  <section class="card form" aria-labelledby="plain-login-h">
    <h2 id="plain-login-h">Login to your account</h2>
    <form id="plain-login" novalidate>
      <p id="plain-login-error" class="notice notice-error" role="alert" hidden></p>
      <div class="field"><input type="email" name="email" placeholder="Email Address" data-qa="login-email"></div>
      <div class="field"><input type="password" name="password" placeholder="Password" data-qa="login-password"></div>
      <button type="submit" class="btn btn-primary" data-qa="login-button">Login</button>
    </form>
  </section>
  <p class="muted" aria-hidden="true">OR</p>
  <section class="card form" aria-labelledby="plain-signup-h">
    <h2 id="plain-signup-h">New User Signup!</h2>
    <form id="plain-signup" action="/signup" method="get">
      <div class="field"><input type="text" name="name" placeholder="Name" data-qa="signup-name"></div>
      <div class="field"><input type="email" name="email" placeholder="Email Address" data-qa="signup-email"></div>
      <button type="submit" class="btn" data-qa="signup-button">Signup</button>
    </form>
  </section>
</div>`,
});

const field = (id, label, input, hint) => `
  <div class="field"><label for="${id}">${label}</label>
  ${input}
  ${hint ? `<p id="${id}-hint" class="hint">${hint}</p>` : ''}
  <p id="${id}-error" class="field-error" hidden></p></div>`;

page('signup.html', {
  title: 'Create an account', current: '/signup', script: 'signup.js', body: `
<h1>Create an account</h1>
<form id="signup-form" class="form" novalidate data-testid="signup-form">
  ${notice('signup-error')}
  ${field('su-name', 'Full name', '<input id="su-name" name="name" type="text" required minlength="2" maxlength="60" autocomplete="name" aria-describedby="su-name-hint su-name-error" data-testid="signup-name">', '2 to 60 characters.')}
  ${field('su-email', 'Email', '<input id="su-email" name="email" type="email" required autocomplete="email" aria-describedby="su-email-error" data-testid="signup-email">')}
  ${field('su-password', 'Password', '<input id="su-password" name="password" type="password" required minlength="8" pattern="(?=.*[A-Za-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}" autocomplete="new-password" aria-describedby="su-password-hint su-password-error" data-testid="signup-password">', 'At least 8 characters with a letter, a number and a symbol.')}
  ${field('su-confirm', 'Confirm password', '<input id="su-confirm" name="confirm" type="password" required autocomplete="new-password" aria-describedby="su-confirm-error" data-testid="signup-confirm">')}
  ${field('su-age', 'Age', '<input id="su-age" name="age" type="number" required min="18" max="120" step="1" inputmode="numeric" aria-describedby="su-age-hint su-age-error" data-testid="signup-age">', 'A whole number from 18 to 120.')}
  ${field('su-country', 'Country', `<select id="su-country" name="country" required aria-describedby="su-country-error" data-testid="signup-country">
    <option value="">Choose…</option><option value="IN">India</option><option value="GB">United Kingdom</option><option value="US">United States</option>
    <option value="DE">Germany</option><option value="FR">France</option><option value="JP">Japan</option><option value="AU">Australia</option></select>`)}
  <div class="field"><span class="check"><input id="su-terms" name="terms" type="checkbox" required aria-describedby="su-terms-error" data-testid="signup-terms">
  <label for="su-terms">I accept the terms</label></span>
  <p id="su-terms-error" class="field-error" hidden></p></div>
  <div class="actions"><button type="submit" class="btn btn-primary" data-testid="signup-submit">Create account</button></div>
</form>
<p>Already have an account? <a href="/login">Sign in</a>.</p>`,
});

page('otp.html', {
  title: 'Enter your code', current: '/otp', script: 'otp.js', body: `
<h1>Two-step sign-in</h1>
<p id="otp-intro">Enter the 6-digit code from your authenticator app.</p>
<p id="otp-mailbox" hidden>We "sent" a code to your email. Read it in the <a id="otp-mailbox-link" href="/mailbox">fake mailbox</a>.</p>
<form id="otp-form" class="form" novalidate data-testid="otp-form">
  ${notice('otp-error')}
  <div class="field"><label for="otp-code">6-digit code</label>
  <input id="otp-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\\d{6}" data-testid="otp-code"></div>
  <div class="actions"><button type="submit" class="btn btn-primary" data-testid="otp-submit">Verify</button></div>
</form>`,
});

page('mailbox.html', {
  title: 'Mailbox', current: '/mailbox', script: 'mailbox.js', body: `
<h1>Fake mailbox</h1>
<p>Messages the site pretends to email. Nothing is really sent.</p>
<form id="mailbox-form" class="row form-wide" method="get" action="/mailbox">
  <div class="field"><label for="mailbox-to">Email address</label>
  <input id="mailbox-to" name="to" type="email" required data-testid="mailbox-to"></div>
  <div class="field"><button type="submit" class="btn btn-primary" data-testid="mailbox-open">Open inbox</button></div>
</form>
${notice('mailbox-error')}
<p id="mailbox-status" class="muted" role="status"></p>
<div class="table-wrap" tabindex="0" role="region" aria-label="Messages" id="mailbox-wrap" hidden>
<table data-testid="mailbox-table"><caption>Inbox</caption>
<thead><tr><th scope="col">Time</th><th scope="col">Subject</th><th scope="col">Code</th><th scope="col">Link</th></tr></thead>
<tbody id="mailbox-rows"></tbody></table></div>`,
});

page('products.html', {
  title: 'Products', current: '/products', script: 'products.js', body: `
<h1>Products</h1>
<form id="filters" class="row" data-testid="product-filters" aria-label="Filter products">
  <div class="field"><label for="f-q">Search</label><input id="f-q" name="q" type="search" maxlength="100" data-testid="filter-q"></div>
  <div class="field"><label for="f-category">Category</label><select id="f-category" name="category" data-testid="filter-category"><option value="">All categories</option></select></div>
  <div class="field"><label for="f-min">Min price</label><input id="f-min" name="minPrice" type="number" min="0" step="0.01" data-testid="filter-min-price"></div>
  <div class="field"><label for="f-max">Max price</label><input id="f-max" name="maxPrice" type="number" min="0" step="0.01" data-testid="filter-max-price"></div>
  <div class="field check"><input id="f-stock" name="inStock" type="checkbox" value="1" data-testid="filter-in-stock"> <label for="f-stock">In stock only</label></div>
  <div class="field"><button type="submit" class="btn btn-primary" data-testid="filter-apply">Apply filters</button></div>
</form>
<fieldset class="row"><legend>View</legend>
  <span class="check"><input type="radio" id="view-cards" name="view" value="cards" checked data-testid="view-cards"> <label for="view-cards">Cards</label></span>
  <span class="check"><input type="radio" id="view-table" name="view" value="table" data-testid="view-table"> <label for="view-table">Table</label></span>
</fieldset>
<h2 class="sr-only">Results</h2>
<p id="products-status" role="status" data-testid="products-status"></p>
<ul id="products-grid" class="grid" data-testid="product-grid"></ul>
<div id="products-table-wrap" class="table-wrap" tabindex="0" role="region" aria-label="Products table" hidden>
<table data-testid="product-table"><caption>Products</caption>
<thead><tr><th scope="col">Name</th><th scope="col">Category</th><th scope="col" class="num">Price</th><th scope="col" class="num">Stock</th></tr></thead>
<tbody id="products-rows"></tbody></table></div>
<nav aria-label="Pages" class="actions" id="pager" data-testid="pager"></nav>`,
});

page('product.html', {
  title: 'Product', current: '', script: 'product.js', body: `
<p><a href="/products">← All products</a></p>
<div id="product" data-testid="product-detail">
  <h1 id="product-name">Loading…</h1>
</div>
${notice('product-error')}
<p id="product-ok" class="notice notice-ok" role="status" hidden data-testid="product-ok"></p>`,
});

page('cart.html', {
  title: 'Cart', current: '/cart', script: 'cart.js', body: `
<h1>Your cart</h1>
${notice('cart-error')}
<p id="cart-ok" class="notice notice-ok" role="status" hidden data-testid="cart-ok"></p>
<p id="cart-empty" hidden data-testid="cart-empty">Your cart is empty.</p>
<div id="cart-wrap" class="table-wrap" tabindex="0" role="region" aria-label="Cart lines" hidden>
<table data-testid="cart-table"><caption>Cart lines</caption>
<thead><tr><th scope="col">Product</th><th scope="col" class="num">Price</th><th scope="col">Quantity</th><th scope="col" class="num">Line total</th><th scope="col">Actions</th></tr></thead>
<tbody id="cart-rows"></tbody></table></div>
<div id="cart-side" hidden>
<form id="discount-form" class="row form-wide" data-testid="discount-form">
  <div class="field"><label for="discount-code">Discount code</label><input id="discount-code" name="code" type="text" maxlength="20" autocomplete="off" data-testid="discount-code"></div>
  <div class="field"><button type="submit" class="btn" data-testid="discount-apply">Apply</button></div>
</form>
<div class="totals" data-testid="cart-totals"><dl>
  <dt>Subtotal</dt><dd id="cart-subtotal" data-testid="cart-subtotal">—</dd>
  <dt>Discount</dt><dd id="cart-discount" data-testid="cart-discount">—</dd>
  <dt>Total</dt><dd id="cart-total" data-testid="cart-total">—</dd>
</dl>
<p class="actions"><a class="btn btn-primary" href="/checkout" data-testid="checkout-link">Checkout</a></p></div>
</div>`,
});

page('checkout.html', {
  title: 'Checkout', current: '/checkout', script: 'checkout.js', body: `
<h1>Checkout</h1>
<form id="checkout-form" class="form" novalidate data-testid="checkout-form">
  ${notice('checkout-error')}
  <fieldset><legend>Shipping address</legend>
  ${field('ship-name', 'Name', '<input id="ship-name" name="name" type="text" required maxlength="60" autocomplete="name" aria-describedby="ship-name-error" data-testid="ship-name">')}
  ${field('ship-street', 'Street', '<input id="ship-street" name="street" type="text" required maxlength="100" autocomplete="street-address" aria-describedby="ship-street-error" data-testid="ship-street">')}
  ${field('ship-city', 'City', '<input id="ship-city" name="city" type="text" required maxlength="60" autocomplete="address-level2" aria-describedby="ship-city-error" data-testid="ship-city">')}
  ${field('ship-postcode', 'Postcode', '<input id="ship-postcode" name="postcode" type="text" required maxlength="12" autocomplete="postal-code" aria-describedby="ship-postcode-error" data-testid="ship-postcode">')}
  </fieldset>
  <fieldset><legend>Shipping</legend>
    <div class="check"><input type="radio" id="ship-standard" name="shipping" value="standard" checked data-testid="ship-standard"> <label for="ship-standard">Standard (free, 5 days)</label></div>
    <div class="check"><input type="radio" id="ship-express" name="shipping" value="express" data-testid="ship-express"> <label for="ship-express">Express ($9.99, 1 day)</label></div>
  </fieldset>
  <div class="actions"><button type="submit" class="btn btn-primary" data-testid="checkout-continue">Continue to review</button></div>
</form>`,
});

page('checkout-review.html', {
  title: 'Review your order', current: '/checkout/review', script: 'checkout-review.js', body: `
<h1>Review your order</h1>
${notice('review-error')}
<div id="review" data-testid="review"></div>
<div class="actions"><a class="btn" href="/checkout">Change shipping</a>
<button type="button" id="place-order" class="btn btn-primary" data-testid="place-order" disabled>Place order</button></div>`,
});

page('orders.html', {
  title: 'Your orders', current: '/orders', script: 'orders.js', body: `
<h1>Your orders</h1>
${notice('orders-error')}
<p id="orders-empty" hidden>You have no orders yet.</p>
<div id="orders-wrap" class="table-wrap" tabindex="0" role="region" aria-label="Orders" hidden>
<table data-testid="orders-table"><caption>Orders, newest first</caption>
<thead><tr><th scope="col">Order</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col" class="num">Total</th></tr></thead>
<tbody id="orders-rows"></tbody></table></div>`,
});

page('order.html', {
  title: 'Order', current: '', script: 'order.js', body: `
<p><a href="/orders">← All orders</a></p>
<h1 id="order-title">Order</h1>
<p id="order-placed" class="notice notice-ok" role="status" hidden data-testid="order-placed">Order placed</p>
${notice('order-error')}
<div id="order" data-testid="order-detail"></div>`,
});

page('account.html', {
  title: 'Your account', current: '/account', script: 'account.js', body: `
<h1>Your account</h1>
<section aria-labelledby="acc-profile-h">
<h2 id="acc-profile-h">Profile</h2>
<dl id="acc-summary" data-testid="account-summary"></dl>
<img id="acc-avatar" alt="Your avatar" width="96" height="96" hidden data-testid="account-avatar">
<form id="profile-form" class="form" novalidate data-testid="profile-form">
  ${notice('profile-error')}
  <p id="profile-ok" class="notice notice-ok" role="status" hidden></p>
  ${field('acc-name', 'Name', '<input id="acc-name" name="name" type="text" required maxlength="60" autocomplete="name" aria-describedby="acc-name-error" data-testid="account-name">')}
  <button type="submit" class="btn btn-primary" data-testid="profile-save">Save name</button>
</form>
</section>
<section aria-labelledby="acc-pw-h">
<h2 id="acc-pw-h">Change password</h2>
<form id="password-form" class="form" novalidate data-testid="password-form">
  ${notice('password-error')}
  <p id="password-ok" class="notice notice-ok" role="status" hidden></p>
  ${field('pw-current', 'Current password', '<input id="pw-current" name="current" type="password" required autocomplete="current-password" aria-describedby="pw-current-error" data-testid="password-current">')}
  ${field('pw-new', 'New password', '<input id="pw-new" name="next" type="password" required minlength="8" pattern="(?=.*[A-Za-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}" autocomplete="new-password" aria-describedby="pw-new-hint pw-new-error" data-testid="password-new">', 'At least 8 characters with a letter, a number and a symbol.')}
  <button type="submit" class="btn btn-primary" data-testid="password-save">Change password</button>
</form>
</section>
<section aria-labelledby="acc-avatar-h">
<h2 id="acc-avatar-h">Avatar</h2>
<form id="avatar-form" class="form" novalidate data-testid="avatar-form">
  ${notice('avatar-error')}
  <p id="avatar-ok" class="notice notice-ok" role="status" hidden></p>
  ${field('avatar-file', 'Avatar image', '<input id="avatar-file" name="avatar" type="file" accept="image/png,image/jpeg" aria-describedby="avatar-file-hint avatar-file-error" data-testid="avatar-file">', 'PNG or JPG, 1 MB or smaller.')}
  <button type="submit" class="btn btn-primary" data-testid="avatar-upload">Upload avatar</button>
</form>
</section>
<section aria-labelledby="acc-orders-h">
<h2 id="acc-orders-h">Orders and invoices</h2>
<p id="acc-orders-empty" hidden>You have no orders yet.</p>
<ul id="acc-orders" data-testid="account-orders"></ul>
</section>`,
});

page('admin/index.html', {
  title: 'Admin', current: '/admin', script: 'admin.js', body: `
<h1>Admin</h1>
${notice('admin-error')}
<div id="admin-home" hidden>
<p>Manage the store.</p>
<ul><li><a href="/admin/users" data-testid="admin-users-link">Users</a></li><li><a href="/admin/orders" data-testid="admin-orders-link">Orders</a></li></ul>
</div>`,
});

page('admin/users.html', {
  title: 'Admin: users', current: '/admin/users', script: 'admin.js', body: `
<h1>Users</h1>
<p><a href="/admin">← Admin</a></p>
${notice('admin-error')}
<p id="admin-ok" class="notice notice-ok" role="status" hidden></p>
<div id="admin-users-wrap" class="table-wrap" tabindex="0" role="region" aria-label="Users" hidden>
<table data-testid="admin-users-table"><caption>All accounts</caption>
<thead><tr><th scope="col">Email</th><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Change role</th></tr></thead>
<tbody id="admin-users-rows"></tbody></table></div>`,
});

page('admin/orders.html', {
  title: 'Admin: orders', current: '/admin/orders', script: 'admin.js', body: `
<h1>All orders</h1>
<p><a href="/admin">← Admin</a></p>
${notice('admin-error')}
<p id="admin-ok" class="notice notice-ok" role="status" hidden></p>
<div id="admin-orders-wrap" class="table-wrap" tabindex="0" role="region" aria-label="Orders" hidden>
<table data-testid="admin-orders-table"><caption>All orders</caption>
<thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col" class="num">Total</th><th scope="col">Next status</th></tr></thead>
<tbody id="admin-orders-rows"></tbody></table></div>`,
});

page('403.html', {
  title: 'No access', current: '', body: `
<h1>You do not have access to this page.</h1>
<p>This page is for admins. <a href="/">Go to the home page</a>.</p>`,
});

page('404.html', {
  title: 'Page not found', current: '', body: `
<h1>Page not found</h1>
<p>There is no page at this address. <a href="/">Go to the home page</a>.</p>`,
});

page('spa/index.html', {
  title: 'Notes', current: '/spa/#/dashboard', script: 'spa.js', body: `
<h1 id="spa-title" tabindex="-1">Notes area</h1>
<nav class="spa-nav" aria-label="Notes area">
  <a href="#/dashboard" data-testid="spa-dashboard-link">Dashboard</a>
  <a href="#/notes" data-testid="spa-notes-link">Notes</a>
</nav>
${notice('spa-error')}
<p id="spa-ok" class="notice notice-ok" role="status" hidden></p>
<div id="spa-view" data-testid="spa-view"></div>`,
});

page('widgets.html', {
  title: 'Widgets', current: '/widgets', script: 'widgets.js', body: `
<h1>Widgets</h1>
<p>Common interface pieces to practise against.</p>

<section class="widget" aria-labelledby="w-dialog-h">
  <h2 id="w-dialog-h">Dialogs</h2>
  <div class="actions">
    <button type="button" class="btn" id="open-native-dialog" data-testid="open-native-dialog">Open native dialog</button>
    <button type="button" class="btn" id="open-aria-dialog" data-testid="open-aria-dialog">Open custom dialog</button>
  </div>
  <p id="dialog-result" role="status" data-testid="dialog-result"></p>
  <dialog id="native-dialog" aria-labelledby="native-dialog-h" data-testid="native-dialog">
    <h2 id="native-dialog-h">Subscribe</h2>
    <form method="dialog" id="native-dialog-form">
      <div class="field"><label for="nd-email">Email</label><input id="nd-email" type="email" name="email" data-testid="native-dialog-email"></div>
      <div class="actions"><button value="ok" class="btn btn-primary" data-testid="native-dialog-ok">Subscribe</button>
      <button value="cancel" class="btn" data-testid="native-dialog-cancel">Cancel</button></div>
    </form>
  </dialog>
  <div id="aria-dialog-backdrop" class="modal-backdrop" hidden>
    <div id="aria-dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="aria-dialog-h" data-testid="aria-dialog">
      <h2 id="aria-dialog-h">Confirm action</h2>
      <p>Do you want to continue?</p>
      <div class="actions"><button type="button" class="btn btn-primary" id="aria-dialog-yes" data-testid="aria-dialog-yes">Yes, continue</button>
      <button type="button" class="btn" id="aria-dialog-no" data-testid="aria-dialog-no">No</button></div>
    </div>
  </div>
</section>

<section class="widget" aria-labelledby="w-menu-h">
  <h2 id="w-menu-h">Menu</h2>
  <div class="dropdown-wrap">
    <button type="button" class="btn" id="menu-button" aria-haspopup="menu" aria-expanded="false" aria-controls="actions-menu" data-testid="menu-button">Actions ▾</button>
    <ul id="actions-menu" role="menu" aria-labelledby="menu-button" hidden data-testid="actions-menu">
      <li role="menuitem" tabindex="-1">Edit</li>
      <li role="menuitem" tabindex="-1">Duplicate</li>
      <li role="menuitem" tabindex="-1">Archive</li>
      <li role="menuitem" tabindex="-1">Delete</li>
    </ul>
  </div>
  <p id="menu-result" role="status" data-testid="menu-result"></p>
</section>

<section class="widget tabs" aria-labelledby="w-tabs-h">
  <h2 id="w-tabs-h">Tabs</h2>
  <div role="tablist" aria-label="Product information">
    <button type="button" role="tab" id="tab-desc" aria-selected="true" aria-controls="panel-desc" data-testid="tab-description">Description</button>
    <button type="button" role="tab" id="tab-specs" aria-selected="false" aria-controls="panel-specs" tabindex="-1" data-testid="tab-specs">Specifications</button>
    <button type="button" role="tab" id="tab-reviews" aria-selected="false" aria-controls="panel-reviews" tabindex="-1" data-testid="tab-reviews">Reviews</button>
  </div>
  <div role="tabpanel" id="panel-desc" aria-labelledby="tab-desc" tabindex="0"><p>A sturdy practice widget, made of nothing at all.</p></div>
  <div role="tabpanel" id="panel-specs" aria-labelledby="tab-specs" tabindex="0" hidden><p>Weight: 0 g. Colour: imaginary.</p></div>
  <div role="tabpanel" id="panel-reviews" aria-labelledby="tab-reviews" tabindex="0" hidden><p>"Exactly as described." — a fake reviewer</p></div>
</section>

<section class="widget accordion" aria-labelledby="w-acc-h">
  <h2 id="w-acc-h">Accordion (frequently asked questions)</h2>
  <h3><button type="button" aria-expanded="false" aria-controls="acc-1" id="acc-1-btn" data-testid="accordion-shipping">How long does shipping take?</button></h3>
  <div id="acc-1" class="panel" role="region" aria-labelledby="acc-1-btn" hidden><p>Standard takes 5 days, Express 1 day. Nothing actually ships.</p></div>
  <h3><button type="button" aria-expanded="false" aria-controls="acc-2" id="acc-2-btn" data-testid="accordion-returns">Can I return an item?</button></h3>
  <div id="acc-2" class="panel" role="region" aria-labelledby="acc-2-btn" hidden><p>Cancel an order while it is pending or paid.</p></div>
  <h3><button type="button" aria-expanded="false" aria-controls="acc-3" id="acc-3-btn" data-testid="accordion-codes">Is there a discount code?</button></h3>
  <div id="acc-3" class="panel" role="region" aria-labelledby="acc-3-btn" hidden><p>Try SAVE10 in the cart.</p></div>
</section>

<section class="widget" aria-labelledby="w-table-h">
  <h2 id="w-table-h">Sortable table</h2>
  <div class="table-wrap" tabindex="0" role="region" aria-label="Team table">
  <table id="sort-table" data-testid="sort-table"><caption>Team (click a header to sort)</caption>
    <thead><tr>
      <th scope="col" aria-sort="none"><button type="button" class="linklike" data-key="0" data-testid="sort-name">Name</button></th>
      <th scope="col" aria-sort="none"><button type="button" class="linklike" data-key="1" data-testid="sort-role">Role</button></th>
      <th scope="col" aria-sort="none" class="num"><button type="button" class="linklike" data-key="2" data-num="1" data-testid="sort-score">Score</button></th>
    </tr></thead>
    <tbody>
      <tr><td>Asha</td><td>Tester</td><td class="num">82</td></tr>
      <tr><td>Bo</td><td>Developer</td><td class="num">67</td></tr>
      <tr><td>Chen</td><td>Designer</td><td class="num">91</td></tr>
      <tr><td>Dara</td><td>Manager</td><td class="num">74</td></tr>
      <tr><td>Eli</td><td>Tester</td><td class="num">58</td></tr>
    </tbody>
  </table></div>
</section>

<section class="widget" aria-labelledby="w-toast-h">
  <h2 id="w-toast-h">Toast and tooltip</h2>
  <div class="actions">
    <button type="button" class="btn" id="show-toast" data-testid="show-toast">Show toast</button>
    <span class="tooltip-wrap">
      <button type="button" class="btn" id="tooltip-button" aria-describedby="tooltip-1" data-testid="tooltip-button">Hover or focus me</button>
      <span role="tooltip" id="tooltip-1" class="tooltip" hidden data-testid="tooltip">This is a tooltip.</span>
    </span>
  </div>
</section>

<section class="widget" aria-labelledby="w-dnd-h">
  <h2 id="w-dnd-h">Drag and drop</h2>
  <p class="muted">Drag a card from "To do" to "Done", or use its Move button.</p>
  <div class="dnd">
    <div><h3 id="todo-h">To do</h3>
    <ul id="dnd-todo" class="zone" aria-labelledby="todo-h" data-testid="dnd-todo">
      <li class="item" draggable="true" id="card-1" data-testid="dnd-card-1"><span>Write test plan</span><button type="button" class="btn" data-move="1">Move to Done</button></li>
      <li class="item" draggable="true" id="card-2" data-testid="dnd-card-2"><span>Review requirements</span><button type="button" class="btn" data-move="1">Move to Done</button></li>
      <li class="item" draggable="true" id="card-3" data-testid="dnd-card-3"><span>Report bugs</span><button type="button" class="btn" data-move="1">Move to Done</button></li>
    </ul></div>
    <div><h3 id="done-h">Done</h3>
    <ul id="dnd-done" class="zone" aria-labelledby="done-h" data-testid="dnd-done"></ul></div>
  </div>
  <p id="dnd-status" role="status" data-testid="dnd-status"></p>
</section>

<section class="widget" aria-labelledby="w-frame-h">
  <h2 id="w-frame-h">Form inside an iframe</h2>
  <iframe class="frame" src="/frame-form.html" title="Feedback form" data-testid="form-frame"></iframe>
</section>

<section class="widget" aria-labelledby="w-late-h">
  <h2 id="w-late-h">Delayed element</h2>
  <p class="muted">Something appears here about 6 seconds after the page loads.</p>
  <div id="late-slot"></div>
</section>

<section class="widget" aria-labelledby="w-live-h">
  <h2 id="w-live-h">Live region</h2>
  <button type="button" class="btn" id="press-me" data-testid="press-me">Press me</button>
  <p id="press-count" aria-live="polite" data-testid="press-count">Pressed 0 times.</p>
</section>`,
});

// The iframe document is its own small page (no site nav).
function framePage(file, title, body, script) {
  const path = join(OUT, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf-token" content="__CSRF__">
<title>${title}</title>
<link rel="stylesheet" href="/assets/site.css">
${script ? `<script type="module" src="/assets/${script}"></script>\n` : ''}</head>
<body>
<header><div class="practice-banner" role="note" data-testid="practice-banner">Practice site for automated testing — not a real shop.</div></header>
<main id="main">
${body.trim()}
</main>
</body>
</html>
`);
}

framePage('frame-form.html', 'Feedback form', `
<h1>Feedback</h1>
<form id="frame-form" class="form" novalidate data-testid="frame-form">
  <div class="field"><label for="ff-name">Your name</label><input id="ff-name" name="name" type="text" required maxlength="60" data-testid="frame-name"></div>
  <div class="field"><label for="ff-comment">Comment</label><textarea id="ff-comment" name="comment" rows="3" maxlength="500" data-testid="frame-comment"></textarea></div>
  <button type="submit" class="btn btn-primary" data-testid="frame-submit">Send</button>
</form>
<p id="frame-result" role="status" data-testid="frame-result"></p>`, 'frame-form.js');

framePage('fake/recaptcha/api2/aframe.html', 'Ad frame', `
<p>Local stand-in for an ad network frame. Not a captcha.</p>`);

page('live.html', {
  title: 'Live', current: '/live', script: 'live.js', body: `
<h1>Live updates</h1>
<section class="widget" aria-labelledby="live-counter-h">
  <h2 id="live-counter-h">Server counter (server-sent events)</h2>
  <p class="big-number" id="live-count" data-testid="live-count">—</p>
  <p id="live-sse-status" class="muted" data-testid="live-sse-status">Connecting…</p>
</section>
<section class="widget" aria-labelledby="live-chat-h">
  <h2 id="live-chat-h">Chat (WebSocket)</h2>
  <p id="live-ws-status" class="muted" data-testid="live-ws-status">Connecting…</p>
  <div id="chat-log" class="chat-log" role="log" aria-live="polite" aria-label="Chat history" tabindex="0" data-testid="chat-log"></div>
  <form id="chat-form" class="row form-wide" novalidate data-testid="chat-form">
    <div class="field"><label for="chat-text">Message</label><input id="chat-text" name="text" type="text" maxlength="200" autocomplete="off" data-testid="chat-input"></div>
    <div class="field"><button type="submit" class="btn btn-primary" data-testid="chat-send">Send</button></div>
  </form>
  <p id="chat-error" class="field-error" role="alert" hidden></p>
</section>`,
});

page('captcha.html', {
  title: 'Contact us', current: '/captcha', script: 'captcha.js', body: `
<h1>Contact us</h1>
<p>This form is protected by a (fake) captcha. It cannot be solved; it exists so that captcha detection can be tested.</p>
<form id="captcha-form" class="form" novalidate data-testid="captcha-form">
  <div class="field"><label for="c-name">Name</label><input id="c-name" name="name" type="text" maxlength="60" data-testid="captcha-name"></div>
  <div class="field"><label for="c-msg">Message</label><textarea id="c-msg" name="message" rows="4" maxlength="1000" data-testid="captcha-message"></textarea></div>
  <div class="field">
    <div class="g-recaptcha" data-sitekey="practice-fake-sitekey" data-testid="captcha-box">
      <span class="check"><input type="checkbox" id="c-robot" data-testid="captcha-checkbox"> <label for="c-robot">I'm not a robot</label></span>
      <span class="brandmark">fakeCAPTCHA<br>Privacy - Terms</span>
    </div>
    <p id="captcha-status" class="field-error" role="status" hidden></p>
  </div>
  <button type="submit" class="btn btn-primary" id="captcha-submit" disabled data-testid="captcha-submit">Send message</button>
</form>`,
});

page('ads.html', {
  title: 'Deals', current: '/ads', body: `
<h1>Today's deals</h1>
<p>This page shows sponsored slots. A hidden ad-network frame loads in the background; there is nothing to solve here.</p>
<div class="ad-slot" data-testid="ad-slot-1"><p><strong>Sponsored:</strong> Imaginary Headphones — 20% off (not real).</p></div>
<div class="ad-slot" data-testid="ad-slot-2"><p><strong>Sponsored:</strong> Pretend Plant Pot — buy one, get none free.</p></div>
<iframe class="hidden-frame" src="/fake/recaptcha/api2/aframe.html" width="0" height="0" title="Ad network frame" aria-hidden="true" tabindex="-1" data-testid="ad-frame"></iframe>`,
});

page('a11y.html', {
  title: 'Accessibility issues', current: '/a11y', body: `
<h1>Accessibility practice page</h1>
<p>This page breaks accessibility on purpose. It is the only page exempt from the accessibility audit.</p>
<!-- Deliberate issue 1: image without alt text -->
<img src="/assets/img/product.svg" width="160" height="120" data-testid="a11y-img-no-alt">
<!-- Deliberate issue 2: low-contrast text (#c8c8c8 on white, about 1.7:1) -->
<p class="low-contrast" data-testid="a11y-low-contrast">This text is very hard to read because its contrast is too low.</p>
<!-- Deliberate issue 3: input without a label -->
<form class="form" data-testid="a11y-form">
  <input type="text" name="nickname" data-testid="a11y-unlabelled-input">
  <!-- Deliberate issue 4: button with no accessible name -->
  <button type="button" class="btn" data-testid="a11y-empty-button"></button>
</form>
<!-- Deliberate issue 5: link with no text -->
<p><a href="/" data-testid="a11y-empty-link"></a></p>`,
});

page('slow.html', {
  title: 'Slow page', current: '/slow', script: 'slow.js', body: `
<h1>Slow page</h1>
<p>The server takes about 3 seconds to answer this page, and the data below takes another few seconds.</p>
<p id="slow-status" role="status" data-testid="slow-status">Loading slow data…</p>`,
});

page('broken.html', {
  title: 'Broken page', current: '/broken', script: 'broken.js', body: `
<h1>Broken page</h1>
<p>This page misbehaves on purpose: a script error in the console, a request that fails, an insecure <code>http:</code> resource address and an endpoint that answers 500.</p>
<img src="http://127.0.0.1:9/insecure-pixel.png" alt="Insecure image" width="1" height="1" data-testid="insecure-image">
<p><button type="button" class="btn" id="call-500" data-testid="call-500">Call the failing endpoint</button></p>
<p id="broken-status" role="status" data-testid="broken-status"></p>`,
});

console.log('ok');
