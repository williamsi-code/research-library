export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth')) {
    window.dispatchEvent(new Event('rl:signed-out'));
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const STATUSES = [
  ['to_read', 'To read'],
  ['reading', 'Reading'],
  ['read', 'Read'],
  ['archived', 'Archived'],
];
export const statusLabel = (s) => (STATUSES.find(([k]) => k === s) || [s, s])[1];

export function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export const parseTags = (s) =>
  [...new Set(String(s || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
