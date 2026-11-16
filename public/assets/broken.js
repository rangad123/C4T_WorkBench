import { api } from '/assets/common.js';

const status = document.getElementById('broken-status');
console.error('Practice error: this page logs a deliberate console error.');
console.warn("Mixed Content: this page references an insecure resource 'http://127.0.0.1:9/insecure-pixel.png'.");
// A request that fails (404).
fetch('/api/does-not-exist', { credentials: 'same-origin' }).catch(() => {});
// An uncaught script error.
setTimeout(() => { throw new TypeError('Practice error: cannot read properties of undefined (deliberate)'); }, 0);

async function call500() {
  const r = await api('/api/broken');
  status.textContent = `The endpoint answered ${r.status}.`;
}
document.getElementById('call-500').addEventListener('click', call500);
call500();
