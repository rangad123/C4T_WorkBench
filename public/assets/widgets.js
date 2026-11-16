import { toast, el } from '/assets/common.js';

const $ = (id) => document.getElementById(id);
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Keeps Tab inside `box`.
function trapFocus(box, e) {
  if (e.key !== 'Tab') return;
  const items = [...box.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// Native <dialog>: showModal gives Escape and the focus trap; focus returns to the opener on close.
const nativeDialog = $('native-dialog');
$('open-native-dialog').addEventListener('click', () => nativeDialog.showModal());
nativeDialog.addEventListener('keydown', (e) => trapFocus(nativeDialog, e));
nativeDialog.addEventListener('close', () => {
  $('dialog-result').textContent = nativeDialog.returnValue === 'ok'
    ? 'Subscribed (not really).' : 'Native dialog closed.';
  $('open-native-dialog').focus();
});

// role="dialog" modal built by hand.
const backdrop = $('aria-dialog-backdrop');
const ariaDialog = $('aria-dialog');
function closeAria(result) {
  backdrop.hidden = true;
  $('dialog-result').textContent = result;
  $('open-aria-dialog').focus();
}
$('open-aria-dialog').addEventListener('click', () => { backdrop.hidden = false; $('aria-dialog-yes').focus(); });
$('aria-dialog-yes').addEventListener('click', () => closeAria('You chose: Yes, continue.'));
$('aria-dialog-no').addEventListener('click', () => closeAria('You chose: No.'));
ariaDialog.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.stopPropagation(); closeAria('Custom dialog closed.'); }
  trapFocus(ariaDialog, e);
});

// Menu button with role="menu": arrows move, Enter/Space choose, Escape closes.
const menuBtn = $('menu-button');
const menu = $('actions-menu');
const items = [...menu.querySelectorAll('[role="menuitem"]')];
function openMenu(index = 0) {
  menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); items[index].focus();
}
function closeMenu(focusButton = true) {
  menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); if (focusButton) menuBtn.focus();
}
function choose(item) { $('menu-result').textContent = 'You chose: ' + item.textContent; closeMenu(); }
menuBtn.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
menuBtn.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(0); }
  if (e.key === 'ArrowUp') { e.preventDefault(); openMenu(items.length - 1); }
});
menu.addEventListener('keydown', (e) => {
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
  else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (i >= 0) choose(items[i]); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
  else if (e.key === 'Tab') closeMenu(false);
});
for (const item of items) item.addEventListener('click', () => choose(item));
document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn) closeMenu(false); });

// Tabs with arrow keys.
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(t.getAttribute('aria-controls')).hidden = !on;
  }
  tab.focus();
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(tab);
    if (e.key === 'ArrowRight') { e.preventDefault(); selectTab(tabs[(i + 1) % tabs.length]); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); selectTab(tabs[(i - 1 + tabs.length) % tabs.length]); }
    if (e.key === 'Home') { e.preventDefault(); selectTab(tabs[0]); }
    if (e.key === 'End') { e.preventDefault(); selectTab(tabs[tabs.length - 1]); }
  });
}

// Accordion.
for (const btn of document.querySelectorAll('.accordion button[aria-controls]')) {
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    $(btn.getAttribute('aria-controls')).hidden = !open;
  });
}

// Sortable table.
const table = $('sort-table');
for (const btn of table.querySelectorAll('thead button')) {
  btn.addEventListener('click', () => {
    const th = btn.closest('th');
    const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
    for (const other of table.querySelectorAll('thead th')) other.setAttribute('aria-sort', 'none');
    th.setAttribute('aria-sort', dir);
    const key = Number(btn.dataset.key);
    const num = !!btn.dataset.num;
    const body = table.tBodies[0];
    const rows = [...body.rows].sort((a, b) => {
      const x = a.cells[key].textContent, y = b.cells[key].textContent;
      const c = num ? Number(x) - Number(y) : x.localeCompare(y);
      return dir === 'ascending' ? c : -c;
    });
    body.append(...rows);
  });
}

// Toast (gone after 4 s) and tooltip (hover and focus, Escape hides).
$('show-toast').addEventListener('click', () => toast('Saved! This toast disappears in 4 seconds.'));
const tipBtn = $('tooltip-button');
const tip = $('tooltip-1');
const showTip = () => { tip.hidden = false; };
const hideTip = () => { tip.hidden = true; };
tipBtn.addEventListener('mouseenter', showTip);
tipBtn.addEventListener('mouseleave', hideTip);
tipBtn.addEventListener('focus', showTip);
tipBtn.addEventListener('blur', hideTip);
tipBtn.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });

// Drag and drop, with a Move button as the keyboard alternative.
const todo = $('dnd-todo');
const done = $('dnd-done');
const dndStatus = $('dnd-status');
function moveToDone(card) {
  if (card.parentElement === done) return;
  card.querySelector('[data-move]')?.remove();
  done.append(card);
  dndStatus.textContent = `Moved "${card.querySelector('span').textContent}" to Done.`;
}
for (const card of todo.querySelectorAll('.item')) {
  card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', card.id); e.dataTransfer.effectAllowed = 'move'; });
  card.querySelector('[data-move]').addEventListener('click', () => moveToDone(card));
}
done.addEventListener('dragover', (e) => { e.preventDefault(); done.classList.add('over'); });
done.addEventListener('dragleave', () => done.classList.remove('over'));
done.addEventListener('drop', (e) => {
  e.preventDefault();
  done.classList.remove('over');
  const card = document.getElementById(e.dataTransfer.getData('text/plain'));
  if (card) moveToDone(card);
});

// Element that appears about 6 seconds after load.
setTimeout(() => {
  $('late-slot').append(el('p', { class: 'notice notice-info', 'data-testid': 'delayed-element', id: 'delayed-element' }, 'I appeared late'));
}, 6000);

// Live region announcing the press count.
let presses = 0;
$('press-me').addEventListener('click', () => {
  presses += 1;
  $('press-count').textContent = `Pressed ${presses} time${presses === 1 ? '' : 's'}.`;
});
