# Practice Store — Requirements

Version: 1.0
Status: baseline for automated testing

This document states how the Practice Store must behave. Each requirement has an id (`section.item`) and sits on one line.
The Practice Store is a practice site for automated testing; nothing in it is real (no real emails, no payments, fake data only).
Behaviour that differs from a line below is a defect, unless a bug switch (see BUGS.md) was turned on on purpose.

## 1 General

1.1 Every page must show the banner "Practice site for automated testing — not a real shop." at the top.
1.2 Every page must have a title, a `lang` attribute, a viewport meta tag and exactly one main heading (`h1`).
1.3 Every page except /a11y must pass an automated WCAG 2.1 A/AA accessibility audit with no serious or critical violations.
1.4 Every page must be usable with the keyboard alone, with a visible focus indicator.
1.5 Every page must be usable at a viewport width of 375 px without horizontal scrolling.
1.6 The site must make no requests to other sites; all scripts, styles and images come from the same origin.
1.7 Every response must carry a Content-Security-Policy header.
1.8 Every HTML form that changes data must carry a CSRF token; a cookie-signed-in request with a form-like body (urlencoded, multipart or text/plain) and no valid token must be rejected with 403.
1.9 A request body larger than 1 MB must be rejected with 413.
1.10 A request for a static file outside the public folder (path traversal such as `/../server/index.mjs`) must be answered with 404.
1.11 An unknown page must show a "Page not found" page with status 404.
1.12 All API answers must be JSON; an API error must have the shape `{ "error": { "code": "...", "message": "..." } }`.
1.13 `GET /api/health` must answer 200 `{ "ok": true }` without signing in.
1.14 `POST /api/reset` (or `GET /__reset`) with header `x-reset-token` equal to the server's RESET_TOKEN must restore all seeded data and answer 200; without the right token, or when RESET_TOKEN is not set, it must answer 403.
1.15 All data must live in memory and be restored to the seed when the server restarts.
1.16 A cookie-signed-in JSON request from another origin (an `Origin` header that is not this site, or `null`) must be rejected with 403 "Cross-site requests are not allowed."; Bearer-token requests are not subject to CSRF checks.

## 2 Home, navigation and search

2.1 The home page `/` must show the navigation menu, a search box and a grid of products.
2.2 The navigation menu must contain a "Shop" dropdown that opens on click and on Enter, closes on Escape and lists the product categories.
2.3 The search box must take up to 100 characters; submitting it must open /products?q=<text> listing the products whose name contains the text (case-insensitive).
2.4 A search with no matching product must show "No products match your search." and no product cards.
2.5 Search text must be shown back to the user as text, never interpreted as HTML.
2.6 On a first visit the home page must show a cookie-consent banner with the buttons "Accept all" and "Reject all".
2.7 Choosing "Accept all" or "Reject all" must hide the banner and remember the choice, so the banner does not come back on later visits.
2.8 While the consent banner is shown, the rest of the page must still be usable: the banner sits in the page under the header and never covers page content.

## 3 Accounts and sign-in

