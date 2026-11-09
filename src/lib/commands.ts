import type { Dispatch } from "react";
import { documentToSvg } from "./export";
import { isMac } from "./platform";
import {
  addComponentProp,
  alignNodes,
  alignOne,
  allTopIds,
  boundsOf,
  createComponent,
  createVariant,
  duplicateNodes,
  findComponent,
  firstChildId,
  flipNodes,
  groupNodes,
  insertAt,
  inverseIds,
  makeComponentSet,
  locate,
  makeAutoLayout,
  makeMask,
  matchingIds,
  nudgeNodes,
  parentOf,
  pasteAtPoint,
  pasteNodes,
  patchTops,
  removeIds,
  reorderNode,
  resizeFrameToFit,
  rootFrameId,
  siblingId,
  textIds,
  topmostIds,
  ungroupNodes,
} from "./scene";
import { usedShortcuts } from "./shortcut-catalog";
import { findNode, uid } from "./id";
import type { Action, StudioState } from "../store";
import type { DesignNode, ToolId } from "../types";

export interface CommandContext {
  state: StudioState;
  dispatch: Dispatch<Action>;
  canvas: HTMLCanvasElement | null;
  placeImage: () => void;
  focusRename: () => void;
  focusText: () => void;
  pasteAt?: { x: number; y: number };
}

const TOOLS: Record<string, ToolId> = {
  "tool-select": "select",
  "tool-scale": "scale",
  "tool-frame": "frame",
  "tool-section": "section",
  "tool-rect": "rect",
  "tool-ellipse": "ellipse",
  "tool-line": "line",
  "tool-pen": "pen",
  "tool-pencil": "pencil",
  "tool-text": "text",
  "tool-slice": "slice",
  "tool-hand": "hand",
  "tool-comment": "comment",
  "tool-eyedropper": "eyedropper",
  "tool-zoom": "zoom",
  "tool-brush": "brush",
  "tool-flow": "flow",
};

