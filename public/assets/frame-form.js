const form = document.getElementById('frame-form');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  document.getElementById('frame-result').textContent = 'Form in frame sent';
  form.reset();
});
