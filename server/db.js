import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || 'merisia',
  password: process.env.POSTGRES_PASSWORD || 'merisia',
  database: process.env.POSTGRES_DB || 'merisia'
});

export async function query(text, params) {
  return pool.query(text, params);
}