export function shortcutId(e: KeyboardEvent, hasSelection: boolean): string | null {
  const key = e.key;
  const k = e.code.startsWith("Key") ? e.code.slice(3).toLowerCase() : key.toLowerCase();
  const bracket = e.code === "BracketRight" ? "]" : e.code === "BracketLeft" ? "[" : "";
  const cmd = isMac ? e.metaKey : e.ctrlKey;
  const alt = e.altKey;
  const shift = e.shiftKey;
  const macCtrl = isMac && e.ctrlKey && !e.metaKey;
  const arrow = key.startsWith("Arrow") ? key : "";

  if ((key === "?" && (macCtrl || (!isMac && cmd)) && shift) || (k === "/" && shift && (macCtrl || (!isMac && cmd)) && !alt)) {
    return "shortcuts";
  }
  if (cmd && !alt && !shift && k === "k") return "actions";
  if (cmd && !alt && !shift && k === "/") return "actions-slash";
  if (cmd && !alt && shift && k === "z") return "redo";
  if (!isMac && cmd && !alt && !shift && k === "y") return "redo";
  if (cmd && !alt && !shift && k === "z") return "undo";

  if (cmd && alt && shift && k === "a" && !isMac) return "autolayout-suggest";
  if (macCtrl && shift && !alt && k === "a") return "autolayout-suggest";
  if (cmd && alt && shift && k === "k") return "main-component";
  if (macCtrl && cmd && alt && !shift && k === "k") return "main-component";
  if (cmd && alt && shift && k === "r") return "resize-fit";
  if (cmd && alt && !shift && k === "g") return "frame-selection";
  if (cmd && alt && !shift && k === "k") return "component";
  if (cmd && alt && !shift && k === "b") return "detach";
  if (cmd && alt && !shift && k === "a") return "select-matching";
  if ((macCtrl && cmd && !shift && !alt && k === "m") || (!isMac && cmd && alt && !shift && k === "m")) return "mask";
  if ((isMac && macCtrl && !cmd && !alt && !shift && k === "p") || (!isMac && cmd && alt && !shift && k === "p")) return "pixel-preview";

  if (cmd && shift && !alt && e.code === "Backslash") return "minimize-ui";
  if (cmd && alt && !shift && e.code === "Backslash") return "cursors";
  if (cmd && !shift && !alt && e.code === "Backslash") return "hide-ui";

  if (cmd && shift && !alt && k === "e") return "export";
  if (cmd && !shift && !alt && k === "e") return "export";
  if (cmd && shift && !alt && k === "h") return "toggle-visible";
  if (cmd && shift && !alt && k === "l") return "toggle-lock";
  if (cmd && shift && !alt && k === "c") return "copy-png";
  if (cmd && shift && !alt && k === "v") return "paste-over";
  if (cmd && shift && !alt && k === "r") return "paste-replace";
  if (cmd && shift && !alt && k === "a") return "select-inverse";
  if (cmd && shift && !alt && k === "g") return "ungroup";
  if (cmd && shift && !alt && k === "o") return "outline";
  if (cmd && shift && !alt && e.code === "Quote") return "snap";
  if (cmd && shift && !alt && k === "k") return "place-image";
  if (cmd && shift && !alt && (key === ">" || key === ".")) return "font-up";
  if (cmd && shift && !alt && (key === "<" || key === ",")) return "font-down";
  if (cmd && !shift && alt && (key === ">" || key === ".")) return "weight-up";
  if (cmd && !shift && alt && (key === "<" || key === ",")) return "weight-down";
  if (cmd && alt && bracket === "]") return "front";
  if (cmd && alt && bracket === "[") return "back";
  if (!isMac && cmd && shift && bracket === "]") return "front";
  if (!isMac && cmd && shift && bracket === "[") return "back";
  if (cmd && !shift && !alt && bracket === "]") return "forward";
  if (cmd && !shift && !alt && bracket === "[") return "backward";

  if (cmd && !shift && !alt && k === "a") return "select-all";
  if (cmd && !shift && !alt && k === "d") return "duplicate";
  if (cmd && !shift && !alt && k === "r") return "rename";
  if (cmd && !shift && !alt && k === "c") return "copy";
  if (cmd && !shift && !alt && k === "x") return "cut";
  if (cmd && !shift && !alt && k === "v") return "paste";
  if (cmd && !shift && !alt && k === "g") return "group";
  if (cmd && !shift && !alt && k === "b") return "bold";
  if (cmd && !shift && !alt && k === "i") return "italic";
  if (cmd && !shift && !alt && k === "u") return "underline";
  if ((cmd && (key === "Backspace" || key === "Delete")) || (cmd && shift && k === "g")) return "ungroup";
  if (cmd && alt && (key === "Enter" || key === "Return")) return "present";

  if (alt && shift && !cmd && k === "a") return "autolayout-remove";
  if (alt && shift && !cmd && k === "u") return "union";
  if (alt && shift && !cmd && k === "s") return "subtract";
  if (alt && shift && !cmd && k === "i") return "intersect";
  if (alt && shift && !cmd && k === "e") return "exclude";
  if (alt && shift && !cmd && k === "f") return "flatten";
  if (alt && !shift && !cmd && k === "a") return "align-left";
  if (alt && !shift && !cmd && k === "d") return "align-right";
  if (alt && !shift && !cmd && k === "w") return "align-top";
  if (alt && !shift && !cmd && k === "s") return "align-bottom";
  if (alt && !shift && !cmd && k === "h") return "align-h";
  if (alt && !shift && !cmd && k === "v") return "align-v";
  if (alt && !cmd && !shift && e.code === "Digit1") return "layers";
  if (alt && !cmd && !shift && e.code === "Digit2") return "assets";
  if (alt && !cmd && !shift && e.code === "Digit3") return "libraries";
  if (alt && !cmd && !shift && (key === ">" || key === ".")) return "track-up";
  if (alt && !cmd && !shift && (key === "<" || key === ",")) return "track-down";
  if (shift && alt && !cmd && (key === ">" || key === ".")) return "line-up";
  if (shift && alt && !cmd && (key === "<" || key === ",")) return "line-down";

  if (!cmd && !alt && !macCtrl && shift && e.code === "Digit1") return "zoom-fit";
  if (!cmd && !alt && !macCtrl && shift && e.code === "Digit2") return "zoom-selection";
  if (!cmd && !alt && !macCtrl && shift && e.code === "Digit0") return "zoom-100";
  if (!cmd && !alt && !macCtrl && shift && k === "c") return "comments-toggle";
  if (!cmd && !alt && !macCtrl && shift && k === "s") return "tool-section";
  if (!cmd && !alt && !macCtrl && shift && k === "p") return "tool-pencil";
  if (!cmd && !alt && !macCtrl && shift && k === "h") return "flip-h";
  if (!cmd && !alt && !macCtrl && shift && k === "v") return "flip-v";
  if (!cmd && !alt && !macCtrl && shift && k === "a") return "autolayout";
  if (!cmd && !alt && !macCtrl && shift && k === "g") return "guides";
  if (!cmd && !alt && !macCtrl && shift && k === "r") return "rulers";
  if (!cmd && !alt && !macCtrl && shift && k === "d") return "dev";
  if (!cmd && !alt && !macCtrl && shift && k === "e") return "prototype";
  if (!cmd && !alt && !macCtrl && shift && k === "i") return "actions";
  if (!cmd && !alt && !macCtrl && shift && e.code === "Quote") return "grid";
  if (!cmd && !alt && !macCtrl && shift && key === " ") return "preview";

  if (!cmd && !alt && !macCtrl && bracket === "]") return "front";
  if (!cmd && !alt && !macCtrl && bracket === "[") return "back";
  if (!alt && !macCtrl && (key === "+" || key === "=" || key === "Add")) return "zoom-in";
  if (!alt && !macCtrl && (key === "-" || key === "_" || key === "Subtract")) return "zoom-out";

  if (arrow && !cmd && !alt && !macCtrl) {
    const big = shift ? "big" : "small";
    return hasSelection ? `nudge:${big}:${arrow}` : `pan:${big}:${arrow}`;
  }

  if ((key === "Backspace" || key === "Delete") && !cmd && !alt) return "delete";
  if (key === "Enter" && shift && !cmd && !alt) return "select-parent";
  if (key === "Enter" && !cmd && !alt && !shift) return "select-child";
  if (e.code === "Backslash" && !cmd && !alt && !macCtrl) return "select-parent";
  if (key === "Tab" && !cmd && !alt) return shift ? "sibling-prev" : "sibling-next";
  if (key === "Escape") return "escape";

  if (!cmd && !alt && !shift && !macCtrl && k.length === 1) {
    const bare: Record<string, string> = {
      v: "tool-select",
      k: "tool-scale",
      f: "tool-frame",
      a: "tool-frame",
      r: "tool-rect",
      o: "tool-ellipse",
      l: "tool-line",
      p: "tool-pen",
      t: "tool-text",
      s: "tool-slice",
      h: "tool-hand",
      c: "tool-comment",
      i: "tool-eyedropper",
      z: "tool-zoom",
      b: "tool-brush",
      n: "tool-flow",
    };
    if (bare[k]) return bare[k];
    if (/^Digit[0-9]$/.test(e.code) && hasSelection) return `opacity:${e.code.slice(5)}`;
  }
  return null;
}

