import { api, errorText, safeNext } from '/assets/common.js';

// Signs in; returns an error message, or navigates away on success / second step.
export async function signIn(email, password, remember = false) {
  if (!email.trim() || !password) return 'Enter your email and password.';
  const r = await api('/api/auth/login', { method: 'POST', body: { email: email.trim(), password, remember } });
  if (r.status === 401) return errorText(r, 'Invalid email or password.');
  if (!r.ok) return errorText(r, r.status === 429 ? 'Too many sign-in attempts. Try again in a minute.' : 'Invalid email or password.');
  const d = r.data || {};
  const next = safeNext('/account');
  const step = d.otpRequired || d.otp || d.next === 'otp' || d.step === 'otp' || r.status === 202;
  if (step) {
    const method = d.method || d.otpMethod || (typeof d.otp === 'string' ? d.otp : '') || '';
    const u = new URLSearchParams({ next });
    if (method) u.set('method', method);
    if (method === 'email') u.set('to', email.trim());
    location.href = '/otp?' + u;
    return '';
  }
  location.href = next;
  return '';
}
