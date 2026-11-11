import { prisma } from '../db.js';
import { chunkText } from './chunk.js';
import { embed, embeddingsEnabled, toVector } from './ai.js';

// One source at a time, in the background, so saving feels instant.
let queue = Promise.resolve();

export function enqueue(sourceId) {
  queue = queue.then(() => processSource(sourceId)).catch((e) => console.error('ingest', e));
  return queue;
}

async function processSource(id) {
  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) return;
  await prisma.source.update({ where: { id }, data: { processing: 'processing', processingError: null } });
  try {
    await prisma.chunk.deleteMany({ where: { sourceId: id } });
    const chunks = chunkText(source.text, Array.isArray(source.segments) ? source.segments : []);
    if (chunks.length) {
      await prisma.chunk.createMany({ data: chunks.map((c) => ({ ...c, sourceId: id })) });
    }

    let note = null;
    if (!embeddingsEnabled()) {
      note = 'Keyword search only. Add OPENAI_API_KEY to search by meaning.';
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
    where: { processing: { in: ['pending', 'processing'] } },
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
    },
  });
  enqueue(source.id);
  return source;
}