function note(dispatch: Dispatch<Action>, text: string) {
  dispatch({ type: "note", note: text });
}

function idsOf(state: StudioState): string[] {
  return state.doc.selectedIds.length ? state.doc.selectedIds : state.doc.selectedId ? [state.doc.selectedId] : [];
}

function applyPages(dispatch: Dispatch<Action>, pages: DesignNode[], selectedIds: string[], history = true) {
  dispatch({ type: "replaceDoc", pages, selectedIds, history });
}

function zoomAround(state: StudioState, canvas: HTMLCanvasElement | null, next: number, dispatch: Dispatch<Action>) {
  const zoom = Math.min(64, Math.max(0.02, next));
  const viewW = canvas?.clientWidth || window.innerWidth;
  const viewH = canvas?.clientHeight || window.innerHeight;
  const cx = (viewW / 2 - state.camera.x) / state.camera.zoom;
  const cy = (viewH / 2 - state.camera.y) / state.camera.zoom;
  dispatch({
    type: "camera",
    camera: { zoom, x: viewW / 2 - cx * zoom, y: viewH / 2 - cy * zoom },
  });
}

function zoomBounds(
  state: StudioState,
  canvas: HTMLCanvasElement | null,
  dispatch: Dispatch<Action>,
  ids?: string[],
) {
  const box = boundsOf(state.doc.pages, ids);
  if (!box) return;
  const viewW = canvas?.clientWidth || window.innerWidth;
  const viewH = canvas?.clientHeight || window.innerHeight;
  const bw = Math.max(1, box.maxX - box.minX);
  const bh = Math.max(1, box.maxY - box.minY);
  const zoom = Math.min(64, Math.max(0.02, Math.min((viewW - 80) / bw, (viewH - 80) / bh)));
  dispatch({
    type: "camera",
    camera: {
      zoom,
      x: (viewW - bw * zoom) / 2 - box.minX * zoom,
      y: (viewH - bh * zoom) / 2 - box.minY * zoom,
    },
  });
}

function patchText(state: StudioState, dispatch: Dispatch<Action>, change: (n: DesignNode) => Partial<DesignNode>) {
  const targets = textIds(state.doc.pages, idsOf(state));
  if (!targets.length) {
    note(dispatch, "Select a text layer");
    return;
  }
  let pages = state.doc.pages;
  for (const id of targets) {
    const node = locate(pages, id)?.node;
    if (!node) continue;
    pages = patchTops(pages, [id], change(node));
  }
  applyPages(dispatch, pages, idsOf(state));
}

