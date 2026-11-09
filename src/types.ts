export type ModeId =
  | "design"
  | "photo"
  | "vector"
  | "motion"
  | "film"
  | "ai"
  | "prototype"
  | "layout"
  | "pdf";

export type ToolId =
  | "select"
  | "scale"
  | "frame"
  | "section"
  | "rect"
  | "ellipse"
  | "line"
  | "pen"
  | "pencil"
  | "text"
  | "slice"
  | "image"
  | "crop"
  | "brush"
  | "comment"
  | "hand"
  | "eyedropper"
  | "zoom"
  | "stamp"
  | "eraser"
  | "bucket"
  | "wand"
  | "flow"
  | "hotspot"
  | "direct"
  | "camera"
  | "razor"
  | "slip"
  | "reposition"
  | "magnet"
  | "audio"
  | "expand"
  | "history"
  | "sparkles"
  | "component"
  | "polygon"
  | "star";

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

export interface LayoutGrid {
  kind: "grid" | "columns";
  size: number;
  count: number;
  gutter: number;
  margin: number;
  color: string;
  opacity: number;
}

export interface PrototypeInteraction {
  trigger: "click" | "hover" | "drag" | "after-delay";
  action: "navigate" | "swap" | "overlay" | "back";
  targetId: string;
  duration: number;
  delay?: number;
  easing?: "ease-out" | "ease-in" | "linear" | "ease-in-out";
  animation?: "smart" | "dissolve" | "move" | "instant";
  preserveScroll?: boolean;
}

export interface ColorStyle {
  id: string;
  name: string;
  value: string;
}

export interface TextStyle {
  id: string;
  name: string;
  fontSize: number;
  fontWeight: number;
  fill: string;
  letterSpacing?: number;
  lineHeight?: number;
}

export interface DevelopPreset {
  id: string;
  name: string;
  filters: PhotoFilters;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BrushStroke {
  points: { x: number; y: number }[];
  color: string;
  size: number;
}

export interface DesignSheet {
  id: string;
  name: string;
  nodes: DesignNode[];
}

export type ShareAccess = "view" | "comment" | "edit";

export type ConstraintAxis = "start" | "end" | "center" | "stretch" | "scale";

export type VariableKind = "color" | "number" | "boolean" | "string";

export interface DesignVariable {
  id: string;
  name: string;
  kind: VariableKind;
  value: string;
}

export interface ComponentProp {
  id: string;
  name: string;
  kind: "boolean" | "string";
  targetName: string;
}

export interface NodeBindings {
  fill?: string;
  text?: string;
  visible?: string;
  radius?: string;
  opacity?: string;
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
  italic?: boolean;
  underline?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
  autoLayout?: "horizontal" | "vertical" | "wrap" | null;
  layoutAlign?: string;
  gap?: number;
  padX?: number;
  padY?: number;
  fillKind?: "solid" | "gradient";
  gradientFrom?: string;
  gradientTo?: string;
  blendMode?: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color" | "luminosity";
  layoutGrid?: LayoutGrid | null;
  component?: boolean;
  variantName?: string;
  variantProps?: Record<string, string>;
  componentSet?: string;
  componentProps?: ComponentProp[];
  instanceOf?: string;
  bindings?: NodeBindings;
  interaction?: PrototypeInteraction | null;
  mask?: boolean;
  flattened?: boolean;
  flipX?: boolean;
  flipY?: boolean;
  booleanOp?: "union" | "subtract" | "intersect" | "exclude" | null;
  imageDataUrl?: string;
  filters?: PhotoFilters;
  crop?: CropRect | null;
  strokes?: BrushStroke[];
  effect?: "none" | "blur" | "tint" | "shadow" | "glass";
  constraints?: { horizontal: ConstraintAxis; vertical: ConstraintAxis };
  shape?: "polygon" | "star";
  sides?: number;
  section?: boolean;
  contentsHidden?: boolean;
  vector?: { points: { x: number; y: number }[]; closed: boolean };
  master?: boolean;
  usesMaster?: boolean;
  rating?: number;
  flag?: "pick" | "reject" | null;
  keyframes?: Keyframe[];
  start?: number;
  duration?: number;
  children: DesignNode[];
}

export interface CommentAttachment {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
}

export interface CommentPin {
  id: string;
  x: number;
  y: number;
  author: string;
  body: string;
  resolved: boolean;
  createdAt?: number;
  attachments?: CommentAttachment[];
  sheetId?: string;
}

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  x: number | null;
  y: number | null;
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
  id: string;
  name: string;
  pages: DesignNode[];
  selectedId: string | null;
  selectedIds: string[];
  comments: CommentPin[];
  colorStyles: ColorStyle[];
  textStyles: TextStyle[];
  variables: DesignVariable[];
  developPresets: DevelopPreset[];
  sheets: DesignSheet[];
  activeSheetId: string;
}

export const MODES: {
  id: ModeId;
  label: string;
  short: string;
  blurb: string;
  lineage: string[];
}[] = [
  {
    id: "design",
    label: "Design",
    short: "Design",
    blurb: "Frames, auto layout, components, and the shared canvas.",
    lineage: ["Penpot", "OpenPencil"],
  },
  {
    id: "photo",
    label: "Photo",
    short: "Photo",
    blurb: "Develop, crop, and paint plates on the same frames.",
    lineage: ["PhotoCraft", "LightCraft"],
  },
  {
    id: "vector",
    label: "Vector",
    short: "Vector",
    blurb: "Pen, shapes, and type on the same frames.",
    lineage: ["Penpot", "OpenPencil"],
  },
  {
    id: "motion",
    label: "Motion",
    short: "Motion",
    blurb: "Keyframe the frames and play them back.",
    lineage: ["EffectCraft"],
  },
  {
    id: "film",
    label: "Video",
    short: "Video",
    blurb: "Trim, move, and split the frames into a sequence.",
    lineage: ["FilmCraft"],
  },
  {
    id: "prototype",
    label: "Prototype",
    short: "Prototype",
    blurb: "Connect the frames and present the flow.",
    lineage: ["Penpot"],
  },
  {
    id: "ai",
    label: "AI",
    short: "AI",
    blurb: "Prompt a design or an edit onto the shared canvas.",
    lineage: ["Claude Design"],
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