3.1 The site must have four seeded accounts: user@practice.test (customer), admin@practice.test (admin), otp@practice.test (customer with authenticator-app two-step sign-in) and mail@practice.test (customer with emailed-code two-step sign-in); their passwords are listed in ACCOUNTS.md.
3.2 Passwords must be stored hashed with scrypt, never in plain text.
3.3 The /login page must have an email field and a password field, each with a visible `<label>` tied to the field, a "Remember me" checkbox, a "Sign in" button and a link to /signup.
3.4 Signing in with a correct email and password must open /account (or the page named in `?next=` when it is a path on this site).
3.5 Signing in with a wrong password or an unknown email must stay on /login and show "Invalid email or password." without saying which of the two was wrong.
3.6 Signing in with an empty email or password must show "Enter your email and password." and send nothing to the server.
3.7 The sign-in session must be a cookie named `ps_session` with HttpOnly and SameSite=Lax set (and Secure when served over HTTPS).
3.8 Without "Remember me" the session cookie must end when the browser closes; with "Remember me" it must last 30 days.
3.9 More than 10 sign-in attempts per minute from one IP address must be refused with 429, a `Retry-After` header and the message "Too many sign-in attempts. Try again in a minute."; accounts themselves are never locked.
3.10 The /login page must never show a captcha.
3.11 For otp@practice.test, a correct password must open /otp, which asks for the 6-digit code from an authenticator app (TOTP, 30-second step, SHA-1); the account is not signed in until a correct code is entered.
3.12 For mail@practice.test, a correct password must "send" a 6-digit code to the fake mailbox and open /otp; the code must be valid for 10 minutes and only once, and `POST /api/auth/otp/resend` sends a new one.
3.13 A wrong or expired code on /otp must show "That code is not right. Try again." and keep the user on /otp.
3.14 The fake mailbox /mailbox?to=<email> must list the messages the site "sent" to that address, newest first, each with its time, subject, code and any link; nothing is sent by real email.
3.15 The /login-plain page must show a sign-in form and a sign-up form side by side, with no `<label>` elements; both email fields have the placeholder "Email Address", and the controls carry `data-qa` attributes (login-email, login-password, login-button, signup-name, signup-email, signup-button).
3.16 Signing in on /login-plain must behave exactly as on /login (3.4 to 3.9).
3.17 Signing out must end the session on the server and open the home page; the old session cookie must no longer work.
3.18 `GET /api/me` must answer 200 with the signed-in user (id, email, name, role) and 401 when nobody is signed in.
3.19 The API must accept either the `ps_session` cookie or an `Authorization: Bearer <token>` header; `POST /api/auth/token` with a valid email and password returns a token for API tests.
3.20 An API request with a missing, invalid or expired session or token must be answered with 401.
3.21 `GET /api/me?optional=1` must answer 200 `{"user":null}` when nobody is signed in (and the user when signed in); plain `GET /api/me` stays 401.

## 4 Sign-up

4.1 The /signup page must ask for: full name, email, password, confirm password, age, country and a "I accept the terms" checkbox.
4.2 Full name is required and must be 2 to 60 characters; otherwise "Enter a name of 2 to 60 characters." is shown.
4.3 Email is required and must be a valid email address; otherwise "Enter a valid email address." is shown.
4.4 Password is required, at least 8 characters, and must contain a letter, a digit and a symbol; otherwise "Use at least 8 characters with a letter, a number and a symbol." is shown.
4.5 Confirm password must equal the password; otherwise "The passwords do not match." is shown (in the API `confirmPassword` is optional and checked only when sent).
4.6 Age is required and must be a whole number from 18 to 120; otherwise "Enter an age from 18 to 120." is shown.
4.7 Country is required and must be one of IN, GB, US, DE, FR, JP, AU (shown by name); otherwise "Choose a country." is shown.
4.8 The terms checkbox must be ticked; otherwise "You must accept the terms." is shown.
4.9 Each message must appear when the field loses focus and on submit, next to the field, linked to it with `aria-describedby`, and the field must be marked `aria-invalid="true"`.
4.10 Signing up with an email that already has an account must show "An account with this email already exists." (409 from the API).
4.11 A successful sign-up must create a customer account, sign the user in and open /account.
4.12 The server must apply the same limits as the page: `POST /api/auth/signup` with an invalid field answers 400 with the field named.

## 5 Products

5.1 /products must list all products with their name, price, category and stock, 12 per page, with page links.
5.2 /products must offer filters by category, by price range and by "In stock only", and a switch between a card view and a table view.
5.3 The table view must be a data table with a header row (`<th scope="col">`) for Name, Category, Price and Stock.
5.4 /products/:id must show one product's name, description, price, stock and an "Add to cart" button with a quantity field.
5.5 An unknown product id must show "Product not found" with status 404 (page) or 404 (API).
5.6 `GET /api/products` must accept `q`, `category`, `minPrice`, `maxPrice`, `inStock`, `sort` (name, price, -price, rating) and `page`, and return the matching products and the total count; `GET /api/products/:id` returns one product and `GET /api/categories` the categories.
5.7 A product with stock 0 must show "Out of stock" and must not be addable to the cart.

