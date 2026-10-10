# Merisia Frontpage

Static landing page for Merisia, a Merise MCD / logical model design tool.

## Files
- `index.html` — page structure
- `styles.css` — visual design, responsive layout, animations
- `script.js` — typewriter hero effect

## Upload to VPS
Upload the folder contents to your web root, for example `/var/www/merisia`, then serve `index.html` with Nginx/Apache.

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
