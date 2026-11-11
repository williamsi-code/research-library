import crypto from 'node:crypto';
import { Router } from 'express';

const COOKIE = 'rl_session';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // Derived from the password, so changing APP_PASSWORD logs every device out.
  return crypto.createHash('sha256').update('research-library:' + (process.env.APP_PASSWORD || '')).digest('hex');
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Small in-memory limiter for login attempts
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 60_000);
  attempts.set(ip, list);
  return list.length >= 5;
}

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  if (!process.env.APP_PASSWORD) {
    return res.status(500).json({ error: 'APP_PASSWORD is not set on the server. Add it in Railway variables.' });
  }
  const ip = req.ip || 'unknown';
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
  }
  const { password } = req.body || {};
  if (!password || !safeEqual(password, process.env.APP_PASSWORD)) {
    attempts.get(ip).push(Date.now());
    return res.status(401).json({ error: 'That password is incorrect.' });
  }
  const token = sign({ sub: 'owner', exp: Date.now() + THIRTY_DAYS });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: THIRTY_DAYS,
    path: '/',
  });
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  if (!verify(readCookie(req, COOKIE))) return res.status(401).json({ error: 'Not signed in' });
  res.json({ ok: true });
});

export function requireAuth(req, res, next) {
  if (!verify(readCookie(req, COOKIE))) return res.status(401).json({ error: 'Not signed in' });
  next();
}