## 6 Cart

6.1 Only a signed-in user may have a cart; adding to the cart while signed out must open /login?next=<the product page>.
6.2 The quantity of each cart line must be a whole number from 1 to 10; any other value must be refused with "Quantity must be between 1 and 10." (400 from the API).
6.3 Adding a product that is already in the cart must increase that line's quantity, still within 1 to 10.
6.4 Changing a line's quantity must update the line total, the subtotal and the total at once.
6.5 Removing a line must take it out of the cart; an empty cart must show "Your cart is empty."
6.6 The line total must be price × quantity, and the subtotal the sum of line totals, both rounded to the cent.
6.7 The discount code SAVE10 must take 10% off the subtotal, rounded to the cent, and show "SAVE10 applied: 10% off".
6.8 SAVE10 can be used once per account: applying it again in the same cart must show "This code is already applied." and change nothing; applying it after an order already used it must show "This code has already been used." (409 from the API).
6.9 An unknown discount code must show "This code is not valid." (400 from the API); codes are not case-sensitive.
6.10 A user's cart must be visible only to that user.
6.11 Prices are in US dollars; some unit prices have three decimals (for example 2.495, 4.995, 1.005, 12.345), and every amount shown or returned must be rounded half up to the cent.
6.12 Emptying the cart (`DELETE /api/cart/items`) must remove every line; removing the discount (`DELETE /api/cart/discount`) must restore the undiscounted total.

## 7 Checkout and orders

7.1 /checkout must ask for the shipping address (name, street, city, postcode, all required) and a shipping choice: Standard (free, 5 days) or Express (9.99, 1 day).
7.2 /checkout/review must show every line, the subtotal, the discount, the shipping cost and the total = subtotal − discount + shipping, before the user places the order.
7.3 Placing the order must create an order with status "pending" from the cart, empty the cart, and open /orders/:id with "Order placed".
7.4 Placing an order with an empty cart must be refused with "Your cart is empty." (400 from the API).
7.5 /orders must list the signed-in user's orders, newest first, with number, date, status and total.
7.6 /orders/:id must show one order's lines, totals, shipping choice, address and status.
7.7 A user must only see their own orders; another user's order id must answer 404.
7.8 An order's status moves only forward along pending → paid → shipped → delivered; it can also become "cancelled" from pending or paid.
7.9 A customer may cancel their own order only while it is pending or paid; once it is shipped or delivered, cancel must be refused with "This order has already shipped and can no longer be cancelled." (409 from the API) and the cancel button must not be shown.
7.10 A cancelled order cannot change status again.
7.11 `GET /api/account/invoice/:orderId` must download the order's invoice as a file (Content-Disposition: attachment) only for the order's owner; anyone else gets 404.
7.12 On /checkout, an empty address field must show its message when it loses focus and on submit: "Enter a name.", "Enter a street.", "Enter a city.", "Enter a postcode."

## 8 Account

8.1 /account must show the signed-in user's name, email and role; a signed-out visitor is sent to /login?next=/account.
8.2 The name can be changed; it is required and at most 60 characters ("Enter a name of 1 to 60 characters.").
8.3 Changing the password must ask for the current password and the new one (rules as in 4.4); a wrong current password shows "Your current password is not right."
8.4 The avatar upload must accept only PNG or JPEG files of at most 1 MB; another type shows "Choose a PNG or JPG image." and a larger file shows "The image must be 1 MB or smaller." (400 / 413 from the API).
8.5 The file type must be checked from the file's contents, not only from its name.
8.6 After a successful upload the new avatar must be shown on /account.
8.7 /account must list the user's orders with a "Download invoice" link for each.

## 9 Administration

9.1 /admin, /admin/users and /admin/orders are for admins only; a signed-in customer must see a "You do not have access to this page." page with status 403, and a signed-out visitor is sent to /login.
9.2 Every `/api/admin/*` route must answer 403 to a customer and 401 to a visitor.
9.3 /admin/users must list every account with email, name and role, and let an admin change a role between customer and admin.
9.4 An admin cannot remove their own admin role ("You cannot change your own role.").
9.5 /admin/orders must list every order and let an admin move it to the next status along 7.8.
9.6 An invalid status change (backwards, skipping a step, or out of cancelled or delivered) must be refused with "This status change is not allowed." (409 from the API).

