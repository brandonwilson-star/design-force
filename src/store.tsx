import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import { seedDocument, seedSources } from "./data";
import { sequenceEnd } from "./lib/craft";
import { findNode, insertChild, removeNode, uid, updateNode } from "./lib/id";
import { constrainChildren } from "./lib/scene";
import type {
  ChatMessage,
  Collaborator,
  ColorStyle,
  CommentPin,
  DesignNode,
  DevelopPreset,
  DocumentState,
  ModeId,
  PhotoFilters,
  ShareAccess,
  SourceItem,
  ToolId,
} from "./types";

export interface StudioState {
  mode: ModeId;
  tool: ToolId;
  doc: DocumentState;
  camera: { x: number; y: number; zoom: number };
  collaborators: Collaborator[];
  sources: SourceItem[];
  sourceOpen: boolean;
  exportOpen: boolean;
  settingsOpen: boolean;
  playing: boolean;
  playhead: number;
  chat: ChatMessage[];
  artboardHtml: string | null;
  apiKey: string;
  busy: boolean;
  shortcutsOpen: boolean;
  paletteOpen: boolean;
  uiHidden: boolean;
  uiMinimized: boolean;
  showComments: boolean;
  outline: boolean;
  pixelPreview: boolean;
  snapPixels: boolean;
  showCursors: boolean;
  showRulers: boolean;
  showGuides: boolean;
  showGrid: boolean;
  compareDevelop: boolean;
  leftPanel: "layers" | "assets" | "libraries";
  rightTab: "design" | "prototype";
  devMode: boolean;
  presenting: boolean;
  presentFrameId: string | null;
  shareOpen: boolean;
  shareAccess: ShareAccess;
  spacePan: boolean;
  activeCommentId: string | null;
  note: string;
  clipboard: DesignNode[] | null;
  past: DocSnap[];
  future: DocSnap[];
  renameTick: number;
}

interface DocSnap {
  name: string;
  pages: DesignNode[];
  selectedId: string | null;
  selectedIds: string[];
  comments: CommentPin[];
  colorStyles: ColorStyle[];
  textStyles: DocumentState["textStyles"];
  developPresets: DevelopPreset[];
  variables: DocumentState["variables"];
  sheets: DocumentState["sheets"];
  activeSheetId: string;
}

export type Action =
  | { type: "mode"; mode: ModeId }
  | { type: "tool"; tool: ToolId }
  | { type: "select"; id: string | null; shift?: boolean }
  | { type: "selectIds"; ids: string[] }
  | { type: "patch"; id: string; patch: Partial<DesignNode>; history?: boolean }
  | { type: "replaceDoc"; pages: DesignNode[]; selectedIds: string[]; history?: boolean }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "checkpoint" }
  | { type: "clipboard"; nodes: DesignNode[] | null }
  | { type: "ui"; patch: Partial<StudioState> }
  | { type: "note"; note: string }
  | { type: "renameTick" }
  | { type: "add"; parentId: string | null; node: DesignNode }
  | { type: "remove"; id: string }
  | { type: "camera"; camera: Partial<StudioState["camera"]> }
  | { type: "rename"; name: string }
  | { type: "openDocument"; doc: DocumentState }
  | { type: "comment"; pin: CommentPin }
  | { type: "patchComment"; id: string; body: string; history?: boolean }
  | { type: "commentPatch"; id: string; patch: Partial<CommentPin>; history?: boolean }
  | { type: "sheet"; id: string }
  | { type: "addSheet" }
  | { type: "renameSheet"; id: string; name: string }
  | { type: "duplicateSheet"; id: string }
  | { type: "deleteSheet"; id: string }
  | { type: "reorderSheet"; id: string; index: number }
  | { type: "style"; style: ColorStyle }
  | { type: "variables"; variables: DocumentState["variables"] }
  | { type: "developPreset"; preset: DevelopPreset }
  | { type: "splitPage"; id: string }
  | { type: "toggleSource" }
  | { type: "toggleExport" }
  | { type: "toggleSettings" }
  | { type: "addSource"; source: SourceItem }
  | { type: "removeSource"; id: string }
  | { type: "playhead"; t: number }
  | { type: "playing"; playing: boolean }
  | { type: "chat"; message: ChatMessage }
  | { type: "artboard"; html: string | null }
  | { type: "apiKey"; apiKey: string }
  | { type: "busy"; busy: boolean }
  | { type: "peers"; peers: Collaborator[] }
  | { type: "playTick" }
  | { type: "filters"; id: string; filters: Partial<PhotoFilters> };

