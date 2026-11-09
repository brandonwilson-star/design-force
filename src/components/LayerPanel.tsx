import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DesignNode, DesignSheet } from "../types";
import { PageTools } from "./CraftDesks";
import { Icon } from "./Icons";
import { selectedNode, useStudio } from "../store";
import { openNodeMenu } from "./NodeMenu";

function iconFor(node: DesignNode): string {
  if (node.instanceOf || node.component) return "component";
  if (node.type === "text") return "type";
  if (node.type === "image") return "image";
  if (node.type === "ellipse") return "circle";
  if (node.type === "path") return "spline";
  if (node.type === "rect") return "square";
  if (node.type === "group") return "frame";
  return "frame";
}

export function LayerPanel() {
  const { state, dispatch } = useStudio();
  const [onlyVisible, setOnlyVisible] = useState(false);
  const [media, setMedia] = useState<"all" | "video" | "audio">("all");
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const selectionKey = state.doc.selectedIds.join("|");

  useEffect(() => {
    if (!selectionKey) return;
    setClosed((current) => {
      const next = new Set(current);
      let changed = false;
      for (const id of selectionKey.split("|")) {
        for (const ancestor of ancestorIds(state.doc.pages, id) ?? []) {
          if (next.delete(ancestor)) changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [selectionKey, state.doc.pages]);
  const sel = selectedNode(state);
  const page = state.doc.pages.find((node) => state.doc.selectedIds.some((id) => id === node.id || contains(node, id))) ?? state.doc.pages[0];

  const toggle = (node: DesignNode) => {
    dispatch({ type: "patch", id: node.id, patch: { visible: !node.visible } });
  };

  const toggleOpen = (node: DesignNode) => {
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  };

  return (
    <div className="layer-panel">
      {state.mode === "photo" && (
        <div className="panel-pad blend-row">
          <label>
            Blend
            <select
              aria-label="Blend"
              value={sel?.blendMode ?? "normal"}
              disabled={!sel}
              onChange={(event) => sel && dispatch({ type: "patch", id: sel.id, patch: { blendMode: event.target.value as DesignNode["blendMode"] } })}
            >
              {["normal", "multiply", "screen", "overlay", "darken", "lighten", "color", "luminosity"].map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label>
            Opacity
            <select
              aria-label="Opacity"
              value={String(Math.round((sel?.opacity ?? 1) * 100))}
              disabled={!sel}
              onChange={(event) => sel && dispatch({ type: "patch", id: sel.id, patch: { opacity: Number(event.target.value) / 100 } })}
            >
              {[100, 75, 50, 25, 0].map((value) => (
                <option key={value} value={value}>
                  {value}%
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {state.mode === "motion" && page && (
        <div className="panel-pad comp-meta">
          <span className="comp-mark">M</span>
          <span>
            <strong>{page.name}</strong>
            <em>{Math.round(page.w)} × {Math.round(page.h)}</em>
          </span>
        </div>
      )}
      {state.mode === "film" && (
        <div className="media-filters" role="group" aria-label="Media filters">
          {(["all", "video", "audio"] as const).map((id) => (
            <button key={id} type="button" aria-pressed={media === id} onClick={() => setMedia(id)}>
              {id === "all" ? "All" : id === "video" ? "Video" : "Audio"}
            </button>
          ))}
        </div>
      )}
      {state.mode === "ai" && (
        <div className="panel-pad">
          <button type="button" className="textbtn" onClick={() => document.getElementById("ai-prompt")?.focus()}>
            New session
          </button>
        </div>
      )}
      {state.mode === "prototype" && (
        <>
          <div className="layer-head">
            <span>Flows</span>
          </div>
          {flows(state.doc.pages).map((node) => (
            <LayerRow key={node.id} node={node} depth={0} icon="play" active={state.doc.selectedIds.includes(node.id)} onToggle={toggle} />
          ))}
          {flows(state.doc.pages).length === 0 && <p className="panel-note">Select a frame, then drag the handle on its right edge to another frame.</p>}
          <div className="panel-pad">
            <button type="button" className="textbtn" onClick={() => dispatch({ type: "tool", tool: "flow" })}>
              Add interaction
            </button>
          </div>
        </>
      )}

      <PagesList />

      <div className="layer-head">
        <span>Layers</span>
        <button
          type="button"
          className="iconbare"
          aria-pressed={onlyVisible}
          aria-label={onlyVisible ? "Showing visible layers" : "Show all layers"}
          onClick={() => setOnlyVisible((value) => !value)}
        >
          <Icon name="filter" />
        </button>
      </div>
      <div className="layer-tree" role="tree" aria-label="Layers">
        {state.doc.pages.length === 0 && <p className="panel-note">No layers on this page.</p>}
        {state.doc.pages.map((node) => (
          <Branch
            key={node.id}
            node={node}
            depth={0}
            onlyVisible={onlyVisible}
            media={state.mode === "film" ? media : "all"}
            selected={state.doc.selectedIds}
            closed={closed}
            onToggle={toggle}
            onOpen={toggleOpen}
          />
        ))}
      </div>

      <div className="layer-head library-head">
        <span>Project library</span>
        <button type="button" className="iconbare" aria-label="Open library" onClick={() => dispatch({ type: "ui", patch: { leftPanel: "libraries" } })}>
          <Icon name="external" />
        </button>
      </div>
      <div className="panel-pad library-summary">
        <p>{state.doc.name}</p>
        <div className="brand-swatches">
          {(state.doc.colorStyles ?? []).map((style) => (
            <button
              key={style.id}
              type="button"
              title={style.name}
              style={{ background: style.value }}
              onClick={() => sel && dispatch({ type: "patch", id: sel.id, patch: { fill: style.value } })}
            />
          ))}
        </div>
      </div>
      <div className="layer-head">
        <span>Page tools</span>
      </div>
      <PageTools />
    </div>
  );
}

function PagesList() {
  const { state, dispatch } = useStudio();
  const sheets = state.doc.sheets;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renameNext, setRenameNext] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const skipCommit = useRef(false);

  useEffect(() => {
    if (!renameNext) return;
    const id = state.doc.activeSheetId;
    setEditing(id);
    setDraft(sheets.find((sheet) => sheet.id === id)?.name ?? "");
    setRenameNext(false);
  }, [renameNext, state.doc.activeSheetId, sheets]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const startRename = (sheet: DesignSheet) => {
    setEditing(sheet.id);
    setDraft(sheet.name);
    setMenu(null);
  };

  const commitName = (id: string) => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    const name = draft.trim();
    const current = sheets.find((sheet) => sheet.id === id);
    if (current && name && name !== current.name) dispatch({ type: "renameSheet", id, name });
    setEditing(null);
  };

  const beginDrag = (event: ReactPointerEvent, sheet: DesignSheet, index: number) => {
    if (event.button !== 0) return;
    const startY = event.clientY;
    const divider = isDivider(sheet);
    let moved = false;
    let nextIndex = index;
    const move = (e: PointerEvent) => {
      if (Math.abs(e.clientY - startY) > 4) moved = true;
      if (!moved) return;
      nextIndex = Math.max(0, Math.min(sheets.length - 1, index + Math.round((e.clientY - startY) / 32)));
      setDragOver(nextIndex);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragOver(null);
      if (moved) {
        if (nextIndex !== index) dispatch({ type: "reorderSheet", id: sheet.id, index: nextIndex });
      } else if (!divider) {
        dispatch({ type: "sheet", id: sheet.id });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <>
      <div className="layer-head">
        <span>Pages</span>
        <button
          type="button"
          className="iconbare"
          aria-label="Add page"
          onClick={() => {
            dispatch({ type: "addSheet" });
            setRenameNext(true);
          }}
        >
          <Icon name="plus" />
        </button>
      </div>
      <div className="page-list" role="listbox" aria-label="Pages">
        {sheets.map((sheet, index) => {
          const divider = isDivider(sheet);
          const current = sheet.id === state.doc.activeSheetId;
          if (divider && editing !== sheet.id) {
            return (
              <div
                key={sheet.id}
                className={`page-divider ${dragOver === index ? "drop" : ""}`}
                role="option"
                aria-selected={false}
                onDoubleClick={() => startRename(sheet)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ id: sheet.id, x: event.clientX, y: event.clientY });
                }}
                onPointerDown={(event) => beginDrag(event, sheet, index)}
              >
                {sheet.name.replace(/^-+/, "").trim() || "Section"}
              </div>
            );
          }
          return (
            <div
              key={sheet.id}
              className={`page-row ${current ? "current" : ""} ${dragOver === index ? "drop" : ""}`}
              role="option"
              aria-selected={current}
              onDoubleClick={() => startRename(sheet)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ id: sheet.id, x: event.clientX, y: event.clientY });
              }}
              onPointerDown={(event) => beginDrag(event, sheet, index)}
            >
              <Icon name="page" />
              {editing === sheet.id ? (
                <input
                  className="page-rename"
                  value={draft}
                  autoFocus
                  aria-label="Page name"
                  onFocus={(event) => event.target.select()}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => commitName(sheet.id)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitName(sheet.id);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      skipCommit.current = true;
                      setEditing(null);
                    }
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                />
              ) : (
                <span>{sheet.name}</span>
              )}
            </div>
          );
        })}
      </div>
      {menu && (
        <div className="page-menu" style={{ left: menu.x, top: menu.y }} role="menu" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => startRename(sheets.find((sheet) => sheet.id === menu.id) ?? sheets[0])}>
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              dispatch({ type: "duplicateSheet", id: menu.id });
              setMenu(null);
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={sheets.length < 2}
            onClick={() => {
              dispatch({ type: "deleteSheet", id: menu.id });
              setMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}

function isDivider(sheet: DesignSheet) {
  return sheet.nodes.length === 0 && sheet.name.trim().startsWith("-");
}

function Branch({
  node,
  depth,
  onlyVisible,
  media,
  selected,
  closed,
  onToggle,
  onOpen,
}: {
  node: DesignNode;
  depth: number;
  onlyVisible: boolean;
  media: "all" | "video" | "audio";
  selected: string[];
  closed: Set<string>;
  onToggle: (node: DesignNode) => void;
  onOpen: (node: DesignNode) => void;
}) {
  const audio = /audio/i.test(node.name);
  const show = (!onlyVisible || node.visible) && !(media === "audio" && !audio) && !(media === "video" && audio);
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && !closed.has(node.id);
  return (
    <>
      {show && (
        <LayerRow
          node={node}
          depth={depth}
          icon={iconFor(node)}
          active={selected.includes(node.id)}
          expanded={expanded}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      )}
      {expanded &&
        node.children.map((child) => (
          <Branch
            key={child.id}
            node={child}
            depth={depth + 1}
            onlyVisible={onlyVisible}
            media={media}
            selected={selected}
            closed={closed}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
    </>
  );
}

function LayerRow({
  node,
  depth,
  icon,
  active,
  expanded = false,
  onToggle,
  onOpen,
}: {
  node: DesignNode;
  depth: number;
  icon: string;
  active: boolean;
  expanded?: boolean;
  onToggle: (node: DesignNode) => void;
  onOpen?: (node: DesignNode) => void;
}) {
  const { dispatch } = useStudio();
  const hasChildren = !!onOpen && node.children.length > 0;
  return (
    <div
      className={`layer-row ${active ? "active" : ""} ${node.visible ? "" : "hidden"}`}
      role="treeitem"
      aria-selected={active}
      aria-expanded={hasChildren ? expanded : undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!active) dispatch({ type: "select", id: node.id });
        openNodeMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      {onOpen && (
        <button
          type="button"
          className={`layer-twist ${hasChildren ? "" : "empty"} ${expanded ? "" : "closed"}`}
          style={{ marginLeft: 8 + depth * 14 }}
          aria-label={hasChildren ? `${expanded ? "Collapse" : "Expand"} ${node.name}` : undefined}
          tabIndex={hasChildren ? 0 : -1}
          onClick={() => hasChildren && onOpen(node)}
        >
          {hasChildren && <Icon name="chevron" />}
        </button>
      )}
      <button
        type="button"
        className="layer-name"
        style={onOpen ? undefined : { paddingLeft: 12 + depth * 14 }}
        onClick={(event) => dispatch({ type: "select", id: node.id, shift: event.shiftKey })}
      >
        <Icon name={icon} />
        <span>{node.name}</span>
      </button>
      <button type="button" className="eye" aria-label={node.visible ? `Hide ${node.name}` : `Show ${node.name}`} onClick={() => onToggle(node)}>
        <Icon name={node.visible ? "eye" : "eye-off"} />
      </button>
    </div>
  );
}

function ancestorIds(nodes: DesignNode[], id: string, trail: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.id === id) return trail;
    const found = ancestorIds(node.children, id, [...trail, node.id]);
    if (found) return found;
  }
  return null;
}

function contains(node: DesignNode, id: string): boolean {
  return node.children.some((child) => child.id === id || contains(child, id));
}

function flows(nodes: DesignNode[]): DesignNode[] {
  const out: DesignNode[] = [];
  const walk = (list: DesignNode[]) => {
    for (const node of list) {
      if (node.interaction?.targetId) out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}
