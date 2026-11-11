import express, { Router } from 'express';
import { prisma } from '../db.js';
import { safeEqual } from '../auth.js';
import { extractFromHtml, fetchPage, extractFromPdf } from '../lib/extract.js';
import { createSource } from '../lib/ingest.js';
import { makeLocator } from '../lib/chunk.js';

// The bookmarklet posts the page you're looking at (including pages behind logins)
// to this endpoint in a new tab. It authenticates with CLIP_TOKEN instead of the
// session cookie, because browsers don't send cookies on cross-site form posts.

const router = Router();
router.use(express.urlencoded({ extended: false, limit: '25mb' }));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(title, message, link) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body{font:17px/1.5 system-ui,sans-serif;background:#F4F6F8;color:#1C2230;display:grid;place-items:center;min-height:100vh;margin:0;padding:1rem}
  main{background:#fff;border:1px solid #DCE1E8;border-radius:10px;padding:2rem;max-width:30rem}
  h1{font-size:1.3rem;margin:0 0 .5rem}
  a{color:#24477A;font-weight:600}
  @media (prefers-color-scheme:dark){body{background:#161A22;color:#E6E9EF}main{background:#1F2430;border-color:#323A4A}a{color:#9DB8E8}}
</style></head><body><main><h1>${esc(title)}</h1><p>${message}</p>${link ? `<p><a href="${esc(link)}">Open it in your library</a></p>` : ''}<p><a href="#" onclick="window.close();return false">Close this tab</a></p></main></body></html>`;
}

router.post('/', async (req, res) => {
  const { token, url, title, html, selection } = req.body || {};
  if (!process.env.CLIP_TOKEN) {
    return res.status(503).send(page('Clipper not set up', 'Add a CLIP_TOKEN variable in Railway, then copy the bookmarklet again from Settings.'));
  }
  if (!token || !safeEqual(token, process.env.CLIP_TOKEN)) {
    return res.status(401).send(page('Clip not saved', 'This bookmarklet’s key doesn’t match. Copy a fresh bookmarklet from Settings.'));
  }

  try {
    const quote = String(selection || '').trim();
    let source = url ? await prisma.source.findFirst({ where: { url }, select: { id: true, text: true, segments: true } }) : null;
    let duplicate = Boolean(source);

    if (!source) {
      let extracted;
      let kind = 'web';
      if (html && html.length > 200) {
        extracted = extractFromHtml(html, url);
      } else if (url) {
        const fetched = await fetchPage(url);
        if (fetched.kind === 'pdf') {
          extracted = await extractFromPdf(fetched.buffer, title);
          kind = 'pdf';
        } else extracted = extractFromHtml(fetched.html, fetched.finalUrl);
      }
      if (!extracted?.text) {
        return res.status(422).send(page('Clip not saved', 'No readable text was found on that page.'));
      }
      source = await createSource({ ...extracted, kind, url, title: extracted.title || title });
    }

    let highlighted = false;
    if (quote) {
      const text = source.text;
      const idx = text.indexOf(quote);
      await prisma.highlight.create({
        data: {
          sourceId: source.id,
          quote,
          startPos: idx >= 0 ? idx : null,
          endPos: idx >= 0 ? idx + quote.length : null,
          location: idx >= 0 ? makeLocator(text, source.segments || [])(idx) : null,
        },
      });
      highlighted = true;
    }

    const link = `${req.protocol}://${req.get('host')}/sources/${source.id}`;
    const msg = duplicate
      ? highlighted ? 'This page was already in your library. Your selection was added as a highlight.' : 'This page is already in your library.'
      : highlighted ? 'Saved the page and your selected text as a highlight.' : 'Saved the page to your library.';
    res.send(page(duplicate ? 'Already saved' : 'Saved', esc(msg), link));
  } catch (e) {
    console.error('clip', e);
    res.status(e.status || 500).send(page('Clip not saved', esc(e.message || 'Something went wrong while saving.')));
  }
});

export default router;
