import { requireAuth } from './auth.js';

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function uniqueFolderName(pool, userId, baseName, excludeId = null) {
  const { rows } = await pool.query(
    'SELECT name FROM folders WHERE owner_user_id = $1 AND (CAST($2 AS INTEGER) IS NULL OR id <> $2)',
    [userId, excludeId]
  );
  const existing = new Set(rows.map((row) => String(row.name).trim().toLowerCase()));
  if (!existing.has(baseName.toLowerCase())) return baseName;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseName} (${index})`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `${baseName} (${Date.now()})`;
}

export function registerFolderRoutes(app, pool) {
  app.get('/api/folders', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT f.id, f.name, f.color, CAST(COUNT(d.id) AS INTEGER) AS count,
               (SELECT CAST(COUNT(*) AS INTEGER) FROM designs WHERE owner_user_id = $1 AND status <> 'Archive') AS all_count
        FROM folders f
        LEFT JOIN designs d ON d.folder_id = f.id AND d.owner_user_id = $1 AND d.status <> 'Archive'
        WHERE f.owner_user_id = $1
        GROUP BY f.id
        ORDER BY f.created_at ASC
      `, [req.user.id]);
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/folders', requireAuth, async (req, res, next) => {
    try {
      const name = String(req.body.name || '').trim().slice(0, 80);
      const color = /^#[0-9a-f]{6}$/i.test(String(req.body.color || '')) ? req.body.color : '#2f6fbd';
      if (!name) return res.status(400).json({ ok: false, error: 'Nom de dossier requis' });
      const finalName = await uniqueFolderName(pool, req.user.id, name);
      const { rows } = await pool.query(
        'INSERT INTO folders (owner_user_id, name, color) VALUES ($1, $2, $3) RETURNING id, name, color, CAST(0 AS INTEGER) AS count',
        [req.user.id, finalName, color]
      );
      res.status(201).json(rows[0]);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/folders/:id', requireAuth, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const name = String(req.body.name || '').trim().slice(0, 80);
      const color = /^#[0-9a-f]{6}$/i.test(String(req.body.color || '')) ? req.body.color : null;
      if (!id) return res.status(404).json({ ok: false, error: 'Dossier introuvable' });
      if (!name && !color) return res.status(400).json({ ok: false, error: 'Aucune modification' });

      const updates = [];
      const values = [];
      if (name) {
        const finalName = await uniqueFolderName(pool, req.user.id, name, id);
        values.push(finalName);
        updates.push(`name = $${values.length}`);
      }
      if (color) {
        values.push(color);
        updates.push(`color = $${values.length}`);
      }
      values.push(id, req.user.id);

      const { rows } = await pool.query(`
        UPDATE folders
        SET ${updates.join(', ')}
        WHERE id = $${values.length - 1} AND owner_user_id = $${values.length}
        RETURNING id, name, color
      `, values);
      if (!rows.length) return res.status(404).json({ ok: false, error: 'Dossier introuvable' });
      res.json(rows[0]);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/folders/:id', requireAuth, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id) await pool.query('DELETE FROM folders WHERE id = $1 AND owner_user_id = $2', [id, req.user.id]);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });
}
