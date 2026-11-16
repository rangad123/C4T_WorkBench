# Practice Store

A small fake shop that exists only to be tested by Crowd4Test AI Studio. Every AI Studio feature has a page, route or account
here that exercises it ([docs/FEATURE-MAP.md](docs/FEATURE-MAP.md)). Nothing is real: no real emails, no payments, fake data only.

- Requirements (for AI Studio's requirements import): [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- Seeded accounts, TOTP secret, fake mailbox: [docs/ACCOUNTS.md](docs/ACCOUNTS.md)
- Seeded defects and how to switch them on: [docs/BUGS.md](docs/BUGS.md)
- Change switches (a "new version" for repair and API-change tests): [docs/CHANGES.md](docs/CHANGES.md)
- The server renders docs/REQUIREMENTS.md at `/docs/requirements` and docs/ACCOUNTS.md at `/docs/accounts`.
- Server routes in detail: [server/routes.md](server/routes.md); API document at `/openapi.json`.
- Hosting it: [deploy/README.md](deploy/README.md)

## Run locally

Node 24, no `npm install` (Node built-ins only).

```sh
node server/index.mjs                    # http://localhost:8080
PORT=8081 BUGS=all node server/index.mjs # a second copy with every defect on
```

## Editing pages

The shared header/nav is generated: run `node scripts/gen-pages.mjs` after editing (builder B's generator) so every page in
`public/` gets the same header, banner and navigation.

## Environment variables

| Name | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | port to listen on |
| `RESET_TOKEN` | none (reset refused) | secret for `POST /api/reset` and `GET /__reset` (header `x-reset-token`) |
| `BUGS` | off | `all` or a comma list of defect ids (`SUBTOTAL,QTY,...`) from [docs/BUGS.md](docs/BUGS.md) |
| `CHANGES` | off | `all` or `CHANGE_UI,CHANGE_API`: serve the changed version, see [docs/CHANGES.md](docs/CHANGES.md) |
| `HOST` | `127.0.0.1` | address to listen on (`0.0.0.0` to reach it from another machine, e.g. a runner) |
| `SESSION_SECRET` | random per start | signs session cookies; set it to keep sessions across restarts |
| `LOGIN_RATE_LIMIT` | `10` | sign-in attempts per minute per IP before 429 |
| `TRUST_PROXY` | off | `1` behind nginx: the client IP (rate limit) and HTTPS (Secure cookie) come from `X-Forwarded-For` / `X-Forwarded-Proto` |

## Reset the data

All data is in memory and seeded at start; restarting resets it. Without a restart:

```sh
curl -X POST -H "x-reset-token: $RESET_TOKEN" http://localhost:8080/api/reset
```

## Tests

```sh
node --test server/test/*.test.mjs   # server tests
node scripts/smoke.mjs        # starts the server on a free port 8090-8099, fetches every page and route, stops it
```

## Point AI Studio at it

1. Create a project with the address `http://localhost:8080` (or the hosted `https://{{DOMAIN}}`). A local address needs your
   runner with **Test private and local addresses** on.
2. Requirements tab: import `docs/REQUIREMENTS.md`; under **What the agents need** set the OpenAPI URL `<address>/openapi.json`
   and a Bearer token from `POST /api/auth/token` (`{"email":"user@practice.test","password":"Practice#123"}`).
3. Sign in: user@practice.test / `Practice#123`. Library → Test accounts: add `admin`, `otp` (with the authenticator secret) and `mail`.
4. Library → Test data → reset call `POST <address>/api/reset` with the `x-reset-token` header.
5. Explore my app. Then follow [docs/FEATURE-MAP.md](docs/FEATURE-MAP.md) feature by feature.
