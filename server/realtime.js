import { WebSocketServer } from 'ws';
import { resolveUserFromCookies } from './auth.js';
import { getDesignAccessByUuid } from './designs.js';
import { DIAGRAM_MAX_BYTES, validateDiagram } from './diagram.js';
import { parseAllowedOrigins } from './security.js';
import { setRealtimeNotifier } from './realtime-notifier.js';

const PALETTE = ['#2f6fbd', '#2d8f74', '#b8762b', '#8b5cf6', '#db2777', '#0d9488', '#dc2626', '#1d4ed8'];
const PRESENCE_TTL_MS = 60_000;
const WS_MAX_MESSAGE_BYTES = DIAGRAM_MAX_BYTES + 16 * 1024;
const WS_ALLOWED_TYPES = new Set(['presence', 'diagram', 'saved', 'request_edit', 'ping']);
const WS_CONNECTION_WINDOW_MS = 60_000;
const WS_MAX_CONNECTIONS_PER_WINDOW = 60;
const WS_MESSAGE_WINDOW_MS = 10_000;
const WS_MAX_MESSAGES_PER_WINDOW = 120;
const PRESENCE_SELECTION_LIMIT = 200;
const PRESENCE_ID_LIMIT = 120;
const PRESENCE_EDITING_LIMIT = 120;
const COORD_LIMIT = 1_000_000;

function colorForUser(id) {
  return PALETTE[Number(id) % PALETTE.length];
}

function displayNameForEmail(email) {
  if (!email) return 'Invité';
  const local = String(email).split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function safeJson(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

function byteLength(raw) {
  if (typeof raw === 'string') return Buffer.byteLength(raw, 'utf8');
  if (Buffer.isBuffer(raw)) return raw.length;
  if (Array.isArray(raw)) return raw.reduce((sum, item) => sum + byteLength(item), 0);
  return Buffer.byteLength(String(raw || ''), 'utf8');
}

function rejectMessage(ws, reason) {
  sendTo(ws, { type: 'error', error: reason });
}

function finiteCoordinate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(COORD_LIMIT, Math.max(-COORD_LIMIT, number));
}

function sanitizePresence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let cursor = null;
  if (value.cursor && typeof value.cursor === 'object' && !Array.isArray(value.cursor)) {
    const x = finiteCoordinate(value.cursor.x);
    const y = finiteCoordinate(value.cursor.y);
    if (x !== null && y !== null) cursor = { x, y };
  }
  const selection = Array.isArray(value.selection)
    ? value.selection.slice(0, PRESENCE_SELECTION_LIMIT).map((item) => String(item).slice(0, PRESENCE_ID_LIMIT))
    : [];
  const editing = typeof value.editing === 'string'
    ? value.editing.slice(0, PRESENCE_EDITING_LIMIT)
    : null;
  return { cursor, selection, editing };
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function sameOrigin(req, origin) {
  if (!origin) return true;
  const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
  return origin === `${proto}://${req.headers.host}`;
}

function websocketOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = parseAllowedOrigins();
  if (allowed.length) return allowed.includes(origin);
  return sameOrigin(req, origin);
}

function incrementWindowCounter(store, key, windowMs) {
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    store.set(key, next);
    return next.count;
  }
  current.count += 1;
  return current.count;
}

