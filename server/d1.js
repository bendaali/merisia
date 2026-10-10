function d1Parameter(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  if (value instanceof Uint8Array) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

export function postgresToD1Sql(sql) {
  return String(sql).replace(/\$(\d+)/g, '?$1');
}

function deserializeD1Row(row) {
  const output = { ...row };
  if (typeof output.diagram_json === 'string') {
    try {
      output.diagram_json = JSON.parse(output.diagram_json);
    } catch {
      // Preserve malformed legacy data so callers can handle it normally.
    }
  }
  for (const [key, value] of Object.entries(output)) {
    if (/_at$/.test(key) && typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(value)) {
      output[key] = `${value.replace(' ', 'T')}Z`;
    }
  }
  return output;
}

function normalizeD1Error(cause) {
  const error = new Error(cause?.message || 'D1 query failed.', { cause });
  error.name = 'D1Error';
  if (/UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(error.message)) {
    // Preserve the route-level unique-violation behavior used with PostgreSQL.
    error.code = '23505';
  }
  return error;
}

function containsMultipleStatements(sql) {
  return String(sql).trim().replace(/;$/, '').includes(';');
}

/**
 * Adapts a Cloudflare D1 binding to the small pg Pool interface used by Merisia.
 */
export class D1Database {
  constructor(binding) {
    if (!binding || typeof binding.prepare !== 'function') {
      throw new Error('D1 requires a Cloudflare D1 binding, for example createD1Database(env.DB).');
    }
    this.backend = 'd1';
    this.binding = binding;
  }

  async query(sql, params = []) {
    const translatedSql = postgresToD1Sql(sql);
    try {
      if (!params.length && containsMultipleStatements(translatedSql) && typeof this.binding.exec === 'function') {
        const result = await this.binding.exec(translatedSql);
        return {
          rows: [],
          rowCount: Number(result?.count || 0),
          command: null
        };
      }

      let statement = this.binding.prepare(translatedSql);
      if (params.length) statement = statement.bind(...params.map(d1Parameter));
      const result = await statement.run();
      if (result?.success === false) throw new Error(result.error || 'D1 query failed.');

      const rows = Array.isArray(result?.results) ? result.results.map(deserializeD1Row) : [];
      const command = String(sql).trim().split(/\s+/, 1)[0]?.toUpperCase() || null;
      return {
        rows,
        rowCount: rows.length || Number(result?.meta?.changes || 0),
        command
      };
    } catch (error) {
      throw normalizeD1Error(error);
    }
  }

  async end() {
    // A Worker binding has no client connection to close.
  }
}

export function createD1Database(binding) {
  return new D1Database(binding);
}
