import { Router } from 'express';
import { prisma } from '../db.js';
import { makeLocator } from '../lib/chunk.js';
import { cleanTags } from '../lib/ingest.js';
import { httpError } from '../lib/ai.js';

const router = Router();

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const where = q
    ? { OR: [{ quote: { contains: q, mode: 'insensitive' } }, { note: { contains: q, mode: 'insensitive' } }] }
    : {};
  const highlights = await prisma.highlight.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { source: { select: { id: true, title: true } } },
  });
  res.json({ highlights });
});

router.post('/', async (req, res) => {
  const { sourceId, quote, note, tags } = req.body || {};
  let { startPos, endPos } = req.body || {};
  if (!sourceId || !quote?.trim()) throw httpError(400, 'Select some text to highlight.');
  const source = await prisma.source.findUnique({ where: { id: sourceId }, select: { text: true, segments: true } });
  if (!source) throw httpError(404, 'That source no longer exists.');

  // Trust offsets only if they match the stored text; otherwise try to find the quote.
  const valid = Number.isInteger(startPos) && Number.isInteger(endPos) && source.text.slice(startPos, endPos) === quote;
  if (!valid) {
    const idx = source.text.indexOf(quote);
    startPos = idx >= 0 ? idx : null;
    endPos = idx >= 0 ? idx + quote.length : null;
  }
  const location = startPos != null ? makeLocator(source.text, source.segments || [])(startPos) : null;
  const highlight = await prisma.highlight.create({
    data: { sourceId, quote, startPos, endPos, location, note: note?.trim() || null, tags: cleanTags(tags) },
  });
  res.status(201).json({ highlight });
});

router.patch('/:id', async (req, res) => {
  const body = req.body || {};
  const data = {};
  if ('note' in body) data.note = body.note?.trim() || null;
  if ('tags' in body) data.tags = cleanTags(body.tags);
  const highlight = await prisma.highlight.update({ where: { id: req.params.id }, data });
  res.json({ highlight });
});

router.delete('/:id', async (req, res) => {
  await prisma.highlight.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
