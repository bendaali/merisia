import pg from 'pg';
import { createApp } from '../server/app.js';
import { migrate } from '../server/schema.js';

const { Pool } = pg;

let cachedPool = null;
let cachedApp = null;

export async function getTestApp() {
  if (cachedApp) return { pool: cachedPool, app: cachedApp };
  cachedPool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER || 'merisia',
    password: process.env.POSTGRES_PASSWORD || 'merisia',
    database: process.env.POSTGRES_DB || 'merisia'
  });
  await migrate(cachedPool);
  cachedApp = createApp(cachedPool, { rateLimiter: false });
  return { pool: cachedPool, app: cachedApp };
}

export async function resetDatabase(pool) {
  await pool.query('TRUNCATE design_collaborators, designs, folders, sessions, users RESTART IDENTITY CASCADE');
}

export async function closeTestApp() {
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = null;
    cachedApp = null;
  }
}

export function parseSetCookieHeader(header) {
  if (!header) return {};
  const cookies = Array.isArray(header) ? header : [header];
  const out = {};
  for (const raw of cookies) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

export async function bootstrapSession(request) {
  const res = await request.get('/api/health');
  const cookies = parseSetCookieHeader(res.headers['set-cookie']);
  return {
    csrfToken: cookies.merisia_csrf || '',
    cookieHeader: cookies.merisia_csrf ? `merisia_csrf=${cookies.merisia_csrf}` : ''
  };
}

export function withSession(cookieHeader, sessionCookieValue) {
  const cookies = cookieHeader ? [cookieHeader] : [];
  if (sessionCookieValue) cookies.push(`merisia_session=${sessionCookieValue}`);
  return cookies.join('; ');
}

export function extractSessionCookie(setCookieHeader) {
  const cookies = parseSetCookieHeader(setCookieHeader);
  return cookies.merisia_session || '';
}

export function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@merisia.test`;
}
