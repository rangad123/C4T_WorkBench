import { show } from '/assets/common.js';
import { signIn } from '/assets/auth-shared.js';

const form = document.getElementById('plain-login');
const err = document.getElementById('plain-login-error');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  show(err, '');
  const msg = await signIn(form.email.value, form.password.value);
  if (msg) show(err, msg);
});
