import pg from 'pg';
import { createD1Database } from './d1.js';

const { Pool } = pg;

function normalizeBackend(value) {
  const backend = String(value || 'postgres').toLowerCase();
  if (backend === 'pg') return 'postgres';
  if (!['postgres', 'd1'].includes(backend)) {
    throw new Error(`Unsupported database "${value}". Use "postgres" or "d1".`);
  }
  return backend;
}

function readOption(argv, names) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    for (const name of names) {
      if (argument === name) {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error(`Missing value for ${name}`);
        }
        return value;
      }
      if (argument.startsWith(`${name}=`)) return argument.slice(name.length + 1);
    }
  }
  return undefined;
}

export function parseDatabaseArgs(argv = process.argv.slice(2), env = process.env) {
  const requestedBackend = readOption(argv, ['--database', '--db'])
    || env.DATABASE_BACKEND
    || env.DB_BACKEND
    || 'postgres';
  return { backend: normalizeBackend(requestedBackend) };
}

export function createDatabase(backendOrOptions = parseDatabaseArgs(), databaseArgs = {}) {
  const options = typeof backendOrOptions === 'string'
    ? { ...databaseArgs, backend: backendOrOptions }
    : backendOrOptions;
  const backend = normalizeBackend(options.backend);
  if (backend === 'd1') {
    return createD1Database(options.binding || options.d1Binding || options.d1?.binding);
  }

  const postgres = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER || 'merisia',
    password: process.env.POSTGRES_PASSWORD || 'merisia',
    database: process.env.POSTGRES_DB || 'merisia'
  });
  postgres.backend = 'postgres';
  return postgres;
}

export const databaseOptions = parseDatabaseArgs();
export const pool = createDatabase(databaseOptions);

export async function query(text, params) {
  return pool.query(text, params);
}
