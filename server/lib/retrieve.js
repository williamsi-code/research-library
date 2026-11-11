import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { embed, embeddingsEnabled, toVector } from './ai.js';

// Combines keyword search (exact words and "quoted phrases") with semantic search
// (similar meaning), merged by reciprocal rank fusion.
//   mode 'exact' — web-search style query: all words must appear (used by Search)
//   mode 'any'   — any of the words may appear (used by Ask, where questions are long)
export async function hybridSearch(query, { topicId, sourceIds, limit = 12, mode = 'exact' } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];

  const filters = [];
  if (topicId) filters.push(Prisma.sql`s."topicId" = ${topicId}`);
  if (sourceIds?.length) filters.push(Prisma.sql`c."sourceId" IN (${Prisma.join(sourceIds)})`);
  const where = filters.length ? Prisma.sql`AND ${Prisma.join(filters, ' AND ')}` : Prisma.empty;

  const rankings = [];

  if (embeddingsEnabled()) {
    try {
      const [vector] = await embed([q]);
      const vec = toVector(vector);
      const rows = await prisma.$queryRaw`
        SELECT c.id FROM "Chunk" c JOIN "Source" s ON s.id = c."sourceId"
        WHERE c.embedding IS NOT NULL ${where}
        ORDER BY c.embedding <=> ${vec}::vector
        LIMIT 30`;
      rankings.push(rows.map((r) => r.id));
    } catch (e) {
      console.warn('Semantic search skipped:', e.message);
    }
  }

  let tsquery;
  if (mode === 'any') {
    const words = [...new Set((q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []))].slice(0, 30);
    if (words.length) tsquery = Prisma.sql`to_tsquery('english', ${words.join(' | ')})`;
  } else {
    tsquery = Prisma.sql`websearch_to_tsquery('english', ${q})`;
  }
  if (tsquery) {
    try {
      const rows = await prisma.$queryRaw`
        SELECT c.id FROM "Chunk" c JOIN "Source" s ON s.id = c."sourceId"
        WHERE to_tsvector('english', c.text) @@ ${tsquery} ${where}
        ORDER BY ts_rank(to_tsvector('english', c.text), ${tsquery}) DESC
        LIMIT 30`;
      rankings.push(rows.map((r) => r.id));
    } catch (e) {
      console.warn('Keyword search skipped:', e.message);
    }
  }

  const scores = new Map();
  for (const list of rankings) {
    list.forEach((id, rank) => scores.set(id, (scores.get(id) || 0) + 1 / (60 + rank)));
  }
  const ids = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  if (!ids.length) return [];

  const chunks = await prisma.chunk.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      text: true,
      location: true,
      startPos: true,
      endPos: true,
      source: { select: { id: true, title: true, url: true, kind: true, author: true } },
    },
  });
  const byId = new Map(chunks.map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