export function attachRealtime(httpServer, pool) {
  const wss = new WebSocketServer({ noServer: true });
  /** rooms: designUuid -> Map<connectionId, { ws, userId, email, name, color, presence, role }> */
  const rooms = new Map();
  const connectionAttempts = new Map();
  let nextConnectionId = 1;

  setRealtimeNotifier({
    deleted(designUuid) {
      const room = rooms.get(designUuid);
      if (!room) return;
      const payload = JSON.stringify({ type: 'deleted' });
      for (const peer of room.values()) {
        if (peer.ws.readyState === 1) {
          try { peer.ws.send(payload); } catch {}
          try { peer.ws.close(); } catch {}
        }
      }
      rooms.delete(designUuid);
    },
    roleUpdated(designUuid, userEmail, role) {
      const room = rooms.get(designUuid);
      if (!room) return;
      const normalizedEmail = String(userEmail || '').toLowerCase();
      for (const peer of room.values()) {
        if (!peer.email || peer.email.toLowerCase() !== normalizedEmail) continue;
        peer.role = role;
        sendTo(peer.ws, { type: 'role_updated', role });
        broadcast(room, peer.connectionId, {
          type: 'peer_role_updated',
          connectionId: peer.connectionId,
          role
        });
      }
    },
    accessRevoked(designUuid, userEmail) {
      const room = rooms.get(designUuid);
      if (!room) return;
      const normalizedEmail = String(userEmail || '').toLowerCase();
      for (const [connectionId, peer] of room) {
        if (!peer.email || peer.email.toLowerCase() !== normalizedEmail) continue;
        sendTo(peer.ws, { type: 'access_revoked' });
        broadcast(room, connectionId, { type: 'leave', connectionId });
        try { peer.ws.close(); } catch {}
        room.delete(connectionId);
      }
    }
  });

  httpServer.on('upgrade', async (req, socket, head) => {
    try {
      if (!websocketOriginAllowed(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      const ip = clientIp(req);
      if (incrementWindowCounter(connectionAttempts, ip, WS_CONNECTION_WINDOW_MS) > WS_MAX_CONNECTIONS_PER_WINDOW) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
      }
      const url = new URL(req.url, `http://${req.headers.host}`);
      const match = url.pathname.match(/^\/ws\/designs\/([0-9a-f-]{36})$/i);
      if (!match) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }
      const designUuid = match[1].toLowerCase();
      const user = await resolveUserFromCookies(pool, req.headers.cookie);
      let access = user ? await getDesignAccessByUuid(pool, designUuid, user.id) : null;
      let guest = null;
      if (!user) {
        const token = url.searchParams.get('token') || '';
        guest = await getGuestViewerAccess(pool, designUuid, token);
        access = guest;
      }
      if (!access) {
        socket.write(`HTTP/1.1 ${user ? 403 : 401} Unauthorized\r\n\r\n`);
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        joinRoom({ ws, user, guest, designUuid, access });
      });
    } catch (error) {
      console.error('WS upgrade error', error);
      try { socket.destroy(); } catch {}
    }
  });

  function joinRoom({ ws, user, guest, designUuid, access }) {
    if (!rooms.has(designUuid)) rooms.set(designUuid, new Map());
    const room = rooms.get(designUuid);
    const connectionId = nextConnectionId++;
      const peer = {
      ws,
      connectionId,
      userId: user?.id || null,
      email: user?.email || null,
      name: user ? displayNameForEmail(user.email) : guest.name,
      color: user ? colorForUser(user.id) : guest.color,
      role: access.role,
      presence: { cursor: null, selection: [], editing: null },
      lastSeen: Date.now(),
      messageWindow: { count: 0, resetAt: Date.now() + WS_MESSAGE_WINDOW_MS }
    };
    room.set(connectionId, peer);

    sendTo(ws, {
      type: 'init',
      self: {
        connectionId,
        userId: peer.userId,
        email: peer.email,
        name: peer.name,
        color: peer.color,
        role: peer.role
      },
      peers: snapshotPeers(room, connectionId)
    });

    if (room.liveDiagram) {
      sendTo(ws, {
        type: 'diagram',
        connectionId: null,
        diagram: room.liveDiagram
      });
    }

    broadcast(room, connectionId, {
      type: 'join',
      peer: presencePayload(peer)
    });

    async function canPeerWriteDiagram() {
      if (!peer.userId) return false;
      const latest = await getDesignAccessByUuid(pool, designUuid, peer.userId);
      if (!latest) {
        sendTo(ws, { type: 'access_revoked' });
        try { ws.close(); } catch {}
        return false;
      }
      peer.role = latest.role;
      return latest.role === 'owner' || latest.role === 'editor';
    }

    ws.on('message', async (raw) => {
      if (incrementWindowCounter({
        get: () => peer.messageWindow,
        set: (_key, value) => { peer.messageWindow = value; }
      }, 'peer', WS_MESSAGE_WINDOW_MS) > WS_MAX_MESSAGES_PER_WINDOW) {
        rejectMessage(ws, 'Trop de messages websocket');
        try { ws.close(1008, 'Rate limit'); } catch {}
        return;
      }
      if (byteLength(raw) > WS_MAX_MESSAGE_BYTES) {
        rejectMessage(ws, 'Message websocket trop volumineux');
        try { ws.close(1009, 'Message too large'); } catch {}
        return;
      }
      const msg = safeJson(raw.toString());
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
        rejectMessage(ws, 'Message websocket invalide');
        return;
      }
      if (!WS_ALLOWED_TYPES.has(msg.type)) {
        rejectMessage(ws, 'Type de message websocket inconnu');
        return;
      }
      peer.lastSeen = Date.now();
      if (msg.type === 'presence') {
        const next = sanitizePresence(msg.presence);
        if (!next) {
          rejectMessage(ws, 'Presence websocket invalide');
          return;
        }
        peer.presence = next;
        broadcast(room, connectionId, {
          type: 'presence',
          connectionId,
          presence: next
        });
      } else if (msg.type === 'diagram') {
        if (!await canPeerWriteDiagram()) {
          rejectMessage(ws, 'Role insuffisant pour modifier le diagramme');
          return;
        }
        const diagram = validateDiagram(msg.diagram);
        if (!diagram) {
          rejectMessage(ws, 'Diagramme websocket invalide');
          return;
        }
        room.liveDiagram = diagram;
        broadcast(room, connectionId, {
          type: 'diagram',
          connectionId,
          diagram
        });
      } else if (msg.type === 'saved' && typeof msg.updated_at === 'string') {
        if (!await canPeerWriteDiagram()) {
          rejectMessage(ws, 'Role insuffisant pour signaler une sauvegarde');
          return;
        }
        broadcast(room, connectionId, {
          type: 'saved',
          connectionId,
          updated_at: msg.updated_at.slice(0, 80)
        });
      } else if (msg.type === 'request_edit') {
        if (peer.role !== 'viewer' || !peer.email) return;
        broadcastToOwners(room, {
          type: 'edit_request',
          from: {
            connectionId,
            userId: peer.userId,
            email: peer.email,
            name: peer.name,
            color: peer.color
          }
        });
      } else if (msg.type === 'ping') {
        sendTo(ws, { type: 'pong' });
      }
    });

    ws.on('close', () => {
      room.delete(connectionId);
      broadcast(room, connectionId, { type: 'leave', connectionId });
      if (room.size === 0) rooms.delete(designUuid);
    });

    ws.on('error', () => {});
  }

  setInterval(() => {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    for (const [uuid, room] of rooms) {
      for (const [connectionId, peer] of room) {
        if (peer.lastSeen < cutoff) {
          try { peer.ws.terminate(); } catch {}
          room.delete(connectionId);
        }
      }
      if (room.size === 0) rooms.delete(uuid);
    }
  }, 30_000).unref();

  return wss;
}

