import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import { seedCollaborators, seedDocument, seedSources } from "./data";
import { findNode, insertChild, removeNode, uid, updateNode } from "./lib/id";
import type {
  ChatMessage,
  Collaborator,
  CommentPin,
  DesignNode,
  DocumentState,
  ModeId,
  PhotoFilters,
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
}

type Action =
  | { type: "mode"; mode: ModeId }
  | { type: "tool"; tool: ToolId }
  | { type: "select"; id: string | null }
  | { type: "patch"; id: string; patch: Partial<DesignNode> }
  | { type: "add"; parentId: string | null; node: DesignNode }
  | { type: "remove"; id: string }
  | { type: "camera"; camera: Partial<StudioState["camera"]> }
  | { type: "rename"; name: string }
  | { type: "comment"; pin: CommentPin }
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
  | { type: "moveCollab"; id: string; x: number; y: number }
  | { type: "nudgeCollabs" }
  | { type: "playTick" }
  | { type: "filters"; id: string; filters: Partial<PhotoFilters> };

const seeded = seedDocument();

const initial: StudioState = {
  mode: "vector",
  tool: "select",
  doc: { name: seeded.name, pages: seeded.pages, selectedId: seeded.pages[0]?.id ?? null, comments: [] },
  camera: { x: -40, y: -20, zoom: 0.55 },
  collaborators: seedCollaborators,
  sources: seedSources,
  sourceOpen: true,
  exportOpen: false,
  settingsOpen: false,
  playing: false,
  playhead: 0,
  chat: [],
  artboardHtml: null,
  apiKey: "",
  busy: false,
};

function reducer(state: StudioState, action: Action): StudioState {
  switch (action.type) {
    case "mode":
      return {
        ...state,
        mode: action.mode,
        tool: action.mode === "photo" ? "select" : state.tool,
      };
    case "tool":
      return { ...state, tool: action.tool };
    case "select":
      return { ...state, doc: { ...state.doc, selectedId: action.id } };
    case "patch":
      return { ...state, doc: { ...state.doc, pages: updateNode(state.doc.pages, action.id, action.patch) } };
    case "add":
      return {
        ...state,
        doc: {
          ...state.doc,
          pages: insertChild(state.doc.pages, action.parentId, action.node),
          selectedId: action.node.id,
        },
      };
    case "remove":
      return {
        ...state,
        doc: {
          ...state.doc,
          pages: removeNode(state.doc.pages, action.id),
          selectedId: state.doc.selectedId === action.id ? null : state.doc.selectedId,
        },
      };
    case "camera":
      return { ...state, camera: { ...state.camera, ...action.camera } };
    case "rename":
      return { ...state, doc: { ...state.doc, name: action.name } };
    case "comment":
      return { ...state, doc: { ...state.doc, comments: [...state.doc.comments, action.pin] } };
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
    case "moveCollab":
      return {
        ...state,
        collaborators: state.collaborators.map((c) => (c.id === action.id ? { ...c, x: action.x, y: action.y } : c)),
      };
    case "nudgeCollabs":
      return {
        ...state,
        collaborators: state.collaborators.map((c) => ({
          ...c,
          x: c.x + (Math.random() - 0.5) * 18,
          y: c.y + (Math.random() - 0.5) * 18,
        })),
      };
    case "playTick":
      return { ...state, playhead: (state.playhead + 0.08) % 8 };
    case "filters": {
      const node = findNode(state.doc.pages, action.id);
      const filters = { ...(node?.filters ?? defaultFilters()), ...action.filters };
      return { ...state, doc: { ...state.doc, pages: updateNode(state.doc.pages, action.id, { filters }) } };
    }
    default:
      return state;
  }
}

export function defaultFilters(): PhotoFilters {
  return { exposure: 0, contrast: 0, saturation: 0, temperature: 0, highlights: 0, shadows: 0 };
}

const Ctx = createContext<{ state: StudioState; dispatch: Dispatch<Action> } | null>(null);

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