function cssOf(state: StudioState) {
  const ids = topmostIds(state.doc.pages, idsOf(state));
  return ids
    .map((id) => locate(state.doc.pages, id)?.node)
    .filter((node): node is DesignNode => !!node)
    .map((node) =>
      [
        `/* ${node.name} */`,
        `width: ${Math.round(node.w)}px;`,
        `height: ${Math.round(node.h)}px;`,
        node.fill && node.fill !== "#00000000" && node.fill !== "transparent" ? `background: ${node.fill};` : "",
        node.strokeWidth > 0 && node.stroke !== "transparent" ? `border: ${node.strokeWidth}px solid ${node.stroke};` : "",
        node.radius ? `border-radius: ${Math.round(node.radius)}px;` : "",
        node.opacity < 1 ? `opacity: ${node.opacity};` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

function svgOf(state: StudioState) {
  const locs = topmostIds(state.doc.pages, idsOf(state))
    .map((id) => locate(state.doc.pages, id))
    .filter((loc) => !!loc);
  if (!locs.length) return "";
  const minX = Math.min(...locs.map((loc) => loc.absX));
  const minY = Math.min(...locs.map((loc) => loc.absY));
  return documentToSvg({
    ...state.doc,
    pages: locs.map((loc) => ({ ...loc.node, x: loc.absX - minX, y: loc.absY - minY })),
  });
}

function copyText(text: string, dispatch: Dispatch<Action>, done: string) {
  if (!text) {
    note(dispatch, "Nothing to copy");
    return Promise.resolve();
  }
  return navigator.clipboard.writeText(text).then(
    () => note(dispatch, done),
    () => note(dispatch, "Clipboard is unavailable"),
  );
}

function outlineStrokes(pages: DesignNode[], ids: string[]) {
  let next = pages;
  let count = 0;
  for (const id of topmostIds(pages, ids)) {
    const loc = locate(next, id);
    const node = loc?.node;
    if (!loc || !node || node.strokeWidth <= 0 || !node.stroke || node.stroke === "transparent" || node.stroke === "#00000000") continue;
    const grow = node.strokeWidth;
    const outline: DesignNode = {
      ...node,
      id: uid(),
      name: `${node.name} stroke`,
      children: [],
      text: undefined,
      vector: undefined,
      x: node.x - grow / 2,
      y: node.y - grow / 2,
      w: node.w + grow,
      h: node.h + grow,
      fill: node.stroke,
      stroke: "transparent",
      strokeWidth: 0,
      component: false,
      section: false,
    };
    next = insertAt(next, loc.parent?.id ?? null, outline, loc.index);
    next = patchTops(next, [id], { stroke: "transparent", strokeWidth: 0 });
    count += 1;
  }
  return count ? next : null;
}

async function copyPng(state: StudioState, dispatch: Dispatch<Action>) {
  const ids = topmostIds(state.doc.pages, idsOf(state));
  const locs = ids.map((id) => locate(state.doc.pages, id)).filter((l) => !!l);
  if (!locs.length) return;
  const minX = Math.min(...locs.map((l) => l!.absX));
  const minY = Math.min(...locs.map((l) => l!.absY));
  const svg = documentToSvg({
    ...state.doc,
    pages: locs.map((l) => ({ ...l!.node, x: l!.absX - minX, y: l!.absY - minY })),
  });
  const blob = await svgToBlob(svg);
  if (navigator.clipboard && "ClipboardItem" in window) {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    note(dispatch, "Copied as PNG");
  } else {
    note(dispatch, "Clipboard image is unavailable in this browser");
  }
}

function svgToBlob(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, img.width);
      canvas.height = Math.max(1, img.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG failed"))), "image/png");
    };
    img.onerror = () => reject(new Error("SVG failed"));
    img.src = url;
  });
}

