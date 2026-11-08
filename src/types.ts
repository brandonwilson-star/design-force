export type ModeId =
  | "vector"
  | "photo"
  | "motion"
  | "film"
  | "layout"
  | "pdf"
  | "ai";

export type ToolId =
  | "select"
  | "frame"
  | "rect"
  | "ellipse"
  | "text"
  | "pen"
  | "image"
  | "crop"
  | "brush"
  | "comment"
  | "hand";

export type NodeType =
  | "page"
  | "frame"
  | "rect"
  | "ellipse"
  | "text"
  | "image"
  | "path"
  | "group"
  | "clip"
  | "comp"
  | "annot";

export interface PhotoFilters {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  highlights: number;
  shadows: number;
}

export interface Keyframe {
  t: number;
  x?: number;
  y?: number;
  opacity?: number;
  rotation?: number;
  scale?: number;
}

export interface DesignNode {
  id: string;
  type: NodeType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  imageDataUrl?: string;
  filters?: PhotoFilters;
  keyframes?: Keyframe[];
  start?: number;
  duration?: number;
  children: DesignNode[];
}

export interface CommentPin {
  id: string;
  x: number;
  y: number;
  author: string;
  body: string;
  resolved: boolean;
}

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  mode: ModeId;
}

export type SourceKind = "file" | "url" | "note" | "repo" | "image";

export interface SourceItem {
  id: string;
  kind: SourceKind;
  title: string;
  excerpt: string;
  content: string;
  addedAt: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  html?: string;
}

export interface DocumentState {
  name: string;
  pages: DesignNode[];
  selectedId: string | null;
  comments: CommentPin[];
}

export const MODES: {
  id: ModeId;
  label: string;
  short: string;
  blurb: string;
  lineage: string[];
}[] = [
  {
    id: "vector",
    label: "Vector & UI",
    short: "Vector",
    blurb: "Frames, components, auto-layout, and real-time collaboration.",
    lineage: ["Penpot", "OpenPencil", "FigCraft"],
  },
  {
    id: "photo",
    label: "Photo & Raster",
    short: "Photo",
    blurb: "Layers, masks, adjustments, and a local photo library.",
    lineage: ["PhotoCraft", "LightCraft"],
  },
  {
    id: "motion",
    label: "Motion & Animation",
    short: "Motion",
    blurb: "Compositions, keyframes, effects, and a render queue.",
    lineage: ["EffectCraft"],
  },
  {
    id: "film",
    label: "Film & Edit",
    short: "Film",
    blurb: "Nonlinear timeline, color, sound, and sequence export.",
    lineage: ["FilmCraft"],
  },
  {
    id: "layout",
    label: "Layout & Print",
    short: "Layout",
    blurb: "Spreads, type, master pages, and press-ready packages.",
    lineage: ["DesignCraft"],
  },
  {
    id: "pdf",
    label: "PDF & Docs",
    short: "PDF",
    blurb: "Read, annotate, combine, split, and secure documents.",
    lineage: ["PdfCraft"],
  },
  {
    id: "ai",
    label: "AI Design",
    short: "AI",
    blurb: "Prompt designs and edits across every mode, grounded in your sources.",
    lineage: ["Claude Design", "ArtCraft Core"],
  },
];

export const UPSTREAM = [
  {
    name: "Penpot",
    url: "https://github.com/penpot/penpot",
    role: "Open-source product design & collaboration (Figma-class).",
  },
  {
    name: "OpenPencil",
    url: "https://github.com/open-pencil/open-pencil",
    role: "AI-native editor that opens .fig / .pen files.",
  },
  {
    name: "ArtCraft",
    url: "https://github.com/storytold/artcraft",
    role: "Orchestration layer for the Crafting Apps.",
  },
  {
    name: "PhotoCraft",
    url: "https://github.com/storytold/photocraft",
    role: "Photoshop-class raster editor.",
  },
  {
    name: "EffectCraft",
    url: "https://github.com/storytold/effectcraft",
    role: "After Effects-class motion & VFX.",
  },
  {
    name: "FilmCraft",
    url: "https://github.com/storytold/filmcraft",
    role: "Premiere-class nonlinear editor.",
  },
  {
    name: "LightCraft",
    url: "https://github.com/storytold/lightcraft",
    role: "Lightroom-class photo library & RAW.",
  },
  {
    name: "DesignCraft",
    url: "https://github.com/storytold/designcraft",
    role: "InDesign-class page layout.",
  },
  {
    name: "PdfCraft",
    url: "https://github.com/storytold/pdfcraft",
    role: "Acrobat-class PDF workbench.",
  },
];
