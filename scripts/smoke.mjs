#!/usr/bin/env node
// Smoke check for the Practice Store: starts the server on a free port (8090-8099), fetches every page in CONTRACT.md and every
// documented API route (with a real sign-in), checks status codes and that /openapi.json lists the documented routes, then stops
// the server it started (by its own PID). Usage: node scripts/smoke.mjs   (exit 0 = all passed)
import { spawn } from "node:child_process";
import net from "node:net";
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESET_TOKEN = "smoke-reset-token";
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });

function portFree(port) {
    return new Promise((resolve) => {
        const s = net.createServer().once("error", () => resolve(false));
        s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
    });
}

async function freePort() {
    for (let p = 8090; p <= 8099; p++) if (await portFree(p)) return p;
    throw new Error("no free port in 8090-8099");
}

const port = await freePort();
const BASE = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [path.join(ROOT, "server/index.mjs")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), RESET_TOKEN, BUGS: "" },
    stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
child.stdout.on("data", (d) => (serverLog += d));
child.stderr.on("data", (d) => (serverLog += d));
const stop = () => {
    if (child.exitCode === null) {
        try {
            process.kill(child.pid, "SIGTERM");
        } catch {}
    }
};
process.on("exit", stop);
process.on("SIGINT", () => (stop(), process.exit(130)));

