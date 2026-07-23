import http from 'http';
import { pool } from './server/db.js';
import { createApp } from './server/app.js';
import { hashPassword } from './server/auth.js';
import { migrate, seedDemoData } from './server/schema.js';
import { attachRealtime } from './server/realtime.js';

const app = createApp(pool);
const server = http.createServer(app);
attachRealtime(server, pool);
const port = process.env.PORT || 3000;

migrate(pool)
  .then(() => {
    if (process.env.ENABLE_DEMO_SEED === 'true') return seedDemoData(pool, hashPassword);
    return null;
  })
  .then(() => server.listen(port, () => console.log(`Merisia running on http://0.0.0.0:${port}`)))
  .catch((error) => {
    console.error('Failed to start Merisia:', error);
    process.exit(1);
  });
