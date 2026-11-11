import { Router } from 'express';
import { prisma } from '../db.js';
import { hybridSearch } from '../lib/retrieve.js';
import { aiEnabled, embeddingsEnabled, claudeModel, httpError } from '../lib/ai.js';

// ---------- Topics ----------
export const topicsRouter = Router();

topicsRouter.get('/', async (req, res) => {
  const topics = await prisma.topic.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { sources: true, notes: true } } },
  });
  res.json({ topics });
});

topicsRouter.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw httpError(400, 'Give the topic a name.');
  const existing = await prisma.topic.findUnique({ where: { name } });
  if (existing) return res.json({ topic: existing });
  const topic = await prisma.topic.create({ data: { name, description: req.body?.description || null } });
  res.status(201).json({ topic });
});

topicsRouter.patch('/:id', async (req, res) => {
  const data = {};
  if (req.body?.name) data.name = String(req.body.name).trim();
  if ('description' in (req.body || {})) data.description = req.body.description || null;
  const topic = await prisma.topic.update({ where: { id: req.params.id }, data });
  res.json({ topic });
});

topicsRouter.delete('/:id', async (req, res) => {
  await prisma.topic.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ---------- Search ----------
export const searchRouter = Router();

searchRouter.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ passages: [], highlights: [], notes: [] });
  const contains = { contains: q, mode: 'insensitive' };
  const [passages, highlights, notes] = await Promise.all([
    hybridSearch(q, { limit: 20, mode: 'exact', topicId: req.query.topicId || undefined }),
    prisma.highlight.findMany({
      where: { OR: [{ quote: contains }, { note: contains }] },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { source: { select: { id: true, title: true } } },
    }),
    prisma.note.findMany({
      where: { OR: [{ title: contains }, { body: contains }] },
      take: 20,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, body: true, updatedAt: true },
    }),
  ]);
  res.json({ passages, highlights, notes: notes.map((n) => ({ ...n, body: n.body.slice(0, 240) })) });
});

// ---------- Review ----------
export const reviewRouter = Router();

reviewRouter.get('/', async (req, res) => {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.highlight.findMany({
    where: {
      createdAt: { lt: twoDaysAgo },
      OR: [{ lastReviewedAt: null }, { lastReviewedAt: { lt: twoDaysAgo } }],
    },
    orderBy: [{ lastReviewedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    take: 20,
    include: { source: { select: { id: true, title: true } } },
  });
  // Shuffle so the same three don't always lead.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const total = await prisma.highlight.count();
  res.json({ highlights: candidates.slice(0, 3), total });
});

reviewRouter.post('/:id', async (req, res) => {
  const h = await prisma.highlight.findUnique({ where: { id: req.params.id } });
  if (!h) throw httpError(404, 'That highlight no longer exists.');
  const reflection = String(req.body?.reflection || '').trim();
  const stamp = new Date().toISOString().slice(0, 10);
  const note = reflection ? [h.note, `${stamp}: ${reflection}`].filter(Boolean).join('\n\n') : h.note;
  const highlight = await prisma.highlight.update({
    where: { id: h.id },
    data: { lastReviewedAt: new Date(), reviewCount: { increment: 1 }, note },
  });
  res.json({ highlight });
});

// ---------- Settings ----------
export const settingsRouter = Router();

settingsRouter.get('/', (req, res) => {
  res.json({
    ai: aiEnabled(),
    embeddings: embeddingsEnabled(),
    model: claudeModel(),
    clipToken: process.env.CLIP_TOKEN || null,
  });
});

// ---------- Export ----------
export const exportRouter = Router();

async function everything() {
  const [topics, sources, notes] = await Promise.all([
    prisma.topic.findMany({ orderBy: { name: 'asc' } }),
    prisma.source.findMany({
      orderBy: { createdAt: 'asc' },
      include: { highlights: { orderBy: { startPos: 'asc' } }, topic: { select: { name: true } } },
    }),
    prisma.note.findMany({
      orderBy: { createdAt: 'asc' },
      include: { sources: { include: { source: { select: { id: true, title: true } } } }, topic: { select: { name: true } } },
    }),
  ]);
  return { topics, sources, notes };
}

exportRouter.get('/json', async (req, res) => {
  const data = await everything();
  res.setHeader('Content-Disposition', `attachment; filename="research-library-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ exportedAt: new Date().toISOString(), ...data });
});

exportRouter.get('/markdown', async (req, res) => {
  const { sources, notes } = await everything();
  const lines = [`# Research library export`, '', `Exported ${new Date().toISOString().slice(0, 10)}`, '', '## Sources', ''];
  for (const s of sources) {
    lines.push(`### ${s.title}`, '');
    const meta = [s.author && `Author: ${s.author}`, s.url && `Link: ${s.url}`, s.topic && `Topic: ${s.topic.name}`, s.tags.length && `Tags: ${s.tags.join(', ')}`, `Status: ${s.status}`].filter(Boolean);
    lines.push(...meta.map((m) => `- ${m}`), '');
    if (s.whySaved) lines.push(`**Why I saved it:** ${s.whySaved}`, '');
    if (s.summary) lines.push(`**AI summary:**`, '', s.summary, '');
    for (const h of s.highlights) {
      lines.push(...h.quote.split('\n').map((l) => `> ${l}`));
      if (h.location) lines.push(`> — ${h.location}`);
      lines.push('');
      if (h.note) lines.push(h.note, '');
    }
  }
  lines.push('## Notes', '');
  for (const n of notes) {
    lines.push(`### ${n.title}`, '');
    if (n.sources.length) lines.push(`Sources: ${n.sources.map((x) => x.source.title).join('; ')}`, '');
    lines.push(n.body || '', '');
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="research-library-${new Date().toISOString().slice(0, 10)}.md"`);
  res.send(lines.join('\n'));
});
