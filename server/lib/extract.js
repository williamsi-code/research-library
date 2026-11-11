import dns from 'node:dns/promises';
import net from 'node:net';
import jsdom from 'jsdom';
import readability from '@mozilla/readability';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { httpError } from './ai.js';

const { JSDOM, VirtualConsole } = jsdom;
const { Readability } = readability;

// Segments describe structure inside the stored text without adding characters to it:
//   { start, end, label, kind: 'heading' | 'page' }
// Keeping the text untouched means highlight offsets always line up with what's on screen.

export function normalizeText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------- Web pages ----------

function isPrivateAddress(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export async function fetchPage(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw httpError(400, 'That doesn’t look like a valid web address.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw httpError(400, 'Only http and https links can be saved.');
  const { address } = await dns.lookup(url.hostname).catch(() => {
    throw httpError(400, `Couldn’t find the site ${url.hostname}.`);
  });
  if (isPrivateAddress(address)) throw httpError(400, 'Links to private network addresses can’t be saved.');

  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ResearchLibrary/1.0; personal reading tool)',
      accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  }).catch((e) => {
    throw httpError(502, `Couldn’t load the page: ${e.message}`);
  });
  if (!res.ok) throw httpError(502, `The site answered with an error (${res.status}). If it needs a login, use the bookmarklet instead.`);

  const type = res.headers.get('content-type') || '';
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > 25 * 1024 * 1024) throw httpError(413, 'That page is larger than 25 MB.');
  if (type.includes('pdf') || url.pathname.toLowerCase().endsWith('.pdf')) {
    return { kind: 'pdf', buffer, finalUrl: res.url };
  }
  return { kind: 'html', html: buffer.toString('utf8'), finalUrl: res.url };
}

function meta(doc, selectors) {
  for (const sel of selectors) {
    const v = doc.querySelector(sel)?.getAttribute('content');
    if (v && v.trim()) return v.trim();
  }
  return null;
}

const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,figcaption,dt,dd,td,th';

export function htmlToText(html) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { virtualConsole: new VirtualConsole() });
  const body = dom.window.document.body;
  const parts = [];
  for (const el of body.querySelectorAll(BLOCK_SELECTOR)) {
    if (el.parentElement?.closest(BLOCK_SELECTOR)) continue; // nested inside another block
    const tag = el.tagName.toLowerCase();
    let t = tag === 'pre' ? el.textContent.replace(/\n{3,}/g, '\n\n').trim() : el.textContent.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (tag === 'li') t = `• ${t}`;
    parts.push({ text: t, heading: /^h[1-6]$/.test(tag) });
  }
  if (!parts.length) {
    const t = normalizeText(body.textContent || '');
    return { text: t, segments: [] };
  }
  let text = '';
  const segments = [];
  for (const p of parts) {
    if (text) text += '\n\n';
    if (p.heading) segments.push({ start: text.length, end: text.length + p.text.length, label: p.text.slice(0, 80), kind: 'heading' });
    text += p.text;
  }
  return { text, segments };
}

export function extractFromHtml(html, url) {
  let pageUrl = 'https://example.invalid/';
  try {
    if (url) pageUrl = new URL(url).href;
  } catch {}
  const dom = new JSDOM(html, { url: pageUrl, virtualConsole: new VirtualConsole() });
  const doc = dom.window.document;

  const metaAuthor = meta(doc, ['meta[name="author"]', 'meta[property="article:author"]', 'meta[name="parsely-author"]']);
  const metaDate = meta(doc, ['meta[property="article:published_time"]', 'meta[name="date"]', 'meta[name="pubdate"]', 'meta[itemprop="datePublished"]']);
  const metaSite = meta(doc, ['meta[property="og:site_name"]']);
  const docTitle = doc.title;

  let article = null;
  try {
    article = new Readability(doc).parse();
  } catch {}

  const { text, segments } = htmlToText(article?.content || doc.body?.innerHTML || '');
  return {
    title: (article?.title || docTitle || url || 'Untitled page').trim().slice(0, 300),
    author: article?.byline || metaAuthor || null,
    siteName: article?.siteName || metaSite || (url ? safeHost(url) : null),
    publishedAt: (article?.publishedTime || metaDate || '').slice(0, 40) || null,
    excerpt: article?.excerpt?.slice(0, 500) || null,
    text,
    segments,
  };
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ---------- PDFs ----------

export async function extractFromPdf(buffer, fallbackTitle) {
  const pages = [];
  const renderPage = async (pageData) => {
    const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    let out = '';
    let lastY = null;
    for (const item of content.items) {
      const y = item.transform[5];
      const h = item.height || Math.abs(item.transform[3]) || 10;
      if (lastY === null || Math.abs(y - lastY) < 1) {
        out += item.str;
      } else {
        // Larger vertical gaps usually mean a new paragraph.
        out += Math.abs(lastY - y) > h * 1.8 ? '\n\n' : ' ';
        out += item.str;
      }
      lastY = y;
    }
    const cleaned = out
      .replace(/(\w)- (\w)/g, '$1$2') // rejoin hyphenated line breaks
      .replace(/[ \t]{2,}/g, ' ');
    pages.push(normalizeText(cleaned));
    return cleaned;
  };

  let info = {};
  try {
    const result = await pdfParse(buffer, { pagerender: renderPage });
    info = result.info || {};
  } catch (e) {
    throw httpError(400, `Couldn’t read that PDF: ${e.message}`);
  }

  let text = '';
  const segments = [];
  pages.forEach((p, i) => {
    if (text) text += '\n\n';
    segments.push({ start: text.length, end: text.length, label: `p. ${i + 1}`, kind: 'page' });
    text += p;
  });
  if (!text.replace(/\s/g, '')) {
    throw httpError(400, 'This PDF has no selectable text (it may be a scan). Scanned PDFs aren’t supported yet.');
  }
  return {
    title: (info.Title && String(info.Title).trim()) || fallbackTitle || 'Untitled PDF',
    author: (info.Author && String(info.Author).trim()) || null,
    text,
    segments,
  };
}

// ---------- Plain text / Markdown ----------

export function extractFromPlain(raw, { markdown = false } = {}) {
  const text = normalizeText(raw);
  const segments = [];
  if (markdown) {
    const re = /^#{1,6}\s+(.+)$/gm;
    let m;
    while ((m = re.exec(text))) {
      segments.push({ start: m.index, end: m.index + m[0].length, label: m[1].trim().slice(0, 80), kind: 'heading' });
    }
  }
  return { text, segments };
}