const seeded = seedDocument();
const firstSheetId = "page-1";

const initial: StudioState = {
  mode: "design",
  tool: "select",
  doc: {
    id: "file-northlight",
    name: seeded.name,
    pages: seeded.pages,
    selectedId: seeded.pages[0]?.id ?? null,
    selectedIds: seeded.pages[0] ? [seeded.pages[0].id] : [],
    comments: [],
    colorStyles: [
      { id: "style-pink", name: "Pink", value: "#f9dada" },
      { id: "style-ink", name: "Dark purple", value: "#17152d" },
    ],
    textStyles: [],
    developPresets: [],
    variables: [],
    sheets: [{ id: firstSheetId, name: "Page 1", nodes: seeded.pages }],
    activeSheetId: firstSheetId,
  },
  camera: { x: -40, y: -20, zoom: 0.55 },
  collaborators: [],
  sources: seedSources,
  sourceOpen: false,
  exportOpen: false,
  settingsOpen: false,
  playing: false,
  playhead: 0,
  chat: [],
  artboardHtml: null,
  apiKey: "",
  busy: false,
  shortcutsOpen: false,
  paletteOpen: false,
  uiHidden: false,
  uiMinimized: false,
  showComments: true,
  outline: false,
  pixelPreview: false,
  snapPixels: true,
  showCursors: true,
  showRulers: true,
  showGuides: false,
  showGrid: true,
  compareDevelop: false,
  leftPanel: "layers",
  rightTab: "design",
  devMode: false,
  presenting: false,
  presentFrameId: null,
  shareOpen: false,
  activeCommentId: null,
  shareAccess: "edit",
  spacePan: false,
  note: "",
  clipboard: null,
  past: [],
  future: [],
  renameTick: 0,
};

function syncDoc(doc: DocumentState): DocumentState {
  const active = doc.activeSheetId || doc.sheets?.[0]?.id || "page-1";
  const sheets = doc.sheets?.length ? doc.sheets : [{ id: active, name: "Page 1", nodes: doc.pages }];
  return {
    ...doc,
    id: doc.id || "file-northlight",
    activeSheetId: active,
    colorStyles: doc.colorStyles ?? [],
    textStyles: doc.textStyles ?? [],
    developPresets: doc.developPresets ?? [],
    variables: doc.variables ?? [],
    sheets: sheets.map((sheet) => (sheet.id === active ? { ...sheet, nodes: doc.pages } : sheet)),
  };
}

function snap(doc: DocumentState): DocSnap {
  const synced = syncDoc(doc);
  return {
    name: synced.name,
    pages: structuredClone(synced.pages),
    selectedId: synced.selectedId,
    selectedIds: [...synced.selectedIds],
    comments: structuredClone(synced.comments),
    colorStyles: structuredClone(synced.colorStyles),
    textStyles: structuredClone(synced.textStyles),
    developPresets: structuredClone(synced.developPresets),
    variables: structuredClone(synced.variables),
    sheets: structuredClone(synced.sheets),
    activeSheetId: synced.activeSheetId,
  };
}

function commit(state: StudioState, doc: DocumentState, record = true): StudioState {
  const next = syncDoc(doc);
  if (!record) return { ...state, doc: next };
  return { ...state, doc: next, past: [...state.past, snap(state.doc)].slice(-100), future: [] };
}

