// The fake captcha can never be solved: ticking the box only reports a failed check, and submit stays disabled.
const box = document.getElementById('c-robot');
const status = document.getElementById('captcha-status');
box.addEventListener('change', () => {
  setTimeout(() => {
    box.checked = false;
    status.textContent = 'Verification failed. Please try again.';
    status.hidden = false;
  }, 800);
});
document.getElementById('captcha-form').addEventListener('submit', (e) => {
  e.preventDefault();
  status.textContent = 'Please complete the captcha.';
  status.hidden = false;
});
