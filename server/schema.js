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

async function randomUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const nodeCrypto = await import('node:crypto');
  return nodeCrypto.randomUUID();
}

const postgresSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS folders (
    id SERIAL PRIMARY KEY,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#2f6fbd',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    uuid TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS design_collaborators (
    design_id INTEGER NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (design_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS share_links (
    id SERIAL PRIMARY KEY,
    design_id INTEGER NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS design_user_folders (
    design_id INTEGER NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (design_id, user_id)
  );
`;

const d1Schema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#2f6fbd',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS designs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'MCD',
    status TEXT NOT NULL DEFAULT 'Brouillon',
    folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
    diagram_json TEXT NOT NULL DEFAULT '{}',
    xml_content TEXT,
    uuid TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS design_collaborators (
    design_id INTEGER NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (design_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS share_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    design_id INTEGER NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS design_user_folders (
    design_id INTEGER NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (design_id, user_id)
  );
`;

const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_user_id, created_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_designs_uuid ON designs(uuid)',
  'CREATE INDEX IF NOT EXISTS idx_designs_owner_updated ON designs(owner_user_id, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_designs_owner_folder ON designs(owner_user_id, folder_id)',
  'CREATE INDEX IF NOT EXISTS idx_design_collaborators_user ON design_collaborators(user_id, design_id)',
  'CREATE INDEX IF NOT EXISTS idx_share_links_design ON share_links(design_id)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_design_user_folders_user ON design_user_folders(user_id, folder_id)'
];

async function ensureD1Column(database, table, column, definition) {
  const { rows } = await database.query(`PRAGMA table_info(${table})`);
  if (!rows.some((row) => row.name === column)) {
    await database.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function migrateD1(database) {
  await database.query(d1Schema);
  await ensureD1Column(database, 'folders', 'owner_user_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE');
  await ensureD1Column(database, 'designs', 'owner_user_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE');
  await ensureD1Column(database, 'designs', 'diagram_json', `TEXT NOT NULL DEFAULT '{}'`);
  const { rows: designColumns } = await database.query('PRAGMA table_info(designs)');
  if (!designColumns.some((row) => row.name === 'created_at')) {
    await database.query('ALTER TABLE designs ADD COLUMN created_at TEXT');
    await database.query('UPDATE designs SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL');
  }
  await ensureD1Column(database, 'designs', 'xml_content', 'TEXT');
  await ensureD1Column(database, 'designs', 'uuid', 'TEXT');
}

async function migratePostgres(database) {
  await database.query(postgresSchema);
  await database.query(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
  await database.query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
  await database.query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS diagram_json JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await database.query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await database.query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS xml_content TEXT`);
  await database.query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS uuid TEXT`);
}

export async function migrate(database) {
  if (database.backend === 'd1') await migrateD1(database);
  else await migratePostgres(database);

  const { rows: pendingUuid } = await database.query(`SELECT id FROM designs WHERE uuid IS NULL`);
  if (pendingUuid.length) {
    for (const row of pendingUuid) {
      await database.query(`UPDATE designs SET uuid = $1 WHERE id = $2`, [await randomUuid(), row.id]);
    }
  }
  if (database.backend !== 'd1') {
    await database.query(`ALTER TABLE designs ALTER COLUMN uuid SET NOT NULL`);
  }

  for (const sql of indexes) await database.query(sql);
}

export async function seedDemoData(database, hashPassword) {
  const { rows: userRows } = await database.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    ['demo@merisia.local', await hashPassword('DemoPassword123!')]
  );
  const demoUserId = userRows[0].id;

  await database.query(`UPDATE folders SET owner_user_id = $1 WHERE owner_user_id IS NULL`, [demoUserId]);
  await database.query(`UPDATE designs SET owner_user_id = $1 WHERE owner_user_id IS NULL`, [demoUserId]);

  const { rows } = await database.query(
    'SELECT CAST(COUNT(*) AS INTEGER) AS count FROM designs WHERE owner_user_id = $1',
    [demoUserId]
  );
  if (rows[0].count > 0) return;

  const folders = await database.query(`
    INSERT INTO folders (owner_user_id, name, color) VALUES
    ($1, $2, '#2f6fbd'),
    ($1, $3, '#2d8f74'),
    ($1, $4, '#b8762b')
    RETURNING id, name
  `, [demoUserId, "Cours SUP'COM", 'Clients', 'Archives']);

  const byName = Object.fromEntries(folders.rows.map((folder) => [folder.name, folder.id]));
  const diagram = createEmptyDiagram();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  const seedDesigns = [
    ['Gestion Bibliotheque', 'MCD', 'Actif', byName["Cours SUP'COM"], hour],
    ['Plateforme E-learning', 'MLD', 'Brouillon', byName["Cours SUP'COM"], day],
    ['CRM Cabinet Medical', 'MCD', 'Actif', byName.Clients, 2 * day],
    ['Stock & Facturation', 'MLD', 'A valider', byName.Clients, 5 * day],
    ['Ancien projet location voitures', 'MCD', 'Archive', byName.Archives, 19 * day]
  ];

  for (const [title, kind, status, folderId, age] of seedDesigns) {
    await database.query(`
      INSERT INTO designs (owner_user_id, title, kind, status, folder_id, diagram_json, uuid, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [demoUserId, title, kind, status, folderId, diagram, await randomUuid(), new Date(Date.now() - age)]);
  }
}
