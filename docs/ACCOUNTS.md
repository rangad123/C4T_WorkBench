# Practice Store — seeded accounts

All accounts, codes and data on this site are fake. They are restored on every restart and on reset (`POST /api/reset` with the
`x-reset-token` header). Never reuse these passwords anywhere real.

| Email | Password | Role | Sign-in | Notes |
|---|---|---|---|---|
| user@practice.test | `Practice#123` | customer | email + password | the plain account; has seeded orders and notes |
| admin@practice.test | `Admin#123` | admin | email + password | opens /admin, /admin/users, /admin/orders and `/api/admin/*` |
| otp@practice.test | `Otp#12345` | customer | password, then authenticator code on /otp | TOTP secret below |
| mail@practice.test | `Mail#1234` | customer | password, then emailed code on /otp | code shown in the fake mailbox |

## Authenticator (TOTP) account

- Secret (base32): `JBSWY3DPEHPK3PXP`
- Algorithm SHA-1, 6 digits, 30-second step (the usual authenticator-app settings).
- otpauth URI: `otpauth://totp/Practice%20Store:otp@practice.test?secret=JBSWY3DPEHPK3PXP&issuer=Practice%20Store`
- Get the current code with any authenticator app, or from a shell:
  `node -e "const c=require('node:crypto');const s='JBSWY3DPEHPK3PXP';let b='';for(const ch of s)b+=('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch)).toString(2).padStart(5,'0');const k=Buffer.from(b.match(/.{8}/g).map(x=>parseInt(x,2)));const t=Buffer.alloc(8);t.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=c.createHmac('sha1',k).update(t).digest();const o=h[19]&15;console.log(String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,'0'))"`
- In AI Studio: put the secret in the test account's **Authenticator secret** field.

## Emailed-code account and the fake mailbox

- Signing in as mail@practice.test "sends" a 6-digit code (valid 10 minutes, usable once). Nothing leaves the server.
- Read it at **/mailbox?to=mail@practice.test** (page) — the newest message is first, with its subject, code and time.
- The mailbox also lists the welcome message "sent" after a sign-up, for whatever address signed up.
- In AI Studio: the step **Use an emailed code or link** needs a Test mailbox. This site has no real mail server, so either read
  the code from /mailbox in a test step (open the page, read the code, type it on /otp), or use **Sign in once yourself** and save the sign-in.

## Other seeded data

- Products: a catalogue spread over several categories, including at least one product with stock 0 ("Out of stock").
- Orders: user@practice.test has orders in several statuses (pending, paid, shipped, delivered, cancelled), so cancel rules can be checked without placing orders first.
- Notes: user@practice.test owns notes, one of them shared with mail@practice.test as a reader; admin@practice.test is neither owner nor reader of that note (it must get 404).
- Discount code: `SAVE10` (10% off, once per account).
