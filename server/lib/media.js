import { httpError } from './ai.js';

export function formatTime(totalSeconds) {
  const t = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function youtubeId(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{6,})/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}

// Groups timed fragments into readable paragraphs, each starting with a time marker
// segment so highlights and AI citations show "12:34" and link to that moment.
export function buildTimedText(items, { paragraphSeconds = 45, maxChars = 700 } = {}) {
  let text = '';
  const segments = [];
  let para = null;
  const flush = () => {
    if (!para || !para.parts.length) return;
    if (text) text += '\n\n';
    segments.push({ start: text.length, end: text.length, label: formatTime(para.start), kind: 'time', seconds: Math.floor(para.start) });
    text += para.parts.join(' ').replace(/\s+/g, ' ').trim();
  };
  for (const it of items) {
    const t = String(it.text || '').replace(/\s+/g, ' ').trim();
    if (!t || /^\[(music|applause|laughter)\]$/i.test(t)) continue;
    const len = para ? para.parts.join(' ').length : 0;
    if (!para || it.start - para.start >= paragraphSeconds || len > maxChars) {
      flush();
      para = { start: it.start, parts: [] };
    }
    para.parts.push(t);
  }
  flush();
  return { text, segments };
}

// Reads transcripts copied from YouTube's "Show transcript" panel, podcast sites,
// or subtitle-style text: timestamps on their own line or at the start of a line.
export function parsePastedTranscript(raw) {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
  const tsRe = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[.,]\d+)?\]?\s*(?:-->.*)?(.*)$/;
  const items = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(tsRe);
    if (m) {
      const parts = m[1].split(':').map(Number);
      const seconds = parts.reduce((acc, n) => acc * 60 + n, 0);
      current = { start: seconds, text: m[2].trim() };
      items.push(current);
    } else if (line.trim() && !/^\d+$/.test(line.trim())) {
      if (current) current.text += ' ' + line.trim();
      else items.push((current = { start: 0, text: line.trim() }));
    }
  }
  const timed = items.filter((i) => i.text);
  if (timed.length < 2) return null; // no timestamps found
  return buildTimedText(timed);
}

const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  cookie: 'CONSENT=YES+1',
};

// Best effort: YouTube often blocks transcript requests from cloud servers.
export async function fetchYoutube(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) throw httpError(502, 'YouTube didn’t respond. Paste the transcript instead.');
  const html = await res.text();
  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|<\/script>)/s);
  let player = null;
  try {
    player = m ? JSON.parse(m[1]) : null;
  } catch {}
  const title = player?.videoDetails?.title || html.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(/ - YouTube$/, '') || 'YouTube video';
  const author = player?.videoDetails?.author || null;
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const pick =
    tracks.find((t) => t.languageCode?.startsWith('en') && t.kind !== 'asr') ||
    tracks.find((t) => t.languageCode?.startsWith('en')) ||
    tracks[0];
  if (!pick?.baseUrl) {
    const err = httpError(422, 'YouTube didn’t share a transcript for this video with the server. Open the video, choose “Show transcript”, copy it, and paste it in.');
    err.title = title;
    throw err;
  }
  const capRes = await fetch(`${pick.baseUrl}&fmt=json3`, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const data = capRes?.ok ? await capRes.json().catch(() => null) : null;
  const items = (data?.events || [])
    .filter((e) => e.segs)
    .map((e) => ({ start: (e.tStartMs || 0) / 1000, text: e.segs.map((s) => s.utf8 || '').join('') }));
  if (!items.length) {
    const err = httpError(422, 'YouTube blocked the transcript download. Open the video, choose “Show transcript”, copy it, and paste it in.');
    err.title = title;
    throw err;
  }
  return { title, author, ...buildTimedText(items) };
}
