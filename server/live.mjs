// Live updates: a server-sent-events counter and a tiny WebSocket chat (RFC 6455 text frames, node:crypto handshake).
import { createHash } from 'node:crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 64 * 1024;
const MAX_CLIENTS = 500;

export function createLive(app) {
  const sse = new Set();
  const ws = new Set();
  const messages = [];
  let count = 0;
  let timer = null;

  function tick() {
    count++;
    const line = `data: ${JSON.stringify({ count })}\n\n`;
    for (const res of sse) res.write(line);
  }
  function ensureTimer() {
    if (!timer && (sse.size || ws.size)) { timer = setInterval(tick, app.options.tickMs); timer.unref(); }
  }
  function maybeStop() {
    if (timer && !sse.size && !ws.size) { clearInterval(timer); timer = null; }
  }

  function chat(name, text) {
    const t = String(text ?? '').trim();
    if (!t) return { error: 'Type a message first.' };
    if ([...t].length > 200) return { error: 'A message can be at most 200 characters.' };
    const msg = { type: 'chat', name, text: t, at: new Date(app.now()).toISOString() };
    messages.push(msg);
    if (messages.length > 20) messages.shift();
    const json = JSON.stringify(msg);
    for (const s of ws) sendText(s, json);
    for (const res of sse) res.write(`event: chat\ndata: ${json}\n\n`);
    return { message: msg };
  }

  function handleSse(ctx) {
    const { req, res } = ctx;
    if (sse.size >= MAX_CLIENTS) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { code: 'busy', message: 'Too many live connections. Try again later.' } })); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`retry: 3000\n\ndata: ${JSON.stringify({ count })}\n\n`);
    sse.add(res);
    ensureTimer();
    const done = () => { sse.delete(res); maybeStop(); };
    req.on('close', done);
    res.on('error', done);
  }

  // WebSocket upgrade on /api/live/ws.
  function handleUpgrade(req, socket) {
    const reject = (status, text) => { socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
    let path;
    try { path = new URL(req.url, 'http://x').pathname; } catch { return reject(400, 'Bad Request'); }
    if (path !== '/api/live/ws') return reject(404, 'Not Found');
    const key = req.headers['sec-websocket-key'];
    if (String(req.headers.upgrade).toLowerCase() !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') return reject(400, 'Bad Request');
    const origin = req.headers.origin;
    if (origin && !app.sameOrigin(req, origin)) return reject(403, 'Forbidden');
    if (ws.size >= MAX_CLIENTS) return reject(503, 'Service Unavailable');
    let name = 'Guest';
    try { name = app.auth.resolve({ req }).user?.name || 'Guest'; } catch { /* bad token: stay a guest */ }
    const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    ws.add(socket);
    ensureTimer();
    sendText(socket, JSON.stringify({ type: 'hello', name, count, messages }));
    let buf = Buffer.alloc(0);
    const close = (code) => {
      if (!ws.has(socket)) return;
      ws.delete(socket);
      maybeStop();
      const p = Buffer.alloc(2); p.writeUInt16BE(code);
      try { socket.end(frame(8, p)); } catch { socket.destroy(); }
    };
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; const big = buf.readBigUInt64BE(2); if (big > BigInt(MAX_FRAME)) return close(1009); len = Number(big); off = 10; }
        if (len > MAX_FRAME) return close(1009);
        if (!masked) return close(1002);
        if (buf.length < off + 4 + len) return;
        const mask = buf.subarray(off, off + 4);
        const data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
        for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
        buf = buf.subarray(off + 4 + len);
        if (!fin) return close(1003);
        if (op === 8) return close(1000);
        if (op === 9) { socket.write(frame(10, data)); continue; }
        if (op === 10) continue;
        if (op !== 1) return close(1003);
        onText(socket, name, data.toString('utf8'));
      }
    });
    socket.on('close', () => { ws.delete(socket); maybeStop(); });
    socket.on('error', () => { ws.delete(socket); maybeStop(); });
  }

  function onText(socket, name, text) {
    let msg;
    try { msg = JSON.parse(text); } catch { return sendText(socket, JSON.stringify({ type: 'error', error: 'Send JSON like {"type":"chat","text":"hello"}.' })); }
    if (msg?.type === 'ping') return sendText(socket, JSON.stringify({ type: 'pong' }));
    if (msg?.type !== 'chat') return sendText(socket, JSON.stringify({ type: 'error', error: 'Unknown message type.' }));
    const r = chat(name, msg.text);
    if (r.error) sendText(socket, JSON.stringify({ type: 'error', error: r.error }));
  }

  function closeAll() {
    if (timer) { clearInterval(timer); timer = null; }
    for (const res of sse) res.destroy();
    for (const s of ws) s.destroy();
    sse.clear(); ws.clear();
  }

  return { handleSse, handleUpgrade, chat, closeAll, messages, get count() { return count; } };
}

function frame(op, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

function sendText(socket, text) {
  if (!socket.destroyed) socket.write(frame(1, Buffer.from(text)));
}
