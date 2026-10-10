# Merisia

Merisia is a Merise MCD / logical model design tool. Its server supports
PostgreSQL and a Cloudflare D1 Worker binding through the same `query()` API.

## PostgreSQL

PostgreSQL remains the default for the Node/Express server:

```sh
npm start
# Explicit equivalent:
npm start -- --database postgres
```

Connection settings use `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`,
`POSTGRES_PASSWORD`, and `POSTGRES_DB`.

The backend parser accepts `--database postgres`, `--database d1`, and the
short alias `--db`. A D1 binding is a Worker runtime object and therefore must
also be passed to the factory; it cannot be reconstructed from a command-line
string. Consequently, `node server.js --database d1` by itself reports the
missing binding; select D1 inside the Worker's `fetch(request, env)` handler.

## Cloudflare D1 binding

Bind the database in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "merisia"
database_id = "<your-database-id>"
```

Use the Worker-provided `env.DB` binding directly:

```js
import { createD1Database } from './server/d1.js';

export default {
  async fetch(request, env) {
    const database = createD1Database(env.DB);
    const { rows } = await database.query(
      'SELECT id, email FROM users WHERE email = $1',
      ['demo@merisia.local']
    );
    return Response.json(rows);
  }
};
```

The equivalent argument-based factory call in Node-compatible code is:

```js
import { createDatabase } from './server/db.js';

const database = createDatabase('d1', { binding: env.DB });
// PostgreSQL:
const postgres = createDatabase('postgres');
```

`createD1Database()` is the preferred Worker import because it does not import
the Node PostgreSQL driver. It translates `$1` placeholders, serializes JSON
and date parameters, and returns `{ rows, rowCount }` like `pg`.

Run `await migrate(database)` once from a controlled migration Worker or
deployment task before serving application traffic. Do not run migrations on
every request.

The current HTTP application uses Express and Node WebSockets. The D1 adapter
is Worker-safe, but deploying the entire HTTP server to Workers would also
require a Worker-native request/WebSocket entry point.

## Local configuration

Copy `.env.example` to `.env` and replace the placeholders with your own values.
Docker Compose reads `.env` automatically. For the Node server, export those
variables into its environment before starting it; the server does not load
`.env` itself. Keep real credentials out of Git and use deployment secrets in CI.

For a local Cloudflare deployment, copy `wrangler.jsonc` to
`wrangler.local.jsonc`, set your own D1 `database_id`, and run:

```sh
npm run build
npm run deploy -- --config wrangler.local.jsonc
```

Use the same private configuration approach in CI. The committed D1 ID is a
placeholder and must be replaced before deployment. Local configuration files
and `.claude/` are ignored by Git.
