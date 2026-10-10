import { useState, useRef, useEffect } from "react";

const EW = 178, EH = 46, AX = 88, AY = 24;

// ============================================================
// MERISIA THEME — beige paper aesthetic, Fraunces typography
// ============================================================
const THEME = {
  paper:     "#F1E8D2",   // canvas background (beige)
  cream:     "#FBF4E0",   // panel cards
  creamSoft: "#F7EFD9",
  line:      "#D4C6A0",   // parchment border
  lineSoft:  "#E5D9B5",
  ink:       "#2A2620",   // primary text
  inkSoft:   "#6F6655",   // secondary text
  inkMuted:  "#A89E83",
  brandDark: "#2A2620",   // primary buttons
  accent:    "#7A864A",   // connect mode / success (warm olive)
  danger:    "#B7593A",   // delete (terracotta)
  selection: "#3D5C5A",   // selection halo (deep teal)
  shadow:    "0 2px 10px rgba(74, 60, 32, 0.10)",
  shadowSoft:"0 1px 4px rgba(74, 60, 32, 0.08)",
};

const FONT_STACK   = '"Fraunces", "Manrope", Georgia, serif';
const FONT_MONO    = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

// ============================================================
// MODULES — éditables au runtime
// ============================================================
const DEFAULT_MODULES = {
};

const ENTITY_ATTRS = {
};

const ENTITIES = [
];

const ASSOCS = [
];

// ============================================================
// GEOMETRY / TEXT HELPERS
// ============================================================
const CARD_OFFSET = 22;
const CARD_PERP   = 7;

function wrapText(name, maxLen = 14) {
  if (name.length <= maxLen) return [name];
  const parts = name.split("_");
  const lines = [];
  let cur = "";
  for (const p of parts) {
    const next = cur ? cur + "_" + p : p;
    if (next.length > maxLen && cur) { lines.push(cur); cur = p; }
    else { cur = next; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function getAssocLabelLines(name) {
  if (name.length <= 18) return [name];
  const words = name.split(" ");
  if (words.length === 1) return wrapText(name, 18);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 18 && current) { lines.push(current); current = word; }
    else { current = next; }
  }
  if (current) lines.push(current);
  return lines;
}

function getEntityHeight(ent) {
  const lines = wrapText(ent.name);
  const attrs = ent.attrs || [];
  const nameH = lines.length * 15;
  const attrH = attrs.length > 0 ? attrs.length * 11 + 8 : 0;
  return Math.max(EH, nameH + attrH + (attrs.length > 0 ? 8 : 0));
}

function getCardinalityPosition(ent, assoc) {
  const dx = assoc.x - ent.x;
  const dy = assoc.y - ent.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { x: ent.x, y: ent.y };

  const halfW = EW / 2;
  const halfH = getEntityHeight(ent) / 2;

  const tEnt = Math.min(
    Math.abs(dx) > 0.01 ? halfW / Math.abs(dx) : Infinity,
    Math.abs(dy) > 0.01 ? halfH / Math.abs(dy) : Infinity
  );
  const denom = Math.sqrt((dx * dx) / (AX * AX) + (dy * dy) / (AY * AY));
  const tAssoc = denom > 0 ? 1 - 1 / denom : 1;

  const tOffset = CARD_OFFSET / dist;
  const tCard = Math.min(tEnt + tOffset, tEnt + (tAssoc - tEnt) * 0.5);

  const px = ent.x + tCard * dx;
  const py = ent.y + tCard * dy;
  return {
    x: px + (dy / dist) * CARD_PERP,
    y: py + (-dx / dist) * CARD_PERP,
  };
}

// ============================================================
// SHARED STYLE TOKENS
// ============================================================
const btnBase = {
  padding: "7px 14px",
  borderRadius: 8,
  fontSize: 12.5,
  fontFamily: FONT_STACK,
  cursor: "pointer",
  fontWeight: 600,
  letterSpacing: 0.1,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const btnPrimary = {
  ...btnBase,
  border: `1px solid ${THEME.brandDark}`,
  background: THEME.brandDark,
  color: THEME.cream,
  boxShadow: THEME.shadowSoft,
};

const btnGhost = {
  ...btnBase,
  border: `1px solid ${THEME.line}`,
  background: THEME.cream,
  color: THEME.ink,
  boxShadow: THEME.shadowSoft,
};

const btnAccent = {
  ...btnBase,
  border: `1px solid ${THEME.accent}`,
  background: THEME.accent,
  color: THEME.cream,
  boxShadow: THEME.shadowSoft,
};

const panelStyle = {
  background: THEME.cream,
  border: `1px solid ${THEME.line}`,
  borderRadius: 14,
  boxShadow: THEME.shadow,
};

// ============================================================
// CARDINALITY EDITOR
// ============================================================
function CardinalityEditor({ cardinalKey, assocs, cardinalEdits, onClose, tr, entMap, isEntityVisible, setCardinalValue }) {
  const inputRef = useRef(null);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    const [assocId, linkIndex] = cardinalKey.split("-");
    const assoc = assocs.find((a) => a.id === assocId);
    if (assoc && assoc.links[parseInt(linkIndex)]) {
      const link = assoc.links[parseInt(linkIndex)];
      const editedValue = cardinalEdits[cardinalKey];
      setInputValue(editedValue !== undefined ? editedValue : link.c);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [cardinalKey]);

  const handleSave = () => {
    const [assocId, linkIndex] = cardinalKey.split("-");
    setCardinalValue(assocId, parseInt(linkIndex), inputValue);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") onClose();
  };

  const [assocId, linkIndex] = cardinalKey.split("-");
  const assoc = assocs.find((a) => a.id === assocId);
  if (!assoc || !assoc.links[parseInt(linkIndex)]) return null;

  const link = assoc.links[parseInt(linkIndex)];
  const ent = entMap[link.e];
  if (!ent || !isEntityVisible(ent)) return null;

  const { x: cardX, y: cardY } = getCardinalityPosition(ent, assoc);
  const screenX = tr.x + cardX * tr.s;
  const screenY = tr.y + cardY * tr.s;

  return (
    <input
      ref={inputRef}
      type="text"
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: `${screenX - 25}px`,
        top: `${screenY - 12}px`,
        width: "56px",
        padding: "4px 6px",
        fontSize: "12px",
        fontWeight: 700,
        fontFamily: FONT_STACK,
        border: `2px solid ${THEME.selection}`,
        borderRadius: 6,
        background: THEME.cream,
        boxShadow: THEME.shadow,
        zIndex: 21,
        textAlign: "center",
        color: THEME.ink,
      }}
    />
  );
}

