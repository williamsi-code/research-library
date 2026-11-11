import { PDFDocument } from 'pdf-lib';
import { askClaude, transcribeAudio } from './ai.js';
import { readUpload } from './files.js';
import { normalizeText } from './extract.js';
import { buildTimedText } from './media.js';

const PAGE_PROMPT = `Transcribe the main text of this book or document page exactly as printed, in reading order.
- Keep paragraph breaks as blank lines. Rejoin words split by a hyphen at a line break.
- Leave out running headers, footers and page numbers.
- If the reader has highlighted, underlined, circled or bracketed passages by hand, copy each of those passages exactly as printed.
- If there's no readable text, leave the text empty.
Reply in exactly this format and nothing else:
<page_number>the printed page number, or nothing if none is visible</page_number>
<text>
the transcribed text
</text>
<marked>
<passage>first marked passage</passage>
</marked>`;

const between = (s, tag) => s.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? '';

async function transcribeImage(buffer, mimeType) {
  const reply = await askClaude({
    system: 'You are a careful transcriber. Output only what is printed on the page.',
    prompt: [
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') } },
      { type: 'text', text: PAGE_PROMPT },
    ],
    maxTokens: 4000,
    timeoutMs: 180_000,
  });
  const marked = [...between(reply, 'marked').matchAll(/<passage>([\s\S]*?)<\/passage>/g)].map((m) => m[1].trim()).filter(Boolean);
  return { pageNumber: between(reply, 'page_number'), text: normalizeText(between(reply, 'text')), marked };
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Returns { text, segments, marked } where segments carry page labels.
export async function transcribePhotos(pending, onProgress) {
  const pages = [];
  for (const [i, f] of pending.files.entries()) {
    await onProgress(`Reading photo ${i + 1} of ${pending.files.length}`);
    const buffer = await readUpload(f.name);
    const type = IMAGE_TYPES.includes(f.mimeType) ? f.mimeType : 'image/jpeg';
    const page = await transcribeImage(buffer, type);
    const fallback = pending.startPage ? String(Number(pending.startPage) + i) : null;
    pages.push({ ...page, label: page.pageNumber ? `p. ${page.pageNumber}` : fallback ? `p. ${fallback}` : `Photo ${i + 1}` });
  }
  return joinPages(pages);
}

export async function transcribeScannedPdf(pending, onProgress) {
  const buffer = await readUpload(pending.file);
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const total = Math.min(source.getPageCount(), 150);
  const pages = [];
  const BATCH = 4;
  for (let first = 0; first < total; first += BATCH) {
    const last = Math.min(first + BATCH, total);
    await onProgress(`Reading scanned pages ${first + 1}–${last} of ${total}`);
    const part = await PDFDocument.create();
    const copied = await part.copyPages(source, Array.from({ length: last - first }, (_, k) => first + k));
    copied.forEach((p) => part.addPage(p));
    const data = Buffer.from(await part.save()).toString('base64');
    const reply = await askClaude({
      system: 'You are a careful transcriber. Output only what is printed on the pages.',
      prompt: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
        {
          type: 'text',
          text: `This file contains ${last - first} page(s). Transcribe the main text of each page exactly as printed, in reading order. Keep paragraph breaks as blank lines, rejoin words hyphenated at line breaks, and leave out running headers, footers and page numbers.
Reply with one block per page, in order, and nothing else:
<page n="1">
text of the first page in this file
</page>`,
        },
      ],
      maxTokens: 8000,
      timeoutMs: 300_000,
    });
    const found = [...reply.matchAll(/<page n="(\d+)">([\s\S]*?)<\/page>/g)];
    for (let k = 0; k < last - first; k++) {
      const block = found.find((m) => Number(m[1]) === k + 1);
      pages.push({ label: `p. ${first + k + 1}`, text: normalizeText(block?.[2] || ''), marked: [] });
    }
  }
  const result = joinPages(pages);
  if (source.getPageCount() > total) result.note = `Only the first ${total} pages were read.`;
  return result;
}

function joinPages(pages) {
  let text = '';
  const segments = [];
  const marked = [];
  for (const p of pages) {
    if (!p.text) continue;
    if (text) text += '\n\n';
    segments.push({ start: text.length, end: text.length, label: p.label, kind: 'page' });
    text += p.text;
    marked.push(...p.marked);
  }
  return { text, segments, marked };
}

export async function transcribeAudioFile(pending, onProgress) {
  await onProgress('Transcribing the audio. Long recordings can take several minutes.');
  const buffer = await readUpload(pending.file);
  const items = await transcribeAudio(buffer, pending.fileName || pending.file, pending.mimeType);
  return { ...buildTimedText(items), marked: [] };
}
