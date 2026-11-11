import { Router } from 'express';
import { prisma } from '../db.js';
import { cleanTags } from '../lib/ingest.js';
import { httpError } from '../lib/ai.js';

const router = Router();

const include = {
  topic: { select: { id: true, name: true } },
  sources: { include: { source: { select: { id: true, title: true } } } },
};

router.get('/', async (req, res) => {
  const { q, topicId } = req.query;
  const where = {};
  if (topicId) where.topicId = String(topicId);
  if (q) {
    where.OR = [
      { title: { contains: String(q), mode: 'insensitive' } },
      { body: { contains: String(q), mode: 'insensitive' } },
    ];
  }
  const notes = await prisma.note.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 300,
    select: { id: true, title: true, updatedAt: true, tags: true, topic: { select: { id: true, name: true } }, body: true },
  });
  res.json({ notes: notes.map((n) => ({ ...n, body: n.body.slice(0, 200) })) });
});

router.get('/:id', async (req, res) => {
  const note = await prisma.note.findUnique({ where: { id: req.params.id }, include });
  if (!note) throw httpError(404, 'That note no longer exists.');
  res.json({ note });
});

function noteData(body) {
  const data = {};
  if ('title' in body) data.title = String(body.title || '').trim() || 'Untitled note';
  if ('body' in body) data.body = String(body.body || '');
  if ('tags' in body) data.tags = cleanTags(body.tags);
  if ('topicId' in body) data.topicId = body.topicId || null;
  return data;
}

router.post('/', async (req, res) => {
  const body = req.body || {};
  const data = noteData({ title: 'Untitled note', ...body });
  const sourceIds = [...new Set(body.sourceIds || [])];
  const note = await prisma.note.create({
    data: { ...data, sources: { create: sourceIds.map((sourceId) => ({ sourceId })) } },
    include,
  });
  res.status(201).json({ note });
});

router.patch('/:id', async (req, res) => {
  const body = req.body || {};
  const id = req.params.id;
  const note = await prisma.$transaction(async (tx) => {
    if (Array.isArray(body.sourceIds)) {
      await tx.noteSource.deleteMany({ where: { noteId: id } });
      const ids = [...new Set(body.sourceIds)];
      if (ids.length) await tx.noteSource.createMany({ data: ids.map((sourceId) => ({ noteId: id, sourceId })) });
    }
    return tx.note.update({ where: { id }, data: noteData(body), include });
  });
  res.json({ note });
});

router.delete('/:id', async (req, res) => {
  await prisma.note.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