function reducer(state: StudioState, action: Action): StudioState {
  switch (action.type) {
    case "mode":
      return {
        ...state,
        mode: action.mode,
        tool: action.mode === "photo" ? "brush" : action.mode === "vector" ? "pen" : action.mode === "ai" ? "sparkles" : "select",
      };
    case "tool":
      return { ...state, tool: action.tool };
    case "select": {
      let ids = state.doc.selectedIds;
      if (action.shift && action.id) {
        ids = ids.includes(action.id) ? ids.filter((id) => id !== action.id) : [...ids, action.id];
      } else {
        ids = action.id ? [action.id] : [];
      }
      return { ...state, doc: { ...state.doc, selectedIds: ids, selectedId: ids.at(-1) ?? null } };
    }
    case "selectIds":
      return { ...state, doc: { ...state.doc, selectedIds: action.ids, selectedId: action.ids.at(-1) ?? null } };
    case "patch": {
      const current = findNode(state.doc.pages, action.id);
      let patch = action.patch;
      if (current && current.children.length && patch.children == null && (patch.w != null || patch.h != null)) {
        const w = patch.w ?? current.w;
        const h = patch.h ?? current.h;
        if (w !== current.w || h !== current.h) patch = { ...patch, children: constrainChildren(current, w, h) };
      }
      return commit(state, { ...state.doc, pages: updateNode(state.doc.pages, action.id, patch) }, action.history !== false);
    }
    case "replaceDoc":
      return commit(
        state,
        {
          ...state.doc,
          pages: action.pages,
          selectedIds: action.selectedIds,
          selectedId: action.selectedIds.at(-1) ?? null,
        },
        action.history !== false,
      );
    case "undo": {
      const prev = state.past.at(-1);
      if (!prev) return state;
      return {
        ...state,
        past: state.past.slice(0, -1),
        future: [snap(state.doc), ...state.future].slice(0, 100),
        doc: { ...state.doc, ...prev },
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        future: state.future.slice(1),
        past: [...state.past, snap(state.doc)].slice(-100),
        doc: { ...state.doc, ...next },
      };
    }
    case "checkpoint":
      return { ...state, past: [...state.past, snap(state.doc)].slice(-100), future: [] };
    case "clipboard":
      return { ...state, clipboard: action.nodes };
    case "ui":
      return { ...state, ...action.patch };
    case "note":
      return { ...state, note: action.note };
    case "renameTick":
      return { ...state, renameTick: state.renameTick + 1 };
    case "add":
      return commit(state, {
        ...state.doc,
        pages: insertChild(state.doc.pages, action.parentId, action.node),
        selectedId: action.node.id,
        selectedIds: [action.node.id],
      });
    case "remove":
      return commit(state, {
        ...state.doc,
        pages: removeNode(state.doc.pages, action.id),
        selectedIds: state.doc.selectedIds.filter((id) => id !== action.id),
        selectedId: state.doc.selectedId === action.id ? null : state.doc.selectedId,
      });
    case "camera":
      return { ...state, camera: { ...state.camera, ...action.camera } };
    case "rename":
      return commit(state, { ...state.doc, name: action.name });
    case "openDocument":
      return {
        ...state,
        mode: "design",
        tool: "select",
        doc: syncDoc(action.doc),
        past: [],
        future: [],
        camera: { x: -40, y: -20, zoom: 0.55 },
        presenting: false,
        presentFrameId: null,
      };
    case "comment":
      return commit(state, {
        ...state.doc,
        comments: [...state.doc.comments, { ...action.pin, sheetId: action.pin.sheetId ?? state.doc.activeSheetId }],
      });
    case "patchComment":
      return commit(
        state,
        {
          ...state.doc,
          comments: state.doc.comments.map((pin) => (pin.id === action.id ? { ...pin, body: action.body } : pin)),
        },
        action.history !== false,
      );
    case "commentPatch":
      return commit(
        state,
        {
          ...state.doc,
          comments: state.doc.comments.map((pin) => (pin.id === action.id ? { ...pin, ...action.patch } : pin)),
        },
        action.history !== false,
      );
    case "sheet": {
      const saved = syncDoc(state.doc);
      const next = saved.sheets.find((sheet) => sheet.id === action.id);
      if (!next || next.id === saved.activeSheetId) return state;
      return commit(state, {
        ...saved,
        activeSheetId: next.id,
        pages: next.nodes,
        selectedId: next.nodes[0]?.id ?? null,
        selectedIds: next.nodes[0] ? [next.nodes[0].id] : [],
      });
    }
    case "addSheet": {
      const saved = syncDoc(state.doc);
      const id = uid("page");
      const sheet = { id, name: nextPageName(saved.sheets), nodes: [] as DesignNode[] };
      return commit(state, {
        ...saved,
        sheets: [...saved.sheets, sheet],
        activeSheetId: id,
        pages: [],
        selectedId: null,
        selectedIds: [],
      });
    }
    case "renameSheet": {
      const name = action.name.trim();
      if (!name) return state;
      const saved = syncDoc(state.doc);
      return commit(state, {
        ...saved,
        sheets: saved.sheets.map((sheet) => (sheet.id === action.id ? { ...sheet, name } : sheet)),
      });
    }
    case "duplicateSheet": {
      const saved = syncDoc(state.doc);
      const source = saved.sheets.find((sheet) => sheet.id === action.id);
      if (!source) return state;
      const id = uid("page");
      const nodes = copyNodes(source.nodes);
      const copy = { id, name: `Copy of ${source.name}`, nodes };
      const index = saved.sheets.findIndex((sheet) => sheet.id === source.id);
      const sheets = [...saved.sheets];
      sheets.splice(index + 1, 0, copy);
      const comments = [
        ...saved.comments,
        ...saved.comments
          .filter((pin) => (pin.sheetId ?? firstSheetId) === source.id)
          .map((pin) => ({ ...structuredClone(pin), id: uid("c"), sheetId: id })),
      ];
      return commit(state, {
        ...saved,
        sheets,
        comments,
        activeSheetId: id,
        pages: nodes,
        selectedId: nodes[0]?.id ?? null,
        selectedIds: nodes[0] ? [nodes[0].id] : [],
      });
    }
    case "deleteSheet": {
      const saved = syncDoc(state.doc);
      if (saved.sheets.length < 2) return state;
      const index = saved.sheets.findIndex((sheet) => sheet.id === action.id);
      if (index < 0) return state;
      const sheets = saved.sheets.filter((sheet) => sheet.id !== action.id);
      const comments = saved.comments.filter((pin) => (pin.sheetId ?? firstSheetId) !== action.id);
      const next = saved.activeSheetId === action.id ? sheets[Math.max(0, index - 1)] ?? sheets[0] : sheets.find((sheet) => sheet.id === saved.activeSheetId) ?? sheets[0];
      return commit(state, {
        ...saved,
        sheets,
        comments,
        activeSheetId: next.id,
        pages: next.nodes,
        selectedId: next.nodes[0]?.id ?? null,
        selectedIds: next.nodes[0] ? [next.nodes[0].id] : [],
      });
    }
    case "reorderSheet": {
      const saved = syncDoc(state.doc);
      const from = saved.sheets.findIndex((sheet) => sheet.id === action.id);
      const to = Math.max(0, Math.min(saved.sheets.length - 1, action.index));
      if (from < 0 || from === to) return state;
      const sheets = [...saved.sheets];
      const [item] = sheets.splice(from, 1);
      sheets.splice(to, 0, item);
      return commit(state, { ...saved, sheets });
    }
    case "style":
      return commit(state, { ...state.doc, colorStyles: [...state.doc.colorStyles, action.style] });
    case "variables":
      return commit(state, { ...state.doc, variables: action.variables });
    case "developPreset":
      return commit(state, { ...state.doc, developPresets: [...(state.doc.developPresets ?? []), action.preset] });
    case "splitPage": {
      const saved = syncDoc(state.doc);
      const page = saved.pages.find((item) => item.id === action.id);
      if (!page || saved.pages.length < 2) return state;
      const rest = saved.pages.filter((item) => item.id !== page.id);
      return commit(state, {
        ...saved,
        pages: rest,
        selectedId: rest[0]?.id ?? null,
        selectedIds: rest[0] ? [rest[0].id] : [],
        sheets: [
          ...saved.sheets.map((sheet) => (sheet.id === saved.activeSheetId ? { ...sheet, nodes: rest } : sheet)),
          { id: uid("page"), name: page.name, nodes: [structuredClone(page)] },
        ],
      });
    }
    case "toggleSource":
      return { ...state, sourceOpen: !state.sourceOpen };
    case "toggleExport":
      return { ...state, exportOpen: !state.exportOpen };
    case "toggleSettings":
      return { ...state, settingsOpen: !state.settingsOpen };
    case "addSource":
      return { ...state, sources: [action.source, ...state.sources] };
    case "removeSource":
      return { ...state, sources: state.sources.filter((s) => s.id !== action.id) };
    case "playhead":
      return { ...state, playhead: action.t };
    case "playing":
      return { ...state, playing: action.playing };
    case "chat":
      return { ...state, chat: [...state.chat, action.message] };
    case "artboard":
      return { ...state, artboardHtml: action.html };
    case "apiKey":
      return { ...state, apiKey: action.apiKey };
    case "busy":
      return { ...state, busy: action.busy };
    case "peers":
      return { ...state, collaborators: action.peers };
    case "playTick":
      return { ...state, playhead: (state.playhead + 0.08) % sequenceEnd(state.doc.pages) };
    case "filters": {
      const node = findNode(state.doc.pages, action.id);
      const filters = { ...(node?.filters ?? defaultFilters()), ...action.filters };
      return commit(state, { ...state.doc, pages: updateNode(state.doc.pages, action.id, { filters }) });
    }
    default:
      return state;
  }
}