## 10 Notes (single-page area)

10.1 /spa/ is a single-page area with hash routes `#/dashboard`, `#/notes` and `#/notes/:id`; moving between them must not reload the page, and the Back button must work.
10.2 The dashboard must show the user's number of notes and orders, loaded with fetch.
10.3 A signed-in user can create, edit and delete their own notes; a note has a title (required, at most 80 characters) and a body (at most 2,000 characters).
10.4 The owner of a note can share it with another account by email; that account becomes a reader and can open the note but not change or delete it (403 for a reader's change).
10.5 Anyone who is neither the owner nor a reader must get 404 for the note (page and API), never 403, so the note's existence is not revealed.
10.6 Sharing with an email that has no account must show "There is no account with this email." (404 from the API).
10.7 `GET /api/notes` must list the notes the user owns and the notes shared with them, each marked owner or reader; `GET /api/notes/:id` returns one note under the rules of 10.4 and 10.5.
10.8 A note title that is empty or longer than 80 characters must show "Enter a title of 1 to 80 characters."

## 11 Widgets

11.1 /widgets must offer a native `<dialog>` and a `role="dialog"` modal; each opens from a button, traps focus while open, closes on Escape and returns focus to the button.
11.2 /widgets must offer a `role="menu"` menu operable with the arrow keys, Enter and Escape.
11.3 /widgets must offer tabs (`role="tablist"`) switched with the arrow keys, and an accordion whose headers are buttons with `aria-expanded`.
11.4 /widgets must offer a sortable data table with header cells; clicking a header sorts by that column.
11.5 /widgets must show a toast that appears after its button is pressed and disappears after 4 seconds, and a tooltip shown on hover and focus.
11.6 /widgets must offer a drag-and-drop list in which a card can be moved from "To do" to "Done".
11.7 /widgets must contain an iframe holding a small form whose submit shows "Form in frame sent".
11.8 /widgets must show an element with the text "I appeared late" about 6 seconds after the page loads.
11.9 /widgets must have a live region (`aria-live="polite"`) that announces each button press count.

## 12 Live updates

12.1 /live must show a counter that the server updates every second through server-sent events (`GET /api/live/events`).
12.2 /live must offer a chat in which a message sent over the WebSocket (`/api/live/ws`) appears for every open /live page within one second.
12.3 Chat messages must be 1 to 200 characters and shown as text, never as HTML; the /live page shows "Messages can be at most 200 characters." for a longer one, and the API answers 400 "A message must be 1 to 200 characters."
12.4 A chat message can also be sent over HTTP (`POST /api/live/chat`) and reaches WebSocket and event-stream clients; `GET /api/live/messages` returns the last 20 messages.

## 13 Special pages

13.1 /captcha must show a visible captcha box (class `g-recaptcha`, 304 × 78 px) that blocks the form; it is a fake and cannot be solved by a test.
13.2 /ads must load a hidden 0 × 0 iframe whose address contains `/recaptcha/api2/aframe` (a local fake); this page has no captcha a visitor must solve.
13.3 /a11y deliberately breaks accessibility (an image without alt text, low-contrast text, an input without a label) and is the only page exempt from 1.3.
13.4 /slow must take about 3 seconds to answer.
13.5 /broken deliberately shows a script error in the console, makes one request that fails, references an `http:` resource address and calls an endpoint that answers 500.
13.6 /docs/requirements and /docs/accounts must show this requirements document and the accounts document, rendered by the server from docs/REQUIREMENTS.md and docs/ACCOUNTS.md.
13.7 /openapi.json must be an OpenAPI 3 document listing the documented API routes with request and response schemas and error codes.
13.8 On /captcha, ticking the captcha box must show "Verification failed. Please try again.", and submitting the form must show "Please complete the captcha." and send nothing.
