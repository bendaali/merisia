import { pool } from './db.js';
import { migrate } from './schema.js';

try {
  await migrate(pool);
  console.log('Database migrations completed.');
} catch (error) {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
