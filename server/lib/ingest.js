import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { chunkText, makeLocator } from './chunk.js';
import { transcribePhotos, transcribeScannedPdf, transcribeAudioFile } from './transcribe.js';
import { embed, embeddingsEnabled, toVector } from './ai.js';

// One source at a time, in the background, so saving feels instant.
let queue = Promise.resolve();

export function enqueue(sourceId) {
  queue = queue.then(() => processSource(sourceId)).catch((e) => console.error('ingest', e));
  return queue;
}

async function transcribePending(source) {
  const pending = source.pendingOcr;
  const onProgress = (message) =>
    prisma.source.update({ where: { id: source.id }, data: { processing: 'transcribing', processingError: message } });
  const run =
    pending.type === 'images' ? transcribePhotos :
    pending.type === 'pdf' ? transcribeScannedPdf :
    pending.type === 'audio' ? transcribeAudioFile :
    null;
  if (!run) throw new Error(`Unknown transcription type: ${pending.type}`);
  const result = await run(pending, onProgress);
  if (!result.text) throw new Error('No readable text was found.');

  await prisma.source.update({
    where: { id: source.id },
    data: { text: result.text, segments: result.segments, pendingOcr: Prisma.DbNull, processing: 'processing', processingError: null },
  });
  // Passages you marked on paper become highlights.
  const locate = makeLocator(result.text, result.segments);
  for (const quote of result.marked || []) {
    const idx = result.text.indexOf(quote);
    await prisma.highlight.create({
      data: {
        sourceId: source.id,
        quote,
        startPos: idx >= 0 ? idx : null,
        endPos: idx >= 0 ? idx + quote.length : null,
        location: idx >= 0 ? locate(idx) : null,
        note: 'Marked on the page',
      },
    });
  }
  return result.note || null;
}

async function processSource(id) {
  let source = await prisma.source.findUnique({ where: { id } });
  if (!source) return;
  await prisma.source.update({ where: { id }, data: { processing: 'processing', processingError: null } });
  try {
    let transcriptNote = null;
    if (source.pendingOcr) {
      transcriptNote = await transcribePending(source);
      source = await prisma.source.findUnique({ where: { id } });
    }
    await prisma.chunk.deleteMany({ where: { sourceId: id } });
    const chunks = chunkText(source.text, Array.isArray(source.segments) ? source.segments : []);
    if (chunks.length) {
      await prisma.chunk.createMany({ data: chunks.map((c) => ({ ...c, sourceId: id })) });
    }

    let note = transcriptNote;
    if (!embeddingsEnabled()) {
      note = [transcriptNote, 'Keyword search only. Add OPENAI_API_KEY to search by meaning.'].filter(Boolean).join(' ');
    } else if (chunks.length) {
      const rows = await prisma.chunk.findMany({
        where: { sourceId: id },
        orderBy: { idx: 'asc' },
        select: { id: true, text: true },
      });
      for (let i = 0; i < rows.length; i += 64) {
        const batch = rows.slice(i, i + 64);
        const vectors = await embed(batch.map((r) => `${source.title}\n\n${r.text}`));
        for (let j = 0; j < batch.length; j++) {
          await prisma.$executeRaw`UPDATE "Chunk" SET embedding = ${toVector(vectors[j])}::vector WHERE id = ${batch[j].id}`;
        }
      }
    }
    await prisma.source.update({ where: { id }, data: { processing: 'ready', processingError: note } });
  } catch (e) {
    console.error(`Processing failed for ${id}:`, e);
    await prisma.source.update({
      where: { id },
      data: { processing: 'failed', processingError: String(e.message || e).slice(0, 500) },
    });
  }
}

export async function resumePending() {
  const pending = await prisma.source.findMany({
    where: { processing: { in: ['pending', 'processing', 'transcribing'] } },
    select: { id: true },
  });
  pending.forEach((s) => enqueue(s.id));
  if (pending.length) console.log(`Resuming processing for ${pending.length} source(s)`);
}

export function cleanTags(tags) {
  if (!tags) return [];
  const list = Array.isArray(tags) ? tags : String(tags).split(',');
  return [...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 30);
}

export async function createSource(fields) {
  const source = await prisma.source.create({
    data: {
      title: fields.title || 'Untitled',
      author: fields.author || null,
      siteName: fields.siteName || null,
      kind: fields.kind,
      url: fields.url || null,
      publishedAt: fields.publishedAt || null,
      filePath: fields.filePath || null,
      fileName: fields.fileName || null,
      mimeType: fields.mimeType || null,
      text: fields.text || '',
      segments: fields.segments || [],
      excerpt: fields.excerpt || null,
      whySaved: fields.whySaved || null,
      tags: cleanTags(fields.tags),
      topicId: fields.topicId || null,
      pendingOcr: fields.pendingOcr || undefined,
      processing: fields.pendingOcr ? 'transcribing' : 'pending',
      processingError: fields.pendingOcr ? 'Waiting to start reading' : null,
    },
  });
  enqueue(source.id);
  return source;
}
