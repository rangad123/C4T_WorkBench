import { show, changeOn } from '/assets/common.js';
import { signIn } from '/assets/auth-shared.js';

const form = document.getElementById('login-form');
const err = document.getElementById('login-error');

// CHANGE_UI: the button text, the email field's test id and the field order change (off = page as served).
if (changeOn('CHANGE_UI')) {
  form.querySelector('[data-testid="login-submit"]').textContent = 'Log in';
  const email = document.getElementById('login-email');
  email.dataset.testid = 'signin-email';
  document.getElementById('login-password').closest('.field').after(email.closest('.field'));
}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  show(err, '');
  const msg = await signIn(form.email.value, form.password.value, form.remember.checked);
  if (msg) { show(err, msg); form.password.value = ''; }
});
