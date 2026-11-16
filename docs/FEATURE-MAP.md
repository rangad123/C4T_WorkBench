# Practice Store — AI Studio feature map

Which part of this site exercises each Crowd4Test AI Studio feature, and how to test it. `BASE` is the site's address
(for example `http://localhost:8080` or `https://{{DOMAIN}}`). Accounts are in [ACCOUNTS.md](ACCOUNTS.md), defects in
[BUGS.md](BUGS.md), change switches in [CHANGES.md](CHANGES.md), requirement ids in [REQUIREMENTS.md](REQUIREMENTS.md). Run with no bug switch unless a row says otherwise,
and reset the data before each exploration (`curl -X POST -H "x-reset-token: $RESET_TOKEN" BASE/api/reset`).

## Summary

| # | AI Studio feature | Here | Account |
|---|---|---|---|
| 1 | Exploration (Explore my app, Watch live) | whole site from `/` | user@practice.test |
| 2 | Application understanding | site + /openapi.json + REQUIREMENTS.md | user, admin |
| 3 | Rules to confirm / Workflows to confirm | cart, checkout, cancel, notes sharing rules | user |
| 4 | Requirements import + coverage | docs/REQUIREMENTS.md, /docs/requirements | — |
| 5 | Test cases from requirements | REQUIREMENTS.md sections 3–10 | — |
| 6 | Test scripts (DSL and Code views) | /login, /cart, /products/:id | user |
| 7 | Generate test scripts from test cases | automated test cases from #5 | user |
| 8 | Describe a test in plain English | /products → /cart | user |
| 9 | Recorder | /login → /products/:id → /cart → /checkout | user |
| 10 | Uploads, drag and drop, frames, popups | /account avatar, /widgets | user |
| 11 | Sign-in: project sign-in | /login (labelled), /login-plain (no labels) | user |
| 12 | Sign-in: test accounts (several roles) | /login | user, admin |
| 13 | Sign-in: TOTP | /login → /otp | otp@practice.test |
| 14 | Sign-in: mailbox (emailed code) | /login → /otp, /mailbox | mail@practice.test |
| 15 | Saved sign-ins | /login, /captcha | user |
| 16 | Environments | two copies of the site (two ports / domains) | user |
| 17 | Test data (tables) | /signup, /products?q= | — |
| 18 | Test data reset before a run | `POST /api/reset` | — |
| 19 | API tests from OpenAPI | /openapi.json, `/api/*` | API token |
| 20 | API contract checks / observed but undocumented | `POST /api/auth/token`, `GET /api/internal/stats` | API token |
| 21 | API changes between runs | `/api/products` with `CHANGE_API` ([CHANGES.md](CHANGES.md)) | API token |
| 22 | Access checks between roles | /admin/*, `/api/admin/*`, notes | user, admin |
| 23 | Accessibility | /a11y (bad), every other page (clean) | — |
| 24 | Page health | /broken, /slow | — |
| 25 | Performance (speed, load check) | /slow, /, `/api/products` | — |
| 26 | Visual changes | /, /products, /widgets | — |
| 27 | Cross-browser and screen sizes | every page at 375 px | user |
| 28 | Captcha detection (true and false positive) | /captcha, /ads, /login | — |
| 29 | Consent banners | `/` cookie banner | — |
| 30 | Overlays (named in project notes) | /widgets dialog, toast | — |
| 31 | Validation probing (form input checks) | /signup, search box, /account name | — |
| 32 | Healing / repair suggestions | /login, /products/:id with `CHANGE_UI` ([CHANGES.md](CHANGES.md)) | user |
| 33 | Suites | tests from #6–#9 | user |
| 34 | Schedules and run sequences | any suite | user |
| 35 | Runs and evidence | /broken, failing tests | user |
| 36 | Live updates in tests | /live (SSE + WebSocket), /spa | user |
| 37 | Security assessment (passive only) | whole site headers, cookies, files | saved sign-in |
| 38 | Bug switches for detection | BUGS=all, ?bugs=on | user, admin |

## How to test each feature

### 1 Exploration
1. New project → **Explore my app**, address `BASE`.
2. Requirements tab → **Sign in**: user@practice.test / `Practice#123`.
3. Explore at **Thorough**; turn on **Watch live** to see the browser.
4. Expect: plan covers home, products, product detail, cart, checkout, orders, account, widgets, spa notes; not /admin (customer).
5. Expect: exploration stops on /captcha with the captcha sentence, and does not stop on /ads.

### 2 Application understanding
1. Requirements tab → **What the agents need** → OpenAPI document URL `BASE/openapi.json`.
2. Import REQUIREMENTS.md (see #4), then Dashboard → **Read again**.
3. Expect on the Dashboard card: pages, workflows (sign-in, add to cart, checkout, cancel order, share note), endpoints, roles customer/admin, rules mostly **stated**.
4. Expect under "what is missing": nothing about API schemas (the OpenAPI document fills them); the two undocumented routes appear as observed-only.

### 3 Rules to confirm / Workflows to confirm
1. After #2, open Requirements → **Rules to confirm**.
2. Expect rules such as "quantity 1–10", "SAVE10 once per account", "cancel only before shipped", "non-reader gets 404"; stated ones cite the REQUIREMENTS.md line.
3. Confirm one, reject one; run **Read again**; the decisions stay.
4. Explore once without importing requirements: rules found only from behaviour must be **inferred** and wait for a person.

### 4 Requirements import and coverage
1. Requirements tab → **Import** → upload `docs/REQUIREMENTS.md` (or paste the text of `BASE/docs/requirements`).
2. Expect about 110 requirements, ids kept (`3.4`, `6.8`, ...), grouped under the section headings; the metadata lines are not requirements.
3. Explore; expect "X of Y requirements covered" and uncovered ones listed (for example 12.2 chat across two pages).

### 5 Test cases from requirements
1. Code project → Requirements → **Generate test cases using AI**, pick sections 4, 6, 7.
2. Expect several cases per requirement (valid, boundary, invalid), e.g. qty 0, 1, 10, 11 for 6.2; age 17, 18, 120, 121 for 4.6.
3. Expect manual cases for things a tool cannot check (12.2 across two browsers, 1.4 keyboard feel).

### 6 Test scripts (DSL and Code)
1. Test scripts → **New test script** → **Write it as text**:
   `Go to "BASE/login"` / `Type "user@practice.test" into the "Email" field` / `Type "Practice#123" into the "Password" field` / `Click the "Sign in" button` / `Check that the text "Your account" is visible`.
2. Save and run; open the **Code** tab, then **Switch to code** and back.
3. Repeat on /login-plain: the DSL must pick fields by placeholder "Email Address" (two on the page) — check it chose the login one.

### 7 Generate test scripts
1. After #5, on Test cases → **Generate test scripts**.
2. Expect a script per automated case; run them; the qty 11 case passes with no bug switch and fails with `BUGS=QTY`.

### 8 Describe a test in plain English
1. **New test script** → **Describe it**: "add the first product to the cart twice and check the quantity is 2 and the subtotal doubled".
2. Expect a passing test with a real check on the subtotal, not just "page loaded".

### 9 Recorder
1. **Test development** → **Record**, address `BASE/login`.
2. Sign in, open a product, add to cart, go to /checkout, pick Express; **Add a check** on the total.
3. Expect the password step uses a stand-in, and the recording replays.

### 10 Uploads, drag and drop, frames, popups
1. Library → Test data → **Test files**: add `avatar.png` (< 1 MB) and `big.png` (> 1 MB) and `notes.txt`.
2. Steps: `Upload "avatar.png" to the "Avatar" field` on /account → expect success; `big.png` → "The image must be 1 MB or smaller."; `notes.txt` → "Choose a PNG or JPG image.".
3. /widgets: `Drag the "Card 1" listitem to the "Done" list`; `Click the "Send" button inside the frame "frame-form"`.

### 11 Project sign-in (labelled and unlabelled forms)
1. Requirements → **Sign in** with user@practice.test; sign-in page `BASE/login`. Run **Check sign-in**: expect success.
2. Change the sign-in page to `BASE/login-plain`: expect it still fills the **login** form (not the signup form) using `data-qa`/placeholders.
3. Wrong password: expect "could not sign in", never a test finding.

### 12 Test accounts (roles)
1. Library → **Test accounts**: `user` (user@practice.test) and `admin` (admin@practice.test).
2. Explore; expect /admin pages planned only for `admin`, and access checks (#22) for `user` and the visitor.

### 13 TOTP
1. Test account `otp`: otp@practice.test / `Otp#12345`, **Authenticator secret** `JBSWY3DPEHPK3PXP`.
2. Run sign-in; expect /otp filled with the current code and the account signed in.
3. Remove the secret: expect a plain-words failure at /otp.

### 14 Mailbox (emailed code)
1. Test account `mail`: mail@practice.test / `Mail#1234`.
2. Build a test: sign in → open `BASE/mailbox?to=mail@practice.test` → read the newest code → back to /otp → type it.
3. With a configured Test mailbox, step **Use an emailed code or link** (this site has no real mail; expect a plain-words "no message arrived").

### 15 Saved sign-ins
1. Library → Test accounts → **Saved sign-ins** → **Sign in once yourself** at `BASE/login`; sign in as user; **I'm signed in, save it**.
2. Run a suite: expect it starts signed in. Sign out everywhere (or reset): expect the pre-run check to stop the run with **Sign in again**.

### 16 Environments
1. Start two copies: `PORT=8080` (staging) and `PORT=8081 BUGS=all` (call it "buggy").
2. Setup → **Environments**: add both with their address and sign-in.
3. Run the same suite on each; expect passes on staging and defect failures on "buggy".

### 17 Test data tables
1. Library → **Test data** → import a CSV with columns `name,email,age,expected` covering 1, 2, 60, 61 chars, age 17/18/120/121.
2. A /signup test that names the table runs once per row; expect each row's message to match REQUIREMENTS 4.2–4.8.

### 18 Test data reset before a run
1. Library → Test data → reset call `POST BASE/api/reset` with header `x-reset-token: <RESET_TOKEN>`.
2. Run twice; expect the same order counts each time. Wrong token: expect the run stops before any test.

### 19 API tests from OpenAPI
1. Requirements → OpenAPI URL `BASE/openapi.json`; **Bearer token** from `POST /api/auth/token {email,password}` for user@practice.test.
2. Explore; expect tests for valid requests, missing fields (400), unknown ids (404), no sign-in (401).
3. Turn on **Include API tests that change data** (test site only); expect cart/notes create-delete tests.

### 20 API contract checks and undocumented routes
1. With the API agent on, run the API tests.
2. Expect no contract findings with no bug switch. Expect `POST /api/auth/token` and `GET /api/internal/stats` listed as observed but not documented.

### 21 API changes between runs
1. Run the API tests twice with no switch on; expect no **API changes** card.
2. Restart with `CHANGES=CHANGE_API` (or send `x-changes: CHANGE_API`) and run again; expect `name` removed (breaking) and `title`, `sku` added.
3. Full steps, including the contract check against `/openapi.json?changes=on`: [CHANGES.md](CHANGES.md).

### 22 Access checks between roles
1. Test accounts `user` and `admin` (+ API token for each).
2. Explore; expect no "possible broken access control" with no bug switch (customers get 403 on /admin).
3. With `BUGS=ADMIN_API`: expect a high finding on `/api/admin/orders` for `user`.
4. With `BUGS=NOTE_403`: a note test as admin gets 403 instead of 404 — expect a failure citing 10.5.

### 23 Accessibility
1. Accessibility agent on (default). Explore.
2. Expect findings on /a11y only: image without alt, low contrast, unlabelled input. Any finding elsewhere is a site bug (report it).

### 24 Page health
1. UX agent on (default). Explore.
2. Expect on /broken: a script error, a failed request, insecure `http:` content and a 500 (rated high). Expect /slow reported slow but healthy.

### 25 Performance
1. Choose the **Performance** agent; explore.
2. Expect /slow over budget (about 3 s to first content), / within budget. Load check (`loadChecks` via the API) on `GET /api/products`: expect no finding.

### 26 Visual changes
1. Choose **Responsive UI**; first run saves baselines of /, /products, /widgets.
2. Run again: expect no change. /live (counter) and /widgets (delayed element) may be marked unstable — that is expected.

### 27 Cross-browser and screen sizes
1. Run panel → **How** → Firefox, Safari (WebKit), Phone, Tablet.
2. Expect the same results everywhere (the site works at 375 px); a difference is a site bug.

### 28 Captcha detection
1. Explore. Expect: /captcha is reported "This page has a captcha (reCAPTCHA) at /captcha ...", not explored further.
2. Expect /ads is **not** reported as a captcha (hidden 0×0 frame), and /login never is.

### 29 Consent banners
1. Run any test that starts at `/` in a fresh browser.
2. Expect the banner is closed before each action ("Reject all" first) and the test continues; no step clicks "Accept all" unless asked.

### 30 Overlays named in the project notes
1. Project notes: "close the dialog on /widgets if it is open; ignore toasts".
2. Run a /widgets test that opens the dialog then clicks a tab; expect the dialog is closed first and the test passes.

### 31 Validation probing (form input checks)
1. Test Case Generation agent on (default). Explore.
2. Expect on the search box: seven harmless inputs, no finding (search text is shown as text).
3. Expect limit checks pass on /account name (60) and /signup fields; sign-up, login and checkout forms are never submitted by the probe.

### 32 Healing / repair
1. Make passing tests that sign in on /login and add to the cart on /products/:id.
2. Restart with `CHANGES=CHANGE_UI` (or open `BASE/?changes=CHANGE_UI`): "Sign in" becomes "Log in", the email field moves and its `data-testid` changes, "Add to cart" becomes "Add to basket".
3. Expect "We found a likely replacement"; **Apply and run again** passes; **Undo this repair** restores.
4. A check failing because of a real defect (`BUGS=SUBTOTAL`) must not be "repaired". Full steps: [CHANGES.md](CHANGES.md).

### 33 Suites
1. Code project → **Test suites**: "Smoke" (sign-in, add to cart) and "Full" (all).
2. Run "Smoke"; expect only those tests run, in order.

### 34 Schedules and run sequences
1. Runs → Schedules → **New schedule**: Re-run all tests every 5 minutes; let it run twice; pause it.
2. Run sequence from template **Smoke then full run**; expect "Full" only after "Smoke" passes.

### 35 Runs and evidence
1. With `BUGS=all`, run all tests.
2. Open a failing test: expect Expected/Got, screenshot, recording, trace, and **What the page did** listing failed requests.
3. Runs page: "Changed since the last run" compares with the clean run.

### 36 Live updates
1. Test on /live: check the counter text changes within 3 s; send a chat message and check it appears.
2. Test on /spa: go #/dashboard → #/notes → create a note → Back; expect no full page reload.

### 37 Security assessment (passive only)
1. Project testing type **Both**; Security assessment → register the application `BASE`, rate 2/s, API document `BASE/openapi.json`.
2. Record the authorization (yourself, for this practice site), start a passive assessment.
3. Expect: CSP present, `ps_session` HttpOnly + SameSite=Lax (Secure only over HTTPS: on plain http expect a cookie finding), no exposed files, no directory listing. Only GET/HEAD/OPTIONS are sent; nothing is submitted.

### 38 Bug switches for detection
1. Explore and run once with no switch: note the findings (should be only the always-on ones from #23, #24, #28).
2. Restart with `BUGS=all` (or browse with `?bugs=on`) and run again.
3. Expect each defect in [BUGS.md](BUGS.md) caught by at least one failing test or finding, citing its requirement.