function snapshotPeers(room, excludeId) {
  const out = [];
  for (const [connectionId, peer] of room) {
    if (connectionId === excludeId) continue;
    out.push(presencePayload(peer));
  }
  return out;
}

function presencePayload(peer) {
  return {
    connectionId: peer.connectionId,
    userId: peer.userId,
    email: peer.email,
    name: peer.name,
    color: peer.color,
    role: peer.role,
    presence: peer.presence
  };
}

function sendTo(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function broadcast(room, excludeId, payload) {
  const text = JSON.stringify(payload);
  for (const [connectionId, peer] of room) {
    if (connectionId === excludeId) continue;
    if (peer.ws.readyState === 1) peer.ws.send(text);
  }
}

function broadcastToOwners(room, payload) {
  const text = JSON.stringify(payload);
  for (const peer of room.values()) {
    if (peer.role === 'owner' && peer.ws.readyState === 1) peer.ws.send(text);
  }
}

async function getGuestViewerAccess(pool, designUuid, token) {
  if (!token) return null;
  const { rows } = await pool.query(`
    SELECT sl.role
    FROM share_links sl
    JOIN designs d ON d.id = sl.design_id
    WHERE d.uuid = $1 AND sl.token = $2 AND sl.role = 'viewer'
  `, [designUuid, token]);
  if (!rows.length) return null;
  return {
    role: 'guest',
    name: `Invite ${Math.floor(1000 + Math.random() * 9000)}`,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)]
  };
}
