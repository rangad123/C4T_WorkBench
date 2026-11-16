# Practice Store — seeded defects (bug switches)

The site is correct by default. Each defect below can be switched on so that AI Studio's defect finding can be checked against a
known answer. **All switches are off unless asked for.** The list of ids is defined in `server/bugs.mjs`; this page must match it.

## How to switch defects on

| Way | Scope | Example |
|---|---|---|
| Environment variable `BUGS` at start | whole server, every visitor | `BUGS=all node server/index.mjs` or `BUGS=SUBTOTAL,QTY node server/index.mjs` |
| `?bugs=on` on any page | that browser (cookie), all defects | `http://localhost:8080/?bugs=on` |
| `?bugs=off` on any page | turns the browser's switch off again | `http://localhost:8080/?bugs=off` |
| `?bugs=ID,ID` on any page | that browser (cookie `ps_bugs`), the named defects | `http://localhost:8080/cart?bugs=QTY,SUBTOTAL` |
| header `x-bugs: on` or `x-bugs: ID,ID` | that one request (API tests) | `curl -H "x-bugs: ADMIN_API" ...` |

Reset (`POST /api/reset`) restores the data but does not change `BUGS`; restart without `BUGS` to turn server-wide defects off.

## Defects

| Id | What goes wrong | Requirement it breaks | How to see it |
|---|---|---|---|
| `DISCOUNT_TWICE` | SAVE10 can be applied a second time in the same cart; the discount becomes 20% | 6.7, 6.8 | apply SAVE10 twice in /cart; the discount doubles |
| `QTY` | quantities from 11 to 99 are accepted (`POST /api/cart/items`, `PATCH /api/cart/items/:id`) | 6.2 | set a cart line to 11; no error, the line total uses 11 |
| `ADMIN_API` | a signed-in customer calling `GET /api/admin/orders` or `PATCH /api/admin/orders/:id` gets 200 instead of 403 | 9.2 | sign in as user@practice.test, request `/api/admin/orders` |
| `CANCEL_SHIPPED` | a shipped order can be cancelled (a delivered one still cannot) | 7.9 | cancel a shipped order of user@practice.test; it becomes cancelled |
| `SUBTOTAL` | line totals (cart and order) are truncated to the cent instead of rounded, so a line whose exact total has half a cent or more is one cent low | 6.6, 6.11 | put 1 × a product priced 2.495 (or 4.995, 1.005, 12.345) in the cart: the line shows one cent less than the rounded amount |
| `NOTE_403` | someone who is neither owner nor reader gets 403 instead of 404 on `GET/PATCH/DELETE /api/notes/:id` and `POST /api/notes/:id/share` | 10.5 | as admin@practice.test, open the note shared by user@practice.test with mail@practice.test |

## Answer key, for checking AI Studio

A good run with `BUGS=all` reports each of the defects above as a failing check or a finding, with the requirement id (when the
requirements were imported). With no switch on, those same checks must pass: a finding then is a false alarm.

The deliberate problems on /a11y, /broken, /slow, /captcha and /ads are **not** switched defects; they are always there, and are
listed in FEATURE-MAP.md with what AI Studio is expected to say about them.
