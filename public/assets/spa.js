import { api, el, listOf, show, errorText, requireSignIn } from '/assets/common.js';

const view = document.getElementById('spa-view');
const err = document.getElementById('spa-error');
const ok = document.getElementById('spa-ok');
const title = document.getElementById('spa-title');

// Links inside the area use pushState so moving between views never reloads; Back fires popstate.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  if (location.hash !== a.getAttribute('href')) history.pushState(null, '', a.getAttribute('href'));
  route();
});
window.addEventListener('popstate', route);

function go(hash) { history.pushState(null, '', hash); route(); }
function setTitle(t) { title.textContent = t; document.title = t + ' — Practice Store'; title.focus(); }

async function dashboard() {
  setTitle('Dashboard');
  view.replaceChildren(el('p', { role: 'status' }, 'Loading…'));
  const [n, o] = await Promise.all([api('/api/notes'), api('/api/orders')]);
  view.replaceChildren(el('dl', { 'data-testid': 'spa-dashboard' },
    el('dt', {}, 'Notes'), el('dd', { 'data-testid': 'dashboard-notes' }, n.ok ? String(listOf(n.data, 'notes').length) : '—'),
    el('dt', {}, 'Orders'), el('dd', { 'data-testid': 'dashboard-orders' }, o.ok ? String(listOf(o.data, 'orders').length) : '—')));
}

function noteForm(note = {}) {
  const f = el('form', { class: 'form-wide', novalidate: true, 'data-testid': 'note-form' },
    el('div', { class: 'field' }, el('label', { for: 'note-title' }, 'Title'),
      el('input', { id: 'note-title', name: 'title', type: 'text', required: true, maxlength: '80', value: note.title || '', 'aria-describedby': 'note-title-error', 'data-testid': 'note-title' }),
      el('p', { id: 'note-title-error', class: 'field-error', hidden: true })),
    el('div', { class: 'field' }, el('label', { for: 'note-body' }, 'Body'),
      el('textarea', { id: 'note-body', name: 'body', rows: '5', maxlength: '2000', 'aria-describedby': 'note-body-hint', 'data-testid': 'note-body' }, note.body || ''),
      el('p', { id: 'note-body-hint', class: 'hint' }, 'At most 2,000 characters.')),
    el('button', { type: 'submit', class: 'btn btn-primary', 'data-testid': 'note-save' }, note.id ? 'Save note' : 'Create note'));
  return f;
}
function titleCheck(f) {
  const t = f.title.value.trim();
  const out = f.querySelector('#note-title-error');
  const msg = t.length >= 1 && t.length <= 80 ? '' : 'Enter a title of 1 to 80 characters.';
  out.textContent = msg; out.hidden = !msg;
  if (msg) f.title.setAttribute('aria-invalid', 'true'); else f.title.removeAttribute('aria-invalid');
  return !msg;
}

async function notes() {
  setTitle('Notes');
  const r = await api('/api/notes');
  if (!r.ok) return show(err, errorText(r, 'Notes could not be loaded.'));
  const list = listOf(r.data, 'notes');
  const f = noteForm();
  f.title.addEventListener('blur', () => titleCheck(f));
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); show(err, ''); show(ok, '', 'ok');
    if (!titleCheck(f)) return f.title.focus();
    const res = await api('/api/notes', { method: 'POST', body: { title: f.title.value.trim(), body: f.body.value } });
    if (!res.ok) return show(err, errorText(res));
    show(ok, 'Note created.', 'ok');
    notes();
  });
  view.replaceChildren(
    list.length ? el('ul', { class: 'note-list', 'data-testid': 'note-list' }, list.map((n) => el('li', { 'data-testid': 'note-item' },
      el('a', { href: '#/notes/' + encodeURIComponent(n.id) }, n.title), ' ',
      el('span', { class: 'status' }, n.access || n.role || (n.owner === false ? 'reader' : 'owner'))))) : el('p', {}, 'No notes yet.'),
    el('h2', {}, 'New note'), f);
}

async function note(id) {
  const r = await api('/api/notes/' + encodeURIComponent(id));
  if (!r.ok) {
    setTitle(r.status === 404 ? 'Note not found' : 'Note could not be opened');
    view.replaceChildren(el('p', {}, el('a', { href: '#/notes' }, 'Back to notes')));
    return;
  }
  const n = r.data?.note || r.data;
  setTitle(n.title);
  const isReader = (n.access || n.role) === 'reader';
  const parts = [el('p', { class: 'muted' }, isReader ? 'Shared with you (read only).' : 'You own this note.')];
  if (isReader) {
    parts.push(el('div', { 'data-testid': 'note-view' }, el('p', { class: 'note-body' }, n.body || '')));
  } else {
    const f = noteForm(n);
    f.title.addEventListener('blur', () => titleCheck(f));
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); show(err, ''); show(ok, '', 'ok');
      if (!titleCheck(f)) return f.title.focus();
      const res = await api('/api/notes/' + encodeURIComponent(n.id), { method: 'PATCH', body: { title: f.title.value.trim(), body: f.body.value } });
      if (!res.ok) return show(err, errorText(res));
      show(ok, 'Note saved.', 'ok');
      setTitle(f.title.value.trim());
    });
    const del = el('button', { type: 'button', class: 'btn btn-danger', 'data-testid': 'note-delete' }, 'Delete note');
    del.addEventListener('click', async () => {
      show(err, '');
      const res = await api('/api/notes/' + encodeURIComponent(n.id), { method: 'DELETE' });
      if (!res.ok) return show(err, errorText(res));
      show(ok, 'Note deleted.', 'ok');
      go('#/notes');
    });
    const share = el('form', { class: 'row form-wide', novalidate: true, 'data-testid': 'share-form' },
      el('div', { class: 'field' }, el('label', { for: 'share-email' }, 'Share with (email)'),
        el('input', { id: 'share-email', name: 'email', type: 'email', required: true, 'data-testid': 'share-email' })),
      el('div', { class: 'field' }, el('button', { type: 'submit', class: 'btn', 'data-testid': 'share-submit' }, 'Share')));
    share.addEventListener('submit', async (e) => {
      e.preventDefault(); show(err, ''); show(ok, '', 'ok');
      const email = share.email.value.trim();
      const res = await api('/api/notes/' + encodeURIComponent(n.id) + '/share', { method: 'POST', body: { email } });
      if (!res.ok) return show(err, errorText(res, res.status === 404 ? 'There is no account with this email.' : undefined));
      show(ok, `Shared with ${email}.`, 'ok');
      share.reset();
    });
    parts.push(f, el('h2', {}, 'Share'), share, el('h2', {}, 'Delete'), del);
  }
  parts.push(el('p', {}, el('a', { href: '#/notes' }, 'Back to notes')));
  view.replaceChildren(...parts);
}

async function route() {
  show(err, '');
  const hash = location.hash || '#/dashboard';
  const m = hash.match(/^#\/notes\/(.+)$/);
  if (m) return note(decodeURIComponent(m[1]));
  if (hash === '#/notes') return notes();
  if (hash !== '#/dashboard') history.replaceState(null, '', '#/dashboard');
  return dashboard();
}

if (await requireSignIn()) route();
