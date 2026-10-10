import crypto from 'crypto';
import express from 'express';
import { requireAuth, requirePageAuth } from './auth.js';
import { createEmptyDiagram } from './schema.js';
import { validateDiagram } from './diagram.js';
import {
  notifyCollaboratorAccessRevoked,
  notifyCollaboratorRoleUpdated,
  notifyDesignDeleted
} from './realtime-notifier.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUuid(value) {
  return UUID_RE.test(String(value || '')) ? String(value).toLowerCase() : null;
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function diagramToXml(diagram) {
  const data = validateDiagram(diagram) || createEmptyDiagram();
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<merisia-design version="${escapeXml(data.version)}" exportedAt="${escapeXml(data.exportedAt)}">\n` +
    `  <payload>${escapeXml(JSON.stringify(data))}</payload>\n` +
    `</merisia-design>\n`;
}

async function requireOwnedFolder(pool, folderId, userId) {
  if (!folderId) return null;
  const { rows } = await pool.query('SELECT id FROM folders WHERE id = $1 AND owner_user_id = $2', [folderId, userId]);
  return rows.length ? folderId : undefined;
}

async function getDesignAccessByUuid(pool, designUuid, userId) {
  const { rows } = await pool.query(`
    SELECT
      d.id,
      d.uuid,
      d.owner_user_id,
      CASE
        WHEN d.owner_user_id = $2 THEN 'owner'
        ELSE dc.role
      END AS role
    FROM designs d
    LEFT JOIN design_collaborators dc ON dc.design_id = d.id AND dc.user_id = $2
    WHERE d.uuid = $1 AND (d.owner_user_id = $2 OR dc.user_id = $2)
  `, [designUuid, userId]);
  return rows[0] || null;
}

function canWriteDesign(access) {
  return access?.role === 'owner' || access?.role === 'editor';
}

async function uniqueDesignTitle(pool, userId, baseTitle, excludeId = null) {
  const { rows } = await pool.query(
    'SELECT title FROM designs WHERE owner_user_id = $1 AND (CAST($2 AS INTEGER) IS NULL OR id <> $2)',
    [userId, excludeId]
  );
  const existing = new Set(rows.map((row) => String(row.title).trim().toLowerCase()));
  if (!existing.has(baseTitle.toLowerCase())) return baseTitle;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseTitle} (${index})`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `${baseTitle} (${Date.now()})`;
}

