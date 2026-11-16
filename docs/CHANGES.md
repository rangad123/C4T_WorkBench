# Practice Store — change switches (not defects)

A change switch makes the site behave like a **new version** that changed on purpose: a renamed button, a moved field, a renamed
API field. Nothing is broken. They exist to test how AI Studio copes with change: **repair suggestions (healing)** for the UI
change, and **API changes between runs** plus **API contract checks** for the API change. They are separate from the defects in
[BUGS.md](BUGS.md) and are all off by default. The ids are defined in `CHANGES` in `server/bugs.mjs`.

## How to switch changes on

| Way | Scope | Example |
|---|---|---|
| Environment variable `CHANGES` at start | whole server | `CHANGES=all node server/index.mjs` or `CHANGES=CHANGE_API node server/index.mjs` |
| `?changes=on`, `?changes=off`, `?changes=ID,ID` on any URL | that browser (cookie `ps_changes`) | `http://localhost:8080/login?changes=CHANGE_UI` |
| header `x-changes: on` or `x-changes: ID,ID` | that one request | `curl -H "x-changes: CHANGE_API" http://localhost:8080/api/products` |

Every HTML page carries the active ids in `<html data-changes="CHANGE_UI CHANGE_API">` (empty when none), and
`GET /api/health` and `GET /api/csrf` return `changes: [...]`, so a test or a person can see which version is being served.

## The switches

| Id | What changes | AI Studio feature it tests |
|---|---|---|
| `CHANGE_UI` | /login: the sign-in button reads "Log in" instead of "Sign in"; the email field's `data-testid` changes from `login-email` to `signin-email` and the email field moves below the password field (done in the browser by `/assets/login.js`). /products/:id (the product page; the list has no add button): "Add to cart" reads "Add to basket". | Repair suggestions (healing), FEATURE-MAP 32 |
| `CHANGE_API` | `GET /api/products` and `GET /api/products/:id` return `title` instead of `name`, plus a new field `sku` (e.g. "PS-0001"); the site's own pages fall back to `title`, so they keep working and only API tests see the change. `/openapi.json` served while the switch is on documents that shape as version 1.1.0 (`/openapi.json?changes=on`). | API changes between runs (FEATURE-MAP 21), API contract checks (FEATURE-MAP 20) |

The requirements in [REQUIREMENTS.md](REQUIREMENTS.md) still hold with either switch on: a test that fails only because of a
change switch is a test that needs repair, not a defect.

## Test repair with CHANGE_UI

1. With no switch on, make and run tests that sign in on /login and add a product to the cart on /products/:id (record them, or
   write them as text: `Click the "Sign in" button`, `Click the "Add to cart" button`). They pass.
2. Turn the switch on for the runs: restart with `CHANGES=CHANGE_UI` (or an environment whose address is
   `http://localhost:8080/?changes=CHANGE_UI`, so the cookie is set on the first page).
3. Run the tests again. Expect them to fail at the renamed button or the moved email field, with Expected/Got evidence.
4. Expect the card "We found a likely replacement" on each: "Log in" for "Sign in", "Add to basket" for "Add to cart", and the
   email field found by its label instead of its old `data-testid`.
5. Choose **Apply and run again**: expect the test passes. **Undo this repair** puts the old step back.
6. Turn the switch off and run the repaired test: it fails again the other way round, which shows the repair followed the page.
7. With `BUGS=SUBTOTAL` on as well, a failing total check must **not** be offered a repair (a wrong value is a defect, not a change).

## Test API change detection with CHANGE_API

1. With no switch on, set the OpenAPI URL `BASE/openapi.json` and a Bearer token (see README), and run the API tests twice.
   Expect no **API changes** card and no contract findings.
2. Restart with `CHANGES=CHANGE_API` (or run against an environment that sends the header `x-changes: CHANGE_API`) and run the
   API tests again, keeping the OpenAPI URL at the plain `BASE/openapi.json` of the earlier runs.
3. Expect the Overview's **API changes** card: `name` removed from `/api/products` and `/api/products/{id}` (breaking), `title`
   and `sku` added (harmless).
4. Expect the API contract check, with the old OpenAPI document still saved, to report the missing required field `name` (high)
   and the extra fields `title`, `sku` (low).
5. Change the OpenAPI URL to `BASE/openapi.json?changes=on` (version 1.1.0) and run again: the contract findings go away; the
   API changes card keeps showing the change against the earlier runs.
6. Application understanding: **Read again** with the new document; expect the product entity to show `title` and `sku`.
