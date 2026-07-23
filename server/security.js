import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const CSRF_COOKIE = 'merisia_csrf';

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const raw of header.split(';')) {
    const part = raw.trim();
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

function csrfCookieHeader(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${CSRF_COOKIE}=${token}; SameSite=Lax; Path=/${secure}`;
}

function csrfProtection() {
  return function csrf(req, res, next) {
    let token = readCookie(req, CSRF_COOKIE);
    if (!token) {
      token = crypto.randomBytes(32).toString('base64url');
      res.append('Set-Cookie', csrfCookieHeader(token));
    }
    req.csrfToken = token;

    const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    if (safe) return next();
    if (!req.path.startsWith('/api/')) return next();

    const header = req.headers['x-csrf-token'];
    if (!header || typeof header !== 'string') {
      return res.status(403).json({ ok: false, error: 'Jeton CSRF requis' });
    }
    const provided = Buffer.from(header);
    const expected = Buffer.from(token);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.status(403).json({ ok: false, error: 'Jeton CSRF invalide' });
    }
    return next();
  };
}

export function parseAllowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function lockCors() {
  const allowed = parseAllowedOrigins();
  return function corsLockdown(req, res, next) {
    const origin = req.headers.origin;
    if (!origin) return next();

    if (allowed.length) {
      if (allowed.includes(origin)) return next();
    } else {
      const host = req.headers.host;
      const expected = `${req.protocol}://${host}`;
      if (origin === expected) return next();
    }

    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    return res.status(403).json({ ok: false, error: 'Origine non autorisee' });
  };
}

export function applySecurity(app) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  app.use(lockCors());
  app.use(csrfProtection());
}

export function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Trop de tentatives. Reessaie dans quelques minutes.' }
  });
}
