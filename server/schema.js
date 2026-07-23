const emptyDiagram = {
  version: 3,
  exportedAt: null,
  entities: [],
  assocs: [],
  modules: {},
  positions: {},
  cardinalEdits: {},
  visibleModules: []
};

export function createEmptyDiagram() {
  return { ...emptyDiagram, exportedAt: new Date().toISOString() };
}

export async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS folders (
      id SERIAL PRIMARY KEY,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#2f6fbd',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS designs (
      id SERIAL PRIMARY KEY,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'MCD',
      status TEXT NOT NULL DEFAULT 'Brouillon',
      folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
      diagram_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      xml_content TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS design_collaborators (
      design_id INTEGER NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (design_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS share_links (
      id SERIAL PRIMARY KEY,
      design_id INTEGER NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS design_user_folders (
      design_id INTEGER NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (design_id, user_id)
    );
  `);

  await pool.query(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS diagram_json JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
  await pool.query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS xml_content TEXT`);
  await pool.query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS uuid TEXT`);

  const { rows: pendingUuid } = await pool.query(`SELECT id FROM designs WHERE uuid IS NULL`);
  if (pendingUuid.length) {
    const crypto = await import('crypto');
    for (const row of pendingUuid) {
      await pool.query(`UPDATE designs SET uuid = $1 WHERE id = $2`, [crypto.randomUUID(), row.id]);
    }
  }
  await pool.query(`ALTER TABLE designs ALTER COLUMN uuid SET NOT NULL`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_user_id, created_at)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_designs_uuid ON designs(uuid)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_designs_owner_updated ON designs(owner_user_id, updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_designs_owner_folder ON designs(owner_user_id, folder_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_design_collaborators_user ON design_collaborators(user_id, design_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_share_links_design ON share_links(design_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_design_user_folders_user ON design_user_folders(user_id, folder_id)`);
}

export async function seedDemoData(pool, hashPassword) {
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    ['demo@merisia.local', await hashPassword('DemoPassword123!')]
  );
  const demoUserId = userRows[0].id;

  await pool.query(`UPDATE folders SET owner_user_id = $1 WHERE owner_user_id IS NULL`, [demoUserId]);
  await pool.query(`UPDATE designs SET owner_user_id = $1 WHERE owner_user_id IS NULL`, [demoUserId]);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM designs WHERE owner_user_id = $1', [demoUserId]);
  if (rows[0].count > 0) return;

  const folders = await pool.query(`
    INSERT INTO folders (owner_user_id, name, color) VALUES
    ($1, $2, '#2f6fbd'),
    ($1, $3, '#2d8f74'),
    ($1, $4, '#b8762b')
    RETURNING id, name
  `, [demoUserId, "Cours SUP'COM", 'Clients', 'Archives']);

  const byName = Object.fromEntries(folders.rows.map((folder) => [folder.name, folder.id]));
  const diagram = createEmptyDiagram();
  const crypto = await import('crypto');

  const seedDesigns = [
    ['Gestion Bibliotheque', 'MCD', 'Actif', byName["Cours SUP'COM"], "1 hour"],
    ['Plateforme E-learning', 'MLD', 'Brouillon', byName["Cours SUP'COM"], "1 day"],
    ['CRM Cabinet Medical', 'MCD', 'Actif', byName.Clients, "2 days"],
    ['Stock & Facturation', 'MLD', 'A valider', byName.Clients, "5 days"],
    ['Ancien projet location voitures', 'MCD', 'Archive', byName.Archives, "19 days"]
  ];

  for (const [title, kind, status, folderId, ago] of seedDesigns) {
    await pool.query(`
      INSERT INTO designs (owner_user_id, title, kind, status, folder_id, diagram_json, uuid, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, now() - $8::interval)
    `, [demoUserId, title, kind, status, folderId, diagram, crypto.randomUUID(), ago]);
  }
}