// ============================================================
// SECTION HEADER (used inside inspector and modal)
// ============================================================
function Kicker({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: THEME.inkSoft,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        marginBottom: 5,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================
// ENTITY INSPECTOR
// ============================================================
function EntityInspector({ entity, modules, updateEntity, deleteEntity, addAttr, updateAttr, deleteAttr }) {
  return (
    <>
      <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${THEME.lineSoft}`, background: THEME.creamSoft }}>
        <Kicker>Entité</Kicker>
        <input
          type="text"
          value={entity.name}
          onChange={(e) => updateEntity(entity.id, { name: e.target.value })}
          style={{
            width: "100%",
            fontSize: 19,
            fontFamily: FONT_STACK,
            fontWeight: 600,
            color: THEME.ink,
            border: `1px solid ${THEME.line}`,
            borderRadius: 7,
            padding: "7px 10px",
            background: THEME.cream,
            letterSpacing: -0.2,
          }}
        />
      </div>

      <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
        <Kicker>Module</Kicker>
        <select
          value={entity.m}
          onChange={(e) => updateEntity(entity.id, { m: e.target.value })}
          style={{
            width: "100%",
            padding: "7px 10px",
            border: `1px solid ${THEME.line}`,
            borderRadius: 7,
            fontSize: 13,
            fontFamily: FONT_STACK,
            background: THEME.cream,
            color: THEME.ink,
            marginBottom: 16,
          }}
        >
          {Object.entries(modules).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </select>

        <Kicker>Attributs · {(entity.attrs || []).length}</Kicker>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {(entity.attrs || []).map((attr, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 8px", background: THEME.creamSoft,
              border: `1px solid ${THEME.lineSoft}`, borderRadius: 7,
            }}>
              <label title="Clé primaire" style={{
                fontSize: 9, fontWeight: 700,
                color: attr.pk ? THEME.danger : THEME.inkMuted,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
              }}>
                <input
                  type="checkbox"
                  checked={!!attr.pk}
                  onChange={(e) => updateAttr(entity.id, i, { pk: e.target.checked })}
                  style={{ margin: 0, cursor: "pointer", accentColor: THEME.danger }}
                />
                PK
              </label>
              <input
                type="text"
                value={attr.name}
                onChange={(e) => updateAttr(entity.id, i, { name: e.target.value })}
                style={{
                  flex: 1, fontSize: 12, fontFamily: FONT_MONO,
                  border: `1px solid ${THEME.line}`, borderRadius: 5,
                  padding: "3px 6px", background: THEME.cream,
                  fontWeight: attr.pk ? 700 : 400, color: THEME.ink,
                }}
              />
              <button
                onClick={() => deleteAttr(entity.id, i)}
                title="Supprimer cet attribut"
                style={{ border: "none", background: "transparent", color: THEME.inkMuted, cursor: "pointer", fontSize: 14, padding: 2 }}
              >🗑</button>
            </div>
          ))}
        </div>

        <button
          onClick={() => addAttr(entity.id)}
          style={{
            ...btnGhost, width: "100%", marginBottom: 16,
            border: `1px dashed ${THEME.inkMuted}`,
            background: "transparent",
            color: THEME.inkSoft, fontWeight: 500,
            justifyContent: "center", boxShadow: "none",
          }}
        >+ Ajouter un attribut</button>

        <div style={{ borderTop: `1px solid ${THEME.lineSoft}`, paddingTop: 12 }}>
          <button
            onClick={() => {
              if (window.confirm(`Supprimer l'entité « ${entity.name} » ?\nTous les liens vers elle seront aussi supprimés.`)) {
                deleteEntity(entity.id);
              }
            }}
            style={{
              ...btnGhost, width: "100%",
              border: `1px solid ${THEME.danger}`, color: THEME.danger,
              background: THEME.cream, justifyContent: "center",
            }}
          >🗑 Supprimer cette entité</button>
        </div>
      </div>
    </>
  );
}

// ============================================================
// ASSOC INSPECTOR
// ============================================================
function AssocInspector({ assoc, entities, updateAssoc, deleteAssoc, removeLink, startConnectMode, addAssocAttr, updateAssocAttr, deleteAssocAttr }) {
  const entMap = Object.fromEntries(entities.map((e) => [e.id, e]));

  return (
    <>
      <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${THEME.lineSoft}`, background: THEME.creamSoft }}>
        <Kicker>Association{assoc.recursive ? " · récursive" : ""}</Kicker>
        <input
          type="text"
          value={assoc.name}
          onChange={(e) => updateAssoc(assoc.id, { name: e.target.value })}
          style={{
            width: "100%", fontSize: 19, fontFamily: FONT_STACK,
            fontWeight: 600, color: THEME.ink,
            border: `1px solid ${THEME.line}`, borderRadius: 7,
            padding: "7px 10px", background: THEME.cream, letterSpacing: -0.2,
          }}
        />
      </div>

      <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
        {!assoc.recursive && (
          <>
            <Kicker>Liens · {(assoc.links || []).length}</Kicker>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              {(assoc.links || []).map((link, i) => {
                const ent = entMap[link.e];
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 10px", background: THEME.creamSoft,
                    border: `1px solid ${THEME.lineSoft}`, borderRadius: 7,
                  }}>
                    <span style={{ flex: 1, fontSize: 13, color: THEME.ink, fontWeight: 600 }}>
                      {ent ? ent.name : `[supprimée: ${link.e}]`}
                    </span>
                    <span style={{ fontSize: 11, color: THEME.inkSoft, fontWeight: 700, fontFamily: FONT_MONO }}>
                      ({link.c || "—"})
                    </span>
                    <button
                      onClick={() => removeLink(assoc.id, i)}
                      title="Retirer ce lien"
                      style={{ border: "none", background: "transparent", color: THEME.inkMuted, cursor: "pointer", fontSize: 14, padding: 2 }}
                    >🗑</button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => startConnectMode(assoc.id)}
              style={{
                ...btnGhost, width: "100%", marginBottom: 16,
                border: `1px dashed ${THEME.selection}`,
                background: "transparent",
                color: THEME.selection,
                justifyContent: "center", boxShadow: "none",
              }}
            >🔗 Connecter à une entité…</button>
          </>
        )}

        <Kicker>Attributs porteurs · {(assoc.dataAttrs || []).length}</Kicker>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {(assoc.dataAttrs || []).map((attr, i) => (
            <div key={attr.id || i} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 8px", background: THEME.creamSoft,
              border: `1px solid ${THEME.lineSoft}`, borderRadius: 7,
            }}>
              <input
                type="text"
                value={attr.name}
                onChange={(e) => updateAssocAttr(assoc.id, i, { name: e.target.value })}
                style={{
                  flex: 1, fontSize: 12, fontFamily: FONT_MONO,
                  border: `1px solid ${THEME.line}`, borderRadius: 5,
                  padding: "3px 6px", background: THEME.cream, color: THEME.ink,
                }}
              />
              <button
                onClick={() => deleteAssocAttr(assoc.id, i)}
                title="Supprimer cet attribut"
                style={{ border: "none", background: "transparent", color: THEME.inkMuted, cursor: "pointer", fontSize: 14, padding: 2 }}
              >🗑</button>
            </div>
          ))}
        </div>
        <button
          onClick={() => addAssocAttr(assoc.id)}
          style={{
            ...btnGhost, width: "100%", marginBottom: 16,
            border: `1px dashed ${THEME.inkMuted}`,
            background: "transparent",
            color: THEME.inkSoft, fontWeight: 500,
            justifyContent: "center", boxShadow: "none",
          }}
        >+ Ajouter un attribut porteur</button>

        <div style={{ borderTop: `1px solid ${THEME.lineSoft}`, paddingTop: 12 }}>
          <button
            onClick={() => {
              if (window.confirm(`Supprimer l'association « ${assoc.name} » ?`)) {
                deleteAssoc(assoc.id);
              }
            }}
            style={{
              ...btnGhost, width: "100%",
              border: `1px solid ${THEME.danger}`, color: THEME.danger,
              background: THEME.cream, justifyContent: "center",
            }}
          >🗑 Supprimer cette association</button>
        </div>
      </div>
    </>
  );
}

