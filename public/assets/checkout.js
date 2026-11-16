import { requireSignIn } from '/assets/common.js';

const form = document.getElementById('checkout-form');
const fields = { 'ship-name': 'Enter a name.', 'ship-street': 'Enter a street.', 'ship-city': 'Enter a city.', 'ship-postcode': 'Enter a postcode.' };
let saved = {};
try { saved = JSON.parse(sessionStorage.getItem('ps_checkout') || '{}'); } catch { /* ignore */ }
for (const k of ['name', 'street', 'city', 'postcode']) if (saved[k]) form[k].value = saved[k];
if (saved.shipping === 'express') form.querySelector('#ship-express').checked = true;

function validate(id) {
  const input = document.getElementById(id);
  const msg = input.value.trim() ? '' : fields[id];
  const out = document.getElementById(id + '-error');
  out.textContent = msg; out.hidden = !msg;
  if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  return !msg;
}
for (const id of Object.keys(fields)) document.getElementById(id).addEventListener('blur', () => validate(id));

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const bad = Object.keys(fields).filter((id) => !validate(id));
  if (bad.length) return document.getElementById(bad[0]).focus();
  const data = { name: form.name.value.trim(), street: form.street.value.trim(), city: form.city.value.trim(), postcode: form.postcode.value.trim(),
    shipping: form.querySelector('input[name="shipping"]:checked').value };
  try { sessionStorage.setItem('ps_checkout', JSON.stringify(data)); } catch { /* ignore */ }
  location.href = '/checkout/review?' + new URLSearchParams(data);
});

requireSignIn();
