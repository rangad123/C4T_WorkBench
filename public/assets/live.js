import { el } from '/assets/common.js';

const count = document.getElementById('live-count');
const sseStatus = document.getElementById('live-sse-status');
const es = new EventSource('/api/live/events');
es.onopen = () => { sseStatus.textContent = 'Connected.'; };
es.onerror = () => { sseStatus.textContent = 'Reconnecting…'; };
es.onmessage = (e) => {
  try { const d = JSON.parse(e.data); if (d.count != null) count.textContent = String(d.count); }
  catch { count.textContent = e.data; }
};

const log = document.getElementById('chat-log');
const wsStatus = document.getElementById('live-ws-status');
const form = document.getElementById('chat-form');
const chatErr = document.getElementById('chat-error');
let ws;
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/live/ws');
  ws.onopen = () => { wsStatus.textContent = 'Connected.'; };
  ws.onclose = () => { wsStatus.textContent = 'Disconnected. Reconnecting…'; setTimeout(connect, 2000); };
  ws.onmessage = (e) => {
    let d;
    try { d = JSON.parse(e.data); } catch { d = { type: 'chat', text: String(e.data) }; }
    const add = (m) => log.append(el('p', { class: 'chat-message', 'data-testid': 'chat-message' }, ((m.name || m.from) ? (m.name || m.from) + ': ' : '') + (m.text ?? '')));
    if (d.type === 'hello') { log.replaceChildren(); (d.messages || []).forEach(add); if (d.name) wsStatus.textContent = 'Connected as ' + d.name + '.'; }
    else if (!d.type || d.type === 'chat') add(d);
    else return;
    log.scrollTop = log.scrollHeight;
  };
}
connect();
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = form.text.value.trim();
  chatErr.hidden = true;
  if (!text) return;
  if (text.length > 200) { chatErr.textContent = 'Messages can be at most 200 characters.'; chatErr.hidden = false; return; }
  if (!ws || ws.readyState !== WebSocket.OPEN) { chatErr.textContent = 'Not connected yet.'; chatErr.hidden = false; return; }
  ws.send(JSON.stringify({ type: 'chat', text }));
  form.text.value = '';
});
