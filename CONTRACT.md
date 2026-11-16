# Test site contract ("Practice Store") — for the three builders

A standalone website that exists only to be tested by Crowd4Test AI Studio. Every AI Studio feature must have something here to
exercise it. Zero npm dependencies: Node 24 built-ins only (`node:http`, `node:crypto`, `node:fs`, `node:url`), plain HTML/CSS/JS
in the browser (no build step, no CDN). One process: `node server/index.mjs` (PORT env, default 8080), serving `public/` and the
JSON API under `/api`. All data in memory, seeded at start; `POST /api/reset` (or `GET /__reset` with header `x-reset-token` =
env RESET_TOKEN) restores the seed. Nothing is real: no real emails sent, no payments, fake data only. A banner on every page:
"Practice site for automated testing — not a real shop."

## Folders and owners
- `server/` — builder A (server, auth, API, OpenAPI, realtime, bug switches).
- `public/` — builder B (all pages, CSS, browser JS).
- `docs/` + `README.md` + `deploy/` — builder C (requirements document, AI Studio feature map, answer-key style notes, deploy).
- This CONTRACT.md is the lead's; ask "main" to change it.

## Accounts (seeded)
| user | password | role | notes |
|---|---|---|---|
| user@practice.test | Practice#123 | customer | plain sign-in |
| admin@practice.test | Admin#123 | admin | sees /admin pages |
| otp@practice.test | Otp#12345 | customer | TOTP 2FA, secret `JBSWY3DPEHPK3PXP` (shown on /docs/accounts) |
| mail@practice.test | Mail#1234 | customer | email one-time code: shown in the fake mailbox page /mailbox?to=mail@practice.test |

## Pages (public/) — each one exists to test something
| Path | Tests |
|---|---|
| `/` | home, navigation menu (dropdown), search box, product grid, cookie-consent banner (Accept / Reject all) |
| `/login` | **labelled** login form (`<label for>`), "Remember me", error message on bad password, link to signup |
| `/login-plain` | the automationexercise pattern: login AND signup forms on one page, **no labels**, placeholders "Email Address" in both, `data-qa` attributes |
| `/signup` | registration with field limits (required, minlength, pattern, email type, number min/max, select, checkbox terms) and app-shown validation messages on blur (`aria-describedby`) |
| `/otp` | second step for TOTP and for email code |
| `/mailbox` | fake inbox listing codes/links "sent" by the site (for mailbox features) |
| `/products`, `/products/:id` | list with filters + table view, detail page (parameterised path), add to cart |
| `/cart`, `/checkout`, `/checkout/review`, `/orders`, `/orders/:id` | shopping workflow, totals, discount code `SAVE10`, quantity limits 1–10, shipping choice, order history, cancel order only before shipped |
| `/account` | profile edit (name ≤ 60 chars), change password, upload avatar (file upload ≤ 1 MB, png/jpg), download invoice PDF-like file |
| `/admin`, `/admin/users`, `/admin/orders` | admin only (403 page for customers), role change, order status transitions pending→paid→shipped→delivered |
| `/spa/#/...` | a hash-routed single-page area (dashboard, notes) using fetch + pushState |
| `/widgets` | dialog (`<dialog>` and role=dialog), menu (role=menu), tabs, accordion, data table with headers, toast, tooltip, drag-and-drop, iframe with a form, a delayed element (appears after 6 s), a live region |
| `/live` | WebSocket/EventSource live counter and chat (server-sent events + a tiny WebSocket via `node:http` upgrade) |
| `/captcha` | a visible fake captcha box (`class="g-recaptcha"`-like, 304×78) that blocks submit — for captcha detection; `/login` never has one |
| `/ads` | a page that loads a hidden 0×0 iframe whose src contains `/recaptcha/api2/aframe` (local fake) — must NOT be called a captcha |
| `/a11y` | deliberate accessibility issues (missing alt, low contrast, unlabeled input) for accessibility checks |
| `/slow`, `/broken` | a slow page (3 s), a page with a console error, a failing request, mixed-content-like warning, a 500 endpoint |
| `/docs/requirements` | the human requirements document (rendered from docs/REQUIREMENTS.md) |
| `/openapi.json` | the API document |

## API (server/) — JSON, cookie session `ps_session` (HttpOnly, SameSite=Lax) and `Authorization: Bearer <token>` both accepted
- `POST /api/auth/login {email,password}` → 200 {user} | 401; `POST /api/auth/otp {code}`; `POST /api/auth/logout`; `GET /api/me`
- `POST /api/auth/signup`, `POST /api/auth/token` (API token for API tests)
- `GET /api/products?q=&category=&page=`, `GET /api/products/:id`
- `GET/POST/PATCH/DELETE /api/cart/items[/:id]` (qty 1–10), `POST /api/cart/discount {code}`
- `POST /api/orders` (from cart), `GET /api/orders`, `GET /api/orders/:id`, `POST /api/orders/:id/cancel`
- `PATCH /api/admin/orders/:id {status}` (admin), `GET /api/admin/users`, `PATCH /api/admin/users/:id {role}`
- `GET /api/notes`, `POST /api/notes`, `PATCH /api/notes/:id`, `DELETE /api/notes/:id`, `POST /api/notes/:id/share {email}` (owner/reader rules: non-reader gets 404)
- `POST /api/account/avatar` (multipart or raw), `GET /api/account/invoice/:orderId`
- `GET /api/live/events` (SSE), `GET /api/live/ws` (WebSocket)
- `GET /api/health`, `POST /api/reset`
- Every route listed in `/openapi.json` with request/response schemas and error codes; two routes deliberately NOT documented
  (`POST /api/auth/token`, `GET /api/internal/stats`) so "observed but undocumented" can be tested.

## Bug switches (for defect-finding tests) — off by default
`?bugs=on` on any page or env `BUGS=all` / `BUGS=SUBTOTAL,QTY,...` turns on seeded defects, listed with ids in docs/BUGS.md
(e.g. discount applied twice, qty 11 accepted, customer can open /admin/orders via API, cancel allowed after shipped, subtotal
rounding off by 1 cent, note readable by non-reader with 403 instead of 404). Never on unless asked.

## Rules
- Security: no real secrets; passwords hashed with scrypt; CSRF token on HTML forms; rate-limit login (10/min/IP); size limits
  on bodies (1 MB); no path traversal in static serving; CSP header; no external requests.
- Accessibility: every page except /a11y passes axe; keyboard usable; works at 375 px.
- Style: simple, clean, neutral; one CSS file.
- Tests: `node --test` tests in `server/test/` (builder A) and a smoke script `scripts/smoke.mjs` that starts the server and fetches
  every page and documented route (builder C).
