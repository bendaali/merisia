import { useState, useRef, useEffect } from "react";
import {
  Camera,
  Download,
  FileText,
  Hand,
  Link as LinkIcon,
  Lock,
  LogOut,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Settings,
  Share2,
  Trash2,
  Undo2,
  Upload
} from "lucide-react";

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

const FONT_STACK   = '"Manrope", "Avenir Next", "Segoe UI", sans-serif';
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

const DEFAULT_AUTO_MODULE_ID = "mod_default";

function createDefaultModule(label = "Module principal") {
  return { label, fill: "#DBEAFE", stroke: "#3B82F6" };
}

// ============================================================
// GEOMETRY / TEXT HELPERS
// ============================================================
const CARD_OFFSET = 22;
const CARD_PERP   = 7;
const SNAP_GRID = 20;
const SNAP_THRESHOLD = 9;

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

const editorActionButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  lineHeight: 1,
  fontFamily: FONT_STACK,
  fontWeight: 800,
  letterSpacing: 0.15,
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
      data-hud="true"
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
function EntityInspector({ entity, modules, updateEntity, deleteEntity, addAttr, updateAttr, deleteAttr, confirmAction, isReadOnly = false }) {
  return (
    <>
      <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${THEME.lineSoft}`, background: THEME.creamSoft }}>
        <Kicker>Entité</Kicker>
        <input
          type="text"
          value={entity.name}
          readOnly={isReadOnly}
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
          disabled={isReadOnly}
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
                  disabled={isReadOnly}
                  onChange={(e) => updateAttr(entity.id, i, { pk: e.target.checked })}
                  style={{ margin: 0, cursor: "pointer", accentColor: THEME.danger }}
                />
                PK
              </label>
              <input
                type="text"
                value={attr.name}
                readOnly={isReadOnly}
                onChange={(e) => updateAttr(entity.id, i, { name: e.target.value })}
                style={{
                  flex: 1, fontSize: 12, fontFamily: FONT_MONO,
                  border: `1px solid ${THEME.line}`, borderRadius: 5,
                  padding: "3px 6px", background: THEME.cream,
                  fontWeight: attr.pk ? 700 : 400, color: THEME.ink,
                }}
              />
              {!isReadOnly && (
                <button
                  onClick={() => deleteAttr(entity.id, i)}
                  title="Supprimer cet attribut"
                  style={{ border: "none", background: "transparent", color: THEME.inkMuted, cursor: "pointer", fontSize: 14, padding: 2 }}
                ><Trash2 size={14} strokeWidth={2.2} /></button>
              )}
            </div>
          ))}
        </div>

        {!isReadOnly && (
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
        )}

        {!isReadOnly && <div style={{ borderTop: `1px solid ${THEME.lineSoft}`, paddingTop: 12 }}>
          <button
            onClick={async () => {
              if (await confirmAction("Supprimer cette entité", `Tous les liens vers « ${entity.name} » seront aussi supprimés.`, "Supprimer")) {
                deleteEntity(entity.id);
              }
            }}
            style={{
              ...btnGhost, width: "100%",
              border: `1px solid ${THEME.danger}`, color: THEME.danger,
              background: THEME.cream, justifyContent: "center",
            }}
          ><Trash2 size={14} strokeWidth={2.2} /> Supprimer cette entité</button>
        </div>}
      </div>
    </>
  );
}

// ============================================================
// ASSOC INSPECTOR
// ============================================================
function AssocInspector({ assoc, entities, updateAssoc, deleteAssoc, removeLink, startConnectMode, addAssocAttr, updateAssocAttr, deleteAssocAttr, confirmAction, isReadOnly = false }) {
  const entMap = Object.fromEntries(entities.map((e) => [e.id, e]));

  return (
    <>
      <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${THEME.lineSoft}`, background: THEME.creamSoft }}>
        <Kicker>Association{assoc.recursive ? " · récursive" : ""}</Kicker>
        <input
          type="text"
          value={assoc.name}
          readOnly={isReadOnly}
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
                    {!isReadOnly && (
                      <button
                        onClick={() => removeLink(assoc.id, i)}
                        title="Retirer ce lien"
                        style={{ border: "none", background: "transparent", color: THEME.inkMuted, cursor: "pointer", fontSize: 14, padding: 2 }}
                      ><Trash2 size={14} strokeWidth={2.2} /></button>
                    )}
                  </div>
                );
              })}
            </div>

            {!isReadOnly && (
              <button
                onClick={() => startConnectMode(assoc.id)}
                style={{
                  ...btnGhost, width: "100%", marginBottom: 16,
                  border: `1px dashed ${THEME.selection}`,
                  background: "transparent",
                  color: THEME.selection,
                  justifyContent: "center", boxShadow: "none",
                }}
              ><LinkIcon size={14} strokeWidth={2.2} /> Connecter à une entité…</button>
            )}
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
                readOnly={isReadOnly}
                onChange={(e) => updateAssocAttr(assoc.id, i, { name: e.target.value })}
                style={{
                  flex: 1, fontSize: 12, fontFamily: FONT_MONO,
                  border: `1px solid ${THEME.line}`, borderRadius: 5,
                  padding: "3px 6px", background: THEME.cream, color: THEME.ink,
                }}
              />
              {!isReadOnly && (
                <button
                  onClick={() => deleteAssocAttr(assoc.id, i)}
                  title="Supprimer cet attribut"
                  style={{ border: "none", background: "transparent", color: THEME.inkMuted, cursor: "pointer", fontSize: 14, padding: 2 }}
                ><Trash2 size={14} strokeWidth={2.2} /></button>
              )}
            </div>
          ))}
        </div>
        {!isReadOnly && (
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
        )}

        {!isReadOnly && <div style={{ borderTop: `1px solid ${THEME.lineSoft}`, paddingTop: 12 }}>
          <button
            onClick={async () => {
              if (await confirmAction("Supprimer cette association", `Supprimer « ${assoc.name} » ?`, "Supprimer")) {
                deleteAssoc(assoc.id);
              }
            }}
            style={{
              ...btnGhost, width: "100%",
              border: `1px solid ${THEME.danger}`, color: THEME.danger,
              background: THEME.cream, justifyContent: "center",
            }}
          ><Trash2 size={14} strokeWidth={2.2} /> Supprimer cette association</button>
        </div>}
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
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
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
                ><Trash2 size={15} strokeWidth={2.2} /></button>
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
// UNDO HELPERS — intent-preserving per-user diff apply
// ============================================================
function undoArray(currentArr, beforeArr, afterArr, idKey = "id") {
  const map = (arr) => new Map(arr.map((item) => [item[idKey], item]));
  const beforeMap = map(beforeArr);
  const afterMap = map(afterArr);
  const currentMap = map(currentArr);
  const out = new Map(currentMap);
  const ids = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  for (const id of ids) {
    const b = beforeMap.get(id);
    const a = afterMap.get(id);
    const c = currentMap.get(id);
    if (a && c && JSON.stringify(a) === JSON.stringify(c)) {
      if (b) out.set(id, b);
      else out.delete(id);
    } else if (!a && b && !c) {
      out.set(id, b);
    }
  }
  const seen = new Set();
  const ordered = [];
  for (const item of currentArr) {
    const id = item[idKey];
    if (out.has(id)) {
      ordered.push(out.get(id));
      seen.add(id);
    }
  }
  for (const [id, item] of out) {
    if (!seen.has(id)) ordered.push(item);
  }
  return ordered;
}