export function runCommand(id: string, ctx: CommandContext, repeat = false) {
  const { state, dispatch } = ctx;
  const base = id.startsWith("opacity:") || id.startsWith("nudge:") || id.startsWith("pan:") ? id.split(":")[0] : id;
  usedShortcuts.add(base);
  const selected = idsOf(state);
  const primary = state.doc.selectedId;

  if (TOOLS[id]) {
    dispatch({ type: "tool", tool: TOOLS[id] });
    note(dispatch, id.replace("tool-", ""));
    return;
  }

  switch (id) {
    case "shortcuts":
      dispatch({ type: "ui", patch: { shortcutsOpen: !state.shortcutsOpen, paletteOpen: false } });
      return;
    case "actions":
    case "actions-slash":
      dispatch({ type: "ui", patch: { paletteOpen: true, shortcutsOpen: false } });
      return;
    case "escape":
      dispatch({
        type: "ui",
        patch: {
          paletteOpen: false,
          shortcutsOpen: false,
          presenting: false,
          uiHidden: state.presenting ? false : state.uiHidden,
          exportOpen: false,
          settingsOpen: false,
          shareOpen: false,
        },
      });
      dispatch({ type: "tool", tool: "select" });
      return;
    case "undo":
      dispatch({ type: "undo" });
      return;
    case "redo":
      dispatch({ type: "redo" });
      return;
    case "select-all":
      dispatch({ type: "selectIds", ids: allTopIds(state.doc.pages) });
      return;
    case "select-inverse": {
      const next = inverseIds(state.doc.pages, selected);
      if (!next.length) note(dispatch, "Nothing to invert");
      else dispatch({ type: "selectIds", ids: next });
      return;
    }
    case "select-matching": {
      if (!primary) return;
      dispatch({ type: "selectIds", ids: matchingIds(state.doc.pages, primary) });
      return;
    }
    case "select-child": {
      if (primary && locate(state.doc.pages, primary)?.node.type === "text") {
        ctx.focusText();
        return;
      }
      const child = primary ? firstChildId(state.doc.pages, primary) : null;
      if (child) dispatch({ type: "select", id: child });
      return;
    }
    case "select-parent": {
      const parent = primary ? parentOf(state.doc.pages, primary) : null;
      if (parent) dispatch({ type: "select", id: parent });
      return;
    }
    case "sibling-next":
    case "sibling-prev": {
      if (!primary) return;
      const next = siblingId(state.doc.pages, primary, id === "sibling-next" ? 1 : -1);
      if (next) dispatch({ type: "select", id: next });
      return;
    }
    case "duplicate": {
      const dup = duplicateNodes(state.doc.pages, selected);
      if (!dup) note(dispatch, "Nothing to duplicate");
      else applyPages(dispatch, dup.pages, dup.ids);
      return;
    }
    case "rename":
      dispatch({ type: "renameTick" });
      ctx.focusRename();
      return;
    case "toggle-visible":
      applyPages(
        dispatch,
        patchTops(state.doc.pages, selected, (n) => ({ visible: !n.visible })),
        selected,
      );
      return;
    case "toggle-lock":
      applyPages(
        dispatch,
        patchTops(state.doc.pages, selected, (n) => ({ locked: !n.locked })),
        selected,
      );
      return;
    case "copy":
    case "cut": {
      const clips = topmostIds(state.doc.pages, selected)
        .map((sid) => locate(state.doc.pages, sid)?.node)
        .filter((n): n is DesignNode => !!n);
      dispatch({ type: "clipboard", nodes: clips });
      if (id === "cut" && clips.length) {
        applyPages(dispatch, removeIds(state.doc.pages, new Set(clips.map((n) => n.id))), []);
      }
      note(dispatch, id === "cut" ? "Cut" : "Copied");
      return;
    }
    case "paste":
    case "paste-over":
    case "paste-replace": {
      if (!state.clipboard?.length) {
        note(dispatch, "Clipboard is empty");
        return;
      }
      if (id === "paste" && ctx.pasteAt) {
        const pasted = pasteAtPoint(state.doc.pages, state.clipboard, ctx.pasteAt.x, ctx.pasteAt.y);
        if (pasted) applyPages(dispatch, pasted.pages, pasted.ids);
        return;
      }
      const mode = id === "paste-over" ? "over" : id === "paste-replace" ? "replace" : "offset";
      const pasted = pasteNodes(state.doc.pages, state.clipboard, primary, mode);
      if (pasted) applyPages(dispatch, pasted.pages, pasted.ids);
      return;
    }
    case "copy-png":
      void copyPng(state, dispatch).catch(() => note(dispatch, "Could not copy PNG"));
      return;
    case "copy-svg":
      void copyText(svgOf(state), dispatch, "Copied as SVG");
      return;
    case "copy-css":
      void copyText(cssOf(state), dispatch, "Copied as CSS");
      return;
    case "copy-link": {
      if (!primary) {
        note(dispatch, "Select a layer");
        return;
      }
      const link = `${location.origin}${location.pathname}#${encodeURIComponent(state.doc.id)}/${encodeURIComponent(primary)}`;
      void copyText(link, dispatch, "Link copied");
      return;
    }
    case "delete":
      if (selected.length) applyPages(dispatch, removeIds(state.doc.pages, new Set(selected)), []);
      return;
    case "group":
    case "frame-selection": {
      const grouped = groupNodes(state.doc.pages, selected, id === "group" ? "group" : "frame");
      if (!grouped) note(dispatch, id === "group" ? "Select two or more layers" : "Select a layer to frame");
      else applyPages(dispatch, grouped.pages, [grouped.id]);
      return;
    }
    case "ungroup": {
      const flat = ungroupNodes(state.doc.pages, selected);
      if (!flat) note(dispatch, "Select a group or frame");
      else applyPages(dispatch, flat.pages, flat.ids);
      return;
    }
    case "wrap-section": {
      const grouped = groupNodes(state.doc.pages, selected, "frame");
      if (!grouped) {
        note(dispatch, "Select a layer to wrap");
        return;
      }
      applyPages(
        dispatch,
        patchTops(grouped.pages, [grouped.id], { section: true, name: "Section", fill: "#00000000", stroke: "#c45c26", strokeWidth: 1 }),
        [grouped.id],
      );
      note(dispatch, "Wrapped in a section");
      return;
    }
    case "convert-section":
      applyPages(
        dispatch,
        patchTops(state.doc.pages, selected, (node) => ({
          section: true,
          type: "frame",
          name: node.name === "Frame" ? "Section" : node.name,
          fill: node.fill === "#1c1713" ? "#00000000" : node.fill,
          stroke: node.strokeWidth > 0 && node.stroke !== "transparent" ? node.stroke : "#c45c26",
          strokeWidth: node.strokeWidth > 0 ? node.strokeWidth : 1,
        })),
        selected,
      );
      note(dispatch, "Converted to section");
      return;
    case "convert-frame":
      applyPages(
        dispatch,
        patchTops(state.doc.pages, selected, (node) => ({
          section: false,
          contentsHidden: false,
          name: node.name === "Section" ? "Frame" : node.name,
          fill: node.fill === "#00000000" ? "#f6f1ea" : node.fill,
        })),
        selected,
      );
      note(dispatch, "Converted to frame");
      return;
    case "outline-stroke": {
      const outlined = outlineStrokes(state.doc.pages, selected);
      if (!outlined) note(dispatch, "No stroke to outline");
      else applyPages(dispatch, outlined, selected);
      return;
    }
    case "section-contents":
      applyPages(
        dispatch,
        patchTops(state.doc.pages, selected, (node) => (node.section ? { contentsHidden: !node.contentsHidden } : {})),
        selected,
      );
      return;
    case "resize-fit":
      if (primary) applyPages(dispatch, resizeFrameToFit(state.doc.pages, primary), selected);
      return;
    case "forward":
    case "backward":
    case "front":
    case "back":
      if (primary) {
        const dir = id === "forward" ? "forward" : id === "backward" ? "backward" : id === "front" ? "front" : "back";
        applyPages(dispatch, reorderNode(state.doc.pages, primary, dir), selected);
      }
      return;
    case "align-left":
    case "align-right":
    case "align-top":
    case "align-bottom":
    case "align-h":
    case "align-v": {
      const mode = id.replace("align-", "") as "left" | "right" | "top" | "bottom" | "h" | "v";
      const mapped = mode === "h" ? "hcenter" : mode === "v" ? "vcenter" : mode;
      const tops = topmostIds(state.doc.pages, selected);
      if (tops.length < 2) {
        const only = tops[0];
        if (!only) {
          note(dispatch, "Select a layer");
          return;
        }
        const next = alignOne(state.doc.pages, only, mapped);
        if (next === state.doc.pages) note(dispatch, "Align inside a frame");
        else applyPages(dispatch, next, selected);
        return;
      }
      const next = alignNodes(state.doc.pages, selected, mapped);
      if (next === state.doc.pages) note(dispatch, "Select two or more layers");
      else applyPages(dispatch, next, selected);
      return;
    }
    case "flip-h":
      applyPages(dispatch, flipNodes(state.doc.pages, selected, "x"), selected);
      return;
    case "flip-v":
      applyPages(dispatch, flipNodes(state.doc.pages, selected, "y"), selected);
      return;
    case "autolayout": {
      const laid = makeAutoLayout(state.doc.pages, selected);
      if (!laid) {
        note(dispatch, "Select layers to auto layout");
        return;
      }
      applyPages(dispatch, laid.pages, [laid.id]);
      note(dispatch, "Auto layout");
      return;
    }
    case "autolayout-suggest":
      applyPages(dispatch, patchTops(state.doc.pages, selected, { autoLayout: "horizontal" }), selected);
      note(dispatch, "Suggested horizontal auto layout");
      return;
    case "autolayout-remove":
      applyPages(dispatch, patchTops(state.doc.pages, selected, { autoLayout: null }), selected);
      return;
    case "component": {
      const made = createComponent(state.doc.pages, selected);
      if (!made) note(dispatch, "Select a layer");
      else {
        applyPages(dispatch, made.pages, made.ids);
        note(dispatch, "Component created");
      }
      return;
    }
    case "create-variant": {
      const made = createVariant(state.doc.pages, selected);
      if (!made) note(dispatch, "Select a layer");
      else {
        applyPages(dispatch, made.pages, made.ids);
        note(dispatch, made.ids.length > 1 ? "Combined as variants" : "Variant created");
      }
      return;
    }
    case "prop-boolean":
    case "prop-string": {
      const target = selected[0];
      if (!target) {
        note(dispatch, "Select a component or a layer inside one");
        return;
      }
      const made = addComponentProp(state.doc.pages, target, id === "prop-boolean" ? "boolean" : "string");
      if (!made) note(dispatch, "Select a component or a layer inside one");
      else {
        applyPages(dispatch, made.pages, [made.id]);
        note(dispatch, id === "prop-boolean" ? "Boolean property added" : "String property added");
      }
      return;
    }
    case "combine": {
      const combined = makeComponentSet(state.doc.pages, selected);
      if (!combined) note(dispatch, "Select components to combine");
      else {
        applyPages(dispatch, combined.pages, combined.ids);
        note(dispatch, "Combined as variants");
      }
      return;
    }
    case "detach":
      applyPages(
        dispatch,
        patchTops(state.doc.pages, selected, { component: false, instanceOf: undefined, componentSet: undefined }),
        selected,
      );
      note(dispatch, "Detached");
      return;
    case "main-component": {
      const current = selected[0] ? findNode(state.doc.pages, selected[0]) : null;
      const id = current?.instanceOf || findComponent(state.doc.pages);
      if (id) dispatch({ type: "select", id });
      else note(dispatch, "No component yet");
      return;
    }
    case "crop":
      dispatch({ type: "tool", tool: "crop" });
      note(dispatch, "Crop");
      return;
    case "mask": {
      const masked = makeMask(state.doc.pages, selected);
      if (!masked) {
        note(dispatch, "Select a layer to mask");
        return;
      }
      applyPages(dispatch, masked.pages, [masked.id]);
      note(dispatch, "Mask");
      return;
    }
    case "union":
    case "subtract":
    case "intersect":
    case "exclude": {
      const grouped = groupNodes(state.doc.pages, selected, "group");
      if (!grouped) {
        note(dispatch, "Select two or more layers");
        return;
      }
      applyPages(
        dispatch,
        patchTops(grouped.pages, [grouped.id], { booleanOp: id as "union" | "subtract" | "intersect" | "exclude", name: id[0].toUpperCase() + id.slice(1) }),
        [grouped.id],
      );
      note(dispatch, `Grouped as ${id}`);
      return;
    }
    case "flatten":
      applyPages(dispatch, patchTops(state.doc.pages, selected, { flattened: true }), selected);
      note(dispatch, "Flattened");
      return;
    case "bold":
      patchText(state, dispatch, (n) => ({ fontWeight: (n.fontWeight ?? 400) >= 600 ? 400 : 700 }));
      return;
    case "italic":
      patchText(state, dispatch, (n) => ({ italic: !n.italic }));
      return;
    case "underline":
      patchText(state, dispatch, (n) => ({ underline: !n.underline }));
      return;
    case "font-up":
      patchText(state, dispatch, (n) => ({ fontSize: (n.fontSize ?? 16) + 1 }));
      return;
    case "font-down":
      patchText(state, dispatch, (n) => ({ fontSize: Math.max(1, (n.fontSize ?? 16) - 1) }));
      return;
    case "weight-up":
      patchText(state, dispatch, (n) => ({ fontWeight: Math.min(900, (n.fontWeight ?? 400) + 100) }));
      return;
    case "weight-down":
      patchText(state, dispatch, (n) => ({ fontWeight: Math.max(100, (n.fontWeight ?? 400) - 100) }));
      return;
    case "line-up":
      patchText(state, dispatch, (n) => ({ lineHeight: (n.lineHeight ?? (n.fontSize ?? 16) * 1.2) + 1 }));
      return;
    case "line-down":
      patchText(state, dispatch, (n) => ({ lineHeight: Math.max(1, (n.lineHeight ?? (n.fontSize ?? 16) * 1.2) - 1) }));
      return;
    case "track-up":
      patchText(state, dispatch, (n) => ({ letterSpacing: (n.letterSpacing ?? 0) + 0.5 }));
      return;
    case "track-down":
      patchText(state, dispatch, (n) => ({ letterSpacing: (n.letterSpacing ?? 0) - 0.5 }));
      return;
    case "zoom-in":
      zoomAround(state, ctx.canvas, state.camera.zoom * 1.25, dispatch);
      return;
    case "zoom-out":
      zoomAround(state, ctx.canvas, state.camera.zoom / 1.25, dispatch);
      return;
    case "zoom-fit":
      zoomBounds(state, ctx.canvas, dispatch);
      return;
    case "zoom-selection":
      zoomBounds(state, ctx.canvas, dispatch, selected);
      return;
    case "zoom-100":
      zoomAround(state, ctx.canvas, 1, dispatch);
      return;
    case "hide-ui":
      dispatch({ type: "ui", patch: { uiHidden: !state.uiHidden } });
      return;
    case "minimize-ui":
      dispatch({ type: "ui", patch: { uiMinimized: !state.uiMinimized } });
      return;
    case "outline":
      dispatch({ type: "ui", patch: { outline: !state.outline } });
      return;
    case "pixel-preview":
      dispatch({ type: "ui", patch: { pixelPreview: !state.pixelPreview } });
      return;
    case "snap":
      dispatch({ type: "ui", patch: { snapPixels: !state.snapPixels } });
      note(dispatch, state.snapPixels ? "Pixel snap off" : "Pixel snap on");
      return;
    case "cursors":
      dispatch({ type: "ui", patch: { showCursors: !state.showCursors } });
      return;
    case "guides":
      dispatch({ type: "ui", patch: { showGuides: !state.showGrid, showGrid: !state.showGrid } });
      note(dispatch, state.showGrid ? "Grid guides hidden" : "Grid guides shown");
      return;
    case "grid":
      dispatch({ type: "ui", patch: { showGrid: !state.showGrid } });
      note(dispatch, state.showGrid ? "Grid hidden" : "Grid shown");
      return;
    case "rulers":
      dispatch({ type: "ui", patch: { showRulers: !state.showRulers } });
      note(dispatch, state.showRulers ? "Rulers hidden" : "Rulers shown");
      return;
    case "layers":
      dispatch({ type: "ui", patch: { leftPanel: "layers", uiMinimized: false } });
      return;
    case "assets":
      dispatch({ type: "ui", patch: { leftPanel: "assets", uiMinimized: false } });
      return;
    case "libraries":
      dispatch({ type: "ui", patch: { leftPanel: "libraries", uiMinimized: false } });
      return;
    case "dev":
      dispatch({ type: "ui", patch: { devMode: !state.devMode } });
      return;
    case "prototype":
      dispatch({ type: "ui", patch: { rightTab: state.rightTab === "design" ? "prototype" : "design" } });
      return;
    case "preview":
    case "present": {
      const on = !state.presenting;
      dispatch({
        type: "ui",
        patch: {
          presenting: on,
          uiHidden: on,
          presentFrameId: on ? rootFrameId(state.doc.pages, state.doc.selectedId) : state.presentFrameId,
        },
      });
      return;
    }
    case "export":
      dispatch({ type: "toggleExport" });
      return;
    case "comments-toggle":
      dispatch({ type: "ui", patch: { showComments: !state.showComments } });
      return;
    case "place-image":
      ctx.placeImage();
      return;
    default:
      break;
  }

  if (id.startsWith("opacity:")) {
    const digit = id.split(":")[1];
    const buffer = opacityBuffer(digit);
    const value = buffer.length >= 2 ? Number(buffer) / 100 : digit === "0" ? 1 : Number(digit) / 10;
    applyPages(dispatch, patchTops(state.doc.pages, selected, { opacity: Math.min(1, Math.max(0, value)) }), selected);
    note(dispatch, `${Math.round(Math.min(1, value) * 100)}% opacity`);
    return;
  }
  if (id.startsWith("nudge:")) {
    const [, size, arrow] = id.split(":");
    const dist = size === "big" ? 10 : 1;
    const dx = arrow === "ArrowLeft" ? -dist : arrow === "ArrowRight" ? dist : 0;
    const dy = arrow === "ArrowUp" ? -dist : arrow === "ArrowDown" ? dist : 0;
    applyPages(dispatch, nudgeNodes(state.doc.pages, selected, dx, dy, state.snapPixels), selected, !repeat);
    return;
  }
  if (id.startsWith("pan:")) {
    const [, size, arrow] = id.split(":");
    const dist = size === "big" ? 240 : 48;
    const camera = { ...state.camera };
    if (arrow === "ArrowLeft") camera.x += dist;
    if (arrow === "ArrowRight") camera.x -= dist;
    if (arrow === "ArrowUp") camera.y += dist;
    if (arrow === "ArrowDown") camera.y -= dist;
    dispatch({ type: "camera", camera });
  }
}

let opacityDigits = "";
let opacityTimer = 0;
function opacityBuffer(digit: string): string {
  opacityDigits = (opacityDigits + digit).slice(-2);
  window.clearTimeout(opacityTimer);
  opacityTimer = window.setTimeout(() => {
    opacityDigits = "";
  }, 500);
  const value = opacityDigits;
  if (opacityDigits.length >= 2) opacityDigits = "";
  return value;
}