// ============================================================
// MODULE EDITOR MODAL
// ============================================================
function ModuleEditorModal({ modules, entities, addModule, updateModule, deleteModule, onClose }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(42, 38, 32, 0.45)",
        backdropFilter: "blur(4px)",
        zIndex: 30,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: FONT_STACK,
      }}
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        style={{
          ...panelStyle,
          width: 620, maxWidth: "92vw", maxHeight: "86vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${THEME.lineSoft}`, background: THEME.creamSoft,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <Kicker>Édition</Kicker>
            <div style={{ fontSize: 22, fontWeight: 600, color: THEME.ink, letterSpacing: -0.3 }}>
              Modules &amp; couleurs
            </div>
          </div>
          <button onClick={onClose} style={{
            border: "none", background: "transparent", fontSize: 26, cursor: "pointer", color: THEME.inkSoft, lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        <div style={{ overflowY: "auto", padding: 16, flex: 1 }}>
          {Object.keys(modules).length === 0 && (
            <div style={{ textAlign: "center", color: THEME.inkMuted, fontSize: 13, padding: 30 }}>
              Aucun module. Cliquez sur « + Ajouter un module » pour commencer.
            </div>
          )}

          {Object.entries(modules).map(([id, mod]) => {
            const usageCount = entities.filter((e) => e.m === id).length;
            return (
              <div key={id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", border: `1px solid ${THEME.lineSoft}`,
                borderRadius: 9, marginBottom: 9, background: THEME.creamSoft,
              }}>
                <input
                  type="color" value={mod.fill}
                  title="Couleur de fond"
                  onChange={(e) => updateModule(id, { fill: e.target.value })}
                  style={{
                    width: 36, height: 36, border: `1px solid ${THEME.line}`,
                    borderRadius: 7, padding: 2, cursor: "pointer", background: THEME.cream,
                  }}
                />
                <input
                  type="color" value={mod.stroke}
                  title="Couleur de bordure"
                  onChange={(e) => updateModule(id, { stroke: e.target.value })}
                  style={{
                    width: 36, height: 36, border: `1px solid ${THEME.line}`,
                    borderRadius: 7, padding: 2, cursor: "pointer", background: THEME.cream,
                  }}
                />

                <div title="Aperçu" style={{
                  width: 70, height: 34, background: mod.fill,
                  border: `2px solid ${mod.stroke}`, borderRadius: 6,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: THEME.ink, flexShrink: 0,
                }}>Aperçu</div>

                <input
                  type="text" value={mod.label}
                  onChange={(e) => updateModule(id, { label: e.target.value })}
                  style={{
                    flex: 1, minWidth: 0, padding: "7px 10px",
                    border: `1px solid ${THEME.line}`, borderRadius: 6, fontSize: 14,
                    fontFamily: FONT_STACK, color: THEME.ink, fontWeight: 500,
                    background: THEME.cream, letterSpacing: -0.1,
                  }}
                />
                <span style={{
                  fontSize: 11, color: usageCount === 0 ? THEME.inkMuted : THEME.inkSoft,
                  minWidth: 48, textAlign: "right", fontWeight: 600,
                }}>{usageCount} ent.</span>

                <button
                  onClick={() => deleteModule(id)}
                  title="Supprimer ce module"
                  style={{ border: "none", background: "transparent", color: THEME.inkMuted, cursor: "pointer", fontSize: 16, padding: 4 }}
                >🗑</button>
              </div>
            );
          })}

          <button
            onClick={addModule}
            style={{
              width: "100%", padding: "12px 14px",
              border: `1px dashed ${THEME.inkMuted}`,
              background: "transparent", borderRadius: 9,
              fontSize: 14, fontFamily: FONT_STACK,
              cursor: "pointer", color: THEME.inkSoft, fontWeight: 600,
              marginTop: 4,
            }}
          >+ Ajouter un module</button>
        </div>

        <div style={{
          padding: "12px 18px", borderTop: `1px solid ${THEME.lineSoft}`, background: THEME.creamSoft,
          fontSize: 11, color: THEME.inkMuted, fontStyle: "italic",
        }}>
          Astuce : choisissez une teinte claire pour le fond et une teinte plus foncée de la même famille pour la bordure.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ERDiagram() {
  const [tr, setTr] = useState({ x: 30, y: 30, s: 0.52 });
  const [drag, setDrag] = useState(null);

  const [entities, setEntities] = useState(() => {
    try {
      const saved = localStorage.getItem("er_entities_v1");
      if (saved) return JSON.parse(saved);
    } catch {}
    let savedPos = {};
    try {
      const sp = localStorage.getItem("erp_positions");
      if (sp) savedPos = JSON.parse(sp);
    } catch {}
    return ENTITIES.map((e) => ({
      ...e,
      ...(savedPos[e.id] || {}),
      attrs: ENTITY_ATTRS[e.id] || [],
    }));
  });

  const [assocs, setAssocs] = useState(() => {
    try {
      const saved = localStorage.getItem("er_assocs_v1");
      if (saved) return JSON.parse(saved);
    } catch {}
    let savedPos = {};
    try {
      const sp = localStorage.getItem("erp_positions");
      if (sp) savedPos = JSON.parse(sp);
    } catch {}
    return ASSOCS.map((a) => ({ ...a, ...(savedPos[a.id] || {}) }));
  });

  const [modules, setModules] = useState(() => {
    try {
      const saved = localStorage.getItem("er_modules_v1");
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_MODULES;
  });

  const [positions, setPositions] = useState(() => {
    try {
      const saved = localStorage.getItem("erp_positions");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [blockDrag, setBlockDrag] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [visibleModules, setVisibleModules] = useState(() => {
    try {
      const saved = localStorage.getItem("er_modules_v1");
      if (saved) return new Set(Object.keys(JSON.parse(saved)));
    } catch {}
    return new Set(Object.keys(DEFAULT_MODULES));
  });
  const [editingCardinal, setEditingCardinal] = useState(null);
  const [cardinalEdits, setCardinalEdits] = useState({});
  const [connectMode, setConnectMode] = useState(null);
  const [showModuleEditor, setShowModuleEditor] = useState(false);

  const svgRef = useRef(null);

  const entMap = Object.fromEntries(entities.map((e) => [e.id, e]));
  const assocMap = Object.fromEntries(assocs.map((a) => [a.id, a]));

  // ============================================================
  // LOAD FONTS (Fraunces + Manrope)
  // ============================================================
  useEffect(() => {
    const id = "merisia-google-fonts";
    if (document.getElementById(id)) return;
    const preconnect1 = document.createElement("link");
    preconnect1.rel = "preconnect";
    preconnect1.href = "https://fonts.googleapis.com";
    const preconnect2 = document.createElement("link");
    preconnect2.rel = "preconnect";
    preconnect2.href = "https://fonts.gstatic.com";
    preconnect2.crossOrigin = "anonymous";
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..900&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap";
    document.head.appendChild(preconnect1);
    document.head.appendChild(preconnect2);
    document.head.appendChild(link);
  }, []);

  const getCardinalValue = (assocId, linkIndex) => {
    const key = `${assocId}-${linkIndex}`;
    return cardinalEdits[key] !== undefined ? cardinalEdits[key] : null;
  };

  const setCardinalValue = (assocId, linkIndex, value) => {
    setAssocs((as) =>
      as.map((a) => {
        if (a.id !== assocId) return a;
        const newLinks = a.links.map((l, i) => (i === linkIndex ? { ...l, c: value } : l));
        return { ...a, links: newLinks };
      })
    );
    const key = `${assocId}-${linkIndex}`;
    setCardinalEdits((prev) => ({ ...prev, [key]: value }));
  };

  const selectedIds = Array.from(selected);
  const selectedEntity =
    selectedIds.length === 1 && entMap[selectedIds[0]] ? entMap[selectedIds[0]] : null;
  const selectedAssoc =
    selectedIds.length === 1 && assocMap[selectedIds[0]] ? assocMap[selectedIds[0]] : null;

  const isAssocConnectedToSelected = (assoc) => {
    return assoc.links?.some((link) => selected.has(link.e)) || false;
  };

  const isEntityVisible = (ent) => {
    if (visibleModules.has(ent.m)) return true;
    return assocs.some(
      (assoc) =>
        assoc.links?.some((link) => link.e === ent.id) &&
        assoc.links?.some((link) => {
          const connectedEnt = entMap[link.e];
          return connectedEnt && connectedEnt.id !== ent.id && visibleModules.has(connectedEnt.m);
        })
    );
  };

  // PERSISTENCE
  useEffect(() => { localStorage.setItem("erp_positions", JSON.stringify(positions)); }, [positions]);
  useEffect(() => { localStorage.setItem("er_entities_v1", JSON.stringify(entities)); }, [entities]);
  useEffect(() => { localStorage.setItem("er_assocs_v1", JSON.stringify(assocs)); }, [assocs]);
  useEffect(() => { localStorage.setItem("er_modules_v1", JSON.stringify(modules)); }, [modules]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setConnectMode(null);
        setEditingCardinal(null);
        setShowModuleEditor(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ============================================================
  // CRUD: entities
  // ============================================================
  const getViewportCenter = () => {
    const w = window.innerWidth, h = window.innerHeight;
    return { x: (-tr.x + w / 2) / tr.s, y: (-tr.y + h / 2) / tr.s };
  };

  const addEntity = () => {
    const id = `ent_${Date.now()}`;
    const c = getViewportCenter();
    const moduleKey = Array.from(visibleModules)[0] || Object.keys(modules)[0] || "default";
    const newEnt = {
      id, name: "NouvelleEntité",
      x: c.x, y: c.y, m: moduleKey,
      attrs: [{ name: `id_${id.slice(-6)}`, pk: true }],
    };
    setEntities((es) => [...es, newEnt]);
    setSelected(new Set([id]));
  };

  const updateEntity = (id, updates) => {
    setEntities((es) => es.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  };

  const deleteEntity = (id) => {
    setEntities((es) => es.filter((e) => e.id !== id));
    setAssocs((as) =>
      as.map((a) => {
          if (a.recursive && a.entity === id) return null;
          if (!a.links) return a;
          return { ...a, links: a.links.filter((l) => l.e !== id) };
        }).filter(Boolean)
    );
    setSelected(new Set());
  };

  const addEntityAttr = (entityId) => {
    setEntities((es) =>
      es.map((e) => {
        if (e.id !== entityId) return e;
        return { ...e, attrs: [...(e.attrs || []), { name: "nouvel_attribut" }] };
      })
    );
  };

  const updateEntityAttr = (entityId, attrIndex, updates) => {
    setEntities((es) =>
      es.map((e) => {
        if (e.id !== entityId) return e;
        const attrs = (e.attrs || []).map((a, i) => (i === attrIndex ? { ...a, ...updates } : a));
        return { ...e, attrs };
      })
    );
  };

  const deleteEntityAttr = (entityId, attrIndex) => {
    setEntities((es) =>
      es.map((e) => {
        if (e.id !== entityId) return e;
        return { ...e, attrs: (e.attrs || []).filter((_, i) => i !== attrIndex) };
      })
    );
  };

  // ============================================================
  // CRUD: associations
  // ============================================================
  const updateAssoc = (id, updates) => {
    setAssocs((as) => as.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  const deleteAssoc = (id) => {
    setAssocs((as) => as.filter((a) => a.id !== id));
    setSelected(new Set());
  };

  const removeLink = (assocId, linkIndex) => {
    setAssocs((as) =>
      as.map((a) => a.id !== assocId ? a : { ...a, links: a.links.filter((_, i) => i !== linkIndex) })
    );
  };

  const addAssocAttr = (assocId) => {
    setAssocs((as) =>
      as.map((a) => {
        if (a.id !== assocId) return a;
        const dataAttrs = a.dataAttrs || [];
        const newAttr = {
          id: `${assocId}_a${Date.now()}`,
          name: "nouvel_attribut",
          dx: 0,
          dy: 80 + dataAttrs.length * 30,
        };
        return { ...a, dataAttrs: [...dataAttrs, newAttr] };
      })
    );
  };

  const updateAssocAttr = (assocId, attrIndex, updates) => {
    setAssocs((as) =>
      as.map((a) => {
        if (a.id !== assocId) return a;
        const dataAttrs = (a.dataAttrs || []).map((at, i) =>
          i === attrIndex ? { ...at, ...updates } : at
        );
        return { ...a, dataAttrs };
      })
    );
  };

  const deleteAssocAttr = (assocId, attrIndex) => {
    setAssocs((as) =>
      as.map((a) => a.id !== assocId ? a : { ...a, dataAttrs: (a.dataAttrs || []).filter((_, i) => i !== attrIndex) })
    );
  };

  // ============================================================
  // CRUD: modules
  // ============================================================
  const addModule = () => {
    const id = `mod_${Date.now()}`;
    const palette = [
      ["#FEE2E2", "#DC2626"], ["#DBEAFE", "#3B82F6"], ["#D1FAE5", "#10B981"],
      ["#FEF3C7", "#D97706"], ["#EDE9FE", "#7C3AED"], ["#E0F2FE", "#0EA5E9"],
      ["#FFEDD5", "#EA580C"], ["#CCFBF1", "#0D9488"], ["#FCE7F3", "#DB2777"],
    ];
    const idx = Object.keys(modules).length % palette.length;
    const [fill, stroke] = palette[idx];
    setModules((m) => ({ ...m, [id]: { label: "Nouveau module", fill, stroke } }));
    setVisibleModules((v) => new Set([...v, id]));
  };

  const updateModule = (id, updates) => {
    setModules((m) => ({ ...m, [id]: { ...m[id], ...updates } }));
  };

  const deleteModule = (id) => {
    const usageCount = entities.filter((e) => e.m === id).length;
    const remaining = Object.keys(modules).filter((k) => k !== id);

    if (remaining.length === 0) {
      alert("Impossible de supprimer le dernier module. Créez-en un autre d'abord.");
      return;
    }

    if (usageCount > 0) {
      const fallback = remaining[0];
      const fallbackLabel = modules[fallback].label;
      if (!window.confirm(`${usageCount} entité(s) sont dans ce module. Elles seront déplacées vers « ${fallbackLabel} ».\n\nContinuer ?`)) {
        return;
      }
      setEntities((es) => es.map((e) => (e.m === id ? { ...e, m: fallback } : e)));
    }

    setModules((m) => { const next = { ...m }; delete next[id]; return next; });
    setVisibleModules((v) => { const next = new Set(v); next.delete(id); return next; });
  };

  // ============================================================
  // CONNECT MODE
  // ============================================================
  const startConnectMode = (targetAssocId = null) => {
    setConnectMode({ firstId: null, targetAssocId });
  };

  const tryConnect = (clickedId) => {
    if (!connectMode) return false;

    // Cas spécial : lancé depuis l'inspector d'une assoc pour lui ajouter un lien
    if (connectMode.targetAssocId) {
      const ent = entMap[clickedId];
      if (!ent) return true;
      const assoc = assocMap[connectMode.targetAssocId];
      if (assoc && !assoc.links?.some((l) => l.e === ent.id)) {
        setAssocs((as) =>
          as.map((a) =>
            a.id === assoc.id ? { ...a, links: [...(a.links || []), { e: ent.id, c: "0,n" }] } : a
          )
        );
      }
      setConnectMode(null);
      return true;
    }

    if (!connectMode.firstId) {
      setConnectMode({ ...connectMode, firstId: clickedId });
      return true;
    }

    const firstId = connectMode.firstId;
    if (firstId === clickedId) return true;

    const firstEnt = entMap[firstId];
    const secondEnt = entMap[clickedId];
    const firstAssoc = assocMap[firstId];
    const secondAssoc = assocMap[clickedId];

    // CAS PRINCIPAL : entité → entité ⇒ création AUTOMATIQUE d'une association
    if (firstEnt && secondEnt) {
      const id = `assoc_${Date.now()}`;
      const newAssoc = {
        id, name: "associer",
        x: (firstEnt.x + secondEnt.x) / 2,
        y: (firstEnt.y + secondEnt.y) / 2,
        links: [
          { e: firstEnt.id, c: "0,n" },
          { e: secondEnt.id, c: "0,n" },
        ],
      };
      setAssocs((as) => [...as, newAssoc]);
      setSelected(new Set([id]));
      setConnectMode(null);
      return true;
    }

    // CAS SECONDAIRE : entité ↔ association ⇒ ajout d'un lien à l'assoc existante
    let entityId = null, assocId = null;
    if (firstEnt && secondAssoc) { entityId = firstEnt.id; assocId = secondAssoc.id; }
    else if (firstAssoc && secondEnt) { entityId = secondEnt.id; assocId = firstAssoc.id; }

    if (entityId && assocId) {
      setAssocs((as) =>
        as.map((a) => {
          if (a.id !== assocId) return a;
          if (a.links?.some((l) => l.e === entityId)) return a;
          return { ...a, links: [...(a.links || []), { e: entityId, c: "0,n" }] };
        })
      );
      setConnectMode(null);
      return true;
    }

    // Cas non supporté : assoc ↔ assoc
    alert("Connexion association ↔ association non supportée.");
    setConnectMode(null);
    return true;
  };

  // ============================================================
  // PAN / DRAG / WHEEL
  // ============================================================
  const onDown = (ev) => {
    ev.preventDefault();
    setSelected(new Set());
    setDrag({ ox: tr.x - ev.clientX, oy: tr.y - ev.clientY });
  };

  const onMove = (ev) => {
    if (!drag && !blockDrag) return;
    if (drag) {
      setTr((p) => ({ ...p, x: ev.clientX + drag.ox, y: ev.clientY + drag.oy }));
    }
    if (blockDrag) {
      const dx = (ev.clientX - blockDrag.startX) / tr.s;
      const dy = (ev.clientY - blockDrag.startY) / tr.s;
      const movedEntities = {}, movedAssocs = {}, movedPositions = {};

      blockDrag.selected.forEach((blockId) => {
        const startPos = blockDrag.startPositions[blockId];
        const newX = startPos.x + dx, newY = startPos.y + dy;
        if (entMap[blockId])      movedEntities[blockId] = { x: newX, y: newY };
        else if (assocMap[blockId]) movedAssocs[blockId] = { x: newX, y: newY };
        else                      movedPositions[blockId] = { x: newX, y: newY };
      });

      if (Object.keys(movedEntities).length) {
        setEntities((es) => es.map((e) => (movedEntities[e.id] ? { ...e, ...movedEntities[e.id] } : e)));
      }
      if (Object.keys(movedAssocs).length) {
        setAssocs((as) => as.map((a) => (movedAssocs[a.id] ? { ...a, ...movedAssocs[a.id] } : a)));
      }
      if (Object.keys(movedPositions).length) {
        setPositions((p) => ({ ...p, ...movedPositions }));
      }
    }
  };

  const onUp = () => { setDrag(null); setBlockDrag(null); };

  const onWheel = (ev) => {
    ev.preventDefault();
    const f = ev.deltaY < 0 ? 1.1 : 0.91;
    setTr((p) => ({ ...p, s: Math.min(2.5, Math.max(0.2, p.s * f)) }));
  };

  const lastTouch = useRef(null);
  const onTouchStart = (ev) => {
    if (ev.touches.length === 1) {
      lastTouch.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, tx: tr.x, ty: tr.y };
    }
  };
  const onTouchMove = (ev) => {
    ev.preventDefault();
    if (ev.touches.length === 1 && lastTouch.current) {
      const dx = ev.touches[0].clientX - lastTouch.current.x;
      const dy = ev.touches[0].clientY - lastTouch.current.y;
      setTr((p) => ({ ...p, x: lastTouch.current.tx + dx, y: lastTouch.current.ty + dy }));
    }
  };

  const getBlockPos = (id, defaultPos) => positions[id] || defaultPos;

  const onBlockDown = (ev, id, defaultPos) => {
    ev.preventDefault();
    ev.stopPropagation();

    if (connectMode) {
      if (tryConnect(id)) return;
    }

    const isMultiSelect = ev.ctrlKey || ev.metaKey;
    let newSelected = new Set(selected);
    if (isMultiSelect) {
      if (newSelected.has(id)) newSelected.delete(id);
      else newSelected.add(id);
    } else {
      newSelected = new Set([id]);
    }
    setSelected(newSelected);

    const dragState = { id, selected: newSelected, startX: ev.clientX, startY: ev.clientY, startPositions: {} };
    newSelected.forEach((blockId) => {
      const ent = entities.find((e) => e.id === blockId);
      const assoc = assocs.find((a) => a.id === blockId);
      if (ent)       dragState.startPositions[blockId] = { x: ent.x, y: ent.y };
      else if (assoc) dragState.startPositions[blockId] = { x: assoc.x, y: assoc.y };
      else           dragState.startPositions[blockId] = getBlockPos(blockId, defaultPos);
    });
    setBlockDrag(dragState);
  };

  // ============================================================
  // RESET / EXPORT / IMPORT (diagramme COMPLET)
  // ============================================================
  const clearPositions = () => {
    if (window.confirm("⚠️ Réinitialiser le diagramme ENTIER ?\n\nCela restaurera la version d'origine et supprimera toutes vos modifications.\n\nCette action est irréversible.")) {
      setEntities(ENTITIES.map((e) => ({ ...e, attrs: ENTITY_ATTRS[e.id] || [] })));
      setAssocs(ASSOCS);
      setModules(DEFAULT_MODULES);
      setVisibleModules(new Set(Object.keys(DEFAULT_MODULES)));
      setPositions({});
      setCardinalEdits({});
      setSelected(new Set());
      localStorage.removeItem("erp_positions");
      localStorage.removeItem("er_entities_v1");
      localStorage.removeItem("er_assocs_v1");
      localStorage.removeItem("er_modules_v1");
    }
  };

  const exportSchema = () => {
    const data = {
      version: 3,
      exportedAt: new Date().toISOString(),
      entities, assocs, modules, positions, cardinalEdits,
      visibleModules: Array.from(visibleModules),
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `merisia_diagram_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSchema = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result);
          // RECRÉE intégralement le diagramme avec les positions précises
          if (Array.isArray(data.entities)) setEntities(data.entities);
          if (Array.isArray(data.assocs)) setAssocs(data.assocs);
          if (data.modules && typeof data.modules === "object") setModules(data.modules);
          if (data.positions && typeof data.positions === "object") setPositions(data.positions);
          if (data.cardinalEdits && typeof data.cardinalEdits === "object") setCardinalEdits(data.cardinalEdits);
          if (Array.isArray(data.visibleModules)) {
            setVisibleModules(new Set(data.visibleModules));
          } else if (data.modules) {
            setVisibleModules(new Set(Object.keys(data.modules)));
          }
          setSelected(new Set());
          setConnectMode(null);
        } catch (err) {
          console.error(err);
          alert("Erreur lors du chargement du fichier : format invalide.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const downloadHighQualityScreenshot = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const graphGroup = svg.querySelector("g[data-export-root='true']");
    if (!graphGroup) return;
    let bbox;
    try { bbox = graphGroup.getBBox(); }
    catch { alert("Impossible de calculer la zone du schéma pour l’export."); return; }

    const padding = 90;
    const exportScale = 3;
    const width = Math.ceil((bbox.width + padding * 2) * exportScale);
    const height = Math.ceil((bbox.height + padding * 2) * exportScale);

    const clonedSvg = svg.cloneNode(true);
    clonedSvg.setAttribute("width", String(width));
    clonedSvg.setAttribute("height", String(height));
    clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clonedSvg.style.background = THEME.paper;

    const clonedRoot = clonedSvg.querySelector("g[data-export-root='true']");
    clonedRoot?.setAttribute(
      "transform",
      `translate(${(-bbox.x + padding) * exportScale},${(-bbox.y + padding) * exportScale}) scale(${exportScale})`
    );

    const serializer = new XMLSerializer();
    const svgText = serializer.serializeToString(clonedSvg);
    const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = THEME.paper;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = `merisia_mcd_${new Date().toISOString().split("T")[0]}_x3.png`;
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, "image/png", 1);
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert("Erreur pendant la génération du screenshot."); };
    img.src = url;
  };

  // ============================================================
  // RENDER HELPERS
  // ============================================================
  const renderAssocAttrs = (assoc) => {
    if (!assoc.dataAttrs || assoc.dataAttrs.length === 0) return null;
    const isSelected = selected.has(assoc.id);
    const pos = { x: assoc.x, y: assoc.y };

    return (
      <g key={`${assoc.id}-attrs`}>
        {assoc.dataAttrs.map((attr) => {
          const defaultPos = { x: pos.x + attr.dx, y: pos.y + attr.dy };
          const attrPos = getBlockPos(attr.id, defaultPos);
          const isAttrSelected = selected.has(attr.id);
          return (
            <g key={attr.id}>
              <line
                x1={pos.x} y1={pos.y} x2={attrPos.x} y2={attrPos.y}
                stroke={isSelected || isAttrSelected ? THEME.selection : THEME.inkMuted}
                strokeWidth={isSelected || isAttrSelected ? 2.5 : 1.5}
                strokeDasharray="5,4"
              />
              <g cursor="move" onMouseDown={(ev) => onBlockDown(ev, attr.id, defaultPos)}>
                <text
                  x={attrPos.x} y={attrPos.y}
                  fontSize={11} fontFamily={FONT_STACK}
                  fill={isAttrSelected ? THEME.selection : THEME.ink}
                  textAnchor="middle" dominantBaseline="middle"
                  fontWeight={500} fontStyle="italic"
                  style={{ userSelect: "none", pointerEvents: "all" }}
                >{attr.name}</text>
              </g>
            </g>
          );
        })}
      </g>
    );
  };

  const renderRecursiveAssoc = (assoc) => {
    const ent = entMap[assoc.entity];
    if (!ent || !isEntityVisible(ent)) return null;
    const entPos = { x: ent.x, y: ent.y };
    const assocPos = { x: assoc.x, y: assoc.y };
    const isSelected = selected.has(assoc.id) || selected.has(ent.id);

    const topX = entPos.x + 10;
    const topY = entPos.y + 1.2 * EH;
    const bottomX = entPos.x - 15;
    const bottomY = entPos.y + 1.2 * EH;
    const arcSpread = 25;
    const arcTopCtrlX = entPos.x + 25;
    const arcTopCtrlY = entPos.y + arcSpread;
    const arcBottomCtrlX = entPos.x - 25;
    const arcBottomCtrlY = entPos.y + arcSpread;
    const lines = getAssocLabelLines(assoc.name);

    return (
      <g key={assoc.id}>
        <path d={`M ${assocPos.x} ${assocPos.y} Q ${arcTopCtrlX} ${arcTopCtrlY}, ${topX} ${topY}`}
              fill="none" stroke={isSelected ? THEME.selection : THEME.inkMuted}
              strokeWidth={isSelected ? 3 : 1.7} />
        <path d={`M ${assocPos.x} ${assocPos.y} Q ${arcBottomCtrlX} ${arcBottomCtrlY}, ${bottomX} ${bottomY}`}
              fill="none" stroke={isSelected ? THEME.selection : THEME.inkMuted}
              strokeWidth={isSelected ? 3 : 1.7} />
        {(isSelected || selected.has(ent.id)) && (
          <ellipse cx={assocPos.x} cy={assocPos.y} rx={AX + 6} ry={AY + 6}
                   fill="none" stroke={THEME.selection} strokeWidth={3} />
        )}
        <g cursor="move" onMouseDown={(ev) => onBlockDown(ev, assoc.id, { x: assoc.x, y: assoc.y })}>
          <ellipse cx={assocPos.x} cy={assocPos.y} rx={AX} ry={AY}
                   fill={THEME.cream} stroke={isSelected ? THEME.selection : THEME.inkSoft}
                   strokeWidth={isSelected ? 2.5 : 1.5} filter="url(#shadow)"
                   style={{ pointerEvents: "all" }} />
          {lines.map((line, idx) => (
            <text key={`${assoc.id}-label-${idx}`}
                  x={assocPos.x} y={assocPos.y + (idx - (lines.length - 1) / 2) * 12}
                  fontSize={11} fontFamily={FONT_STACK}
                  fill={THEME.ink} textAnchor="middle" dominantBaseline="middle"
                  fontWeight={500} fontStyle="italic"
                  style={{ userSelect: "none", pointerEvents: "none" }}>{line}</text>
          ))}
        </g>
        <text x={entPos.x + 172} y={entPos.y - 78}
              fontSize={11} fontFamily={FONT_MONO}
              fill={THEME.inkSoft} textAnchor="middle" fontWeight="700"
              style={{ userSelect: "none", pointerEvents: "none" }}>(0,n)</text>
        {renderAssocAttrs(assoc)}
      </g>
    );
  };

  const showInspector = !!(selectedEntity || selectedAssoc);
  const containerCursor = connectMode ? "crosshair" : drag ? "grabbing" : "grab";

  const connectBannerText = () => {
    if (!connectMode) return "";
    if (connectMode.targetAssocId) {
      return `Cliquez sur l'entité à connecter à « ${assocMap[connectMode.targetAssocId]?.name || "?"} »`;
    }
    if (!connectMode.firstId) {
      return "Cliquez sur 2 entités — une association sera créée automatiquement entre elles";
    }
    const firstE = entMap[connectMode.firstId];
    const firstA = assocMap[connectMode.firstId];
    if (firstE) return `« ${firstE.name} » sélectionnée. Cliquez sur une seconde entité.`;
    if (firstA) return `« ${firstA.name} » sélectionnée. Cliquez sur une entité à lier.`;
    return "";
  };

  return (
    <div
      style={{
        width: "100vw", height: "100vh", overflow: "hidden",
        background: THEME.paper,
        cursor: containerCursor,
        fontFamily: FONT_STACK,
        color: THEME.ink,
      }}
      onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove}
      onTouchEnd={() => { lastTouch.current = null; }}
    >
      {/* Subtle paper texture overlay */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage:
          "radial-gradient(circle at 15% 25%, rgba(212,198,160,0.18) 0, transparent 35%),"+
          "radial-gradient(circle at 85% 75%, rgba(212,198,160,0.14) 0, transparent 40%)",
        zIndex: 0,
      }} />

      {/* ============================================================ */}
      {/* TOP-LEFT BRAND + LEGEND                                      */}
      {/* ============================================================ */}
      <div
        style={{
          position: "absolute", top: 14, left: 14,
          ...panelStyle,
          padding: "12px 16px",
          fontSize: 12,
          zIndex: 10, maxWidth: 430,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div>
              <div style={{
                fontFamily: FONT_STACK, fontWeight: 700, fontSize: 18,
                color: THEME.ink, letterSpacing: -0.4, lineHeight: 1,
              }}>Merisia</div>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowModuleEditor(true); }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Éditer les modules et leurs couleurs"
            style={{
              padding: "4px 10px", border: `1px solid ${THEME.line}`,
              background: THEME.cream, borderRadius: 6,
              fontSize: 10.5, fontFamily: FONT_STACK,
              cursor: "pointer", color: THEME.inkSoft, fontWeight: 600,
              letterSpacing: 0.1,
            }}
          >🎨 Éditer</button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
          {Object.entries(modules).map(([k, m]) => (
            <label
              key={k}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: m.fill,
                border: `1.5px solid ${m.stroke}`,
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 10, fontFamily: FONT_STACK,
                color: THEME.ink, fontWeight: 500,
                cursor: "pointer",
                opacity: visibleModules.has(k) ? 1 : 0.4,
              }}
            >
              <input
                type="checkbox"
                checked={visibleModules.has(k)}
                onChange={(e) => {
                  const newSet = new Set(visibleModules);
                  if (e.target.checked) newSet.add(k); else newSet.delete(k);
                  setVisibleModules(newSet);
                }}
                style={{ cursor: "pointer", width: 13, height: 13, accentColor: m.stroke }}
              />
              {m.label}
            </label>
          ))}
        </div>

        <div style={{
          fontSize: 10, color: THEME.inkMuted, fontStyle: "italic",
          borderTop: `1px solid ${THEME.lineSoft}`, paddingTop: 8,
        }}>
          Clic = sélectionner · Ctrl+Clic = multi · Glisser = déplacer · Molette = zoom · {Math.round(tr.s * 100)}%
        </div>
      </div>

      {/* ============================================================ */}
      {/* TOP TOOLBAR (right)                                          */}
      {/* ============================================================ */}
      <div style={{
        position: "absolute", top: 14, right: 14,
        display: "flex", gap: 6, zIndex: 10, flexWrap: "wrap",
        justifyContent: "flex-end",
        maxWidth: showInspector ? "calc(100vw - 400px)" : "auto",
      }}>
        <button
          title="Créer une nouvelle entité au centre de la vue"
          style={btnPrimary}
          onClick={(e) => { e.stopPropagation(); addEntity(); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Entité
        </button>

        <button
          title="Mode connexion : cliquez 2 entités → une association sera créée automatiquement. Échap pour annuler."
          style={connectMode ? btnAccent : btnGhost}
          onClick={(e) => {
            e.stopPropagation();
            if (connectMode) setConnectMode(null);
            else startConnectMode();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          🔗 {connectMode ? "Annuler" : "Connecter"}
        </button>

        <button
          title="Éditer les modules et leurs couleurs"
          style={btnGhost}
          onClick={(e) => { e.stopPropagation(); setShowModuleEditor(true); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          🎨 Modules
        </button>

        <div style={{ width: 1, background: THEME.line, margin: "0 4px" }} />

        <button
          title="Exporter le diagramme complet en JSON"
          style={btnGhost}
          onClick={(e) => { e.stopPropagation(); exportSchema(); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ↓ Export
        </button>
        <button
          title="Importer un diagramme — recrée intégralement entités, assocs, modules, positions précises"
          style={btnGhost}
          onClick={(e) => { e.stopPropagation(); importSchema(); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ↑ Import
        </button>
        <button
          title="Exporter une image PNG haute qualité du schéma complet"
          style={btnGhost}
          onClick={(e) => { e.stopPropagation(); downloadHighQualityScreenshot(); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ⊡ Screenshot
        </button>
        <button
          title="Réinitialiser à l'état d'origine (efface toutes les modifications)"
          style={{ ...btnGhost, color: THEME.danger, border: `1px solid ${THEME.line}` }}
          onClick={(e) => { e.stopPropagation(); clearPositions(); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ↻ Reset
        </button>
      </div>

      {/* CONNECT MODE BANNER */}
      {connectMode && (
        <div
          style={{
            position: "absolute", top: 70, left: "50%",
            transform: "translateX(-50%)",
            background: THEME.accent, color: THEME.cream,
            padding: "9px 18px", borderRadius: 999,
            fontSize: 13, fontFamily: FONT_STACK, fontWeight: 600,
            boxShadow: "0 6px 16px rgba(122,134,74,0.35)",
            zIndex: 15,
            display: "flex", alignItems: "center", gap: 10,
            maxWidth: "80vw", letterSpacing: -0.1,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          🔗 {connectBannerText()}
          <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 11 }}>· Échap</span>
        </div>
      )}

      {/* BOTTOM-RIGHT ZOOM */}
      <div style={{ position: "absolute", bottom: 22, right: 22, display: "flex", flexDirection: "column", gap: 7, zIndex: 10 }}>
        {[["＋", 1.2], ["－", 0.83], ["⊙", null]].map(([label, factor]) => (
          <button
            key={label}
            style={{
              width: 38, height: 38, borderRadius: 9,
              border: `1px solid ${THEME.line}`,
              background: THEME.cream, fontSize: 16, fontFamily: FONT_STACK,
              cursor: "pointer", boxShadow: THEME.shadowSoft,
              color: THEME.ink, fontWeight: 700,
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (factor) setTr((p) => ({ ...p, s: Math.min(2.5, Math.max(0.2, p.s * factor)) }));
              else setTr({ x: 30, y: 30, s: 0.52 });
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >{label}</button>
        ))}
      </div>

      {/* INSPECTOR PANEL */}
      {showInspector && (
        <div
          style={{
            position: "absolute", top: 70, right: 14,
            width: 380, maxHeight: "calc(100vh - 90px)",
            ...panelStyle,
            zIndex: 12,
            display: "flex", flexDirection: "column",
            fontFamily: FONT_STACK,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {selectedEntity && (
            <EntityInspector
              entity={selectedEntity}
              modules={modules}
              updateEntity={updateEntity}
              deleteEntity={deleteEntity}
              addAttr={addEntityAttr}
              updateAttr={updateEntityAttr}
              deleteAttr={deleteEntityAttr}
            />
          )}
          {selectedAssoc && (
            <AssocInspector
              assoc={selectedAssoc}
              entities={entities}
              updateAssoc={updateAssoc}
              deleteAssoc={deleteAssoc}
              removeLink={removeLink}
              startConnectMode={startConnectMode}
              addAssocAttr={addAssocAttr}
              updateAssocAttr={updateAssocAttr}
              deleteAssocAttr={deleteAssocAttr}
            />
          )}
        </div>
      )}

      {/* MODULE EDITOR */}
      {showModuleEditor && (
        <ModuleEditorModal
          modules={modules}
          entities={entities}
          addModule={addModule}
          updateModule={updateModule}
          deleteModule={deleteModule}
          onClose={() => setShowModuleEditor(false)}
        />
      )}

      {/* CARDINALITY EDITOR OVERLAY */}
      {editingCardinal && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }}
          onClick={() => setEditingCardinal(null)}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <CardinalityEditor
            cardinalKey={editingCardinal}
            assocs={assocs}
            cardinalEdits={cardinalEdits}
            setCardinalValue={setCardinalValue}
            onClose={() => setEditingCardinal(null)}
            tr={tr}
            entMap={entMap}
            isEntityVisible={isEntityVisible}
          />
        </div>
      )}

      {/* SVG CANVAS */}
      <svg ref={svgRef} width="100%" height="100%" style={{ position: "relative", zIndex: 1 }}>
        <g data-export-root="true" transform={`translate(${tr.x},${tr.y}) scale(${tr.s})`}>
          {/* Lines */}
          {assocs.map((assoc) => {
            if (assoc.recursive || !assoc.links) return null;
            const allVisible = assoc.links.every((link) => {
              const ent = entMap[link.e];
              return ent && isEntityVisible(ent);
            });
            if (!allVisible) return null;

            return assoc.links.map((link, i) => {
              const ent = entMap[link.e];
              if (!ent) return null;
              const isHighlighted = isAssocConnectedToSelected(assoc) || selected.has(assoc.id);
              return (
                <line
                  key={`${assoc.id}-line-${i}`}
                  x1={ent.x} y1={ent.y} x2={assoc.x} y2={assoc.y}
                  stroke={isHighlighted ? THEME.selection : "#9C8F70"}
                  strokeWidth={isHighlighted ? 2.5 : 1.4}
                  strokeDasharray={link.c === "" ? "5,3" : undefined}
                />
              );
            });
          })}

          {/* Visual attributes for data-bearing associations */}
          {assocs.map((assoc) => {
            if (assoc.recursive || !assoc.links) return null;
            const allVisible = assoc.links.every((link) => {
              const ent = entMap[link.e];
              return ent && isEntityVisible(ent);
            });
            if (!allVisible) return null;
            return renderAssocAttrs(assoc);
          })}

          {/* Association ellipses */}
          {assocs.map((assoc) => {
            if (assoc.recursive) return null;
            const hasLinks = assoc.links && assoc.links.length > 0;
            if (hasLinks) {
              const allVisible = assoc.links.every((link) => {
                const ent = entMap[link.e];
                return ent && isEntityVisible(ent);
              });
              if (!allVisible) return null;
            }

            const pos = { x: assoc.x, y: assoc.y };
            const isSelected = selected.has(assoc.id);
            const isConnectFirst = connectMode?.firstId === assoc.id;
            const isConnectedToSelected = isAssocConnectedToSelected(assoc);
            const labelLines = getAssocLabelLines(assoc.name);

            return (
              <g key={assoc.id} cursor={connectMode ? "crosshair" : "move"}
                 onMouseDown={(ev) => onBlockDown(ev, assoc.id, { x: assoc.x, y: assoc.y })}>
                {(isSelected || isConnectedToSelected || isConnectFirst) && (
                  <ellipse cx={pos.x} cy={pos.y} rx={AX + 6} ry={AY + 6}
                           fill="none"
                           stroke={isConnectFirst ? THEME.accent : isSelected ? THEME.selection : THEME.brandDark}
                           strokeWidth={3}
                           strokeDasharray={isConnectFirst ? "6,3" : undefined} />
                )}
                <ellipse cx={pos.x} cy={pos.y} rx={AX} ry={AY}
                         fill={THEME.cream}
                         stroke={isConnectedToSelected ? THEME.brandDark : THEME.inkSoft}
                         strokeWidth={isSelected ? 2.5 : isConnectedToSelected ? 2 : 1.5}
                         filter="url(#shadow)" style={{ pointerEvents: "all" }} />
                {labelLines.map((line, idx) => (
                  <text key={`${assoc.id}-txt-${idx}`}
                        x={pos.x} y={pos.y + (idx - (labelLines.length - 1) / 2) * 13}
                        fontSize={11.5} fontFamily={FONT_STACK}
                        fill={THEME.ink} textAnchor="middle" dominantBaseline="middle"
                        fontWeight={500} fontStyle="italic"
                        style={{ userSelect: "none", pointerEvents: "none", letterSpacing: -0.1 }}
                  >{line}</text>
                ))}
              </g>
            );
          })}

          {/* Entities */}
          {entities.filter((ent) => isEntityVisible(ent)).map((ent) => {
            const pos = { x: ent.x, y: ent.y };
            const isSelected = selected.has(ent.id);
            const isConnectFirst = connectMode?.firstId === ent.id;
            const lines = wrapText(ent.name);
            const attrs = ent.attrs || [];

            const nameLines = lines.length;
            const nameH = nameLines * 15;
            const attrH = attrs.length > 0 ? attrs.length * 11 + 8 : 0;
            const totalH = nameH + attrH + (attrs.length > 0 ? 8 : 0);
            const h = Math.max(EH, totalH);

            const mod = modules[ent.m];
            const moduleStroke = mod?.stroke || THEME.inkSoft;
            const moduleFill = mod?.fill || THEME.creamSoft;

            return (
              <g key={ent.id} cursor={connectMode ? "crosshair" : "move"}
                 onMouseDown={(ev) => onBlockDown(ev, ent.id, { x: ent.x, y: ent.y })}>
                {(isSelected || isConnectFirst) && (
                  <rect x={pos.x - EW / 2 - 6} y={pos.y - h / 2 - 6}
                        width={EW + 12} height={h + 12} rx={6}
                        fill="none"
                        stroke={isConnectFirst ? THEME.accent : THEME.selection}
                        strokeWidth={3}
                        strokeDasharray={isConnectFirst ? "6,3" : undefined} />
                )}
                <rect x={pos.x - EW / 2} y={pos.y - h / 2}
                      width={EW} height={h} rx={6}
                      fill={moduleFill} stroke={moduleStroke}
                      strokeWidth={isSelected ? 3 : 2.5}
                      filter="url(#shadow)"
                      style={{ pointerEvents: "all" }} />
                {lines.map((line, i) => (
                  <text key={`name-${i}`}
                        x={pos.x} y={pos.y - (h / 2) + 16 + (i * 15)}
                        fontSize={13} fontFamily={FONT_STACK}
                        fill={THEME.ink} textAnchor="middle"
                        fontWeight={700} letterSpacing={-0.2}
                        style={{ userSelect: "none", pointerEvents: "none" }}
                  >{line}</text>
                ))}
                {attrs.length > 0 && (
                  <g>
                    <line x1={pos.x - EW / 2 + 5} y1={pos.y - (h / 2) + nameH + 4}
                          x2={pos.x + EW / 2 - 5} y2={pos.y - (h / 2) + nameH + 4}
                          stroke={moduleStroke} strokeOpacity={0.35} strokeWidth={1} />
                    {attrs.map((attr, i) => (
                      <text key={`attr-${i}`}
                            x={pos.x - EW / 2 + 8}
                            y={pos.y - (h / 2) + nameH + 18 + (i * 11)}
                            fontSize={8.5} fill={THEME.inkSoft}
                            fontFamily={FONT_MONO}
                            fontWeight={attr.pk ? 700 : 400}
                            style={{ userSelect: "none", pointerEvents: "none" }}
                      >{attr.name}</text>
                    ))}
                  </g>
                )}
              </g>
            );
          })}

          {/* Recursive associations */}
          {assocs.filter((assoc) => assoc.recursive).map((assoc) => renderRecursiveAssoc(assoc))}

          {/* Cardinalities */}
          {assocs.map((assoc) => {
            if (assoc.recursive || !assoc.links) return null;
            const allVisible = assoc.links.every((link) => {
              const ent = entMap[link.e];
              return ent && isEntityVisible(ent);
            });
            if (!allVisible) return null;

            return assoc.links.map((link, i) => {
              const ent = entMap[link.e];
              if (!ent || !link.c) return null;
              const { x: cardX, y: cardY } = getCardinalityPosition(ent, assoc);
              const cardKey = `${assoc.id}-${i}`;
              const editedValue = getCardinalValue(assoc.id, i);
              const displayValue = editedValue !== null ? editedValue : link.c;

              return (
                <text
                  key={`${assoc.id}-card-${i}`}
                  x={cardX} y={cardY}
                  fontSize={11.5} fontFamily={FONT_MONO}
                  fill={THEME.ink} textAnchor="middle" fontWeight="700"
                  style={{ userSelect: "none", pointerEvents: "all", cursor: "pointer" }}
                  onClick={(ev) => { ev.stopPropagation(); setEditingCardinal(cardKey); }}
                  title="Cliquez pour éditer la cardinalité"
                >({displayValue})</text>
              );
            });
          })}

          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.10" />
            </filter>
          </defs>
        </g>
      </svg>
    </div>
  );
}