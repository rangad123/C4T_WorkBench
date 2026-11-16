// HTML pages (pretty URLs -> files in public/), static assets, rendered docs. See routes.md for the map.
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

// [url pattern, file in public/, access] access: undefined = anyone, 'user' = signed in, 'admin' = admins.
export const PAGES = [
  ['/', 'index.html'],
  ...['login', 'login-plain', 'signup', 'otp', 'mailbox', 'products', 'widgets', 'live', 'captcha', 'ads', 'a11y', 'slow', 'broken'].map((n) => [`/${n}`, `${n}.html`]),
  ...['cart', 'checkout', 'orders', 'account'].map((n) => [`/${n}`, `${n}.html`, 'user']),
  ['/checkout/review', 'checkout-review.html', 'user'],
  ['/products/:id', 'product.html'],
  ['/orders/:id', 'order.html', 'user'],
  ['/admin', 'admin/index.html', 'admin'],
  ['/admin/users', 'admin/users.html', 'admin'],
  ['/admin/orders', 'admin/orders.html', 'admin'],
  ['/spa/', 'spa/index.html', 'user'],
];
// Rendered from docs/*.md into the site's page frame.
export const DOCS = { '/docs/requirements': ['REQUIREMENTS.md', 'Requirements'], '/docs/accounts': ['ACCOUNTS.md', 'Test accounts'] };
// .html files that may be fetched by their own path (iframes); every other .html is only reachable through PAGES.
export const STATIC_HTML = new Set(['frame-form.html', 'fake/recaptcha/api2/aframe.html']);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.md': 'text/plain; charset=utf-8',
};

const compiled = PAGES.map(([pattern, file, access]) => {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '$');
  return { pattern, file, access, keys, regex };
});

