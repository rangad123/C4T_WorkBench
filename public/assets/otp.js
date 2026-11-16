import { api, show, errorText, safeNext } from '/assets/common.js';

const params = new URLSearchParams(location.search);
if (params.get('method') === 'email') {
  document.getElementById('otp-intro').textContent = 'Enter the 6-digit code we sent to your email.';
  document.getElementById('otp-mailbox').hidden = false;
  const to = params.get('to');
  if (to) document.getElementById('otp-mailbox-link').href = '/mailbox?to=' + encodeURIComponent(to);
}
const form = document.getElementById('otp-form');
const err = document.getElementById('otp-error');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  show(err, '');
  const code = form.code.value.trim();
  if (!/^\d{6}$/.test(code)) return show(err, 'That code is not right. Try again.');
  const r = await api('/api/auth/otp', { method: 'POST', body: { code } });
  if (!r.ok) { form.code.value = ''; return show(err, r.status === 429 ? errorText(r) : 'That code is not right. Try again.'); }
  location.href = safeNext('/account');
});
