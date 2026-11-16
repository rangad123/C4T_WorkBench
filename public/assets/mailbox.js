import { api, el, listOf, show, errorText } from '/assets/common.js';

const to = new URLSearchParams(location.search).get('to') || '';
const input = document.getElementById('mailbox-to');
const status = document.getElementById('mailbox-status');
input.value = to;
if (to) {
  const r = await api('/api/mailbox?to=' + encodeURIComponent(to));
  if (!r.ok) show(document.getElementById('mailbox-error'), errorText(r, 'The mailbox could not be loaded.'));
  else {
    const msgs = listOf(r.data, 'messages')
      .slice().sort((a, b) => new Date(b.at || b.time || b.sentAt || 0) - new Date(a.at || a.time || a.sentAt || 0));
    status.textContent = msgs.length ? `${msgs.length} message${msgs.length === 1 ? '' : 's'} for ${to}.` : `No messages for ${to}.`;
    document.getElementById('mailbox-wrap').hidden = !msgs.length;
    document.getElementById('mailbox-rows').replaceChildren(...msgs.map((m) => {
      const at = m.at || m.time || m.sentAt;
      return el('tr', { 'data-testid': 'mail-row' },
        el('td', {}, at ? new Date(at).toLocaleString() : ''),
        el('td', {}, m.subject || ''),
        el('td', {}, m.code ? el('code', { 'data-testid': 'mail-code' }, m.code) : '—'),
        el('td', {}, m.link ? el('a', { href: m.link, 'data-testid': 'mail-link' }, 'Open link') : '—'));
    }));
  }
} else status.textContent = 'Enter an address to open its inbox.';
