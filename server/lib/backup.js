import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { prisma } from '../db.js';
import { BACKUP_DIR } from './files.js';
import { enqueue } from './ingest.js';
import { httpError } from './ai.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const KEEP = 8;
const WEEK = 7 * 24 * 60 * 60 * 1000;

// Everything you've written or saved. Search indexes are left out because they're
// rebuilt automatically after a restore. Uploaded original files aren't included,
// but the text read from them is.
export async function buildBackup() {
  const [topics, sources, highlights, notes, noteSources, researchItems, timelineEvents, quizQuestions, explanationChecks] = await Promise.all([
    prisma.topic.findMany(),
    prisma.source.findMany(),
    prisma.highlight.findMany(),
    prisma.note.findMany(),
    prisma.noteSource.findMany(),
    prisma.researchItem.findMany(),
    prisma.timelineEvent.findMany(),
    prisma.quizQuestion.findMany(),
    prisma.explanationCheck.findMany(),
  ]);
  for (const s of sources) delete s.pendingOcr;
  return {
    app: 'research-library',
    version: 1,
    createdAt: new Date().toISOString(),
    counts: { topics: topics.length, sources: sources.length, highlights: highlights.length, notes: notes.length },
    topics, sources, highlights, notes, noteSources, researchItems, timelineEvents, quizQuestions, explanationChecks,
  };
}

export async function backupFile() {
  const data = await buildBackup();
  const buffer = await gzip(Buffer.from(JSON.stringify(data)));
  const name = `research-library-${data.createdAt.slice(0, 19).replace(/[:T]/g, '-')}.json.gz`;
  return { name, buffer, counts: data.counts };
}

export async function listBackups() {
  const names = await fs.readdir(BACKUP_DIR).catch(() => []);
  const files = [];
  for (const name of names.filter((n) => n.endsWith('.json.gz'))) {
    const stat = await fs.stat(path.join(BACKUP_DIR, name));
    files.push({ name, size: stat.size, createdAt: stat.mtime });
  }
  return files.sort((a, b) => b.createdAt - a.createdAt);
}

async function emailBackup({ name, buffer, counts }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.BACKUP_FROM || 'Research library <onboarding@resend.dev>',
      to: [process.env.BACKUP_EMAIL],
      subject: `Research library backup, ${new Date().toISOString().slice(0, 10)}`,
      text: `Your weekly backup is attached: ${counts.sources} sources, ${counts.highlights} highlights, ${counts.notes} notes, ${counts.topics} topics.\n\nTo restore it, open Settings in your research library and use Restore from a backup.`,
      attachments: [{ filename: name, content: buffer.toString('base64') }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Email failed: ${data?.message || res.status}`);
  }
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.BACKUP_EMAIL);

export async function runBackup() {
  const file = await backupFile();
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.writeFile(path.join(BACKUP_DIR, file.name), file.buffer);
  const old = (await listBackups()).slice(KEEP);
  for (const f of old) await fs.unlink(path.join(BACKUP_DIR, f.name)).catch(() => {});

  let emailError = null;
  if (emailConfigured()) {
    try {
      await emailBackup(file);
    } catch (e) {
      emailError = e.message;
    }
  }
  const status = {
    at: new Date().toISOString(),
    name: file.name,
    size: file.buffer.length,
    counts: file.counts,
    emailed: emailConfigured() && !emailError,
    emailError,
  };
  await prisma.appSetting.upsert({
    where: { key: 'lastBackup' },
    create: { key: 'lastBackup', value: status },
    update: { value: status },
  });
  return status;
}

export async function lastBackup() {
  const row = await prisma.appSetting.findUnique({ where: { key: 'lastBackup' } });
  return row?.value || null;
}

export function startBackupSchedule() {
  const check = async () => {
    try {
      const last = await lastBackup();
      if (!last || Date.now() - new Date(last.at).getTime() > WEEK) {
        const status = await runBackup();
        console.log(`Weekly backup saved: ${status.name}${status.emailError ? ` (email failed: ${status.emailError})` : ''}`);
      }
    } catch (e) {
      console.error('Scheduled backup failed:', e);
    }
  };
  setTimeout(check, 2 * 60_000);
  setInterval(check, 6 * 60 * 60_000);
}

// Adds anything in the backup that isn't already here. Nothing existing is overwritten.
export async function restoreBackup(buffer) {
  let data;
  try {
    const raw = buffer[0] === 0x1f && buffer[1] === 0x8b ? await gunzip(buffer) : buffer;
    data = JSON.parse(raw.toString('utf8'));
  } catch {
    throw httpError(400, 'That file isn’t a backup from this app.');
  }
  if (data?.app !== 'research-library' || !Array.isArray(data.sources)) throw httpError(400, 'That file isn’t a backup from this app.');

  // Topics with the same name are merged into the existing one.
  const existingTopics = await prisma.topic.findMany({ select: { id: true, name: true } });
  const byName = new Map(existingTopics.map((t) => [t.name, t.id]));
  const topicMap = new Map();
  const newTopics = [];
  for (const t of data.topics || []) {
    if (byName.has(t.name)) topicMap.set(t.id, byName.get(t.name));
    else {
      topicMap.set(t.id, t.id);
      newTopics.push(t);
    }
  }
  const mapTopic = (id) => (id ? topicMap.get(id) || null : null);
  const nullJson = (v) => (v == null ? undefined : v);

  const before = await prisma.source.count();
  const batches = async (model, rows, size = 100) => {
    for (let i = 0; i < rows.length; i += size) {
      await prisma[model].createMany({ data: rows.slice(i, i + size), skipDuplicates: true });
    }
  };

  await batches('topic', newTopics.map((t) => ({ ...t, conceptMap: nullJson(t.conceptMap) })));
  await batches(
    'source',
    data.sources.map((s) => ({ ...s, topicId: mapTopic(s.topicId), processing: 'pending', processingError: null, pendingOcr: undefined })),
    25
  );
  const sourceIds = new Set((await prisma.source.findMany({ select: { id: true } })).map((s) => s.id));
  const keepSource = (id) => (id && sourceIds.has(id) ? id : null);

  await batches('highlight', (data.highlights || []).filter((h) => sourceIds.has(h.sourceId)));
  await batches('note', (data.notes || []).map((n) => ({ ...n, topicId: mapTopic(n.topicId) })));
  const noteIds = new Set((await prisma.note.findMany({ select: { id: true } })).map((n) => n.id));
  await batches('noteSource', (data.noteSources || []).filter((x) => noteIds.has(x.noteId) && sourceIds.has(x.sourceId)));
  const topicIds = new Set((await prisma.topic.findMany({ select: { id: true } })).map((t) => t.id));
  const withTopic = (rows) => rows.map((r) => ({ ...r, topicId: mapTopic(r.topicId) })).filter((r) => topicIds.has(r.topicId));
  await batches('researchItem', withTopic(data.researchItems || []));
  await batches('timelineEvent', withTopic(data.timelineEvents || []).map((e) => ({ ...e, sourceId: keepSource(e.sourceId) })));
  await batches('quizQuestion', withTopic(data.quizQuestions || []).map((q) => ({ ...q, sourceId: keepSource(q.sourceId) })));
  await batches('explanationCheck', withTopic(data.explanationChecks || []));

  // Rebuild search for anything restored.
  const pending = await prisma.source.findMany({ where: { processing: 'pending' }, select: { id: true } });
  pending.forEach((s) => enqueue(s.id));

  const after = await prisma.source.count();
  return { sourcesAdded: after - before, backupDate: data.createdAt };
}