export function defaultFilters(): PhotoFilters {
  return { exposure: 0, contrast: 0, saturation: 0, temperature: 0, highlights: 0, shadows: 0 };
}

const Ctx = createContext<{ state: StudioState; dispatch: Dispatch<Action> } | null>(null);

export function pageComments(doc: DocumentState) {
  const page = doc.activeSheetId || firstSheetId;
  return doc.comments.filter((pin) => (pin.sheetId ?? firstSheetId) === page);
}

function nextPageName(sheets: { name: string }[]) {
  const used = new Set(sheets.map((sheet) => sheet.name));
  let n = 1;
  while (used.has(`Page ${n}`)) n += 1;
  return `Page ${n}`;
}

function copyNodes(nodes: DesignNode[]): DesignNode[] {
  const map = new Map<string, string>();
  const stamp = (node: DesignNode): DesignNode => {
    const id = uid();
    map.set(node.id, id);
    return { ...structuredClone(node), id, children: node.children.map(stamp) };
  };
  const retarget = (node: DesignNode): DesignNode => ({
    ...node,
    interaction: node.interaction?.targetId
      ? { ...node.interaction, targetId: map.get(node.interaction.targetId) ?? node.interaction.targetId }
      : node.interaction,
    children: node.children.map(retarget),
  });
  return nodes.map(stamp).map(retarget);
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStudio outside provider");
  return ctx;
}

export function selectedNode(state: StudioState): DesignNode | null {
  if (!state.doc.selectedId) return null;
  return findNode(state.doc.pages, state.doc.selectedId);
}

export { uid };
