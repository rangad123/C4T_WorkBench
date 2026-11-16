# Server routes (builder A) — for page and docs builders

Start: `node server/index.mjs` (env `PORT`=8080, `HOST`=127.0.0.1, `RESET_TOKEN`, `BUGS`, `SESSION_SECRET`, `TRUST_PROXY=1` behind
nginx so client IP and https come from `X-Forwarded-For` / `X-Forwarded-Proto`, `LOGIN_RATE_LIMIT`=10). Source of truth for the
page map: `PAGES` in `server/pages.mjs`; for the API: the table in `server/api.mjs` (also `/openapi.json`).

## Pages: URL -> file in public/

| URL | File | Access |
|---|---|---|
| `/` | `index.html` | anyone |
| `/login` `/login-plain` `/signup` `/otp` `/mailbox` `/products` `/widgets` `/live` `/captcha` `/ads` `/a11y` `/broken` | `<name>.html` | anyone |
| `/slow` | `slow.html`, sent after 3 s | anyone |
| `/products/:id` (digits) | `product.html`; unknown id -> `404.html` (404) | anyone |
| `/cart` `/checkout` `/orders` `/account` | `<name>.html` | signed in, else 302 `/login?next=<path>` |
| `/checkout/review` | `checkout-review.html` | signed in |
| `/orders/:id` | `order.html`; not yours / unknown -> `404.html` (404) | signed in |
| `/admin` `/admin/users` `/admin/orders` | `admin/index.html` `admin/users.html` `admin/orders.html` | admin; customer -> `403.html` (403); visitor -> 302 `/login?next=` |
| `/spa` -> 302 `/spa/`; `/spa/` | `spa/index.html` | signed in |
| `/docs/requirements`, `/docs/accounts` | docs/REQUIREMENTS.md, docs/ACCOUNTS.md rendered into the frame of `404.html` (its `<title>` and `<main>` are replaced) | anyone |
| `/openapi.json` | generated | anyone |
| anything else with a known extension | static file under `public/` (`/assets/*`, images...) | anyone |
| `.html` by its own path | only `/frame-form.html` and `/fake/recaptcha/api2/aframe.html`; every other `.html` is reachable only via its pretty URL | |
| unknown, traversal (`..`, encoded, dotfiles) | `404.html` with status 404 | |

Trailing slashes are ignored (`/cart/` = `/cart`). Every HTML response replaces `__CSRF__` with the CSRF token and sets cookie
`ps_csrf`. CSP is strict: `script-src 'self'; style-src 'self'` — no inline `<script>`, no `style=""` attributes, no `on*=` handlers.

## CSRF
Double-submit: cookie `ps_csrf` must equal header `x-csrf-token` or form field `_csrf`. Required on POST/PUT/PATCH/DELETE that use
the session cookie with a form-like body (urlencoded, multipart, text/plain) -> else 403 `{error:{code:"csrf"}}`. JSON bodies and
empty bodies pass on SameSite=Lax + same-origin check (any cross-site `Origin` -> 403). Bearer requests are exempt. Sending
`x-csrf-token` on every non-GET (as common.js does) is always fine. `GET /api/csrf` -> `{csrfToken}`.
Native form posts (urlencoded, `Accept: text/html`) to login/otp/signup/logout get 303 to `next` on success, or back to the
referring page with `?error=<message>` on failure.

