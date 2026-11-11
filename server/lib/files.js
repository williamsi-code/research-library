import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(path.dirname(UPLOAD_DIR), 'backups'));

export async function saveFile(buffer, originalName, mimeType) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const safe = String(originalName || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
  const name = `${crypto.randomUUID()}-${safe}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), buffer);
  return { filePath: name, fileName: originalName, mimeType };
}

export const readUpload = (name) => fs.readFile(path.join(UPLOAD_DIR, name));
