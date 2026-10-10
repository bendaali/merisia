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

## Deploy to Cloudflare Workers with D1

The Worker entry point runs the Express API through Cloudflare's Node HTTP
compatibility layer and serves the Vite build through the `ASSETS` binding.

In the Cloudflare build settings use:

```text
Build command:  npm run build
Deploy command: npm run deploy
```

Do not use `npm start` as the Cloudflare deploy command. That command starts
the traditional Node server and therefore expects PostgreSQL.

Add a D1 binding to the Worker in **Settings > Bindings**:

```text
Variable name: DB
Resource:      your Merisia D1 database
```

Alternatively, declare the binding in `wrangler.jsonc` after creating the
database:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "merisia",
      "database_id": "<your-database-id>"
    }
  ]
}
```

The Worker initializes an empty D1 database on its first database-backed
request. Static pages remain available if the binding is missing, while API
requests return `503 database_unavailable`.

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

The Worker deployment supports the HTTP application and D1-backed API.
Realtime collaboration is not enabled on Workers yet because the existing
implementation uses the Node `ws` upgrade API. The PostgreSQL Node deployment
continues to support it.

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
