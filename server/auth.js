import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'merisia_session';
const SESSION_DAYS = 14;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function sessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${secure}`;
}

function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const derived = await scrypt(String(password), salt, 64);
  return `scrypt$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password, storedHash) {
  const [scheme, salt, encodedHash] = String(storedHash || '').split('$');
  if (scheme !== 'scrypt' || !salt || !encodedHash) return false;
  const expected = Buffer.from(encodedHash, 'base64url');
  const actual = await scrypt(String(password), salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Authentification requise' });
  next();
}

export function requirePageAuth(req, res, next) {
  if (!req.user) {
    const target = encodeURIComponent(req.originalUrl || '/dashboard');
    return res.redirect(`/auth?next=${target}`);
  }
  next();
}

export function createAuthMiddleware(pool) {
  return async function authMiddleware(req, _res, next) {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[SESSION_COOKIE];
      if (!token) return next();

      const { rows } = await pool.query(`
        SELECT u.id, u.email
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()
      `, [sha256(token)]);

      if (rows.length) req.user = rows[0];
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export async function createSession(pool, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, sha256(token), expiresAt]
  );
  res.setHeader('Set-Cookie', sessionCookie(token));
}

export async function destroySession(pool, req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
}

export function registerAuthRoutes(app, pool, { authRateLimiter } = {}) {
  const limiter = authRateLimiter || ((_req, _res, next) => next());
  app.post('/api/auth/register', limiter, async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body.email);
      const password = String(req.body.password || '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ ok: false, error: 'Email invalide' });
      }
      if (password.length < 10) {
        return res.status(400).json({ ok: false, error: 'Le mot de passe doit contenir au moins 10 caracteres' });
      }

      const passwordHash = await hashPassword(password);
      const { rows } = await pool.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [email, passwordHash]
      );
      await createSession(pool, res, rows[0].id);
      return res.status(201).json({ ok: true, user: rows[0] });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ ok: false, error: 'Un compte existe deja avec cet email' });
      return next(error);
    }
  });

  app.post('/api/auth/login', limiter, async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body.email);
      const password = String(req.body.password || '');
      const { rows } = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
      const user = rows[0];
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return res.status(401).json({ ok: false, error: 'Email ou mot de passe incorrect' });
      }

      await createSession(pool, res, user.id);
      return res.json({ ok: true, user: { id: user.id, email: user.email } });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      await destroySession(pool, req, res);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });
}

export async function resolveUserFromCookies(pool, cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const { rows } = await pool.query(`
    SELECT u.id, u.email
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now()
  `, [sha256(token)]);
  return rows[0] || null;
}

export { normalizeEmail };