## API (JSON; errors are `{"error":{"code","message","field?"}}`; money in US dollars)
Auth: cookie `ps_session` (HttpOnly, SameSite=Lax, Secure on https; 30 days with `remember`) or `Authorization: Bearer <token>`.
- `POST /api/auth/login {email,password,remember?,next?}` -> 200 `{user,next:"/account"}` or 200 `{otpRequired:true,method:"totp"|"email",next:"/otp",mailbox?}`; 400 "Enter your email and password."; 401 "Invalid email or password."; 429 "Too many sign-in attempts. Try again in a minute." (more than 10 attempts/min/IP, Retry-After header)
- `POST /api/auth/otp {code}` -> 200 `{user,next}`; 401 "That code is not right. Try again."; 400 no waiting sign-in (5 wrong codes or 10 min end it). `POST /api/auth/otp/resend` (email account)
- `POST /api/auth/logout` -> `{ok:true}`; `POST /api/auth/signup {name,email,password,confirmPassword?,age,country,terms}` -> 201 `{user}` (signed in), 400 with `field`, 409 "An account with this email already exists."; countries `IN GB US DE FR JP AU`
- `POST /api/auth/token {email,password,code?}` -> 201 `{token,tokenType,expiresIn}` (undocumented on purpose; 2FA accounts need `code`; for mail@ the first call sends it)
- `GET /api/me` -> `{user:{id,email,name,role,twoFactor,hasAvatar,avatarUrl,createdAt}}` | 401; `GET /api/me?optional=1` -> 200 `{user:null}` when signed out (use it for nav state, no console 401); `PATCH /api/me {name}` (1-60)
- `POST /api/account/password {current,next}`; `POST /api/account/avatar` multipart field `avatar` or raw image body -> `{user,avatarUrl}` (400 "Choose a PNG or JPG image.", 413 "The image must be 1 MB or smaller."); `GET /api/account/avatar`; `GET /api/account/invoice/:orderId` -> PDF attachment (owner only, else 404)
- `GET /api/categories`; `GET /api/products?q=&category=&page=&minPrice=&maxPrice=&inStock=true&sort=name|price|-price|rating` -> `{items,total,page,pageSize:12,pages}`; `GET /api/products/:id` (product `{id,name,category,price,stock,inStock,rating,description}`)
- `GET /api/cart/items?shipping=standard|express`, `POST /api/cart/items {productId,qty}` (201), `PATCH /api/cart/items/:id {qty}`, `DELETE /api/cart/items/:id`, `DELETE /api/cart/items` (empty) — all return the cart `{items:[{id,productId,name,price,qty,lineTotal,stock}],count,subtotal,discountCode,discountPercent,discount,shipping:{method,cost},total}`; qty 1-10 ("Quantity must be between 1 and 10."), 409 out of stock
- `POST /api/cart/discount {code}` -> cart + `message:"SAVE10 applied: 10% off"`; 400 "This code is not valid."; 409 "This code is already applied." / "This code has already been used."; `DELETE /api/cart/discount`
- `POST /api/orders {shipping:"standard"|"express", address:{name,street,city,postcode}}` -> 201 `{order,message:"Order placed"}`; 400 "Your cart is empty." Shipping: standard 0, express 9.99
- `GET /api/orders` -> `{items}` newest first; `GET /api/orders/:id` (own, else 404); `POST /api/orders/:id/cancel` -> order; 409 "This order has already shipped and can no longer be cancelled." Order: `{id,status,createdAt,lines,subtotal,discountCode,discount,shipping,total,address,history,canCancel,nextStatuses}`
- Admin (401 visitor, 403 "You do not have access to this page." customer): `GET /api/admin/users` `{items}`, `PATCH /api/admin/users/:id {role}` (409 "You cannot change your own role."), `GET /api/admin/orders` `{items}` (each with `user:{id,email}`), `PATCH /api/admin/orders/:id {status}` (409 "This status change is not allowed.")
- Notes: `GET /api/notes` `{items:[{id,title,body,role:"owner"|"reader",owner,readers?}]}`, `POST /api/notes {title,body}` (201), `GET|PATCH|DELETE /api/notes/:id`, `POST /api/notes/:id/share {email}` (404 "There is no account with this email."). Non-reader -> 404 "Note not found."; reader change -> 403
- `GET /api/mailbox?to=<email>` -> `{to,messages:[{id,to,subject,body,code?,link?,at}]}` newest first
- `GET /api/live/events` SSE: `data: {"count":N}` every second; `event: chat` with a chat message. `GET /api/live/ws` WebSocket: server sends `{type:"hello",name,count,messages}` then `{type:"chat",name,text,at}` for every message; client sends `{"type":"chat","text":"..."}` (1-200 chars) or `{"type":"ping"}`. `POST /api/live/chat {text}`, `GET /api/live/messages`
- `GET /api/health` -> `{ok:true,uptimeSeconds,bugs}`; `POST /api/reset` (header `x-reset-token`; 403 without, also when RESET_TOKEN is unset); `GET /__reset` same; `GET /api/slow` (3 s); `GET /api/broken` (500); `GET /api/internal/stats` (undocumented on purpose)

## Bug switches
Ids and effects: `BUGS` in `server/bugs.mjs`. On via env `BUGS=all|ID,ID`, `?bugs=on|ID,ID` on any URL (sets cookie `ps_bugs`;
`?bugs=off` clears it), or header `x-bugs`. `GET /api/health` lists the ones on for the request.

## Change switches (not defects)
`CHANGE_UI`, `CHANGE_API` in `CHANGES` of `server/bugs.mjs`. On via env `CHANGES=all|ID,ID`, `?changes=on|off|ID,ID` on any URL
(cookie `ps_changes`), or header `x-changes`. Pages read the active ids from `<html ... data-changes="CHANGE_UI CHANGE_API">`
(the server adds the attribute to every HTML page; empty string when none), from any `__CHANGES__` placeholder (replaced with the
same space-separated list), or from `GET /api/csrf` / `GET /api/health` -> `changes: [...]`.
- CHANGE_UI: server only exposes it; the /login page renames its button and moves the email data-testid (builder B).
- CHANGE_API: `GET /api/products` and `/api/products/:id` return `title` instead of `name` plus `sku` ("PS-0001"); `/openapi.json`
  served while the switch is on (e.g. `/openapi.json?changes=on`) documents that shape, version 1.1.0.

## Tests
`node --test server/test/*.test.mjs` (Node 24 does not accept a bare directory: `node --test server/test/` fails with
"Cannot find module"). Tests start their own servers on ephemeral ports with fixture public/ and docs/ folders.