export function registerDesignRoutes(app, pool) {
  app.get('/api/designs', requireAuth, async (req, res, next) => {
    try {
      const search = `%${String(req.query.search || '').trim()}%`;
      const folder = req.query.folder ? parseId(req.query.folder) : null;
      const archived = req.query.archived === 'true';
      if (req.query.folder && !folder) return res.status(400).json({ ok: false, error: 'Dossier invalide' });

      const { rows } = await pool.query(`
        SELECT d.uuid AS id, d.title, d.kind, d.status, d.updated_at,
               CASE WHEN d.owner_user_id = $1 THEN owner_folder.name ELSE user_folder.name END AS folder,
               CASE WHEN d.owner_user_id = $1 THEN owner_folder.color ELSE user_folder.color END AS folder_color,
               CASE WHEN d.owner_user_id = $1 THEN 'owner' ELSE dc.role END AS access_role
        FROM designs d
        LEFT JOIN design_collaborators dc ON dc.design_id = d.id AND dc.user_id = $1
        LEFT JOIN design_user_folders duf ON duf.design_id = d.id AND duf.user_id = $1
        LEFT JOIN folders user_folder ON user_folder.id = duf.folder_id AND user_folder.owner_user_id = $1
        LEFT JOIN folders owner_folder ON owner_folder.id = d.folder_id AND owner_folder.owner_user_id = d.owner_user_id
        WHERE (d.owner_user_id = $1 OR dc.user_id = $1)
          AND ($2 = '%%' OR LOWER(d.title) LIKE LOWER($2) OR LOWER(d.kind) LIKE LOWER($2) OR LOWER(d.status) LIKE LOWER($2) OR LOWER(CASE WHEN d.owner_user_id = $1 THEN owner_folder.name ELSE user_folder.name END) LIKE LOWER($2))
          AND (CAST($3 AS INTEGER) IS NULL OR (CASE WHEN d.owner_user_id = $1 THEN d.folder_id ELSE duf.folder_id END) = CAST($3 AS INTEGER))
          AND (($4 = 1 AND d.status = 'Archive') OR ($4 = 0 AND d.status <> 'Archive'))
        ORDER BY d.updated_at DESC
      `, [req.user.id, search, folder, archived ? 1 : 0]);
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/designs', requireAuth, async (req, res, next) => {
    try {
      const title = String(req.body.title || 'Nouveau design').trim().slice(0, 120) || 'Nouveau design';
      const finalTitle = await uniqueDesignTitle(pool, req.user.id, title);
      const requestedFolderId = req.body.folder_id ? parseId(req.body.folder_id) : null;
      const folderId = await requireOwnedFolder(pool, requestedFolderId, req.user.id);
      if (folderId === undefined) return res.status(400).json({ ok: false, error: 'Dossier invalide' });

      const diagram = createEmptyDiagram();
      const newUuid = crypto.randomUUID();
      const { rows } = await pool.query(`
        INSERT INTO designs (owner_user_id, title, folder_id, kind, status, diagram_json, uuid)
        VALUES ($1, $2, $3, 'MCD', 'Brouillon', $4, $5)
        RETURNING uuid AS id, title, kind, status, updated_at
      `, [req.user.id, finalTitle, folderId, diagram, newUuid]);
      res.status(201).json(rows[0]);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/designs/:id', requireAuth, async (req, res, next) => {
    try {
      const uuid = parseUuid(req.params.id);
      if (!uuid) return res.status(404).json({ ok: false, error: 'Design introuvable' });
      const { rows } = await pool.query(`
        SELECT d.uuid AS id, d.title, d.kind, d.status, d.folder_id, d.diagram_json, d.updated_at,
               CASE WHEN d.owner_user_id = $2 THEN 'owner' ELSE dc.role END AS access_role
        FROM designs d
        LEFT JOIN design_collaborators dc ON dc.design_id = d.id AND dc.user_id = $2
        WHERE d.uuid = $1 AND (d.owner_user_id = $2 OR dc.user_id = $2)
      `, [uuid, req.user.id]);
      if (!rows.length) return res.status(404).json({ ok: false, error: 'Design introuvable' });
      res.json(rows[0]);
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/designs/:id', requireAuth, async (req, res, next) => {
    try {
      const uuid = parseUuid(req.params.id);
      const diagram = validateDiagram(req.body.diagram_json || req.body.diagram);
      const ifUnmodifiedSince = req.body.if_unmodified_since ? new Date(req.body.if_unmodified_since) : null;
      if (!uuid) return res.status(404).json({ ok: false, error: 'Design introuvable' });
      if (!diagram) return res.status(400).json({ ok: false, error: 'Diagramme JSON invalide' });
      if (ifUnmodifiedSince && Number.isNaN(ifUnmodifiedSince.getTime())) {
        return res.status(400).json({ ok: false, error: 'Version de sauvegarde invalide' });
      }
      const access = await getDesignAccessByUuid(pool, uuid, req.user.id);
      if (!canWriteDesign(access)) return res.status(404).json({ ok: false, error: 'Design introuvable' });

      if (ifUnmodifiedSince) {
        const { rows: versionRows } = await pool.query('SELECT updated_at FROM designs WHERE id = $1', [access.id]);
        const currentUpdatedAt = versionRows[0]?.updated_at;
        if (currentUpdatedAt && new Date(currentUpdatedAt).getTime() !== ifUnmodifiedSince.getTime()) {
          return res.status(409).json({
            ok: false,
            error: 'Ce design a ete modifie ailleurs. Recharge la page avant de sauvegarder.',
            updated_at: currentUpdatedAt
          });
        }
      }

      const { rows } = await pool.query(`
        UPDATE designs
        SET diagram_json = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING uuid AS id, updated_at
      `, [diagram, access.id]);
      if (!rows.length) return res.status(404).json({ ok: false, error: 'Design introuvable' });
      res.json({ ok: true, design: rows[0] });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/designs/:id', requireAuth, async (req, res, next) => {
    try {
      const uuid = parseUuid(req.params.id);
      if (!uuid) return res.status(404).json({ ok: false, error: 'Design introuvable' });
      const access = await getDesignAccessByUuid(pool, uuid, req.user.id);
      if (!canWriteDesign(access)) return res.status(404).json({ ok: false, error: 'Design introuvable' });

      const updates = [];
      const values = [];
      if (req.body.title !== undefined) {
        const title = String(req.body.title || '').trim().slice(0, 120);
        if (!title) return res.status(400).json({ ok: false, error: 'Titre invalide' });
        const finalTitle = await uniqueDesignTitle(pool, req.user.id, title, access.id);
        values.push(finalTitle);
        updates.push(`title = $${values.length}`);
      }
      if (req.body.status !== undefined) {
        const status = String(req.body.status || '').trim().slice(0, 40);
        if (!['Brouillon', 'Actif', 'A valider', 'Archive'].includes(status)) {
          return res.status(400).json({ ok: false, error: 'Statut invalide' });
        }
        values.push(status);
        updates.push(`status = $${values.length}`);
      }
      let collaboratorFolderHandled = false;
      if (req.body.folder_id !== undefined) {
        const requestedFolderId = req.body.folder_id ? parseId(req.body.folder_id) : null;
        const folderId = await requireOwnedFolder(pool, requestedFolderId, req.user.id);
        if (folderId === undefined) return res.status(400).json({ ok: false, error: 'Dossier invalide' });
        if (access.owner_user_id === req.user.id) {
          values.push(folderId);
          updates.push(`folder_id = $${values.length}`);
        } else {
          await pool.query(`
            INSERT INTO design_user_folders (design_id, user_id, folder_id, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (design_id, user_id)
            DO UPDATE SET folder_id = EXCLUDED.folder_id, updated_at = CURRENT_TIMESTAMP
          `, [access.id, req.user.id, folderId]);
          collaboratorFolderHandled = true;
        }
      }
      if (!updates.length) {
        if (collaboratorFolderHandled) return res.json({ ok: true, design: { id: uuid } });
        return res.status(400).json({ ok: false, error: 'Aucune modification' });
      }
      values.push(access.id);

      const { rows } = await pool.query(`
        UPDATE designs
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${values.length}
        RETURNING uuid AS id, title, kind, status, updated_at
      `, values);
      res.json({ ok: true, design: rows[0] });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/designs/:id/xml', requireAuth, async (req, res, next) => {
    try {
      const uuid = parseUuid(req.params.id);
      if (!uuid) return res.status(404).send('Design introuvable');
      const { rows } = await pool.query(`
        SELECT d.diagram_json
        FROM designs d
        LEFT JOIN design_collaborators dc ON dc.design_id = d.id AND dc.user_id = $2
        WHERE d.uuid = $1 AND (d.owner_user_id = $2 OR dc.user_id = $2)
      `, [uuid, req.user.id]);
      if (!rows.length) return res.status(404).send('Design introuvable');
      res.type('application/xml').send(diagramToXml(rows[0].diagram_json));
    } catch (error) {
      next(error);
    }
  });

  app.put(
    '/api/designs/:id/xml',
    requireAuth,
    express.text({ type: ['application/xml', 'text/xml', 'text/plain', '*/*'], limit: '5mb' }),
    async (req, res, next) => {
      try {
        const uuid = parseUuid(req.params.id);
        const xml = String(req.body || '');
        if (!uuid) return res.status(404).json({ ok: false, error: 'Design introuvable' });
        if (!xml.trim().startsWith('<?xml') && !xml.trim().startsWith('<merisia-design')) {
          return res.status(400).json({ ok: false, error: 'XML Merisia invalide' });
        }
        const access = await getDesignAccessByUuid(pool, uuid, req.user.id);
        if (!canWriteDesign(access)) return res.status(404).json({ ok: false, error: 'Design introuvable' });
        const { rowCount } = await pool.query(
          'UPDATE designs SET xml_content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [xml, access.id]
        );
        if (!rowCount) return res.status(404).json({ ok: false, error: 'Design introuvable' });
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete('/api/designs/:id', requireAuth, async (req, res, next) => {
    try {
      const uuid = parseUuid(req.params.id);
      if (uuid) {
        const { rowCount } = await pool.query(
          'DELETE FROM designs WHERE uuid = $1 AND owner_user_id = $2',
          [uuid, req.user.id]
        );
        if (rowCount > 0) notifyDesignDeleted(uuid);
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/designs/:id/share', requireAuth, async (req, res, next) => {
    try {
      const uuid = parseUuid(req.params.id);
      if (!uuid) return res.status(404).json({ ok: false, error: 'Design introuvable' });
      const { rows: ownerRows } = await pool.query(
        'SELECT id FROM designs WHERE uuid = $1 AND owner_user_id = $2',
        [uuid, req.user.id]
      );
      if (!ownerRows.length) return res.status(404).json({ ok: false, error: 'Design introuvable' });
      const designRowId = ownerRows[0].id;

      const { rows: links } = await pool.query(
        'SELECT token, role, created_at FROM share_links WHERE design_id = $1 ORDER BY created_at DESC',
        [designRowId]
      );
      const { rows: collaborators } = await pool.query(`
        SELECT u.email, dc.role, dc.created_at
        FROM design_collaborators dc
        JOIN users u ON u.id = dc.user_id
        WHERE dc.design_id = $1
        ORDER BY dc.created_at DESC
      `, [designRowId]);
      res.json({ links, collaborators });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/designs/:id/share', requireAuth, async (req, res, next) => {
    try {
      const uuid = parseUuid(req.params.id);
      const role = req.body.role === 'viewer' ? 'viewer' : 'editor';
      if (!uuid) return res.status(404).json({ ok: false, error: 'Design introuvable' });
      const { rows: ownerRows } = await pool.query(
        'SELECT id FROM designs WHERE uuid = $1 AND owner_user_id = $2',
        [uuid, req.user.id]
      );
      if (!ownerRows.length) return res.status(404).json({ ok: false, error: 'Design introuvable' });

      const token = crypto.randomBytes(24).toString('base64url');
      await pool.query(
        'INSERT INTO share_links (design_id, token, role, created_by) VALUES ($1, $2, $3, $4)',
        [ownerRows[0].id, token, role, req.user.id]
      );
      res.status(201).json({ token, role });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/designs/:id/share', requireAuth, async (req, res, next) => {
    try {
      const uuid = parseUuid(req.params.id);
      if (!uuid) return res.status(404).json({ ok: false, error: 'Design introuvable' });
      const { rows: ownerRows } = await pool.query(
        'SELECT id FROM designs WHERE uuid = $1 AND owner_user_id = $2',
        [uuid, req.user.id]
      );
      if (!ownerRows.length) return res.status(404).json({ ok: false, error: 'Design introuvable' });

      const token = typeof req.body?.token === 'string' && req.body.token ? req.body.token : null;
      if (token) {
        await pool.query('DELETE FROM share_links WHERE design_id = $1 AND token = $2', [ownerRows[0].id, token]);
      } else {
        await pool.query('DELETE FROM share_links WHERE design_id = $1', [ownerRows[0].id]);
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/designs/:id/collaborators/:email', requireAuth, async (req, res, next) => {
    try {
      const uuid = parseUuid(req.params.id);
      if (!uuid) return res.status(404).json({ ok: false, error: 'Design introuvable' });
      const { rows: ownerRows } = await pool.query(
        'SELECT id FROM designs WHERE uuid = $1 AND owner_user_id = $2',
        [uuid, req.user.id]
      );
      if (!ownerRows.length) return res.status(404).json({ ok: false, error: 'Design introuvable' });
      const email = String(req.params.email || '').toLowerCase();
      const { rows } = await pool.query(`
        DELETE FROM design_collaborators
        WHERE design_id = $1
          AND user_id = (SELECT id FROM users WHERE email = $2)
        RETURNING user_id
      `, [ownerRows[0].id, email]);
      if (rows.length) notifyCollaboratorAccessRevoked(uuid, email);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/designs/:id/collaborators/:email/role', requireAuth, async (req, res, next) => {
    try {
      const uuid = parseUuid(req.params.id);
      const email = String(req.params.email || '').trim().toLowerCase();
      const role = req.body.role === 'editor' ? 'editor' : req.body.role === 'viewer' ? 'viewer' : null;
      if (!uuid || !email || !role) return res.status(400).json({ ok: false, error: 'Demande invalide' });

      const { rows: ownerRows } = await pool.query(
        'SELECT id FROM designs WHERE uuid = $1 AND owner_user_id = $2',
        [uuid, req.user.id]
      );
      if (!ownerRows.length) return res.status(404).json({ ok: false, error: 'Design introuvable' });

      const { rows } = await pool.query(`
        UPDATE design_collaborators
        SET role = $1
        WHERE design_id = $2
          AND user_id = (SELECT id FROM users WHERE email = $3)
        RETURNING role
      `, [role, ownerRows[0].id, email]);
      if (!rows.length) return res.status(404).json({ ok: false, error: 'Collaborateur introuvable' });

      const collaborator = { email, role: rows[0].role };
      notifyCollaboratorRoleUpdated(uuid, collaborator.email, collaborator.role);
      res.json({ ok: true, collaborator });
    } catch (error) {
      next(error);
    }
  });

  app.get('/share/:token', async (req, res, next) => {
    try {
      const token = String(req.params.token || '');
      if (!token) return res.status(404).send('Lien introuvable');
      const { rows } = await pool.query(`
        SELECT sl.design_id, sl.role, d.uuid, d.owner_user_id
        FROM share_links sl
        JOIN designs d ON d.id = sl.design_id
        WHERE sl.token = $1
      `, [token]);
      if (!rows.length) return res.status(404).send('Lien introuvable ou revoque');
      const link = rows[0];

      if (req.user) {
        if (link.owner_user_id !== req.user.id) {
          await pool.query(`
            INSERT INTO design_collaborators (design_id, user_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (design_id, user_id) DO UPDATE SET role = EXCLUDED.role
          `, [link.design_id, req.user.id, link.role]);
        }
        return res.redirect(`/editor/${link.uuid}`);
      }

      if (link.role !== 'viewer') {
        const next = encodeURIComponent(req.originalUrl);
        return res.redirect(`/auth?next=${next}`);
      }
      return res.redirect(`/guest/${token}`);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/share/:token', async (req, res, next) => {
    try {
      const token = String(req.params.token || '');
      const { rows } = await pool.query(`
        SELECT d.uuid AS id, d.title, d.kind, d.status, d.diagram_json, d.updated_at, sl.role
        FROM share_links sl
        JOIN designs d ON d.id = sl.design_id
        WHERE sl.token = $1 AND sl.role = 'viewer'
      `, [token]);
      if (!rows.length) return res.status(404).json({ ok: false, error: 'Lien introuvable' });
      const row = rows[0];
      res.json({ ...row, access_role: 'guest' });
    } catch (error) {
      next(error);
    }
  });
}

export { getDesignAccessByUuid, canWriteDesign };
