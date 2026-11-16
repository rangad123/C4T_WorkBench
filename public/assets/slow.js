import { api } from '/assets/common.js';

const status = document.getElementById('slow-status');
const started = performance.now();
const r = await api('/api/slow');
const secs = ((performance.now() - started) / 1000).toFixed(1);
status.textContent = r.ok ? `Slow data loaded after ${secs} s.` : `Slow data failed after ${secs} s (status ${r.status}).`;
