import { useEffect, useState } from "react";
import { runCommand, type CommandContext } from "../lib/commands";
import { findNode, findParent } from "../lib/id";
import { isMac } from "../lib/platform";
import { SHORTCUTS } from "../lib/shortcut-catalog";
import { useStudio } from "../store";
import type { DesignNode } from "../types";

export interface NodeMenuRequest {
  x: number;
  y: number;
  world?: { x: number; y: number };
}

let current: NodeMenuRequest | null = null;
const listeners = new Set<() => void>();

export function openNodeMenu(next: NodeMenuRequest) {
  current = next;
  listeners.forEach((listener) => listener());
}

function closeNodeMenu() {
  if (!current) return;
  current = null;
  listeners.forEach((listener) => listener());
}

function useNodeMenu() {
  const [menu, setMenu] = useState(current);
  useEffect(() => {
    const sync = () => setMenu(current);
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return menu;
}

function shortcutFor(id: string) {
  const row = SHORTCUTS.find((item) => item.id === id);
  return row ? (isMac ? row.mac : row.win) : "";
}

function onBoard(pages: DesignNode[], node: DesignNode) {
  const parent = findParent(pages, node.id);
  return !parent || !!parent.section;
}

export function NodeMenu() {
  const menu = useNodeMenu();
  const { state, dispatch } = useStudio();
  const [copyOpen, setCopyOpen] = useState(false);
  useEffect(() => setCopyOpen(false), [menu]);

  useEffect(() => {
    if (!menu) return;
    let armed = false;
    const arm = window.setTimeout(() => {
      armed = true;
    }, 250);
    const onPointer = (event: PointerEvent) => {
      if (!armed) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".node-menu")) return;
      closeNodeMenu();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeNodeMenu();
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (!menu) return null;

  const nodes = state.doc.selectedIds.map((id) => findNode(state.doc.pages, id)).filter((node): node is DesignNode => !!node);
  const clip = !!state.clipboard?.length;
  const sections = nodes.filter((node) => node.section);
  const frames = nodes.length > 0 && nodes.every((node) => node.type === "frame" && !node.section && onBoard(state.doc.pages, node));
  const allSections = nodes.length > 0 && nodes.every((node) => node.section);
  const components = nodes.filter((node) => node.component);
  const run = (id: string) => {
    const context: CommandContext = {
      state,
      dispatch,
      canvas: document.querySelector(".canvas-host canvas"),
      placeImage: () => undefined,
      focusRename: () => {
        dispatch({ type: "renameTick" });
        const field = document.getElementById("layer-name") as HTMLInputElement | null;
        field?.focus();
        field?.select();
      },
      focusText: () => document.getElementById("layer-copy")?.focus(),
      pasteAt: id === "paste" ? menu.world : undefined,
    };
    closeNodeMenu();
    runCommand(id, context);
  };

  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 268));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - (nodes.length ? 520 : 220)));

  return (
    <div className="node-menu" role="menu" style={{ left, top }} onPointerDown={(event) => event.stopPropagation()}>
      {nodes.length === 0 ? (
        <EmptyItems clip={clip} onRun={run} />
      ) : (
        <>
          <Item id="copy" label="Copy" onRun={run} />
          <Item id="paste" label="Paste here" disabled={!clip} onRun={run} />
          <Item id="paste-replace" label="Paste to replace" disabled={!clip} onRun={run} />
          <div className="node-sub" onMouseEnter={() => setCopyOpen(true)} onMouseLeave={() => setCopyOpen(false)}>
            <button type="button" role="menuitem" aria-expanded={copyOpen} aria-haspopup="menu" onClick={() => setCopyOpen((open) => !open)}>
              Copy as <span aria-hidden="true">›</span>
            </button>
            {copyOpen && (
              <div role="menu">
                <Item id="copy-css" label="Copy as CSS" onRun={run} />
                <Item id="copy-svg" label="Copy as SVG" onRun={run} />
                <Item id="copy-png" label="Copy as PNG" onRun={run} />
                <Item id="copy-link" label="Copy link to selection" onRun={run} />
              </div>
            )}
          </div>
          <hr />
          <Item id="front" label="Bring to front" onRun={run} />
          <Item id="forward" label="Bring forward" onRun={run} />
          <Item id="backward" label="Send backward" onRun={run} />
          <Item id="back" label="Send to back" onRun={run} />
          <hr />
          <Item id="group" label="Group selection" disabled={nodes.length < 2} onRun={run} />
          <Item id="frame-selection" label="Frame selection" onRun={run} />
          <Item id="wrap-section" label="Wrap in new section" onRun={run} />
          {allSections && <Item id="convert-frame" label="Convert to frame" onRun={run} />}
          {frames && <Item id="convert-section" label="Convert to section" onRun={run} />}
          <Item id="ungroup" label="Ungroup" disabled={!nodes.some((node) => (node.type === "group" || node.type === "frame") && node.children.length)} onRun={run} />
          <Item id="union" label="Union selection" disabled={nodes.length < 2} onRun={run} />
          <Item id="subtract" label="Subtract selection" disabled={nodes.length < 2} onRun={run} />
          <Item id="intersect" label="Intersect selection" disabled={nodes.length < 2} onRun={run} />
          <Item id="exclude" label="Exclude selection" disabled={nodes.length < 2} onRun={run} />
          <Item id="flatten" label="Flatten" onRun={run} />
          <Item id="outline-stroke" label="Outline stroke" disabled={!nodes.some((node) => node.strokeWidth > 0 && node.stroke !== "transparent" && node.stroke !== "#00000000")} onRun={run} />
          <Item id="mask" label="Use as mask" onRun={run} />
          {nodes.length === 1 && (nodes[0].type === "image" || nodes[0].imageDataUrl) && <Item id="crop" label="Crop image" onRun={run} />}
          <hr />
          <Item id="autolayout" label="Add auto layout" onRun={run} />
          <Item id="autolayout-remove" label="Remove all auto layout" disabled={!nodes.some((node) => node.autoLayout)} onRun={run} />
          {nodes.length > 0 && nodes.every((node) => node.instanceOf) ? (
            <Item id="main-component" label="Go to main component" onRun={run} />
          ) : (
            <Item id="component" label="Create component" onRun={run} />
          )}
          {nodes.length === 1 && (nodes[0].component || nodes[0].instanceOf) && <Item id="create-variant" label="Create variant" onRun={run} />}
          {components.length >= 2 && <Item id="combine" label="Combine as variants" onRun={run} />}
          {(components.length > 0 || nodes.some((node) => node.instanceOf)) && <Item id="prop-boolean" label="Add boolean property" onRun={run} />}
          {(components.length > 0 || nodes.some((node) => node.instanceOf)) && <Item id="prop-string" label="Add string property" onRun={run} />}
          <Item id="detach" label="Detach instance" disabled={!nodes.some((node) => node.instanceOf)} onRun={run} />
          <hr />
          <Item id="toggle-visible" label="Show/Hide" onRun={run} />
          <Item id="toggle-lock" label="Lock/Unlock" onRun={run} />
          {sections.length > 0 && (
            <Item id="section-contents" label={sections.every((node) => node.contentsHidden) ? "Show section contents" : "Hide section contents"} onRun={run} />
          )}
          <hr />
          <Item id="flip-h" label="Flip horizontal" onRun={run} />
          <Item id="flip-v" label="Flip vertical" onRun={run} />
          <hr />
          <Item id="delete" label="Delete" onRun={run} />
        </>
      )}
    </div>
  );
}

function EmptyItems({ clip, onRun }: { clip: boolean; onRun: (id: string) => void }) {
  return (
    <>
      <Item id="paste" label="Paste here" disabled={!clip} onRun={onRun} />
      <hr />
      <Item id="select-all" label="Select all" onRun={onRun} />
      <hr />
      <Item id="hide-ui" label="Show/Hide UI" onRun={onRun} />
      <Item id="zoom-fit" label="Zoom to fit" onRun={onRun} />
      <Item id="rulers" label="Rulers" onRun={onRun} />
      <Item id="grid" label="Pixel grid" onRun={onRun} />
    </>
  );
}

function Item({ id, label, disabled, onRun }: { id: string; label: string; disabled?: boolean; onRun: (id: string) => void }) {
  const keys = shortcutFor(id === "paste" ? "paste" : id);
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={() => onRun(id)}>
      <span>{label}</span>
      {keys && <kbd>{keys}</kbd>}
    </button>
  );
}