async function req(method, url, { token, body, headers = {}, cookie, raw } = {}) {
    const h = { ...headers };
    if (token) h.authorization = `Bearer ${token}`;
    if (cookie) h.cookie = cookie;
    let payload;
    if (body !== undefined) {
        payload = raw ? body : JSON.stringify(body);
        if (!raw) h["content-type"] = "application/json";
    }
    const started = Date.now();
    const res = await fetch(BASE + url, { method, headers: h, body: payload, redirect: "manual", signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {}
    return { status: res.status, headers: res.headers, text, json, ms: Date.now() - started };
}

const expectStatus = async (name, method, url, want, opts) => {
    try {
        const r = await req(method, url, opts);
        const ok = Array.isArray(want) ? want.includes(r.status) : r.status === want;
        check(`${method} ${url}${name ? ` (${name})` : ""}`, ok, ok ? "" : `got ${r.status}, want ${want}: ${r.text.slice(0, 120)}`);
        return r;
    } catch (e) {
        check(`${method} ${url}${name ? ` (${name})` : ""}`, false, String(e.message || e));
        return { status: 0, headers: new Headers(), text: "", json: undefined, ms: 0 };
    }
};

const pickId = (j, key) => {
    const list = Array.isArray(j) ? j : j?.[key] ?? j?.items ?? j?.data ?? [];
    return list[0]?.id;
};

async function main() {
    // wait for health
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
        if (child.exitCode !== null) break;
        try {
            up = (await fetch(`${BASE}/api/health`)).ok;
        } catch {}
        if (!up) await new Promise((r) => setTimeout(r, 200));
    }
    check("server starts and /api/health answers", up, up ? "" : serverLog.slice(-500));
    if (!up) return;

    // ── Pages ──
    const pages = ["/", "/login", "/login-plain", "/signup", "/otp", "/mailbox?to=mail@practice.test", "/products", "/cart",
        "/checkout", "/checkout/review", "/orders", "/account", "/spa/", "/widgets", "/live", "/captcha", "/ads", "/a11y",
        "/broken", "/docs/requirements", "/docs/accounts", "/admin", "/admin/users", "/admin/orders"];
    for (const p of pages) {
        // signed-out visitors may be redirected to /login or refused on the protected pages
        const r = await expectStatus("page", "GET", p, [200, 302, 303, 401, 403]);
        if (r.status === 200 && (r.headers.get("content-type") || "").includes("html")) {
            check(`page ${p} has the practice banner`, r.text.includes("Practice site for automated testing"));
        }
    }
    const slow = await expectStatus("page", "GET", "/slow", 200);
    check("GET /slow takes about 3 s", slow.ms >= 2500, `${slow.ms} ms`);
    await expectStatus("unknown page", "GET", "/no-such-page-xyz", 404);
    await expectStatus("path traversal", "GET", "/..%2fserver%2findex.mjs", [400, 403, 404]);
    const home = await req("GET", "/");
    check("CSP header on pages", !!home.headers.get("content-security-policy"));

    // ── Public API ──
    await expectStatus("", "GET", "/api/health", 200);
    await expectStatus("signed out", "GET", "/api/me", 401);
    const opt = await expectStatus("signed out, optional", "GET", "/api/me?optional=1", 200);
    check("GET /api/me?optional=1 gives {user:null}", opt.json && opt.json.user === null, opt.text.slice(0, 80));
    const prods = await expectStatus("", "GET", "/api/products?q=&category=&page=1", 200);
    const productId = pickId(prods.json, "products");
    check("products list has an id", productId !== undefined, prods.text.slice(0, 120));
    if (productId !== undefined) {
        await expectStatus("page", "GET", `/products/${productId}`, 200);
        await expectStatus("", "GET", `/api/products/${productId}`, 200);
    }
    await expectStatus("unknown", "GET", "/api/products/999999", 404);

    // ── Sign-in ──
    await expectStatus("bad password", "POST", "/api/auth/login", 401, { body: { email: "user@practice.test", password: "nope" } });
    const login = await expectStatus("user", "POST", "/api/auth/login", 200, { body: { email: "user@practice.test", password: "Practice#123" } });
    const setCookie = login.headers.get("set-cookie") || "";
    check("login sets ps_session HttpOnly SameSite=Lax", /ps_session=/.test(setCookie) && /httponly/i.test(setCookie) && /samesite=lax/i.test(setCookie), setCookie);
    const cookie = (setCookie.match(/ps_session=[^;]+/) || [""])[0];
    await expectStatus("cookie", "GET", "/api/me", 200, { cookie });
    const tokFor = async (email, password) => {
        const r = await expectStatus(email, "POST", "/api/auth/token", [200, 201], { body: { email, password } });
        return r.json?.token;
    };
    const userTok = await tokFor("user@practice.test", "Practice#123");
    const adminTok = await tokFor("admin@practice.test", "Admin#123");
    check("tokens issued", userTok && adminTok);
    await expectStatus("bearer", "GET", "/api/me", 200, { token: userTok });
    const otpLogin = await expectStatus("otp account needs a code", "POST", "/api/auth/login", [200, 202], { body: { email: "otp@practice.test", password: "Otp#12345" } });
    const otpCookie = ((otpLogin.headers.get("set-cookie") || "").match(/ps_session=[^;]+/) || [""])[0];
    await expectStatus("wrong code", "POST", "/api/auth/otp", [400, 401], { body: { code: "000000" }, cookie: otpCookie });

    // ── Cart and orders ──
    await expectStatus("signed out", "GET", "/api/cart/items", 401);
    await expectStatus("", "GET", "/api/cart/items", 200, { token: userTok });
    if (productId !== undefined) {
        await expectStatus("qty 11", "POST", "/api/cart/items", 400, { token: userTok, body: { productId, qty: 11 } });
        const add = await expectStatus("qty 1", "POST", "/api/cart/items", [200, 201], { token: userTok, body: { productId, qty: 1 } });
        const lineId = add.json?.item?.id ?? add.json?.id ?? pickId(add.json, "items");
        if (lineId !== undefined) await expectStatus("qty 2", "PATCH", `/api/cart/items/${lineId}`, 200, { token: userTok, body: { qty: 2 } });
        await expectStatus("SAVE10", "POST", "/api/cart/discount", 200, { token: userTok, body: { code: "SAVE10" } });
        await expectStatus("unknown code", "POST", "/api/cart/discount", 400, { token: userTok, body: { code: "NOPE" } });
        const order = await expectStatus("from cart", "POST", "/api/orders", [200, 201], { token: userTok, body: { shipping: "standard", address: { name: "Smoke Test", street: "1 Test St", city: "Testville", postcode: "12345" } } });
        const orderId = order.json?.order?.id ?? order.json?.id;
        if (orderId !== undefined) {
            await expectStatus("page", "GET", `/orders/${orderId}`, 200, { cookie });
            await expectStatus("", "GET", `/api/orders/${orderId}`, 200, { token: userTok });
            await expectStatus("other user", "GET", `/api/orders/${orderId}`, 404, { token: adminTok });
            await expectStatus("", "GET", `/api/account/invoice/${orderId}`, 200, { token: userTok });
            await expectStatus("customer", "PATCH", `/api/admin/orders/${orderId}`, 403, { token: userTok, body: { status: "paid" } });
            await expectStatus("admin", "PATCH", `/api/admin/orders/${orderId}`, 200, { token: adminTok, body: { status: "paid" } });
            await expectStatus("before shipped", "POST", `/api/orders/${orderId}/cancel`, 200, { token: userTok });
        }
    }
    await expectStatus("", "GET", "/api/orders", 200, { token: userTok });

    // ── Admin ──
    await expectStatus("visitor", "GET", "/api/admin/users", 401);
    await expectStatus("customer", "GET", "/api/admin/users", 403, { token: userTok });
    const users = await expectStatus("admin", "GET", "/api/admin/users", 200, { token: adminTok });
    const mailUser = (users.json?.users ?? users.json?.items ?? users.json ?? []).find?.((u) => u.email === "mail@practice.test");
    if (mailUser) {
        await expectStatus("to admin", "PATCH", `/api/admin/users/${mailUser.id}`, 200, { token: adminTok, body: { role: "admin" } });
        await expectStatus("back", "PATCH", `/api/admin/users/${mailUser.id}`, 200, { token: adminTok, body: { role: "customer" } });
    } else check("admin users list has mail@practice.test", false, users.text.slice(0, 120));

    // ── Notes ──
    await expectStatus("", "GET", "/api/notes", 200, { token: userTok });
    const note = await expectStatus("", "POST", "/api/notes", [200, 201], { token: userTok, body: { title: "Smoke note", body: "hello" } });
    const noteId = note.json?.note?.id ?? note.json?.id;
    if (noteId !== undefined) {
        await expectStatus("", "PATCH", `/api/notes/${noteId}`, 200, { token: userTok, body: { title: "Smoke note 2" } });
        await expectStatus("non-reader", "PATCH", `/api/notes/${noteId}`, 404, { token: adminTok, body: { title: "x" } });
        await expectStatus("", "POST", `/api/notes/${noteId}/share`, 200, { token: userTok, body: { email: "admin@practice.test" } });
        await expectStatus("reader edits", "PATCH", `/api/notes/${noteId}`, 403, { token: adminTok, body: { title: "x" } });
        await expectStatus("", "DELETE", `/api/notes/${noteId}`, [200, 204], { token: userTok });
    }

    // ── Avatar ──
    const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
    await expectStatus("png", "POST", "/api/account/avatar", [200, 201], { token: userTok, body: png, raw: true, headers: { "content-type": "image/png" } });
    const boundary = "----smokeBoundary7";
    const multipart = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), png, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    await expectStatus("multipart png", "POST", "/api/account/avatar", [200, 201], { token: userTok, body: multipart, raw: true, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } });
    await expectStatus("after upload", "GET", "/api/account/avatar", 200, { token: userTok });
    await expectStatus("text file", "POST", "/api/account/avatar", [400, 415], { token: userTok, body: "not an image", raw: true, headers: { "content-type": "text/plain" } });
    await expectStatus("over 1 MB", "POST", "/api/account/avatar", 413, { token: userTok, body: Buffer.concat([png, Buffer.alloc(1024 * 1024 + 10)]), raw: true, headers: { "content-type": "image/png" } });

    // ── Live ──
    try {
        const ac = new AbortController();
        const r = await fetch(`${BASE}/api/live/events`, { signal: ac.signal });
        const ok = r.status === 200 && (r.headers.get("content-type") || "").includes("text/event-stream");
        const reader = r.body.getReader();
        const first = await Promise.race([reader.read(), new Promise((res) => setTimeout(() => res({ value: null }), 3000))]);
        ac.abort();
        check("GET /api/live/events streams events", ok && first.value && first.value.length > 0);
    } catch (e) {
        check("GET /api/live/events streams events", false, String(e.message || e));
    }
    const ws = await new Promise((resolve) => {
        const rq = http.request({ host: "127.0.0.1", port, path: "/api/live/ws", headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==" } });
        rq.on("upgrade", (res, socket) => (socket.destroy(), resolve(res.statusCode)));
        rq.on("response", (res) => (res.resume(), resolve(res.statusCode)));
        rq.on("error", (e) => resolve(String(e.message)));
        rq.setTimeout(3000, () => (rq.destroy(), resolve("timeout")));
        rq.end();
    });
    check("GET /api/live/ws upgrades (101)", ws === 101, String(ws));

    // ── Broken endpoint, OpenAPI ──
    await expectStatus("deliberate 500 exists", "GET", "/api/broken", [500, 404]);
    const oa = await expectStatus("", "GET", "/openapi.json", 200);
    const paths = oa.json?.paths ?? {};
    const norm = (p) => p.replace(/\{[^}]+\}/g, ":id").replace(/:[A-Za-z]+/g, ":id");
    const documented = new Set(Object.entries(paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${norm(p)}`)));
    const mustList = ["POST /api/auth/login", "POST /api/auth/otp", "POST /api/auth/logout", "GET /api/me", "POST /api/auth/signup",
        "GET /api/products", "GET /api/products/:id", "GET /api/cart/items", "POST /api/cart/items", "PATCH /api/cart/items/:id",
        "DELETE /api/cart/items/:id", "POST /api/cart/discount", "POST /api/orders", "GET /api/orders", "GET /api/orders/:id",
        "POST /api/orders/:id/cancel", "PATCH /api/admin/orders/:id", "GET /api/admin/users", "PATCH /api/admin/users/:id",
        "GET /api/notes", "POST /api/notes", "PATCH /api/notes/:id", "DELETE /api/notes/:id", "POST /api/notes/:id/share",
        "POST /api/account/avatar", "GET /api/account/invoice/:id", "GET /api/live/events", "GET /api/live/ws", "GET /api/health",
        "POST /api/reset", "GET /api/categories", "GET /api/csrf", "POST /api/auth/otp/resend", "DELETE /api/cart/items",
        "DELETE /api/cart/discount", "GET /api/account/avatar", "GET /api/notes/:id", "GET /api/admin/orders", "POST /api/live/chat",
        "GET /api/live/messages"];
    const missing = mustList.filter((r) => !documented.has(r));
    check("openapi.json lists every documented route", missing.length === 0, missing.join(", "));
    const leaked = ["POST /api/auth/token", "GET /api/internal/stats"].filter((r) => documented.has(r));
    check("openapi.json leaves out the two undocumented routes", leaked.length === 0, leaked.join(", "));
    await expectStatus("undocumented but real", "GET", "/api/internal/stats", [200, 401, 403], { token: adminTok });

    // ── Change switches (docs/CHANGES.md): off by default, on per request ──
    const firstItem = (j) => (j?.items ?? j?.products ?? [])[0] ?? {};
    const pOff = firstItem((await req("GET", "/api/products")).json);
    check("CHANGE_API off: products have name, no title/sku", "name" in pOff && !("title" in pOff) && !("sku" in pOff), JSON.stringify(pOff).slice(0, 100));
    const pOn = firstItem((await expectStatus("CHANGE_API on", "GET", "/api/products", 200, { headers: { "x-changes": "CHANGE_API" } })).json);
    check("CHANGE_API on: products have title and sku, no name", "title" in pOn && "sku" in pOn && !("name" in pOn), JSON.stringify(pOn).slice(0, 100));
    if (productId !== undefined) {
        const one = (await req("GET", `/api/products/${productId}`, { headers: { "x-changes": "CHANGE_API" } })).json;
        const p1 = one?.product ?? one ?? {};
        check("CHANGE_API on: product detail has title and sku", "title" in p1 && "sku" in p1 && !("name" in p1), JSON.stringify(p1).slice(0, 100));
    }
    const oaOff = (await req("GET", "/openapi.json")).json;
    const oaOn = (await expectStatus("changed variant", "GET", "/openapi.json?changes=on", 200)).json;
    check("openapi.json: plain is not 1.1.0, ?changes=on is 1.1.0", oaOff?.info?.version !== "1.1.0" && oaOn?.info?.version === "1.1.0", `${oaOff?.info?.version} / ${oaOn?.info?.version}`);
    const hOff = (await req("GET", "/api/health")).json;
    const hOn = (await req("GET", "/api/health", { headers: { "x-changes": "on" } })).json;
    check("health reports changes [] off, both ids on", Array.isArray(hOff?.changes) && hOff.changes.length === 0 && ["CHANGE_UI", "CHANGE_API"].every((c) => hOn?.changes?.includes(c)), `${JSON.stringify(hOff?.changes)} / ${JSON.stringify(hOn?.changes)}`);
    const loginOff = await req("GET", "/login");
    const loginOn = await req("GET", "/login", { headers: { "x-changes": "CHANGE_UI" } });
    check("CHANGE_UI off: /login has data-changes=\"\"", /<html[^>]*data-changes=""/.test(loginOff.text));
    check("CHANGE_UI on: /login has data-changes with CHANGE_UI", /<html[^>]*data-changes="[^"]*CHANGE_UI/.test(loginOn.text));
    // CHANGE_UI is applied in the browser; without a browser, check the scripts carry the changed wording.
    const loginJs = await req("GET", "/assets/login.js");
    check("CHANGE_UI: /assets/login.js renames to \"Log in\" and moves signin-email", loginJs.text.includes("CHANGE_UI") && loginJs.text.includes("Log in") && loginJs.text.includes("signin-email"));
    const prodJs = (await Promise.all(["/assets/products.js", "/assets/product.js", "/assets/products-shared.js"].map((u) => req("GET", u)))).map((r) => r.text).join("\n");
    check("CHANGE_UI: product scripts offer \"Add to basket\"", prodJs.includes("Add to basket"));
    const cookieOn = await req("GET", "/login?changes=CHANGE_UI");
    check("?changes=CHANGE_UI sets the ps_changes cookie", /ps_changes=/.test(cookieOn.headers.get("set-cookie") || ""), cookieOn.headers.get("set-cookie") || "no set-cookie");

    // ── Logout, reset ──
    await expectStatus("", "POST", "/api/auth/logout", [200, 204], { cookie });
    await expectStatus("old cookie after logout", "GET", "/api/me", 401, { cookie });
    await expectStatus("no token", "POST", "/api/reset", 403);
    await expectStatus("token", "POST", "/api/reset", 200, { headers: { "x-reset-token": RESET_TOKEN } });
    await expectStatus("token", "GET", "/__reset", 200, { headers: { "x-reset-token": RESET_TOKEN } });
}

try {
    await main();
} catch (e) {
    check("smoke script ran to the end", false, String(e.stack || e));
} finally {
    stop();
}
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} passed (server on port ${port}, pid ${child.pid}, stopped)`);
process.exitCode = failed.length ? 1 : 0;
