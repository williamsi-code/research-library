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

const KINDS = { web: 'Web page', pdf: 'PDF', text: 'Text', scan: 'Photos', video: 'Video', audio: 'Audio' };
export const kindLabel = (k) => KINDS[k] || k;

// Shrinks phone photos before upload so they're quick to send and within AI size limits.
export async function shrinkImage(file, maxSide = 2200) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 3.5 * 1024 * 1024 && file.type === 'image/jpeg') return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // formats the browser can't decode are sent as they are
  }
}
