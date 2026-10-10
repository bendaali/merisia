import http from 'node:http';
import { handleAsNodeRequest } from 'cloudflare:node';
import { createApp } from './app.js';
import { resolveUserFromCookies } from './auth.js';
import { createD1Database } from './d1.js';
import { migrate } from './schema.js';

const EXPRESS_PORT = 3000;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_WINDOW_MAX = 20;
const authAttempts = new Map();
let currentBinding;
let currentDatabase;
let schemaReady;

function configureDatabase(workerEnv) {
  if (!workerEnv.DB) {
    throw new Error('Missing D1 binding "DB". Add it in the Worker settings.');
  }
  if (workerEnv.DB !== currentBinding) {
    currentBinding = workerEnv.DB;
    currentDatabase = createD1Database(workerEnv.DB);
    schemaReady = null;
  }
}

function database() {
  if (!currentDatabase) {
    throw new Error('D1 database has not been configured for this request.');
  }
  return currentDatabase;
}

const databaseProxy = {
  backend: 'd1',
  query(sql, params) {
    return database().query(sql, params);
  },
  end() {
    return database().end();
  }
};

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      try {
        await databaseProxy.query('SELECT 1 FROM users LIMIT 1');
      } catch (error) {
        if (!/no such table:?\s*users/i.test(error.message)) throw error;
        await migrate(databaseProxy);
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function ensureDatabase(workerEnv) {
  configureDatabase(workerEnv);
  await ensureSchema();
}

function workerAuthRateLimiter(req, res, next) {
  const now = Date.now();
  const key = String(req.headers['cf-connecting-ip'] || req.ip || 'unknown');
  let entry = authAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + AUTH_WINDOW_MS };
    authAttempts.set(key, entry);
  }
  entry.count += 1;
  if (authAttempts.size > 10_000) {
    for (const [storedKey, stored] of authAttempts) {
      if (stored.resetAt <= now) authAttempts.delete(storedKey);
    }
  }
  if (entry.count > AUTH_WINDOW_MAX) {
    res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({
      ok: false,
      error: 'Trop de tentatives. Reessaie dans quelques minutes.'
    });
  }
  return next();
}

const app = createApp(databaseProxy, {
  authRateLimiter: workerAuthRateLimiter,
  staticFiles: false
});
const server = http.createServer(app);
server.listen(EXPRESS_PORT);

function redirect(request, pathname) {
  return Response.redirect(new URL(pathname, request.url), 302);
}

function cookieValue(header, name) {
  for (const raw of String(header || '').split(';')) {
    const part = raw.trim();
    if (part.startsWith(`${name}=`)) return part.slice(name.length + 1);
  }
  return null;
}

function csrfToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function assetResponse(request, workerEnv, pathname, { csrf = false } = {}) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = '';
  const response = await workerEnv.ASSETS.fetch(new Request(url, request));
  if (!csrf || cookieValue(request.headers.get('Cookie'), 'merisia_csrf')) return response;

  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', `merisia_csrf=${csrfToken()}; Secure; SameSite=Lax; Path=/`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function databaseUnavailable(error) {
  console.error('Worker database initialization failed:', error?.message, error?.stack);
  return Response.json(
    {
      ok: false,
      error: 'database_unavailable'
    },
    { status: 503 }
  );
}

async function authenticatedUser(request, workerEnv) {
  await ensureDatabase(workerEnv);
  return resolveUserFromCookies(databaseProxy, request.headers.get('Cookie'));
}

async function routePage(request, workerEnv, pathname) {
  if (pathname === '/') {
    return assetResponse(request, workerEnv, '/index.html', { csrf: true });
  }
  if (pathname === '/auth' || pathname === '/register') {
    try {
      const hasSession = cookieValue(request.headers.get('Cookie'), 'merisia_session');
      if (hasSession && await authenticatedUser(request, workerEnv)) return redirect(request, '/dashboard');
    } catch (error) {
      return databaseUnavailable(error);
    }
    return assetResponse(
      request,
      workerEnv,
      pathname === '/auth' ? '/auth.html' : '/register.html',
      { csrf: true }
    );
  }
  if (pathname === '/dashboard' || /^\/editor\/[0-9a-f-]{36}$/i.test(pathname)) {
    try {
      if (!await authenticatedUser(request, workerEnv)) {
        return redirect(request, `/auth?next=${encodeURIComponent(pathname)}`);
      }
    } catch (error) {
      return databaseUnavailable(error);
    }
    return assetResponse(
      request,
      workerEnv,
      pathname === '/dashboard' ? '/dashboard.html' : '/editor.html',
      { csrf: true }
    );
  }
  if (/^\/guest\/[^/]+$/.test(pathname)) {
    return assetResponse(request, workerEnv, '/editor.html', { csrf: true });
  }
  return null;
}

export default {
  async fetch(request, workerEnv) {
    const pathname = new URL(request.url).pathname;
    const page = await routePage(request, workerEnv, pathname);
    if (page) return page;

    if (pathname.startsWith('/api/') || pathname.startsWith('/share/')) {
      try {
        await ensureDatabase(workerEnv);
      } catch (error) {
        return databaseUnavailable(error);
      }
      return handleAsNodeRequest(EXPRESS_PORT, request);
    }

    if (pathname.startsWith('/ws/')) {
      return Response.json(
        { ok: false, error: 'realtime_not_available_on_worker' },
        { status: 501 }
      );
    }

    return workerEnv.ASSETS.fetch(request);
  }
};