export function createPages(app) {
  const root = resolve(app.options.publicDir);
  const docsDir = resolve(app.options.docsDir);

  async function sendHtml(ctx, status, file) {
    let html;
    try { html = await readFile(join(root, file), 'utf8'); } catch { html = null; }
    if (html === null) {
      if (file === '404.html') html = fallbackPage('Page not found', '<h1>Page not found</h1><p>There is no page at this address.</p>');
      else if (file === '403.html') html = fallbackPage('No access', '<h1>You do not have access to this page.</h1>');
      else return sendHtml(ctx, 404, '404.html');
    }
    return writeHtml(ctx, status, html);
  }

  function writeHtml(ctx, status, html) {
    const token = app.auth.csrfToken(ctx);
    const changes = [...(ctx.changes || [])].join(' ');
    const body = Buffer.from(html.replaceAll('__CSRF__', token).replaceAll('__CHANGES__', changes)
      .replace(/<html(?![^>]*data-changes)([^>]*)>/i, (_, attrs) => `<html${attrs} data-changes="${changes}">`));
    ctx.res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    ctx.res.end(ctx.req.method === 'HEAD' ? undefined : body);
  }

  async function renderDoc(ctx, mdFile, title) {
    let md;
    try { md = await readFile(join(docsDir, mdFile), 'utf8'); } catch { return sendHtml(ctx, 404, '404.html'); }
    let frame;
    try { frame = await readFile(join(root, '404.html'), 'utf8'); } catch { frame = null; }
    const content = `<article class="doc">${markdown(md)}</article>`;
    let html;
    if (frame && /<main[^>]*>[\s\S]*<\/main>/.test(frame)) {
      html = frame.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)} — Practice Store</title>`)
        .replace(/(<main[^>]*>)[\s\S]*(<\/main>)/, (_, a, b) => `${a}${content}${b}`);
    } else html = fallbackPage(title, content);
    return writeHtml(ctx, 200, html);
  }

  async function serveStatic(ctx, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return sendHtml(ctx, 404, '404.html'); }
    const parts = rel.split('/').filter(Boolean);
    if (!parts.length || rel.includes('\0') || rel.includes('\\') || parts.some((p) => p === '..' || p === '.' || p.startsWith('.'))) return sendHtml(ctx, 404, '404.html');
    const relPath = parts.join('/');
    const ext = extname(relPath).toLowerCase();
    if (!MIME[ext] || (ext === '.html' && !STATIC_HTML.has(relPath))) return sendHtml(ctx, 404, '404.html');
    const full = resolve(root, relPath);
    if (!full.startsWith(root + sep)) return sendHtml(ctx, 404, '404.html');
    try {
      const real = await realpath(full);
      const realRoot = await realpath(root);
      if (!real.startsWith(realRoot + sep)) return sendHtml(ctx, 404, '404.html');
      const st = await stat(real);
      if (!st.isFile()) return sendHtml(ctx, 404, '404.html');
      if (ext === '.html') return writeHtml(ctx, 200, await readFile(real, 'utf8'));
      const data = await readFile(real);
      ctx.res.writeHead(200, { 'Content-Type': MIME[ext], 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
      ctx.res.end(ctx.req.method === 'HEAD' ? undefined : data);
    } catch {
      return sendHtml(ctx, 404, '404.html');
    }
  }

  async function handle(ctx) {
    const { req, res, url } = ctx;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Method not allowed');
    }
    let path = url.pathname;
    if (path === '/spa') return redirect(res, '/spa/' + url.search);
    if (path.length > 1 && path.endsWith('/') && path !== '/spa/') path = path.slice(0, -1);
    if (DOCS[path]) return renderDoc(ctx, ...DOCS[path]);
    for (const p of compiled) {
      const m = p.regex.exec(path);
      if (!m) continue;
      const params = Object.fromEntries(p.keys.map((k, i) => [k, Number(m[i + 1])]));
      if (p.access) {
        let who = null;
        try { who = app.auth.resolve(ctx).user; } catch { who = null; }
        if (!who) return redirect(res, '/login?next=' + encodeURIComponent(url.pathname + url.search));
        if (p.access === 'admin' && who.role !== 'admin') return sendHtml(ctx, 403, '403.html');
        ctx.user = who;
      }
      if (p.pattern === '/products/:id' && !app.product(params.id)) return sendHtml(ctx, 404, '404.html');
      if (p.pattern === '/orders/:id' && !app.state.orders.some((o) => o.id === params.id && o.userId === ctx.user.id)) return sendHtml(ctx, 404, '404.html');
      if (p.pattern === '/slow') await new Promise((r) => setTimeout(r, app.options.slowMs));
      return sendHtml(ctx, 200, p.file);
    }
    return serveStatic(ctx, url.pathname);
  }

  return { handle, sendHtml };
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Content-Length': 0 });
  res.end();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fallbackPage(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf-token" content="__CSRF__"><title>${esc(title)} — Practice Store</title><link rel="stylesheet" href="/assets/site.css"></head>
<body><header class="site-header"><div class="practice-banner" role="note">Practice site for automated testing — not a real shop.</div>
<div class="inner"><a class="brand" href="/">Practice Store</a></div></header>
<main id="main" class="container">${content}</main></body></html>`;
}

// A small Markdown renderer: headings, paragraphs, lists, tables, code, quotes, inline code/bold/italic/links. Escapes HTML.
export function markdown(md) {
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
      const safe = /^(https?:|\/|#|[\w.-]+(\.md)?($|#))/i.test(href) && !/^javascript:/i.test(href);
      const h = href.replace(/^([\w-]+)\.md(#.*)?$/i, (m, n, hash) => (n.toUpperCase() === 'REQUIREMENTS' ? '/docs/requirements' : n.toUpperCase() === 'ACCOUNTS' ? '/docs/accounts' : m) + (hash || ''));
      return safe ? `<a href="${h}">${t}</a>` : t;
    });
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { const t = inline(h[2]); out.push(`<h${h[1].length} id="${slug(t)}">${t}</h${h[1].length}>`); i++; continue; }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote><p>${inline(buf.join(' '))}</p></blockquote>`);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const req = /^(\d+\.\d+)\s+(.*)$/.exec(line);
    if (req) { out.push(`<p class="req" id="req-${req[1].replace('.', '-')}"><strong>${req[1]}</strong> ${inline(req[2])}</p>`); i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*\||>|\s*([-*]|\d+\.)\s+|\d+\.\d+\s)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { out.push(`<p>${inline(lines[i++])}</p>`); continue; }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

