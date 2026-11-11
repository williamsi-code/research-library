import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { authRouter, requireAuth } from './auth.js';
import sourcesRouter from './routes/sources.js';
import highlightsRouter from './routes/highlights.js';
import notesRouter from './routes/notes.js';
import askRouter from './routes/ask.js';
import clipRouter from './routes/clip.js';
import { topicsRouter, searchRouter, reviewRouter, settingsRouter, exportRouter } from './routes/misc.js';
import { resumePending } from './lib/ingest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

// Bookmarklet endpoint: form posts with its own token check
app.use('/api/clip', clipRouter);

app.use(express.json({ limit: '5mb' }));
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);
app.use('/api/sources', sourcesRouter);
app.use('/api/highlights', highlightsRouter);
app.use('/api/notes', notesRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/search', searchRouter);
app.use('/api/ask', askRouter);
app.use('/api/review', reviewRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/export', exportRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// React app
const dist = path.join(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// Errors
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'P2025' ? 404 : err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  const message =
    err.code === 'P2025' ? 'That item no longer exists.' :
    err.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than 50 MB.' :
    !err.status ? 'Something went wrong on the server. Check the Railway logs for details.' :
    err.message;
  res.status(status).json({ error: message });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Research library running on port ${port}`);
  if (!process.env.APP_PASSWORD) console.warn('APP_PASSWORD is not set — nobody can sign in until you add it.');
  resumePending().catch((e) => console.error('resume', e));
});
