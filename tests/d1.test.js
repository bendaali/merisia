import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1Database, postgresToD1Sql } from '../server/d1.js';
import { migrate } from '../server/schema.js';

function bindingReturning(result) {
  const calls = [];
  const binding = {
    calls,
    prepare(sql) {
      const call = { sql, params: [] };
      calls.push(call);
      return {
        bind(...params) {
          call.params = params;
          return this;
        },
        async run() {
          if (result instanceof Error) throw result;
          return result;
        }
      };
    },
    async exec(sql) {
      calls.push({ exec: sql });
      return { count: 3, duration: 1 };
    }
  };
  return binding;
}

test('translates PostgreSQL placeholders for a D1 binding', () => {
  assert.equal(
    postgresToD1Sql('SELECT * FROM designs WHERE owner_user_id = $1 OR folder_id = $2 OR id = $1'),
    'SELECT * FROM designs WHERE owner_user_id = ?1 OR folder_id = ?2 OR id = ?1'
  );
});

test('D1 adapter binds Worker statements and preserves the pg-shaped result', async () => {
  const binding = bindingReturning({
    success: true,
    results: [{
      id: 7,
      diagram_json: '{"version":3}',
      updated_at: '2026-07-23 21:05:02'
    }],
    meta: { changes: 1 }
  });
  const database = createD1Database(binding);
  const timestamp = new Date('2026-07-23T20:00:00.000Z');

  const result = await database.query(
    'UPDATE designs SET diagram_json = $1, updated_at = $2 WHERE id = $3 RETURNING *',
    [{ version: 3 }, timestamp, 7]
  );

  assert.equal(database.backend, 'd1');
  assert.match(binding.calls[0].sql, /diagram_json = \?1/);
  assert.deepEqual(binding.calls[0].params, [
    '{"version":3}',
    '2026-07-23T20:00:00.000Z',
    7
  ]);
  assert.deepEqual(result, {
    rows: [{
      id: 7,
      diagram_json: { version: 3 },
      updated_at: '2026-07-23T21:05:02Z'
    }],
    rowCount: 1,
    command: 'UPDATE'
  });
});

test('D1 adapter prepares every statement in a parameterless batch', async () => {
  const binding = bindingReturning({ success: true, results: [], meta: {} });
  const database = createD1Database(binding);

  const result = await database.query('CREATE TABLE one (id INTEGER); CREATE TABLE two (id INTEGER);');

  assert.equal(binding.calls.length, 2);
  assert.match(binding.calls[0].sql, /CREATE TABLE one/);
  assert.match(binding.calls[1].sql, /CREATE TABLE two/);
  assert.equal(result.rowCount, 0);
});

test('D1 unique constraint errors retain the existing route error code', async () => {
  const binding = bindingReturning(new Error('D1_ERROR: UNIQUE constraint failed: users.email'));
  const database = createD1Database(binding);

  await assert.rejects(
    database.query('INSERT INTO users (email) VALUES ($1)', ['used@example.com']),
    (error) => error.name === 'D1Error' && error.code === '23505'
  );
});

test('D1 migration selects the SQLite schema and skips PostgreSQL-only ALTER COLUMN', async () => {
  const queries = [];
  const columns = [
    'owner_user_id',
    'diagram_json',
    'created_at',
    'xml_content',
    'uuid'
  ].map((name) => ({ name }));
  const database = {
    backend: 'd1',
    async query(sql) {
      queries.push(sql);
      if (/PRAGMA table_info/.test(sql)) return { rows: columns };
      if (/SELECT id FROM designs/.test(sql)) return { rows: [] };
      return { rows: [], rowCount: 0 };
    }
  };

  await migrate(database);

  assert.match(queries[0], /INTEGER PRIMARY KEY AUTOINCREMENT/);
  assert.doesNotMatch(queries[0], /\bSERIAL\b|\bJSONB\b|\bTIMESTAMPTZ\b/);
  assert.equal(queries.some((sql) => /ALTER COLUMN/.test(sql)), false);
  assert.equal(queries.some((sql) => /idx_designs_uuid/.test(sql)), true);
});
