export const DIAGRAM_MAX_BYTES = 512 * 1024;
export const DIAGRAM_LIMITS = {
  entities: 500,
  assocs: 500,
  modules: 120,
  positions: 2000,
  cardinalEdits: 2000,
  notes: 500,
  attrsPerEntity: 80,
  linksPerAssoc: 80,
  dataAttrsPerAssoc: 80,
  text: 240,
  noteText: 2000
};

function byteSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Infinity;
  }
}

function finiteNumber(value, fallback = 0, min = -1_000_000, max = 1_000_000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function text(value, fallback = '', max = DIAGRAM_LIMITS.text) {
  return String(value ?? fallback).slice(0, max);
}

function array(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function attr(value) {
  const input = plainObject(value);
  return {
    name: text(input.name || 'attr'),
    pk: !!input.pk
  };
}

function dataAttr(value) {
  const input = plainObject(value);
  return {
    id: text(input.id || `attr_${Date.now()}`, '', 120),
    name: text(input.name || 'attr'),
    dx: finiteNumber(input.dx),
    dy: finiteNumber(input.dy),
    pk: !!input.pk
  };
}

function entity(value) {
  const input = plainObject(value);
  return {
    id: text(input.id || `ent_${Date.now()}`, '', 120),
    name: text(input.name || 'NouvelleEntité'),
    x: finiteNumber(input.x),
    y: finiteNumber(input.y),
    m: text(input.m || '', '', 120),
    attrs: array(input.attrs, DIAGRAM_LIMITS.attrsPerEntity).map(attr)
  };
}

function assoc(value) {
  const input = plainObject(value);
  return {
    id: text(input.id || `assoc_${Date.now()}`, '', 120),
    name: text(input.name || 'associer'),
    x: finiteNumber(input.x),
    y: finiteNumber(input.y),
    recursive: !!input.recursive,
    entity: input.entity ? text(input.entity, '', 120) : undefined,
    links: array(input.links, DIAGRAM_LIMITS.linksPerAssoc).map((link) => {
      const item = plainObject(link);
      return { e: text(item.e, '', 120), c: text(item.c || '0,n', '0,n', 40) };
    }),
    dataAttrs: array(input.dataAttrs, DIAGRAM_LIMITS.dataAttrsPerAssoc).map(dataAttr)
  };
}

function moduleDef(value) {
  const input = plainObject(value);
  const color = (candidate, fallback) => /^#[0-9a-f]{6}$/i.test(String(candidate || '')) ? String(candidate) : fallback;
  return {
    label: text(input.label || 'Module'),
    fill: color(input.fill, '#DBEAFE'),
    stroke: color(input.stroke, '#3B82F6')
  };
}

function boundedRecord(value, max, mapValue) {
  const out = {};
  for (const [key, raw] of Object.entries(plainObject(value)).slice(0, max)) {
    out[text(key, '', 120)] = mapValue(raw);
  }
  return out;
}

function position(value) {
  const input = plainObject(value);
  return { x: finiteNumber(input.x), y: finiteNumber(input.y) };
}

function note(value) {
  const input = plainObject(value);
  return {
    id: text(input.id || `note_${Date.now()}`, '', 120),
    x: finiteNumber(input.x),
    y: finiteNumber(input.y),
    w: finiteNumber(input.w, 180, 80, 640),
    h: finiteNumber(input.h, 120, 60, 480),
    text: text(input.text || '', '', DIAGRAM_LIMITS.noteText),
    authorName: text(input.authorName || 'Auteur', 'Auteur', 120),
    authorColor: /^#[0-9a-f]{6}$/i.test(String(input.authorColor || '')) ? String(input.authorColor) : '#2f6fbd'
  };
}

export function validateDiagram(value, options = {}) {
  const maxBytes = options.maxBytes || DIAGRAM_MAX_BYTES;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (byteSize(value) > maxBytes) return null;
  const input = value;
  return {
    version: finiteNumber(input.version, 3, 1, 999),
    exportedAt: text(input.exportedAt || new Date().toISOString(), '', 80),
    entities: array(input.entities, DIAGRAM_LIMITS.entities).map(entity),
    assocs: array(input.assocs, DIAGRAM_LIMITS.assocs).map(assoc),
    modules: boundedRecord(input.modules, DIAGRAM_LIMITS.modules, moduleDef),
    positions: boundedRecord(input.positions, DIAGRAM_LIMITS.positions, position),
    cardinalEdits: boundedRecord(input.cardinalEdits, DIAGRAM_LIMITS.cardinalEdits, (raw) => text(raw, '', 40)),
    visibleModules: array(input.visibleModules, DIAGRAM_LIMITS.modules).map((item) => text(item, '', 120)),
    notes: array(input.notes, DIAGRAM_LIMITS.notes).map(note)
  };
}
