import { api, show, errorText } from '/assets/common.js';

const form = document.getElementById('signup-form');
const err = document.getElementById('signup-error');
const PW = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Each check returns the message to show, or '' when the field is valid. Texts match REQUIREMENTS.md section 4.
const checks = {
  'su-name': (v) => (v.trim().length >= 2 && v.trim().length <= 60 ? '' : 'Enter a name of 2 to 60 characters.'),
  'su-email': (v) => (EMAIL.test(v.trim()) ? '' : 'Enter a valid email address.'),
  'su-password': (v) => (PW.test(v) ? '' : 'Use at least 8 characters with a letter, a number and a symbol.'),
  'su-confirm': (v) => (v && v === form.password.value ? '' : 'The passwords do not match.'),
  'su-age': (v) => (/^\d+$/.test(v.trim()) && +v >= 18 && +v <= 120 ? '' : 'Enter an age from 18 to 120.'),
  'su-country': (v) => (v ? '' : 'Choose a country.'),
  'su-terms': (_v, input) => (input.checked ? '' : 'You must accept the terms.'),
};

function validate(id) {
  const input = document.getElementById(id);
  const msg = checks[id](input.value, input);
  const out = document.getElementById(id + '-error');
  out.textContent = msg;
  out.hidden = !msg;
  if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  return !msg;
}

for (const id of Object.keys(checks)) {
  const input = document.getElementById(id);
  input.addEventListener('blur', () => validate(id));
  input.addEventListener('change', () => { if (input.getAttribute('aria-invalid')) validate(id); });
}
form.password.addEventListener('blur', () => { if (form.confirm.value) validate('su-confirm'); });

const params = new URLSearchParams(location.search);
if (params.get('name')) form.name.value = params.get('name');
if (params.get('email')) form.email.value = params.get('email');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  show(err, '');
  const bad = Object.keys(checks).filter((id) => !validate(id));
  if (bad.length) { document.getElementById(bad[0]).focus(); return; }
  const body = {
    name: form.name.value.trim(), email: form.email.value.trim(), password: form.password.value, confirmPassword: form.confirm.value,
    age: Number(form.age.value), country: form.country.value, terms: form.terms.checked,
  };
  const r = await api('/api/auth/signup', { method: 'POST', body });
  if (!r.ok) return show(err, errorText(r, r.status === 409 ? 'An account with this email already exists.' : 'Sign-up failed. Check the fields and try again.'));
  location.href = '/account';
});
