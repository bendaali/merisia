import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAuthMiddleware, registerAuthRoutes, requirePageAuth } from './auth.js';
import { registerFolderRoutes } from './folders.js';
import { registerDesignRoutes } from './designs.js';
import { applySecurity, authRateLimiter } from './security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export function createApp(pool, options = {}) {
  const app = express();
  const limiter = options.rateLimiter === false ? undefined : authRateLimiter;

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
  applySecurity(app);
  app.use(express.json({ limit: '5mb' }));
  app.use(createAuthMiddleware(pool));

  registerAuthRoutes(app, pool, { authRateLimiter: limiter });

  app.use('/assets', express.static(path.join(rootDir, 'dist', 'assets'), { immutable: true, maxAge: '1y' }));
  app.get('/styles.css', (_req, res) => res.sendFile(path.join(rootDir, 'styles.css')));
  app.get('/script.js', (_req, res) => res.sendFile(path.join(rootDir, 'script.js')));
  app.get('/csrf.js', (_req, res) => res.sendFile(path.join(rootDir, 'csrf.js')));
  app.get('/dashboard.js', requirePageAuth, (_req, res) => res.sendFile(path.join(rootDir, 'dashboard.js')));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, service: 'merisia', database: 'connected' });
    } catch {
      res.status(500).json({ ok: false, error: 'database_unavailable' });
    }
  });

  registerFolderRoutes(app, pool);
  registerDesignRoutes(app, pool);

  app.get('/auth', (req, res) => {
    if (req.user) return res.redirect('/dashboard');
    return res.sendFile(path.join(rootDir, 'auth.html'));
  });
  app.get('/register', (req, res) => {
    if (req.user) return res.redirect('/dashboard');
    return res.sendFile(path.join(rootDir, 'register.html'));
  });
  app.get('/dashboard', requirePageAuth, (_req, res) => res.sendFile(path.join(rootDir, 'dashboard.html')));
  app.get('/editor/:id', requirePageAuth, (_req, res) => res.sendFile(path.join(rootDir, 'dist', 'editor.html')));
  app.get('/guest/:token', (_req, res) => res.sendFile(path.join(rootDir, 'dist', 'editor.html')));
  app.get('/', (_req, res) => res.sendFile(path.join(rootDir, 'index.html')));

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  });

  return app;
}
