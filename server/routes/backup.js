import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { BACKUP_DIR } from '../lib/files.js';
import { backupFile, listBackups, runBackup, lastBackup, restoreBackup, emailConfigured } from '../lib/backup.js';
import { httpError } from '../lib/ai.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.get('/', async (req, res) => {
  res.json({
    last: await lastBackup(),
    files: await listBackups(),
    email: emailConfigured() ? process.env.BACKUP_EMAIL : null,
  });
});

router.post('/run', async (req, res) => {
  const status = await runBackup();
  res.json({ status, files: await listBackups() });
});

router.get('/download', async (req, res) => {
  const { name, buffer } = await backupFile();
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buffer);
});

router.get('/files/:name', async (req, res) => {
  const name = path.basename(req.params.name);
  if (!name.endsWith('.json.gz')) throw httpError(404, 'Backup not found.');
  const buffer = await fs.readFile(path.join(BACKUP_DIR, name)).catch(() => null);
  if (!buffer) throw httpError(404, 'Backup not found.');
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buffer);
});

router.post('/restore', upload.single('file'), async (req, res) => {
  if (!req.file) throw httpError(400, 'Choose a backup file.');
  const result = await restoreBackup(req.file.buffer);
  res.json(result);
});

export default router;