function undoDict(currentDict, beforeDict, afterDict) {
  const out = { ...currentDict };
  const keys = new Set([...Object.keys(beforeDict || {}), ...Object.keys(afterDict || {})]);
  for (const k of keys) {
    const b = beforeDict?.[k];
    const a = afterDict?.[k];
    const c = currentDict?.[k];
    if (a !== undefined && c !== undefined && JSON.stringify(a) === JSON.stringify(c)) {
      if (b !== undefined) out[k] = b;
      else delete out[k];
    } else if (a === undefined && b !== undefined && c === undefined) {
      out[k] = b;
    }
  }
  return out;
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ERDiagram() {
  const designId = window.MERISIA_DESIGN_ID && window.MERISIA_DESIGN_ID !== "editor"
    ? String(window.MERISIA_DESIGN_ID)
    : "";
  const guestToken = typeof window.MERISIA_GUEST_TOKEN === "string" ? window.MERISIA_GUEST_TOKEN : "";
  const isGuest = !!guestToken && !designId;
  const storageKey = (key) => designId
    ? `merisia_${designId}_${key}`
    : guestToken
      ? `merisia_guest_${guestToken}_${key}`
      : `merisia_local_${key}`;

  // ============================================================
  // REALTIME PRESENCE
  // ============================================================
  const [peers, setPeers] = useState(() => new Map());
  const [selfPeer, setSelfPeer] = useState(null);
  const [presenceToasts, setPresenceToasts] = useState([]);
  const [realtimeDesignId, setRealtimeDesignId] = useState(designId);
  const toastIdRef = useRef(1);
  const pushPresenceToast = (text, color) => {
    const id = toastIdRef.current++;
    setPresenceToasts((current) => [...current, { id, text, color }]);
    setTimeout(() => {
      setPresenceToasts((current) => current.filter((t) => t.id !== id));
    }, 2500);
  };
  const wsRef = useRef(null);
  const presenceRef = useRef({ cursor: null, selection: [], editing: null });
  const presenceFlushedAtRef = useRef(0);
  const presenceTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectBlockedRef = useRef(false);
  const lastPongRef = useRef(Date.now());
  const liveDiagramAppliedRef = useRef(false);
  const [realtimeNonce, setRealtimeNonce] = useState(0);

  const flushPresenceNow = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    presenceFlushedAtRef.current = performance.now();
    try { ws.send(JSON.stringify({ type: "presence", presence: presenceRef.current })); } catch {}
  };

  const queuePresence = (partial) => {
    presenceRef.current = { ...presenceRef.current, ...partial };
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    const now = performance.now();
    const sinceLast = now - presenceFlushedAtRef.current;
    if (sinceLast >= 80) {
      flushPresenceNow();
      return;
    }
    if (presenceTimerRef.current) return;
    presenceTimerRef.current = setTimeout(() => {
      presenceTimerRef.current = null;
      flushPresenceNow();
    }, 80 - sinceLast);
  };

  useEffect(() => {
    if (!realtimeDesignId) return undefined;
    reconnectBlockedRef.current = false;
    let shouldReconnect = true;
    let reconnectTimer = null;
    let pingTimer = null;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const tokenParam = isGuest ? `?token=${encodeURIComponent(guestToken)}` : "";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/designs/${realtimeDesignId}${tokenParam}`);
    wsRef.current = ws;
    ws.addEventListener("open", () => {
      reconnectAttemptsRef.current = 0;
      lastPongRef.current = Date.now();
      pingTimer = setInterval(() => {
        if (ws.readyState !== 1) {
          try { ws.close(); } catch {}
          return;
        }
        if (Date.now() - lastPongRef.current > 45_000) {
          try { ws.close(); } catch {}
          return;
        }
        try { ws.send(JSON.stringify({ type: "ping" })); } catch {}
      }, 20_000);
    });
    ws.addEventListener("message", (event) => {
      let msg;
      try { msg = JSON.parse(event.data); }
      catch { return; }
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "init") {
        setSelfPeer(msg.self || null);
        setPeers(new Map((msg.peers || []).map((peer) => [peer.connectionId, peer])));
      } else if (msg.type === "join" && msg.peer) {
        setPeers((current) => {
          const next = new Map(current);
          next.set(msg.peer.connectionId, msg.peer);
          return next;
        });
        pushPresenceToast(`${msg.peer.name} a rejoint`, msg.peer.color);
      } else if (msg.type === "leave") {
        setPeers((current) => {
          if (!current.has(msg.connectionId)) return current;
          const leaving = current.get(msg.connectionId);
          if (leaving) pushPresenceToast(`${leaving.name} a quitté`, leaving.color);
          const next = new Map(current);
          next.delete(msg.connectionId);
          return next;
        });
      } else if (msg.type === "presence") {
        setPeers((current) => {
          const existing = current.get(msg.connectionId);
          if (!existing) return current;
          const next = new Map(current);
          next.set(msg.connectionId, { ...existing, presence: msg.presence });
          return next;
        });
      } else if (msg.type === "saved" && msg.updated_at) {
        setDesignMeta((current) => ({ ...current, updatedAt: msg.updated_at }));
        setSaveStatus((status) => (status === "saving" ? status : "saved"));
      } else if (msg.type === "pong") {
        lastPongRef.current = Date.now();
      } else if (msg.type === "deleted") {
        reconnectBlockedRef.current = true;
        setAccessError({ status: 410, message: "Ce design a été supprimé par son propriétaire." });
        try { wsRef.current?.close(); } catch {}
      } else if (msg.type === "access_revoked") {
        reconnectBlockedRef.current = true;
        setAccessRole("viewer");
        try { wsRef.current?.close(); } catch {}
        (async () => {
          await showAppAlert("Accès retiré", "Votre accès à ce design vient d'être retiré par son propriétaire.");
          window.location.href = "/dashboard";
        })();
      } else if (msg.type === "edit_request" && msg.from) {
        setPresenceToasts((current) => [...current, {
          id: toastIdRef.current++,
          text: `${msg.from.name} demande l'accès édition`,
          color: msg.from.color,
          action: { label: "Accorder", run: () => grantEditAccess(msg.from.email) },
        }]);
      } else if (msg.type === "role_updated" && msg.role) {
        setAccessRole(msg.role);
        pushPresenceToast(`Votre rôle est maintenant : ${msg.role}`, "#2d8f74");
      } else if (msg.type === "peer_role_updated" && msg.connectionId && msg.role) {
        setPeers((current) => {
          const existing = current.get(msg.connectionId);
          if (!existing) return current;
          const next = new Map(current);
          next.set(msg.connectionId, { ...existing, role: msg.role });
          return next;
        });
      } else if (msg.type === "diagram" && msg.diagram) {
        liveDiagramAppliedRef.current = true;
        applyingRemoteRef.current = true;
        const data = msg.diagram;
        if (Array.isArray(data.entities)) setEntities(data.entities);
        if (Array.isArray(data.assocs)) setAssocs(data.assocs);
        if (data.modules && typeof data.modules === "object") setModules(data.modules);
        if (data.positions && typeof data.positions === "object") setPositions(data.positions);
        if (data.cardinalEdits && typeof data.cardinalEdits === "object") setCardinalEdits(data.cardinalEdits);
        if (Array.isArray(data.notes)) setNotes(data.notes);
        // visibleModules is intentionally NOT synced — each user controls their own view
        setTimeout(() => { applyingRemoteRef.current = false; }, 0);
      }
    });
    ws.addEventListener("close", () => {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (wsRef.current === ws) wsRef.current = null;
      setPeers(new Map());
      setSelfPeer(null);
      if (shouldReconnect && !reconnectBlockedRef.current) {
        const delay = Math.min(10_000, 800 * 2 ** reconnectAttemptsRef.current);
        reconnectAttemptsRef.current += 1;
        reconnectTimer = setTimeout(() => setRealtimeNonce((value) => value + 1), delay);
      }
    });
    ws.addEventListener("error", () => {});
    const onBeforeUnload = () => {
      shouldReconnect = false;
      try { ws.close(); } catch {}
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      shouldReconnect = false;
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      try { ws.close(); } catch {}
      if (presenceTimerRef.current) {
        clearTimeout(presenceTimerRef.current);
        presenceTimerRef.current = null;
      }
    };
  }, [realtimeDesignId, isGuest, guestToken, realtimeNonce]);

  const [tr, setTr] = useState({ x: 30, y: 30, s: 0.52 });
  const [drag, setDrag] = useState(null);

  const [entities, setEntities] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey("er_entities_v1"));
      if (saved) return JSON.parse(saved);
    } catch {}
    let savedPos = {};
    try {
      const sp = localStorage.getItem(storageKey("erp_positions"));
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
      const saved = localStorage.getItem(storageKey("er_assocs_v1"));
      if (saved) return JSON.parse(saved);
    } catch {}
    let savedPos = {};
    try {
      const sp = localStorage.getItem(storageKey("erp_positions"));
      if (sp) savedPos = JSON.parse(sp);
    } catch {}
    return ASSOCS.map((a) => ({ ...a, ...(savedPos[a.id] || {}) }));
  });

  const [modules, setModules] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey("er_modules_v1"));
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_MODULES;
  });

  const [positions, setPositions] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey("erp_positions"));
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [blockDrag, setBlockDrag] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [visibleModules, setVisibleModules] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey("er_visible_modules_v1"));
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set(Object.keys(DEFAULT_MODULES));
  });
  const [editingCardinal, setEditingCardinal] = useState(null);
  const [cardinalEdits, setCardinalEdits] = useState({});
  const [connectMode, setConnectMode] = useState(null);
  const [showModuleEditor, setShowModuleEditor] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [screenshotModal, setScreenshotModal] = useState(false);
  const [notes, setNotes] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey("er_notes_v1"));
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [noteDrag, setNoteDrag] = useState(null);
  const [shareModal, setShareModal] = useState(false);
  const [shareData, setShareData] = useState({ links: [], collaborators: [] });
  const [shareBusy, setShareBusy] = useState(false);
  const [shareRole, setShareRole] = useState("editor");
  const [shareCopied, setShareCopied] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  const refreshShareData = async () => {
    if (!designId) return;
    try {
      const res = await fetch(`/api/designs/${designId}/share`);
      if (res.ok) setShareData(await res.json());
    } catch {}
  };

  const openShareModal = async () => {
    setShareModal(true);
    setShareCopied(false);
    await refreshShareData();
  };

  const createShareLink = async () => {
    setShareBusy(true);
    try {
      await fetch(`/api/designs/${designId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: shareRole })
      });
      await refreshShareData();
    } finally {
      setShareBusy(false);
    }
  };

  const revokeShareLink = async (token) => {
    setShareBusy(true);
    try {
      await fetch(`/api/designs/${designId}/share`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      await refreshShareData();
    } finally {
      setShareBusy(false);
    }
  };

  const removeCollaborator = async (email) => {
    setShareBusy(true);
    try {
      await fetch(`/api/designs/${designId}/collaborators/${encodeURIComponent(email)}`, {
        method: "DELETE"
      });
      await refreshShareData();
    } finally {
      setShareBusy(false);
    }
  };

  const shareUrlFor = (token) => `${window.location.origin}/share/${token}`;

  const copyShareUrl = async (token) => {
    try {
      await navigator.clipboard.writeText(shareUrlFor(token));
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch {}
  };
  const [screenshotOptions, setScreenshotOptions] = useState({
    panX: 0,
    panY: 0,
    zoom: 1,
    legendScale: 1,
    showGrid: false,
    showLegend: false,
    backgroundColor: THEME.paper,
  });
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState("");
  const [designMeta, setDesignMeta] = useState({ title: "Design", updatedAt: null });
  const [saveStatus, setSaveStatus] = useState("idle");
  const [accessError, setAccessError] = useState(null);
  const [accessRole, setAccessRole] = useState(null); // 'owner' | 'editor' | 'viewer' | 'guest'
  const isReadOnly = isGuest || accessRole === "viewer";
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [selectionBox, setSelectionBox] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [appDialog, setAppDialog] = useState(null);
  const appDialogResolver = useRef(null);
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(false);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const clipboardRef = useRef(null);
  const prevSnapRef = useRef(null);
  const undoApplyingRef = useRef(false);
  const undoEnqueueTimerRef = useRef(null);
  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);

  const svgRef = useRef(null);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const entMap = Object.fromEntries(entities.map((e) => [e.id, e]));
  const assocMap = Object.fromEntries(assocs.map((a) => [a.id, a]));

  const openAppDialog = (config) => new Promise((resolve) => {
    appDialogResolver.current = resolve;
    setAppDialog(config);
  });

  const closeAppDialog = (value) => {
    appDialogResolver.current?.(value);
    appDialogResolver.current = null;
    setAppDialog(null);
  };

  const showAppAlert = (title, message) => openAppDialog({
    title,
    message,
    actions: [{ label: "OK", value: true, primary: true }],
  });

  const showAppConfirm = (title, message, confirmLabel = "Confirmer") => openAppDialog({
    title,
    message,
    actions: [
      { label: "Annuler", value: false },
      { label: confirmLabel, value: true, primary: true },
    ],
  });

  const getDiagramBounds = (data = getDiagramData()) => {
    const points = [];
    (data.entities || []).forEach((ent) => {
      const h = getEntityHeight(ent);
      points.push(
        { x: ent.x - EW / 2, y: ent.y - h / 2 },
        { x: ent.x + EW / 2, y: ent.y + h / 2 }
      );
    });
    (data.assocs || []).forEach((assoc) => {
      points.push(
        { x: assoc.x - AX, y: assoc.y - AY },
        { x: assoc.x + AX, y: assoc.y + AY }
      );
      (assoc.dataAttrs || []).forEach((attr) => {
        points.push({ x: assoc.x + attr.dx, y: assoc.y + attr.dy });
      });
    });
    if (!points.length) return null;
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  };

  const fitDiagramToView = (data) => {
    const bounds = getDiagramBounds(data);
    if (!bounds) {
      setTr({ x: 30, y: 30, s: 0.52 });
      return;
    }
    const padding = 120;
    const viewportW = Math.max(320, window.innerWidth);
    const viewportH = Math.max(320, window.innerHeight);
    const scale = Math.min(
      1.1,
      Math.max(0.2, Math.min((viewportW - padding * 2) / bounds.width, (viewportH - padding * 2) / bounds.height))
    );
    setTr({
      x: (viewportW - bounds.width * scale) / 2 - bounds.x * scale,
      y: (viewportH - bounds.height * scale) / 2 - bounds.y * scale,
      s: scale,
    });
  };

  const getSnapTargets = (movingIds = new Set()) => [
    ...entities
      .filter((entity) => !movingIds.has(entity.id))
      .map((entity) => ({ x: entity.x, y: entity.y })),
    ...assocs
      .filter((assoc) => !movingIds.has(assoc.id))
      .map((assoc) => ({ x: assoc.x, y: assoc.y })),
  ];

  const snapCoordinate = (value, targets, axis) => {
    const gridValue = Math.round(value / SNAP_GRID) * SNAP_GRID;
    let best = Math.abs(gridValue - value) <= SNAP_THRESHOLD ? gridValue : value;
    let bestDistance = Math.abs(best - value);
    targets.forEach((target) => {
      const targetValue = target[axis];
      const distance = Math.abs(targetValue - value);
      if (distance <= SNAP_THRESHOLD && distance < bestDistance) {
        best = targetValue;
        bestDistance = distance;
      }
    });
    return best;
  };

  const snapPoint = (point, targets) => {
    if (!snapEnabled) return point;
    return {
      x: snapCoordinate(point.x, targets, "x"),
      y: snapCoordinate(point.y, targets, "y"),
    };
  };

  const screenToWorld = (x, y) => ({ x: (x - tr.x) / tr.s, y: (y - tr.y) / tr.s });

  const getSelectableBlocks = () => [
    ...entities
      .filter((ent) => isEntityVisible(ent))
      .map((ent) => ({ id: ent.id, type: "entity", x: ent.x, y: ent.y })),
    ...assocs
      .filter((assoc) => !assoc.recursive || entMap[assoc.entity])
      .map((assoc) => ({ id: assoc.id, type: "assoc", x: assoc.x, y: assoc.y })),
    ...assocs.flatMap((assoc) => (assoc.dataAttrs || []).map((attr) => {
      const defaultPos = { x: assoc.x + attr.dx, y: assoc.y + attr.dy };
      const pos = getBlockPos(attr.id, defaultPos);
      return { id: attr.id, type: "attr", x: pos.x, y: pos.y };
    })),
  ];

  const selectBlocksInScreenRect = (box) => {
    const start = screenToWorld(box.startX, box.startY);
    const end = screenToWorld(box.endX, box.endY);
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const next = new Set(
      getSelectableBlocks()
        .filter((block) => block.x >= minX && block.x <= maxX && block.y >= minY && block.y <= maxY)
        .map((block) => block.id)
    );
    setSelected(next);
  };

  const moveSelectedBy = (dx, dy) => {
    if (isReadOnly) return;
    if (!selected.size) return;
    setEntities((items) => items.map((item) => selected.has(item.id) ? { ...item, x: item.x + dx, y: item.y + dy } : item));
    setAssocs((items) => items.map((item) => selected.has(item.id) ? { ...item, x: item.x + dx, y: item.y + dy } : item));
    setPositions((items) => {
      const next = { ...items };
      selected.forEach((id) => {
        if (entMap[id] || assocMap[id]) return;
        const existing = next[id] || getSelectableBlocks().find((block) => block.id === id);
        if (existing) next[id] = { x: existing.x + dx, y: existing.y + dy };
      });
      return next;
    });
  };

  const deleteSelectedBlocks = () => {
    if (isReadOnly) return;
    if (!selected.size) return;
    const selectedIds = new Set(selected);
    setEntities((items) => items.filter((item) => !selectedIds.has(item.id)));
    setAssocs((items) =>
      items
        .filter((item) => !selectedIds.has(item.id) && !(item.recursive && selectedIds.has(item.entity)))
        .map((item) => ({
          ...item,
          links: item.links?.filter((link) => !selectedIds.has(link.e)),
          dataAttrs: item.dataAttrs?.filter((attr) => !selectedIds.has(attr.id)),
        }))
    );
    setPositions((items) => {
      const next = { ...items };
      selectedIds.forEach((id) => delete next[id]);
      return next;
    });
    setSelected(new Set());
  };

  const copySelectedBlocks = () => {
    if (!selected.size) return false;
    const selectedIds = new Set(selected);
    const copiedEntities = entities.filter((item) => selectedIds.has(item.id));
    const copiedNotes = notes.filter((item) => selectedIds.has(item.id));
    const copiedEntityIds = new Set(copiedEntities.map((item) => item.id));
    const copiedAssocs = assocs
      .filter((assoc) => selectedIds.has(assoc.id))
      .filter((assoc) => assoc.recursive
        ? copiedEntityIds.has(assoc.entity)
        : (assoc.links || []).every((link) => copiedEntityIds.has(link.e))
      );
    if (!copiedEntities.length && !copiedAssocs.length && !copiedNotes.length) return false;
    clipboardRef.current = {
      entities: JSON.parse(JSON.stringify(copiedEntities)),
      assocs: JSON.parse(JSON.stringify(copiedAssocs)),
      notes: JSON.parse(JSON.stringify(copiedNotes))
    };
    return true;
  };

  const cutSelectedBlocks = () => {
    if (isReadOnly) return;
    if (!copySelectedBlocks()) return;
    deleteSelectedBlocks();
  };

  const pasteBlocks = () => {
    if (isReadOnly) return;
    const clip = clipboardRef.current;
    if (!clip) return;
    const stamp = Date.now();
    const offset = 34;
    const idMap = new Map();
    const nextSelected = new Set();

    const nextEntities = (clip.entities || []).map((entity, index) => {
      const id = `ent_${stamp}_${index}`;
      idMap.set(entity.id, id);
      nextSelected.add(id);
      return { ...entity, id, name: `${entity.name} copie`, x: entity.x + offset, y: entity.y + offset };
    });

    const nextNotes = (clip.notes || []).map((note, index) => {
      const id = `note_${stamp}_${index}`;
      nextSelected.add(id);
      return { ...note, id, x: note.x + offset, y: note.y + offset };
    });

    const nextAssocs = (clip.assocs || []).map((assoc, index) => {
      const id = `assoc_${stamp}_${index}`;
      nextSelected.add(id);
      const dataAttrs = (assoc.dataAttrs || []).map((attr, attrIndex) => {
        const attrId = `attr_${stamp}_${index}_${attrIndex}`;
        return { ...attr, id: attrId };
      });
      return {
        ...assoc,
        id,
        x: assoc.x + offset,
        y: assoc.y + offset,
        entity: assoc.entity ? idMap.get(assoc.entity) || assoc.entity : assoc.entity,
        links: (assoc.links || []).map((link) => ({ ...link, e: idMap.get(link.e) || link.e })),
        dataAttrs
      };
    });

    setEntities((items) => [...items, ...nextEntities]);
    setAssocs((items) => [...items, ...nextAssocs]);
    setNotes((items) => [...items, ...nextNotes]);
    setSelected(nextSelected);
    clipboardRef.current = clip;
  };

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

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const getCardinalValue = (assocId, linkIndex) => {
    const key = `${assocId}-${linkIndex}`;
    return cardinalEdits[key] !== undefined ? cardinalEdits[key] : null;
  };

  const setCardinalValue = (assocId, linkIndex, value) => {
    if (isReadOnly) return;
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
  useEffect(() => { localStorage.setItem(storageKey("erp_positions"), JSON.stringify(positions)); }, [positions]);
  useEffect(() => { localStorage.setItem(storageKey("er_entities_v1"), JSON.stringify(entities)); }, [entities]);
  useEffect(() => { localStorage.setItem(storageKey("er_assocs_v1"), JSON.stringify(assocs)); }, [assocs]);
  useEffect(() => { localStorage.setItem(storageKey("er_modules_v1"), JSON.stringify(modules)); }, [modules]);
  useEffect(() => { localStorage.setItem(storageKey("er_visible_modules_v1"), JSON.stringify(Array.from(visibleModules))); }, [visibleModules]);
  useEffect(() => { localStorage.setItem(storageKey("er_notes_v1"), JSON.stringify(notes)); }, [notes]);

  // Auto-reveal ONLY genuinely new module keys (peer adds one) — don't re-reveal modules I deliberately hid.
  const prevModuleKeysRef = useRef(null);
  useEffect(() => {
    const currentKeys = new Set(Object.keys(modules));
    const prev = prevModuleKeysRef.current;
    prevModuleKeysRef.current = currentKeys;
    if (!prev) return; // first run: respect existing localStorage choice
    const fresh = [...currentKeys].filter((k) => !prev.has(k));
    if (!fresh.length) return;
    setVisibleModules((current) => {
      const next = new Set(current);
      for (const k of fresh) next.add(k);
      return next;
    });
  }, [modules]);

  useEffect(() => {
    if (!designId || !hydratedRef.current || applyingRemoteRef.current) return;
    setSaveStatus((status) => (status === "saving" ? status : "unsaved"));
  }, [entities, assocs, modules, positions, cardinalEdits, visibleModules, notes]);

  const takeDiagramSnap = () => ({
    entities: JSON.parse(JSON.stringify(entities)),
    assocs: JSON.parse(JSON.stringify(assocs)),
    modules: JSON.parse(JSON.stringify(modules)),
    positions: JSON.parse(JSON.stringify(positions)),
    cardinalEdits: JSON.parse(JSON.stringify(cardinalEdits)),
    visibleModules: Array.from(visibleModules),
    notes: JSON.parse(JSON.stringify(notes)),
  });

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (applyingRemoteRef.current || undoApplyingRef.current) {
      prevSnapRef.current = takeDiagramSnap();
      return;
    }
    if (undoEnqueueTimerRef.current) clearTimeout(undoEnqueueTimerRef.current);
    const captured = takeDiagramSnap();
    undoEnqueueTimerRef.current = setTimeout(() => {
      undoEnqueueTimerRef.current = null;
      const before = prevSnapRef.current || captured;
      if (JSON.stringify(before) === JSON.stringify(captured)) return;
      undoStackRef.current.push({ before, after: captured });
      if (undoStackRef.current.length > 50) undoStackRef.current.shift();
      redoStackRef.current = [];
      prevSnapRef.current = captured;
      setUndoDepth(undoStackRef.current.length);
      setRedoDepth(0);
    }, 250);
  }, [entities, assocs, modules, positions, cardinalEdits, visibleModules, notes]);

  const performUndo = () => {
    if (isReadOnly) return;
    const entry = undoStackRef.current.pop();
    setUndoDepth(undoStackRef.current.length);
    if (!entry) return;
    redoStackRef.current.push(entry);
    if (redoStackRef.current.length > 50) redoStackRef.current.shift();
    setRedoDepth(redoStackRef.current.length);
    undoApplyingRef.current = true;
    setEntities((current) => undoArray(current, entry.before.entities, entry.after.entities));
    setAssocs((current) => undoArray(current, entry.before.assocs, entry.after.assocs));
    setNotes((current) => undoArray(current, entry.before.notes || [], entry.after.notes || []));
    setModules((current) => undoDict(current, entry.before.modules, entry.after.modules));
    setPositions((current) => undoDict(current, entry.before.positions, entry.after.positions));
    setCardinalEdits((current) => undoDict(current, entry.before.cardinalEdits, entry.after.cardinalEdits));
    setVisibleModules((current) => {
      const sorted = (arr) => JSON.stringify([...arr].sort());
      if (sorted(Array.from(current)) === sorted(entry.after.visibleModules)) {
        return new Set(entry.before.visibleModules);
      }
      return current;
    });
    setTimeout(() => { undoApplyingRef.current = false; }, 0);
  };

  const performRedo = () => {
    if (isReadOnly) return;
    const entry = redoStackRef.current.pop();
    setRedoDepth(redoStackRef.current.length);
    if (!entry) return;
    undoStackRef.current.push(entry);
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    setUndoDepth(undoStackRef.current.length);
    undoApplyingRef.current = true;
    setEntities((current) => undoArray(current, entry.after.entities, entry.before.entities));
    setAssocs((current) => undoArray(current, entry.after.assocs, entry.before.assocs));
    setNotes((current) => undoArray(current, entry.after.notes || [], entry.before.notes || []));
    setModules((current) => undoDict(current, entry.after.modules, entry.before.modules));
    setPositions((current) => undoDict(current, entry.after.positions, entry.before.positions));
    setCardinalEdits((current) => undoDict(current, entry.after.cardinalEdits, entry.before.cardinalEdits));
    setVisibleModules((current) => {
      const sorted = (arr) => JSON.stringify([...arr].sort());
      if (sorted(Array.from(current)) === sorted(entry.before.visibleModules)) {
        return new Set(entry.after.visibleModules);
      }
      return current;
    });
    setTimeout(() => { undoApplyingRef.current = false; }, 0);
  };

  const diagramBroadcastTimerRef = useRef(null);
  useEffect(() => {
    if (!designId || isReadOnly || !hydratedRef.current || applyingRemoteRef.current) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    if (diagramBroadcastTimerRef.current) clearTimeout(diagramBroadcastTimerRef.current);
    diagramBroadcastTimerRef.current = setTimeout(() => {
      diagramBroadcastTimerRef.current = null;
      const live = wsRef.current;
      if (!live || live.readyState !== 1) return;
      try {
        live.send(JSON.stringify({
          type: "diagram",
          diagram: { entities, assocs, modules, positions, cardinalEdits, notes }
        }));
      } catch {}
    }, 120);
  }, [entities, assocs, modules, positions, cardinalEdits, notes]);

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isTyping = ["input", "textarea", "select"].includes(tag) || document.activeElement?.isContentEditable;
      if (isTyping) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isReadOnly) {
          requestEditAccess();
          return;
        }
        saveDesignXml().catch((err) => {
          console.error(err);
          showAppAlert("Sauvegarde impossible", err.message || "Erreur pendant la sauvegarde.");
        });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        if (isReadOnly) return;
        performUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")) {
        e.preventDefault();
        if (isReadOnly) return;
        performRedo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelectedBlocks();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        if (isReadOnly) return;
        cutSelectedBlocks();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        if (isReadOnly) return;
        pasteBlocks();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(getSelectableBlocks().map((block) => block.id)));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (isReadOnly) return;
        deleteSelectedBlocks();
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        if (isReadOnly) return;
        const step = e.shiftKey ? 20 : 5;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        moveSelectedBy(dx, dy);
        return;
      }
      if (e.key === "Escape") {
        setConnectMode(null);
        setEditingCardinal(null);
        setShowModuleEditor(false);
        setSelectionBox(null);
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, entities, assocs, notes, positions, tr, designMeta.updatedAt, isReadOnly]);

  useEffect(() => {
    queuePresence({ selection: Array.from(selected) });
    if (!selected.size) setInspectorExpanded(false);
  }, [selected]);

  useEffect(() => {
    let editing = null;
    if (blockDrag) editing = "Déplace une sélection";
    else if (connectMode) editing = "Crée une association";
    else if (editingCardinal) editing = "Édite une cardinalité";
    else if (showModuleEditor) editing = "Édite les modules";
    queuePresence({ editing });
  }, [blockDrag, connectMode, editingCardinal, showModuleEditor]);

  useEffect(() => {
    if (!isGuest) return;
    fetch(`/api/share/${guestToken}`)
      .then(async (res) => {
        if (!res.ok) {
          setAccessError({ status: res.status, message: "Lien de partage invalide ou révoqué." });
          return null;
        }
        return res.json();
      })
      .then((design) => {
        if (!design?.diagram_json) return;
        setAccessRole("guest");
        setDesignMeta({
          title: design.title || "Design",
          updatedAt: design.updated_at || null,
        });
        setRealtimeDesignId(design.id || "");
        if (!liveDiagramAppliedRef.current) {
          applyingRemoteRef.current = true;
          applyDiagramData(design.diagram_json);
          requestAnimationFrame(() => fitDiagramToView(design.diagram_json));
        }
        setSaveStatus("saved");
        setTimeout(() => {
          applyingRemoteRef.current = false;
          hydratedRef.current = true;
        }, 0);
      })
      .catch(() => setAccessError({ status: 0, message: "Erreur réseau pendant le chargement." }));
  }, []);

  useEffect(() => {
    if (!designId) return;
    fetch(`/api/designs/${designId}`)
      .then(async (res) => {
        if (res.status === 404 || res.status === 403) {
          setAccessError({
            status: res.status,
            message: res.status === 404
              ? "Ce design n'existe pas ou ne vous est pas partagé."
              : "Vous n'avez pas accès à ce design."
          });
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((design) => {
        if (!design?.diagram_json) return;
        setAccessRole(design.access_role || "viewer");
        setDesignMeta({
          title: design.title || "Design",
          updatedAt: design.updated_at || null,
        });
        if (!liveDiagramAppliedRef.current) {
          applyingRemoteRef.current = true;
          applyDiagramData(design.diagram_json);
          requestAnimationFrame(() => fitDiagramToView(design.diagram_json));
        }
        setSaveStatus("saved");
        setTimeout(() => {
          applyingRemoteRef.current = false;
          hydratedRef.current = true;
        }, 0);
      })
      .catch((err) => {
        console.warn("Chargement JSON ignoré", err);
        setAccessError({ status: 0, message: "Erreur réseau pendant le chargement." });
      });
  }, []);

  // ============================================================
  // CRUD: entities
  // ============================================================
  const getViewportCenter = () => {
    const w = window.innerWidth, h = window.innerHeight;
    return { x: (-tr.x + w / 2) / tr.s, y: (-tr.y + h / 2) / tr.s };
  };

  const grantEditAccess = async (email) => {
    if (!designId || !email) return;
    try {
      const response = await fetch(`/api/designs/${designId}/collaborators/${encodeURIComponent(email)}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "editor" })
      });
      if (!response.ok) throw new Error("Role update failed");
      pushPresenceToast(`Accès édition accordé à ${email}`, "#2d8f74");
    } catch {
      pushPresenceToast("Impossible d'accorder l'accès", "#dc2626");
    }
  };

  const requestEditAccess = () => {
    if (isGuest) {
      window.location.href = `/auth?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify({ type: "request_edit" })); } catch {}
      pushPresenceToast("Demande envoyée au propriétaire", selfPeer?.color || "#2f6fbd");
    }
  };

  const addNote = (point = getViewportCenter()) => {
    if (isReadOnly) return;
    const id = `note_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
    const c = point;
    const author = selfPeer ? { name: selfPeer.name, color: selfPeer.color } : { name: "Moi", color: "#f4c542" };
    setNotes((current) => [
      ...current,
      { id, x: c.x, y: c.y, w: 180, h: 110, text: "", authorName: author.name, authorColor: author.color, createdAt: Date.now() }
    ]);
  };

  const updateNote = (id, patch) => {
    if (isReadOnly) return;
    setNotes((current) => current.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const deleteNote = (id) => {
    if (isReadOnly) return;
    setNotes((current) => current.filter((n) => n.id !== id));
  };

  const addEntity = (point = getViewportCenter()) => {
    if (isReadOnly) return;
    const id = `ent_${Date.now()}`;
    const c = point;
    let moduleKey = Array.from(visibleModules)[0] || Object.keys(modules)[0];
    if (!moduleKey) {
      moduleKey = DEFAULT_AUTO_MODULE_ID;
      setModules((current) => (
        Object.keys(current).length ? current : { [DEFAULT_AUTO_MODULE_ID]: createDefaultModule() }
      ));
      setVisibleModules((current) => new Set([...current, DEFAULT_AUTO_MODULE_ID]));
    }
    const newEnt = {
      id, name: "NouvelleEntité",
      x: c.x, y: c.y, m: moduleKey,
      attrs: [{ name: `id_${id.slice(-6)}`, pk: true }],
    };
    setEntities((es) => [...es, newEnt]);
    setSelected(new Set([id]));
  };

  const updateEntity = (id, updates) => {
    if (isReadOnly) return;
    setEntities((es) => es.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  };

  const deleteEntity = (id) => {
    if (isReadOnly) return;
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
    if (isReadOnly) return;
    setEntities((es) =>
      es.map((e) => {
        if (e.id !== entityId) return e;
        return { ...e, attrs: [...(e.attrs || []), { name: "nouvel_attribut" }] };
      })
    );
  };

  const updateEntityAttr = (entityId, attrIndex, updates) => {
    if (isReadOnly) return;
    setEntities((es) =>
      es.map((e) => {
        if (e.id !== entityId) return e;
        const attrs = (e.attrs || []).map((a, i) => (i === attrIndex ? { ...a, ...updates } : a));
        return { ...e, attrs };
      })
    );
  };

  const deleteEntityAttr = (entityId, attrIndex) => {
    if (isReadOnly) return;
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
    if (isReadOnly) return;
    setAssocs((as) => as.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  const deleteAssoc = (id) => {
    if (isReadOnly) return;
    setAssocs((as) => as.filter((a) => a.id !== id));
    setSelected(new Set());
  };

  const removeLink = (assocId, linkIndex) => {
    if (isReadOnly) return;
    setAssocs((as) =>
      as.map((a) => a.id !== assocId ? a : { ...a, links: a.links.filter((_, i) => i !== linkIndex) })
    );
  };

  const addAssocAttr = (assocId) => {
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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
    if (isReadOnly) return;
    setAssocs((as) =>
      as.map((a) => a.id !== assocId ? a : { ...a, dataAttrs: (a.dataAttrs || []).filter((_, i) => i !== attrIndex) })
    );
  };

  // ============================================================
  // CRUD: modules
  // ============================================================
  const addModule = () => {
    if (isReadOnly) return;
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
    if (isReadOnly) return;
    setModules((m) => ({ ...m, [id]: { ...m[id], ...updates } }));
  };

  const deleteModule = async (id) => {
    if (isReadOnly) return;
    const usageCount = entities.filter((e) => e.m === id).length;
    const remaining = Object.keys(modules).filter((k) => k !== id);

    if (remaining.length === 0) {
      await showAppAlert("Suppression impossible", "Impossible de supprimer le dernier module. Creez-en un autre d'abord.");
      return;
    }

    if (usageCount > 0) {
      const fallback = remaining[0];
      const fallbackLabel = modules[fallback].label;
      if (!await showAppConfirm("Déplacer les entités", `${usageCount} entité(s) sont dans ce module. Elles seront déplacées vers « ${fallbackLabel} ».\n\nContinuer ?`, "Continuer")) {
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
    if (isReadOnly) return;
    setConnectMode({ firstId: null, targetAssocId });
  };

  const tryConnect = (clickedId) => {
    if (isReadOnly) return true;
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
    showAppAlert("Connexion impossible", "La connexion association ↔ association n'est pas supportée.");
    setConnectMode(null);
    return true;
  };

  // ============================================================
  // PAN / DRAG / WHEEL
  // ============================================================
  const onDown = (ev) => {
    if (ev.button === 2) return;
    ev.preventDefault();
    setContextMenu(null);
    setToolsMenuOpen(false);
    if (ev.shiftKey && ev.button === 0) {
      setSelectionBox({ startX: ev.clientX, startY: ev.clientY, endX: ev.clientX, endY: ev.clientY });
      setDrag(null);
      return;
    }
    setSelected(new Set());
    setDrag({ ox: tr.x - ev.clientX, oy: tr.y - ev.clientY });
  };

  const onMove = (ev) => {
    const overHud = ev.target?.closest?.("[data-hud='true']");
    if (screenshotModal || overHud) {
      queuePresence({ cursor: null });
    } else {
      queuePresence({ cursor: { x: (ev.clientX - tr.x) / tr.s, y: (ev.clientY - tr.y) / tr.s } });
    }
    if (noteDrag) {
      if (isReadOnly) return;
      const dx = (ev.clientX - noteDrag.startX) / tr.s;
      const dy = (ev.clientY - noteDrag.startY) / tr.s;
      updateNote(noteDrag.id, { x: noteDrag.originX + dx, y: noteDrag.originY + dy });
    }
    if (selectionBox) {
      setSelectionBox((box) => ({ ...box, endX: ev.clientX, endY: ev.clientY }));
      return;
    }
    if (!drag && !blockDrag) return;
    if (drag) {
      setTr((p) => ({ ...p, x: ev.clientX + drag.ox, y: ev.clientY + drag.oy }));
    }
    if (blockDrag) {
      const dx = (ev.clientX - blockDrag.startX) / tr.s;
      const dy = (ev.clientY - blockDrag.startY) / tr.s;
      const movedEntities = {}, movedAssocs = {}, movedPositions = {};
      const movingIds = new Set(blockDrag.selected);
      const snapTargets = getSnapTargets(movingIds);

      blockDrag.selected.forEach((blockId) => {
        const startPos = blockDrag.startPositions[blockId];
        const next = snapPoint({ x: startPos.x + dx, y: startPos.y + dy }, snapTargets);
        if (entMap[blockId])      movedEntities[blockId] = next;
        else if (assocMap[blockId]) movedAssocs[blockId] = next;
        else                      movedPositions[blockId] = next;
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

  const onUp = () => {
    if (selectionBox) {
      selectBlocksInScreenRect(selectionBox);
      setSelectionBox(null);
    }
    setDrag(null);
    setBlockDrag(null);
    if (noteDrag) setNoteDrag(null);
  };

  const onWheel = (ev) => {
    ev.preventDefault();
    const f = ev.deltaY < 0 ? 1.1 : 0.91;
    setTr((p) => {
      const nextScale = Math.min(2.5, Math.max(0.2, p.s * f));
      const worldX = (ev.clientX - p.x) / p.s;
      const worldY = (ev.clientY - p.y) / p.s;
      return {
        x: ev.clientX - worldX * nextScale,
        y: ev.clientY - worldY * nextScale,
        s: nextScale,
      };
    });
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
    if (ev.button === 2) return;
    ev.preventDefault();
    ev.stopPropagation();

    if (connectMode && !isReadOnly) {
      if (tryConnect(id)) return;
    }

    const isMultiSelect = ev.ctrlKey || ev.metaKey;
    let newSelected = new Set(selected);
    if (isMultiSelect) {
      if (newSelected.has(id)) newSelected.delete(id);
      else newSelected.add(id);
    } else if (selected.has(id)) {
      newSelected = new Set(selected);
    } else {
      newSelected = new Set([id]);
    }
    setSelected(newSelected);

    if (isReadOnly) return; // viewers/guests can highlight but not drag/move

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

  const openContextMenu = (ev, nextSelected = selected) => {
    ev.preventDefault();
    ev.stopPropagation();
    setContextMenu({
      x: ev.clientX,
      y: ev.clientY,
      world: screenToWorld(ev.clientX, ev.clientY),
      selected: Array.from(nextSelected),
      readOnly: isReadOnly,
    });
  };

  const onCanvasContextMenu = (ev) => {
    if (connectMode && !isReadOnly) {
      ev.preventDefault();
      ev.stopPropagation();
      setConnectMode(null);
      setContextMenu(null);
      return;
    }
    openContextMenu(ev);
  };

  const onBlockContextMenu = (ev, id) => {
    if (connectMode && !isReadOnly) {
      ev.preventDefault();
      ev.stopPropagation();
      setConnectMode(null);
      setContextMenu(null);
      return;
    }
    const nextSelected = selected.has(id) ? new Set(selected) : new Set([id]);
    setSelected(nextSelected);
    openContextMenu(ev, nextSelected);
  };

  // ============================================================
  // RESET / EXPORT / IMPORT (diagramme COMPLET)
  // ============================================================
  const clearPositions = async () => {
    if (isReadOnly) return;
    if (await showAppConfirm("Réinitialiser le diagramme", "Cela restaurera la version d'origine et supprimera toutes vos modifications.", "Réinitialiser")) {
      setEntities(ENTITIES.map((e) => ({ ...e, attrs: ENTITY_ATTRS[e.id] || [] })));
      setAssocs(ASSOCS);
      setModules(DEFAULT_MODULES);
      setVisibleModules(new Set(Object.keys(DEFAULT_MODULES)));
      setPositions({});
      setCardinalEdits({});
      setSelected(new Set());
      localStorage.removeItem(storageKey("erp_positions"));
      localStorage.removeItem(storageKey("er_entities_v1"));
      localStorage.removeItem(storageKey("er_assocs_v1"));
      localStorage.removeItem(storageKey("er_modules_v1"));
      localStorage.removeItem(storageKey("er_visible_modules_v1"));
    }
  };

  const getDiagramData = () => ({
    version: 3,
    exportedAt: new Date().toISOString(),
    entities, assocs, modules, positions, cardinalEdits, notes,
  });

  const escapeXml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

  const diagramToXml = (data = getDiagramData()) => (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<merisia-design version="${escapeXml(data.version)}" exportedAt="${escapeXml(data.exportedAt)}">\n` +
    `  <payload>${escapeXml(JSON.stringify(data))}</payload>\n` +
    `</merisia-design>\n`
  );

  const applyDiagramData = (data) => {
    if (Array.isArray(data.entities)) setEntities(data.entities);
    if (Array.isArray(data.assocs)) setAssocs(data.assocs);
    if (data.modules && typeof data.modules === "object") setModules(data.modules);
    if (data.positions && typeof data.positions === "object") setPositions(data.positions);
    if (data.cardinalEdits && typeof data.cardinalEdits === "object") setCardinalEdits(data.cardinalEdits);
    if (Array.isArray(data.notes)) setNotes(data.notes);
    // visibleModules is intentionally per-user — never override from server.
    setSelected(new Set());
    setConnectMode(null);
  };

  const parseDiagramXml = (xmlText) => {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const payload = doc.querySelector("payload")?.textContent;
    return payload ? JSON.parse(payload) : null;
  };

  const saveDesignXml = async () => {
    if (isReadOnly) {
      await showAppAlert("Mode lecture seule", "Demandez l'accès édition avant de sauvegarder ce design.");
      return;
    }
    if (!designId) {
      await showAppAlert("Sauvegarde impossible", "Aucun design n'est sélectionné pour la sauvegarde.");
      return;
    }
    setSaveStatus("saving");
    const response = await fetch(`/api/designs/${designId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        diagram_json: getDiagramData(),
        if_unmodified_since: designMeta.updatedAt,
      }),
    });
    if (response.status === 409) {
      const conflict = await response.json().catch(() => ({}));
      setSaveStatus("conflict");
      throw new Error(conflict.error || "Conflit de sauvegarde");
    }
    if (!response.ok) {
      setSaveStatus("failed");
      throw new Error(await response.text());
    }
    const payload = await response.json();
    const nextUpdatedAt = payload.design?.updated_at || null;
    setDesignMeta((current) => ({
      ...current,
      updatedAt: nextUpdatedAt || current.updatedAt,
    }));
    setSaveStatus("saved");
    const ws = wsRef.current;
    if (nextUpdatedAt && ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify({ type: "saved", updated_at: nextUpdatedAt })); } catch {}
    }
  };

  const beginTitleRename = () => {
    if (isReadOnly || !designId) return;
    setTitleDraft(designMeta.title || "Design");
    setTitleEditing(true);
  };

  const commitTitleRename = async () => {
    if (!titleEditing) return;
    const title = titleDraft.trim().slice(0, 120);
    if (!title || title === designMeta.title) {
      setTitleEditing(false);
      return;
    }
    try {
      const response = await fetch(`/api/designs/${designId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Titre invalide");
      setDesignMeta((current) => ({
        ...current,
        title: body.design?.title || title,
        updatedAt: body.design?.updated_at || current.updatedAt,
      }));
      setTitleEditing(false);
    } catch (error) {
      await showAppAlert("Renommage impossible", error.message || "Erreur pendant le renommage.");
    }
  };

  const exitEditor = async () => {
    if (["unsaved", "failed", "conflict"].includes(saveStatus)) {
      const choice = await openAppDialog({
        title: "Quitter l'éditeur",
        message: "Ce design contient des modifications non sauvegardees.",
        actions: [
          { label: "Annuler", value: "cancel" },
          { label: "Quitter sans sauvegarder", value: "discard" },
          { label: "Sauvegarder et quitter", value: "save", primary: true },
        ],
      });
      if (choice === "cancel" || !choice) return;
      if (choice === "save") {
        try {
          await saveDesignXml();
        } catch (err) {
          console.error(err);
          await showAppAlert("Sauvegarde impossible", err.message || "Erreur pendant la sauvegarde.");
          return;
        }
      }
    }
    try { wsRef.current?.close(); } catch {}
    window.location.href = "/dashboard";
  };

  const exportSchema = () => {
    const json = JSON.stringify(getDiagramData(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `merisia_diagram_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSchema = async () => {
    if (isReadOnly) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xml,.json";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const raw = ev.target?.result || "";
          const data = raw.trim().startsWith("<") ? parseDiagramXml(raw) : JSON.parse(raw);
          if (!data) throw new Error("Payload XML invalide");
          // RECRÉE intégralement le diagramme avec les positions précises
          hydratedRef.current = true; // ensure post-import broadcast reaches peers
          applyDiagramData(data);
        } catch (err) {
          console.error(err);
          showAppAlert("Import impossible", "Le fichier choisi n'a pas un format valide.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const buildScreenshotSvg = (options = screenshotOptions) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const graphGroup = svg.querySelector("g[data-export-root='true']");
    if (!graphGroup) return null;
    let bbox;
    try { bbox = graphGroup.getBBox(); }
    catch { showAppAlert("Export impossible", "Impossible de calculer la zone du schéma pour l'export."); return null; }

    const padding = 90;
    const exportScale = 3;
    const optionZoom = Math.min(1.8, Math.max(0.5, Number(options.zoom || 1)));
    const width = Math.ceil((bbox.width + padding * 2) * exportScale);
    const height = Math.ceil((bbox.height + padding * 2) * exportScale);

    const clonedSvg = svg.cloneNode(true);
    clonedSvg.setAttribute("width", String(width));
    clonedSvg.setAttribute("height", String(height));
    clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const backgroundColor = /^#[0-9a-f]{6}$/i.test(String(options.backgroundColor || ""))
      ? options.backgroundColor
      : THEME.paper;
    clonedSvg.style.background = backgroundColor;

    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", String(width));
    background.setAttribute("height", String(height));
    background.setAttribute("fill", backgroundColor);
    clonedSvg.insertBefore(background, clonedSvg.firstChild);

    const clonedRoot = clonedSvg.querySelector("g[data-export-root='true']");
    const effectiveScale = exportScale * optionZoom;
    const srcCenterX = bbox.x + bbox.width / 2 - Number(options.panX || 0);
    const srcCenterY = bbox.y + bbox.height / 2 - Number(options.panY || 0);
    const tx = width / 2 - effectiveScale * srcCenterX;
    const ty = height / 2 - effectiveScale * srcCenterY;
    clonedRoot?.setAttribute(
      "transform",
      `translate(${tx},${ty}) scale(${effectiveScale})`
    );
    clonedSvg.querySelectorAll("[data-selection-highlight='true']").forEach((node) => node.remove());
    clonedSvg.querySelectorAll("[data-export-stroke]").forEach((node) => {
      node.setAttribute("stroke", node.getAttribute("data-export-stroke") || node.getAttribute("stroke") || THEME.inkSoft);
      node.setAttribute("stroke-width", node.getAttribute("data-export-stroke-width") || node.getAttribute("stroke-width") || "1.5");
    });
    clonedSvg.querySelectorAll("[data-export-fill]").forEach((node) => {
      node.setAttribute("fill", node.getAttribute("data-export-fill") || node.getAttribute("fill") || THEME.ink);
    });

    if (options.showGrid) {
      const grid = document.createElementNS("http://www.w3.org/2000/svg", "g");
      grid.setAttribute("opacity", "0.22");
      for (let x = 0; x <= width; x += 60) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x); line.setAttribute("y1", 0);
        line.setAttribute("x2", x); line.setAttribute("y2", height);
        line.setAttribute("stroke", THEME.selection); line.setAttribute("stroke-width", "1");
        grid.appendChild(line);
      }
      for (let y = 0; y <= height; y += 60) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", 0); line.setAttribute("y1", y);
        line.setAttribute("x2", width); line.setAttribute("y2", y);
        line.setAttribute("stroke", THEME.selection); line.setAttribute("stroke-width", "1");
        grid.appendChild(line);
      }
      clonedSvg.insertBefore(grid, clonedRoot || background.nextSibling);
    }

    if (options.showLegend) {
      const legend = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const legendScale = Math.min(2.2, Math.max(0.55, Number(options.legendScale || 1)));
      const legendModules = Object.values(modules);
      const longestLabel = legendModules.reduce((max, mod) => Math.max(max, String(mod.label || "Module").length), 7);
      const titleSize = 28;
      const labelSize = 18;
      const rowHeight = 30;
      const swatchSize = 20;
      const baseX = 22;
      const baseY = 44;
      const localWidth = Math.max(280, baseX * 2 + swatchSize + 14 + longestLabel * (labelSize * 0.6));
      const localHeight = baseY + 16 + legendModules.length * rowHeight;
      legend.setAttribute("transform", `translate(30,24) scale(${legendScale})`);

      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("x", "0");
      bg.setAttribute("y", "0");
      bg.setAttribute("width", String(localWidth));
      bg.setAttribute("height", String(localHeight));
      bg.setAttribute("rx", "14");
      bg.setAttribute("fill", THEME.cream);
      bg.setAttribute("fill-opacity", "0.94");
      bg.setAttribute("stroke", THEME.line);
      bg.setAttribute("stroke-width", "2");
      legend.appendChild(bg);

      const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
      title.setAttribute("x", String(baseX));
      title.setAttribute("y", String(baseY - 8));
      title.setAttribute("font-family", "Fraunces, Georgia, 'Times New Roman', serif");
      title.setAttribute("font-size", String(titleSize));
      title.setAttribute("font-weight", "800");
      title.setAttribute("fill", THEME.ink);
      title.textContent = "Légende";
      legend.appendChild(title);

      legendModules.forEach((mod, index) => {
        const y = baseY + 18 + index * rowHeight;
        const swatch = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        swatch.setAttribute("x", String(baseX));
        swatch.setAttribute("y", String(y - swatchSize / 2 - 4));
        swatch.setAttribute("width", String(swatchSize));
        swatch.setAttribute("height", String(swatchSize));
        swatch.setAttribute("rx", "5");
        swatch.setAttribute("fill", mod.fill || THEME.cream);
        swatch.setAttribute("stroke", mod.stroke || THEME.inkSoft);
        swatch.setAttribute("stroke-width", "2");
        legend.appendChild(swatch);

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", String(baseX + swatchSize + 14));
        label.setAttribute("y", String(y));
        label.setAttribute("font-family", "Manrope, 'Segoe UI', Arial, sans-serif");
        label.setAttribute("font-size", String(labelSize));
        label.setAttribute("font-weight", "700");
        label.setAttribute("fill", THEME.inkSoft);
        label.textContent = mod.label || "Module";
        legend.appendChild(label);
      });
      clonedSvg.appendChild(legend);
    }

    {
      const watermarkSize = Math.max(28, Math.round(height * 0.035));
      const watermark = document.createElementNS("http://www.w3.org/2000/svg", "text");
      watermark.setAttribute("x", String(width - 24));
      watermark.setAttribute("y", String(height - 18));
      watermark.setAttribute("text-anchor", "end");
      watermark.setAttribute("font-family", "Fraunces, Georgia, 'Times New Roman', serif");
      watermark.setAttribute("font-size", String(watermarkSize));
      watermark.setAttribute("font-weight", "850");
      watermark.setAttribute("letter-spacing", "-0.04em");
      watermark.setAttribute("fill", THEME.ink);
      watermark.setAttribute("opacity", "0.18");
      watermark.textContent = "Merisia";
      clonedSvg.appendChild(watermark);
    }

    const serializer = new XMLSerializer();
    return { svgText: serializer.serializeToString(clonedSvg), width, height };
  };

  const refreshScreenshotPreview = (options = screenshotOptions) => {
    const built = buildScreenshotSvg(options);
    if (!built) return;
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
    const url = URL.createObjectURL(new Blob([built.svgText], { type: "image/svg+xml;charset=utf-8" }));
    setScreenshotPreviewUrl(url);
  };

  const openScreenshotModal = () => {
    setToolsMenuOpen(false);
    setScreenshotModal(true);
    setTimeout(() => refreshScreenshotPreview(screenshotOptions), 0);
  };

  const downloadHighQualityScreenshot = async () => {
    const built = buildScreenshotSvg(screenshotOptions);
    if (!built) return;
    const { svgText, width, height } = built;
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
    img.onerror = () => { URL.revokeObjectURL(url); showAppAlert("Export impossible", "Erreur pendant la génération du screenshot."); };
    img.src = url;
  };

  useEffect(() => () => {
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
  }, [screenshotPreviewUrl]);

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
                data-export-stroke={THEME.inkMuted}
                data-export-stroke-width="1.5"
                strokeDasharray="5,4"
              />
              <g
                cursor="move"
                onMouseDown={(ev) => onBlockDown(ev, attr.id, defaultPos)}
                onContextMenu={(ev) => onBlockContextMenu(ev, attr.id)}
              >
                <text
                  x={attrPos.x} y={attrPos.y}
                  fontSize={11} fontFamily={FONT_STACK}
                  fill={isAttrSelected ? THEME.selection : THEME.ink}
                  data-export-fill={THEME.ink}
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
              strokeWidth={isSelected ? 3 : 1.7}
              data-export-stroke={THEME.inkMuted}
              data-export-stroke-width="1.7" />
        <path d={`M ${assocPos.x} ${assocPos.y} Q ${arcBottomCtrlX} ${arcBottomCtrlY}, ${bottomX} ${bottomY}`}
              fill="none" stroke={isSelected ? THEME.selection : THEME.inkMuted}
              strokeWidth={isSelected ? 3 : 1.7}
              data-export-stroke={THEME.inkMuted}
              data-export-stroke-width="1.7" />
        {(isSelected || selected.has(ent.id)) && (
          <ellipse cx={assocPos.x} cy={assocPos.y} rx={AX + 6} ry={AY + 6}
                   fill="none" stroke={THEME.selection} strokeWidth={3}
                   data-selection-highlight="true" />
        )}
        <g
          cursor="move"
          onMouseDown={(ev) => onBlockDown(ev, assoc.id, { x: assoc.x, y: assoc.y })}
          onContextMenu={(ev) => onBlockContextMenu(ev, assoc.id)}
        >
          <ellipse cx={assocPos.x} cy={assocPos.y} rx={AX} ry={AY}
                   fill={THEME.cream} stroke={isSelected ? THEME.selection : THEME.inkSoft}
                   strokeWidth={isSelected ? 2.5 : 1.5} filter="url(#shadow)"
                   data-export-stroke={THEME.inkSoft}
                   data-export-stroke-width="1.5"
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
  const compactInspector = viewportWidth < 760;
  const inspectorCollapsed = showInspector && compactInspector && !inspectorExpanded;
  const containerCursor = connectMode ? "crosshair" : drag ? "grabbing" : "grab";
  const saveStatusLabel = {
    idle: "Non sauvegardé",
    unsaved: "Modifié",
    saving: "Sauvegarde...",
    saved: "Sauvegardé",
    failed: "Échec",
    conflict: "Conflit",
  }[saveStatus] || "Non sauvegardé";

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

  if (accessError) {
    return (
      <div style={{
        width: "100vw", height: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: THEME.paper, fontFamily: FONT_STACK, color: THEME.ink,
      }}>
        <div style={{ ...panelStyle, padding: "28px 32px", maxWidth: 440, textAlign: "center" }}>
          <h2 style={{ margin: "0 0 8px", fontFamily: "Fraunces, Georgia, serif", letterSpacing: -0.6 }}>
            Accès refusé
          </h2>
          <p style={{ margin: "0 0 18px", color: THEME.inkSoft, fontSize: 14 }}>
            {accessError.message}
          </p>
          <a
            href="/dashboard"
            style={{
              display: "inline-block", padding: "8px 16px",
              background: THEME.ink, color: "#fff", borderRadius: 8,
              textDecoration: "none", fontWeight: 700, fontSize: 13,
            }}
          >Retour au dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100vw", height: "100vh", overflow: "hidden",
        position: "fixed", inset: 0,
        background: THEME.paper,
        cursor: containerCursor,
        fontFamily: FONT_STACK,
        color: THEME.ink,
        userSelect: "none",
      }}
      onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      onContextMenu={(e) => {
        if (e.target?.closest?.("[data-hud='true']")) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onCanvasContextMenu(e);
      }}
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

      {/* Zoom scale grid — visible helper for canvas scale */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage:
          "linear-gradient(rgba(61,92,90,0.13) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(61,92,90,0.13) 1px, transparent 1px)," +
          "linear-gradient(rgba(61,92,90,0.055) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(61,92,90,0.055) 1px, transparent 1px)",
        backgroundSize: `${80 * tr.s}px ${80 * tr.s}px, ${80 * tr.s}px ${80 * tr.s}px, ${20 * tr.s}px ${20 * tr.s}px, ${20 * tr.s}px ${20 * tr.s}px`,
        backgroundPosition: `${tr.x}px ${tr.y}px`,
        zIndex: 0,
      }} />

      {selectionBox && (
        <div
          style={{
            position: "fixed",
            left: Math.min(selectionBox.startX, selectionBox.endX),
            top: Math.min(selectionBox.startY, selectionBox.endY),
            width: Math.abs(selectionBox.endX - selectionBox.startX),
            height: Math.abs(selectionBox.endY - selectionBox.startY),
            border: `1.5px solid ${THEME.selection}`,
            background: "rgba(61,92,90,0.12)",
            pointerEvents: "none",
            zIndex: 25,
          }}
        />
      )}

      {contextMenu && (
        <div
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            minWidth: 178,
            ...panelStyle,
            padding: 6,
            zIndex: 40,
            fontFamily: FONT_STACK,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!isReadOnly && (
            <>
              <button
                style={{ ...btnPrimary, width: "100%", justifyContent: "flex-start", boxShadow: "none", marginBottom: 4 }}
                onClick={() => {
                  addEntity(contextMenu.world);
                  setContextMenu(null);
                }}
              >+ Entité ici</button>
              <button
                style={{ ...btnGhost, width: "100%", justifyContent: "flex-start", boxShadow: "none", marginBottom: 4 }}
                onClick={() => {
                  addNote(contextMenu.world);
                  setContextMenu(null);
                }}
              ><FileText size={14} strokeWidth={2.2} /> Note ici</button>
              <button
                style={{ ...(connectMode ? btnAccent : btnGhost), width: "100%", justifyContent: "flex-start", boxShadow: "none", marginBottom: 4 }}
                onClick={() => {
                  if (connectMode) {
                    setConnectMode(null);
                  } else {
                    const firstId = contextMenu.selected?.[0];
                    if (firstId && (entMap[firstId] || assocMap[firstId])) {
                      setConnectMode({ firstId, targetAssocId: null });
                    } else {
                      startConnectMode();
                    }
                  }
                  setContextMenu(null);
                }}
              ><LinkIcon size={14} strokeWidth={2.2} /> {connectMode ? "Annuler connexion" : "Connecter"}</button>
              <button
                style={{ ...btnGhost, width: "100%", justifyContent: "flex-start", boxShadow: "none", marginBottom: 4 }}
                onClick={() => {
                  setShowModuleEditor(true);
                  setContextMenu(null);
                }}
              ><Palette size={14} strokeWidth={2.2} /> Modules</button>
              <div style={{ height: 1, background: THEME.lineSoft, margin: "6px 4px" }} />
            </>
          )}
          <button
            style={{ ...btnGhost, width: "100%", justifyContent: "flex-start", boxShadow: "none", marginBottom: 4 }}
            onClick={() => {
              setSelected(new Set(getSelectableBlocks().map((block) => block.id)));
              setContextMenu(null);
            }}
          >Tout sélectionner</button>
          <button
            style={{ ...btnGhost, width: "100%", justifyContent: "flex-start", boxShadow: "none", marginBottom: 4 }}
            onClick={() => {
              fitDiagramToView();
              setContextMenu(null);
            }}
          >Recentrer</button>
          {!isReadOnly && <button
            style={{ ...btnGhost, width: "100%", justifyContent: "flex-start", boxShadow: "none", color: THEME.danger }}
            disabled={!selected.size}
            onClick={() => {
              deleteSelectedBlocks();
              setContextMenu(null);
            }}
          >Supprimer la sélection</button>}
        </div>
      )}

      {/* ============================================================ */}
      {/* TOP-LEFT BRAND + LEGEND                                      */}
      {/* ============================================================ */}
      <div
        data-hud="true"
        style={{
          position: "absolute", top: 14, left: 14,
          ...panelStyle,
          padding: "12px 16px",
          paddingRight: 24,
          fontSize: 12,
          zIndex: 10,
          width: "min(720px, calc(100vw - 520px))",
          minWidth: 340,
          maxWidth: "calc(100vw - 32px)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, flex: "1 1 auto" }}>
            <div style={{ minWidth: 0, flex: "1 1 320px" }}>
              {titleEditing ? (
                <input
                  value={titleDraft}
                  autoFocus
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitTitleRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitTitleRename();
                    if (e.key === "Escape") setTitleEditing(false);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    width: "100%",
                    minWidth: 260,
                    fontFamily: FONT_STACK,
                    fontWeight: 700,
                    fontSize: 18,
                    color: THEME.ink,
                    lineHeight: 1,
                    border: `1px solid ${THEME.line}`,
                    borderRadius: 6,
                    background: THEME.cream,
                    padding: "3px 7px",
                  }}
                />
              ) : (
                <div
                  title={isReadOnly ? (designMeta.title || "Merisia") : "Double-cliquez pour renommer"}
                  onDoubleClick={beginTitleRename}
                  style={{
                    fontFamily: FONT_STACK, fontWeight: 700, fontSize: 18,
                    color: THEME.ink, lineHeight: 1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    cursor: isReadOnly ? "default" : "text",
                  }}
                >{designMeta.title || "Merisia"}</div>
              )}
              <div style={{
                fontSize: 10,
                color: saveStatus === "failed" || saveStatus === "conflict" ? THEME.danger : THEME.inkMuted,
                fontWeight: 700,
                marginTop: 4,
              }}>{saveStatusLabel}</div>
            </div>
            {designId && (selfPeer || peers.size > 0) && (
              <div
                title={Array.from(peers.values()).map((p) => p.name).concat(selfPeer ? [`${selfPeer.name} (vous)`] : []).join(" · ")}
                style={{
                  display: "flex", alignItems: "center", gap: 4, marginLeft: 6,
                  paddingLeft: 8, borderLeft: `1px solid ${THEME.line}`,
                }}
              >
                {selfPeer && (
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: selfPeer.color, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: FONT_STACK, fontWeight: 800, fontSize: 11,
                    boxShadow: "0 0 0 1.5px #fffaf0",
                  }}>{selfPeer.name.charAt(0)}</div>
                )}
                {Array.from(peers.values()).slice(0, 4).map((peer) => (
                  <div key={peer.connectionId} style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: peer.color, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: FONT_STACK, fontWeight: 800, fontSize: 11,
                    boxShadow: "0 0 0 1.5px #fffaf0",
                  }}>{peer.name.charAt(0)}</div>
                ))}
                {peers.size > 4 && (
                  <span style={{ fontFamily: FONT_STACK, fontSize: 11, fontWeight: 700, color: THEME.inkSoft }}>
                    +{peers.size - 4}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flex: "1 1 260px", justifyContent: "flex-end", flexWrap: "wrap" }}>
            {isGuest ? (
              <a
                href={`/auth?next=${encodeURIComponent(window.location.pathname)}`}
                style={{
                  padding: "6px 14px", border: `1px solid ${THEME.line}`,
                  background: THEME.ink, color: "#fff", borderRadius: 6,
                  fontSize: 11, fontFamily: FONT_STACK,
                  textDecoration: "none", fontWeight: 700,
                }}
              >Se connecter pour modifier</a>
            ) : (
              <>
                <button
                  onClick={async (e) => { e.stopPropagation(); try { await saveDesignXml(); } catch (err) { console.error(err); await showAppAlert("Sauvegarde impossible", err.message || "Erreur pendant la sauvegarde."); } }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="Sauvegarder le design"
                  disabled={saveStatus === "saving"}
                  style={{
                    padding: "4px 10px", border: `1px solid ${THEME.line}`,
                    background: "#2d8f74", borderRadius: 6,
                    fontSize: 11, cursor: saveStatus === "saving" ? "wait" : "pointer", color: THEME.cream,
                    ...editorActionButton,
                    opacity: saveStatus === "saving" ? 0.65 : 1,
                  }}
                ><Save size={15} strokeWidth={2.4} aria-hidden="true" /> Sauver</button>
                {designId && accessRole === "owner" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openShareModal(); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Partager ce design"
                    style={{
                      padding: "4px 10px", border: `1px solid ${THEME.line}`,
                      background: "#2f6fbd", borderRadius: 6,
                      fontSize: 11, cursor: "pointer", color: THEME.cream,
                      ...editorActionButton,
                    }}
                  ><Share2 size={15} strokeWidth={2.4} aria-hidden="true" /> Partager</button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); exitEditor(); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="Retour aux designs"
                  style={{
                    padding: "4px 10px", border: `1px solid ${THEME.danger}`,
                    background: THEME.danger, borderRadius: 6,
                    fontSize: 11, cursor: "pointer", color: THEME.cream,
                    ...editorActionButton,
                  }}
                ><LogOut size={15} strokeWidth={2.4} aria-hidden="true" /> Sortir</button>
              </>
            )}
          </div>
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
      {/* PRIMARY TOOLBAR (bottom center)                              */}
      {/* ============================================================ */}
      {isReadOnly && (
        <div data-hud="true" style={{
          position: "absolute", top: 14, right: 14,
          display: "flex", gap: 6, zIndex: 10,
        }}>
          <button
            title={isGuest ? "Connectez-vous pour modifier" : "Demander à l'éditeur d'accorder les droits d'édition"}
            style={btnPrimary}
            onClick={(e) => { e.stopPropagation(); requestEditAccess(); }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {isGuest ? <><Lock size={14} strokeWidth={2.2} /> Se connecter pour modifier</> : <><Hand size={14} strokeWidth={2.2} /> Demander l'accès édition</>}
          </button>
        </div>
      )}
      {!isReadOnly && (
        <div data-hud="true" style={{
          position: "absolute", top: 14, right: 14,
          zIndex: 20,
        }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            title="Outils du diagramme"
            style={btnGhost}
            onClick={(e) => { e.stopPropagation(); setToolsMenuOpen((open) => !open); }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Settings size={14} strokeWidth={2.2} /> Outils
          </button>
          {toolsMenuOpen && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              ...panelStyle,
              padding: 6,
              minWidth: 190,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}>
              <button
                title="Exporter le diagramme complet en JSON"
                style={{ ...btnGhost, width: "100%", justifyContent: "flex-start", boxShadow: "none" }}
                onClick={(e) => { e.stopPropagation(); setToolsMenuOpen(false); exportSchema(); }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Upload size={14} strokeWidth={2.2} /> Export
              </button>
              <button
                title="Importer un diagramme — recrée intégralement entités, assocs, modules, positions précises"
                style={{ ...btnGhost, width: "100%", justifyContent: "flex-start", boxShadow: "none" }}
                onClick={(e) => { e.stopPropagation(); setToolsMenuOpen(false); importSchema(); }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Download size={14} strokeWidth={2.2} /> Import
              </button>
              <button
                title="Exporter une image PNG haute qualité du schéma complet"
                style={{ ...btnGhost, width: "100%", justifyContent: "flex-start", boxShadow: "none" }}
                onClick={(e) => { e.stopPropagation(); setToolsMenuOpen(false); openScreenshotModal(); }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Camera size={14} strokeWidth={2.2} /> Screenshot
              </button>
              <button
                title="Réinitialiser à l'état d'origine (efface toutes les modifications)"
                style={{ ...btnGhost, width: "100%", justifyContent: "flex-start", boxShadow: "none", color: THEME.danger }}
                onClick={(e) => { e.stopPropagation(); setToolsMenuOpen(false); clearPositions(); }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <RotateCcw size={14} strokeWidth={2.2} /> Reset
              </button>
            </div>
          )}
        </div>
      )}
      {!isReadOnly && (
      <div data-hud="true" style={{
        position: "absolute",
        left: "50%",
        bottom: 22,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "stretch",
        gap: 8,
        zIndex: 18,
        flexWrap: "wrap",
        justifyContent: "center",
        maxWidth: showInspector ? "calc(100vw - 430px)" : "min(900px, calc(100vw - 36px))",
      }}>
        <div style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "center",
        ...panelStyle,
        padding: 8,
      }}>
        <button
          title="Créer une nouvelle entité au centre de la vue"
          style={btnPrimary}
          onClick={(e) => { e.stopPropagation(); addEntity(); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Plus size={14} strokeWidth={2.4} /> Entité
        </button>

        <button
          title="Ajouter une note collaborative (cachée des screenshots)"
          style={btnGhost}
          onClick={(e) => { e.stopPropagation(); addNote(); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <FileText size={14} strokeWidth={2.2} /> Note
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
          <LinkIcon size={14} strokeWidth={2.2} /> {connectMode ? "Annuler" : "Connecter"}
        </button>

        <button
          title="Éditer les modules et leurs couleurs"
          style={btnGhost}
          onClick={(e) => { e.stopPropagation(); setShowModuleEditor(true); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Palette size={14} strokeWidth={2.2} /> Modules
        </button>

      </div>
        <button
          title="Annuler (Ctrl+Z) — vos modifications seulement"
          aria-disabled={undoDepth === 0}
          onClick={(e) => { e.stopPropagation(); if (undoDepth > 0) performUndo(); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            ...btnGhost,
            alignSelf: "center",
            minHeight: 40,
            padding: "7px 14px",
            border: `1px solid ${THEME.danger}`,
            color: THEME.danger,
            background: THEME.cream,
            boxShadow: THEME.shadowSoft,
            opacity: 1,
            cursor: undoDepth === 0 ? "default" : "pointer",
          }}
        >
          <Undo2 size={14} strokeWidth={2.2} /> Annuler
        </button>
        <button
          title="Rétablir (redo)"
          aria-disabled={redoDepth === 0}
          onClick={(e) => { e.stopPropagation(); if (redoDepth > 0) performRedo(); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            ...btnPrimary,
            alignSelf: "center",
            width: 40,
            minHeight: 40,
            padding: 0,
            justifyContent: "center",
            borderRadius: 8,
            background: THEME.ink,
            border: `1px solid ${THEME.ink}`,
            opacity: redoDepth === 0 ? 0.55 : 1,
            cursor: redoDepth === 0 ? "default" : "pointer",
          }}
        >
          <Redo2 size={17} strokeWidth={2.4} />
        </button>
      </div>
      )}

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
          <LinkIcon size={15} strokeWidth={2.2} /> {connectBannerText()}
          <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 11 }}>· Échap</span>
        </div>
      )}

      {/* BOTTOM-RIGHT ZOOM */}
      <div data-hud="true" style={{ position: "absolute", bottom: 22, right: 22, display: "flex", flexDirection: "column", gap: 7, zIndex: 10 }}>
        {[["＋", 1.2, "Zoom avant"], ["－", 0.83, "Zoom arrière"], ["⊙", null, "Recentrer le diagramme"]].map(([label, factor, title]) => (
          <button
            key={label}
            title={title}
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
              else fitDiagramToView();
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >{label}</button>
        ))}
        <button
          title={snapEnabled ? "Désactiver l'alignement" : "Activer l'alignement"}
          style={{
            width: 38, height: 38, borderRadius: 9,
            border: `1px solid ${snapEnabled ? THEME.selection : THEME.line}`,
            background: snapEnabled ? THEME.selection : THEME.cream,
            fontSize: 14, fontFamily: FONT_STACK,
            cursor: "pointer", boxShadow: THEME.shadowSoft,
            color: snapEnabled ? THEME.cream : THEME.ink, fontWeight: 700,
          }}
          onClick={(e) => { e.stopPropagation(); setSnapEnabled((value) => !value); }}
          onMouseDown={(e) => e.stopPropagation()}
        >⌗</button>
      </div>

      {/* INSPECTOR PANEL */}
      {inspectorCollapsed && (
        <button
          data-hud="true"
          style={{
            position: "absolute", top: 118, right: 14,
            zIndex: 12,
            ...btnPrimary,
          }}
          onClick={(e) => { e.stopPropagation(); setInspectorExpanded(true); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          Détails
        </button>
      )}
      {showInspector && !inspectorCollapsed && (
        <div
          data-hud="true"
          style={{
            position: "absolute", top: 118, right: 14,
            width: compactInspector ? "min(360px, calc(100vw - 28px))" : 380,
            maxHeight: "calc(100vh - 138px)",
            ...panelStyle,
            zIndex: 12,
            display: "flex", flexDirection: "column",
            fontFamily: FONT_STACK,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onWheel={(e) => e.stopPropagation()}
        >
          {compactInspector && (
            <button
              title="Réduire"
              onClick={(e) => { e.stopPropagation(); setInspectorExpanded(false); }}
              style={{
                position: "absolute", top: 8, right: 8, zIndex: 2,
                border: 0, background: "transparent", color: THEME.inkSoft,
                cursor: "pointer", fontSize: 18,
              }}
            >×</button>
          )}
          {selectedEntity && (
            <EntityInspector
              entity={selectedEntity}
              modules={modules}
              updateEntity={updateEntity}
              deleteEntity={deleteEntity}
              addAttr={addEntityAttr}
              updateAttr={updateEntityAttr}
              deleteAttr={deleteEntityAttr}
              confirmAction={showAppConfirm}
              isReadOnly={isReadOnly}
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
              confirmAction={showAppConfirm}
              isReadOnly={isReadOnly}
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

      {appDialog && (
        <div
          data-hud="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(42, 38, 32, 0.45)",
            backdropFilter: "blur(5px)",
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
            fontFamily: FONT_STACK,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onWheel={(e) => e.stopPropagation()}
        >
          <div style={{ ...panelStyle, width: "min(430px, 94vw)", padding: 22 }}>
            <Kicker>{appDialog.kicker || "Merisia"}</Kicker>
            <div style={{ fontSize: 25, fontWeight: 800, color: THEME.ink, marginBottom: 10 }}>
              {appDialog.title}
            </div>
            {appDialog.message && (
              <div style={{ fontSize: 14, lineHeight: 1.5, color: THEME.inkSoft, whiteSpace: "pre-line", marginBottom: 18 }}>
                {appDialog.message}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              {(appDialog.actions || [{ label: "OK", value: true, primary: true }]).map((action) => (
                <button
                  key={action.label}
                  style={action.primary ? btnPrimary : btnGhost}
                  onClick={() => closeAppDialog(action.value)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {shareModal && (
        <div
          data-hud="true"
          style={{
            position: "fixed", inset: 0,
            background: "rgba(42, 38, 32, 0.45)",
            backdropFilter: "blur(4px)",
            zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: FONT_STACK,
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShareModal(false); }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{
              ...panelStyle, padding: 22, width: 480, maxWidth: "92vw",
              display: "flex", flexDirection: "column", gap: 14,
              fontFamily: FONT_STACK,
            }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontFamily: "Fraunces, Georgia, serif", letterSpacing: -0.5 }}>
                Partager ce design
              </h3>
              <button
                onClick={() => setShareModal(false)}
                style={{ border: 0, background: "transparent", fontSize: 18, cursor: "pointer", color: THEME.inkSoft }}
              >×</button>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: THEME.inkSoft }}>Rôle</label>
              <select
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value)}
                style={{
                  padding: "6px 8px", border: `1px solid ${THEME.line}`,
                  background: THEME.cream, borderRadius: 6, fontFamily: FONT_STACK,
                }}
              >
                <option value="editor">Éditeur (peut modifier)</option>
                <option value="viewer">Lecteur (lecture seule)</option>
              </select>
              <button
                onClick={createShareLink}
                disabled={shareBusy}
                style={{
                  marginLeft: "auto", padding: "6px 14px",
                  border: `1px solid ${THEME.line}`, background: THEME.ink, color: "#fff",
                  borderRadius: 6, fontWeight: 700, cursor: shareBusy ? "wait" : "pointer",
                }}
              >Créer un lien</button>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: THEME.inkSoft, marginBottom: 6 }}>
                Liens actifs
              </div>
              {shareData.links.length === 0 ? (
                <div style={{ fontSize: 12, color: THEME.inkMuted }}>Aucun lien créé.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {shareData.links.map((link) => (
                    <div key={link.token} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 8px", border: `1px solid ${THEME.line}`,
                      borderRadius: 6, background: THEME.cream,
                    }}>
                      <input
                        readOnly
                        value={shareUrlFor(link.token)}
                        onFocus={(e) => e.target.select()}
                        style={{
                          flex: 1, border: 0, background: "transparent",
                          fontFamily: "ui-monospace, monospace", fontSize: 11, color: THEME.ink,
                        }}
                      />
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 6px",
                        background: link.role === "editor" ? "#2d8f74" : "#8b5cf6",
                        color: "#fff", borderRadius: 4,
                      }}>{link.role}</span>
                      <button
                        onClick={() => copyShareUrl(link.token)}
                        style={{
                          padding: "3px 8px", border: `1px solid ${THEME.line}`,
                          background: "#fff", borderRadius: 4, fontSize: 11, cursor: "pointer", fontWeight: 700,
                        }}
                      >Copier</button>
                      <button
                        onClick={() => revokeShareLink(link.token)}
                        disabled={shareBusy}
                        style={{
                          padding: "3px 8px", border: `1px solid ${THEME.danger}`,
                          background: "#fff", color: THEME.danger, borderRadius: 4,
                          fontSize: 11, cursor: "pointer", fontWeight: 700,
                        }}
                      >Révoquer</button>
                    </div>
                  ))}
                </div>
              )}
              {shareCopied && (
                <div style={{ marginTop: 4, fontSize: 11, color: "#2d8f74", fontWeight: 700 }}>
                  Lien copié ✓
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: THEME.inkSoft, marginBottom: 6 }}>
                Collaborateurs
              </div>
              {shareData.collaborators.length === 0 ? (
                <div style={{ fontSize: 12, color: THEME.inkMuted }}>Personne n'a encore ouvert ce design.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {shareData.collaborators.map((collab) => (
                    <div key={collab.email} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "4px 8px", borderRadius: 6, background: THEME.cream,
                    }}>
                      <span style={{ flex: 1, fontSize: 12, color: THEME.ink }}>{collab.email}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 6px",
                        background: collab.role === "editor" ? "#2d8f74" : "#8b5cf6",
                        color: "#fff", borderRadius: 4,
                      }}>{collab.role}</span>
                      <button
                        onClick={() => removeCollaborator(collab.email)}
                        disabled={shareBusy}
                        style={{
                          padding: "2px 6px", border: 0, background: "transparent",
                          color: THEME.danger, cursor: "pointer", fontSize: 11, fontWeight: 700,
                        }}
                      >Retirer</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {screenshotModal && (
        <div
          data-hud="true"
          style={{
            position: "fixed", inset: 0,
            background: "rgba(42, 38, 32, 0.45)",
            backdropFilter: "blur(4px)",
            zIndex: 80,
            display: "grid",
            gridTemplateColumns: "minmax(320px, 1fr) 280px",
            gap: 18,
            padding: 24,
            fontFamily: FONT_STACK,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onWheel={(e) => e.stopPropagation()}
        >
          <div style={{ ...panelStyle, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
            {screenshotPreviewUrl ? (
              <img
                src={screenshotPreviewUrl}
                alt="Aperçu du screenshot"
                style={{ maxWidth: "100%", maxHeight: "calc(100vh - 76px)", objectFit: "contain", borderRadius: 8 }}
              />
            ) : (
              <div style={{ color: THEME.inkMuted }}>Préparation de l'aperçu...</div>
            )}
          </div>
          <div style={{ ...panelStyle, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <Kicker>Export</Kicker>
                <div style={{ fontSize: 22, fontWeight: 700, color: THEME.ink }}>Screenshot</div>
              </div>
              <button
                onClick={() => setScreenshotModal(false)}
                style={{ border: "none", background: "transparent", fontSize: 26, cursor: "pointer", color: THEME.inkSoft }}
              >×</button>
            </div>

            <label style={{ display: "grid", gap: 6, fontSize: 13, color: THEME.inkSoft, fontWeight: 700 }}>
              Zoom export
              <input
                type="range" min="0.5" max="1.8" step="0.05" value={screenshotOptions.zoom}
                onChange={(e) => {
                  const next = { ...screenshotOptions, zoom: Number(e.target.value) };
                  setScreenshotOptions(next); refreshScreenshotPreview(next);
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13, color: THEME.inkSoft, fontWeight: 700 }}>
              Taille légende
              <input
                type="range" min="0.55" max="2.2" step="0.05" value={screenshotOptions.legendScale}
                disabled={!screenshotOptions.showLegend}
                onChange={(e) => {
                  const next = { ...screenshotOptions, legendScale: Number(e.target.value) };
                  setScreenshotOptions(next); refreshScreenshotPreview(next);
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13, color: THEME.inkSoft, fontWeight: 700 }}>
              Déplacement horizontal
              <input
                type="range" min="-160" max="160" value={screenshotOptions.panX}
                onChange={(e) => {
                  const next = { ...screenshotOptions, panX: Number(e.target.value) };
                  setScreenshotOptions(next); refreshScreenshotPreview(next);
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 13, color: THEME.inkSoft, fontWeight: 700 }}>
              Déplacement vertical
              <input
                type="range" min="-160" max="160" value={screenshotOptions.panY}
                onChange={(e) => {
                  const next = { ...screenshotOptions, panY: Number(e.target.value) };
                  setScreenshotOptions(next); refreshScreenshotPreview(next);
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13, color: THEME.inkSoft, fontWeight: 700 }}>
              Couleur du fond
              <input
                type="color"
                value={screenshotOptions.backgroundColor || THEME.paper}
                onChange={(e) => {
                  const next = { ...screenshotOptions, backgroundColor: e.target.value };
                  setScreenshotOptions(next); refreshScreenshotPreview(next);
                }}
                style={{ width: "100%", height: 34, border: `1px solid ${THEME.line}`, borderRadius: 7, background: THEME.cream }}
              />
            </label>

            {[
              ["showGrid", "Afficher la grille"],
              ["showLegend", "Afficher la légende"],
            ].map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: THEME.ink }}>
                <input
                  type="checkbox"
                  checked={screenshotOptions[key]}
                  onChange={(e) => {
                    const next = { ...screenshotOptions, [key]: e.target.checked };
                    setScreenshotOptions(next); refreshScreenshotPreview(next);
                  }}
                />
                {label}
              </label>
            ))}

            <button
              style={{ ...btnPrimary, justifyContent: "center", marginTop: "auto" }}
              onClick={downloadHighQualityScreenshot}
            >Télécharger PNG</button>
            <button
              style={{ ...btnGhost, justifyContent: "center" }}
              onClick={() => {
                const next = { panX: 0, panY: 0, zoom: 1, legendScale: 1, showGrid: false, showLegend: false, backgroundColor: THEME.paper };
                setScreenshotOptions(next); refreshScreenshotPreview(next);
              }}
            >Réinitialiser l'aperçu</button>
          </div>
        </div>
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
                  data-export-stroke="#9C8F70"
                  data-export-stroke-width="1.4"
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
                 onMouseDown={(ev) => onBlockDown(ev, assoc.id, { x: assoc.x, y: assoc.y })}
                 onContextMenu={(ev) => onBlockContextMenu(ev, assoc.id)}>
                {(isSelected || isConnectedToSelected || isConnectFirst) && (
                  <ellipse cx={pos.x} cy={pos.y} rx={AX + 6} ry={AY + 6}
                           fill="none"
                           stroke={isConnectFirst ? THEME.accent : isSelected ? THEME.selection : THEME.brandDark}
                           strokeWidth={3}
                           data-selection-highlight="true"
                           strokeDasharray={isConnectFirst ? "6,3" : undefined} />
                )}
                <ellipse cx={pos.x} cy={pos.y} rx={AX} ry={AY}
                         fill={THEME.cream}
                         stroke={isConnectedToSelected ? THEME.brandDark : THEME.inkSoft}
                         strokeWidth={isSelected ? 2.5 : isConnectedToSelected ? 2 : 1.5}
                         data-export-stroke={isConnectedToSelected ? THEME.brandDark : THEME.inkSoft}
                         data-export-stroke-width={isConnectedToSelected ? 2 : 1.5}
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
                 onMouseDown={(ev) => onBlockDown(ev, ent.id, { x: ent.x, y: ent.y })}
                 onContextMenu={(ev) => onBlockContextMenu(ev, ent.id)}>
                {(isSelected || isConnectFirst) && (
                  <rect x={pos.x - EW / 2 - 6} y={pos.y - h / 2 - 6}
                        width={EW + 12} height={h + 12} rx={6}
                        fill="none"
                        stroke={isConnectFirst ? THEME.accent : THEME.selection}
                        strokeWidth={3}
                        data-selection-highlight="true"
                        strokeDasharray={isConnectFirst ? "6,3" : undefined} />
                )}
                <rect x={pos.x - EW / 2} y={pos.y - h / 2}
                      width={EW} height={h} rx={6}
                      fill={moduleFill} stroke={moduleStroke}
                      strokeWidth={isSelected ? 3 : 2.5}
                      data-export-stroke={moduleStroke}
                      data-export-stroke-width="2.5"
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

      {/* Sticky notes — fixed pixel size, anchored to world coords (HTML overlay naturally absent from SVG export) */}
      {notes.map((note) => {
        const left = note.x * tr.s + tr.x - note.w / 2;
        const top = note.y * tr.s + tr.y - note.h / 2;
        const dragging = noteDrag?.id === note.id;
        return (
          <div
            key={note.id}
            data-hud="true"
            style={{
              position: "absolute",
              left, top,
              width: note.w, minHeight: note.h,
              background: "#fff5b6",
              borderTop: `6px solid ${note.authorColor || "#f4c542"}`,
              borderRadius: 4,
              boxShadow: "0 6px 18px rgba(58,47,28,.18)",
              fontFamily: FONT_STACK,
              zIndex: 8,
              display: "flex", flexDirection: "column",
              cursor: dragging ? "grabbing" : "default",
              transition: dragging ? "none" : "box-shadow .15s",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "4px 8px", display: "flex", justifyContent: "space-between", alignItems: "center",
                fontSize: 10, fontWeight: 700, color: "#7c5e10", cursor: isReadOnly ? "default" : "grab",
                userSelect: "none",
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                if (!isReadOnly) setNoteDrag({ id: note.id, startX: e.clientX, startY: e.clientY, originX: note.x, originY: note.y });
              }}
            >
              <span>{note.authorName || "—"}</span>
              {!isReadOnly && <button
                onClick={() => deleteNote(note.id)}
                title="Supprimer la note"
                style={{ border: 0, background: "transparent", cursor: "pointer", color: "#7c5e10", fontSize: 12, padding: 0 }}
              >×</button>
              }
            </div>
            <textarea
              value={note.text}
              readOnly={isReadOnly}
              onChange={(e) => updateNote(note.id, { text: e.target.value })}
              placeholder="Tape ta note…"
              style={{
                flex: 1, border: 0, background: "transparent",
                resize: "none", outline: "none",
                padding: "6px 10px 10px",
                fontFamily: FONT_STACK, fontSize: 13,
                color: "#3a2f1c",
                minHeight: 60,
              }}
            />
          </div>
        );
      })}

      {/* Presence toasts */}
      {realtimeDesignId && presenceToasts.length > 0 && (
        <div style={{
          position: "absolute", bottom: 18, right: 18,
          display: "flex", flexDirection: "column", gap: 6,
          zIndex: 40, pointerEvents: "none",
        }}>
          {presenceToasts.map((toast) => (
            <div key={toast.id} style={{
              padding: "6px 12px", borderRadius: 18,
              background: "#fffaf0", border: `1px solid ${THEME.line}`,
              boxShadow: "0 8px 20px rgba(58,47,28,.18)",
              fontFamily: FONT_STACK, fontSize: 12, fontWeight: 700,
              color: THEME.ink, display: "flex", alignItems: "center", gap: 8,
              pointerEvents: toast.action ? "auto" : "none",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: toast.color || THEME.inkSoft }} />
              {toast.text}
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action.run();
                    setPresenceToasts((c) => c.filter((t) => t.id !== toast.id));
                  }}
                  style={{
                    marginLeft: 6, padding: "3px 10px", border: 0,
                    background: THEME.ink, color: "#fff", borderRadius: 12,
                    fontWeight: 700, fontSize: 11, cursor: "pointer",
                  }}
                >{toast.action.label}</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Remote cursors and selection rings */}
      {realtimeDesignId && Array.from(peers.values()).map((peer) => {
        const cursor = peer.presence?.cursor;
        if (!cursor) return null;
        const left = cursor.x * tr.s + tr.x;
        const top = cursor.y * tr.s + tr.y;
        return (
          <div
            key={`cursor-${peer.connectionId}`}
            style={{
              position: "absolute", left: 0, top: 0,
              pointerEvents: "none", zIndex: 28,
              transform: `translate(${left - 2}px, ${top - 2}px)`,
              transition: "transform 90ms linear",
              willChange: "transform",
            }}
          >
            <svg width="20" height="22" viewBox="0 0 20 22">
              <path d="M2 2 L2 18 L7 14 L10 20 L13 18 L10 13 L16 13 Z"
                fill={peer.color} stroke="#fff" strokeWidth="1.4" />
            </svg>
            <div style={{
              marginTop: 2, padding: "2px 6px",
              background: peer.color, color: "#fff",
              fontFamily: FONT_STACK, fontSize: 11, fontWeight: 800,
              borderRadius: 6, whiteSpace: "nowrap",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            }}>
              {peer.name}{peer.presence?.editing ? ` · ${peer.presence.editing}` : ""}
            </div>
          </div>
        );
      })}

      {/* Remote selection halos */}
      {designId && (() => {
        const halos = [];
        for (const peer of peers.values()) {
          const selection = peer.presence?.selection || [];
          for (const id of selection) {
            const ent = entities.find((e) => e.id === id);
            const assoc = assocs.find((a) => a.id === id);
            let cx, cy, w, h;
            if (ent) { cx = ent.x; cy = ent.y; w = 200; h = 120; }
            else if (assoc) { cx = assoc.x; cy = assoc.y; w = 150; h = 70; }
            else continue;
            halos.push(
              <div
                key={`halo-${peer.connectionId}-${id}`}
                style={{
                  position: "absolute",
                  left: (cx - w / 2) * tr.s + tr.x - 6,
                  top: (cy - h / 2) * tr.s + tr.y - 6,
                  width: w * tr.s + 12,
                  height: h * tr.s + 12,
                  border: `2px dashed ${peer.color}`,
                  borderRadius: 12,
                  pointerEvents: "none",
                  zIndex: 5,
                  opacity: 0.85,
                }}
              />
            );
          }
        }
        return halos;
      })()}
    </div>
  );
}

