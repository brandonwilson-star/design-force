import { uid } from "./id";
import type { ColorStyle, DesignNode, DesignVariable, DocumentState, NodeType } from "../types";

const NODE_TYPES = new Set<NodeType>(["page", "frame", "rect", "ellipse", "text", "image", "path", "group", "clip", "comp", "annot"]);

export function finite(value: unknown, fallback = 0) {
  if (typeof value === "string" && value.trim() === "") return fallback;
  if (value == null) return fallback;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function asType(value: unknown): NodeType {
  const lower = String(value || "").toLowerCase().replace(/[\s_-]/g, "");
  if (NODE_TYPES.has(lower as NodeType)) return lower as NodeType;
  if (lower === "rectangle" || lower === "roundedrectangle" || lower === "shape") return "rect";
  if (lower === "circle" || lower === "oval") return "ellipse";
  if (lower === "bitmap" || lower === "picture") return "image";
  if (lower === "line" || lower === "vector" || lower === "polygon" || lower === "star" || lower === "triangle") return "path";
  if (lower.includes("text")) return "text";
  if (lower.includes("ellipse")) return "ellipse";
  if (lower.includes("group") || lower === "booleanoperation" || lower === "bool") return "group";
  if (lower.includes("image")) return "image";
  if (lower === "canvas" || lower === "document" || lower === "artboard") return "frame";
  return "frame";
}

export function channel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

export function rgbaHex(red: number, green: number, blue: number, alpha = 1) {
  const base = `#${channel(red)}${channel(green)}${channel(blue)}`;
  if (alpha >= 0.999) return base;
  return `${base}${channel(alpha * 255)}`;
}

export function unitColor(color: unknown, alpha?: number): string {
  if (typeof color === "string" && color.trim()) return applyAlpha(color.trim(), alpha);
  if (!color || typeof color !== "object") return "#00000000";
  const record = color as Record<string, unknown>;
  const red = finite(record.r ?? record.red);
  const green = finite(record.g ?? record.green);
  const blue = finite(record.b ?? record.blue);
  const ownAlpha = alpha ?? finite(record.a ?? record.alpha, 1);
  const scale = red > 1 || green > 1 || blue > 1 ? 1 : 255;
  const normalAlpha = ownAlpha > 1 ? ownAlpha / 255 : ownAlpha;
  return rgbaHex(red * scale, green * scale, blue * scale, normalAlpha);
}

export function applyAlpha(color: string, alpha?: number) {
  if (alpha == null || alpha >= 0.999) return color;
  const hex = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return color;
  return `${hex}${channel(alpha * 255)}`;
}

export function completeNode(input: Partial<DesignNode> & Pick<DesignNode, "name"> & { type?: DesignNode["type"] | string }): DesignNode {
  const node: DesignNode = {
    id: input.id || uid(),
    type: asType(input.type),
    name: input.name || "Layer",
    x: finite(input.x),
    y: finite(input.y),
    w: Math.max(1, finite(input.w, 100)),
    h: Math.max(1, finite(input.h, 100)),
    rotation: finite(input.rotation),
    opacity: input.opacity == null ? 1 : Math.min(1, Math.max(0, finite(input.opacity, 1))),
    visible: input.visible !== false,
    locked: input.locked === true,
    fill: input.fill || "#00000000",
    stroke: input.stroke && input.stroke !== "none" ? input.stroke : "transparent",
    strokeWidth: Math.max(0, finite(input.strokeWidth)),
    radius: Math.max(0, finite(input.radius)),
    children: [],
  };
  if (input.text != null) node.text = String(input.text);
  if (input.fontSize) node.fontSize = finite(input.fontSize, 16);
  if (input.fontWeight) node.fontWeight = finite(input.fontWeight, 400);
  if (input.letterSpacing != null) node.letterSpacing = finite(input.letterSpacing);
  if (input.lineHeight != null) node.lineHeight = finite(input.lineHeight);
  if (input.imageDataUrl) node.imageDataUrl = input.imageDataUrl;
  if (input.component) node.component = true;
  if (input.variantName) node.variantName = input.variantName;
  if (input.componentSet) node.componentSet = input.componentSet;
  if (input.instanceOf) node.instanceOf = input.instanceOf;
  if (input.section) node.section = true;
  if (input.shape) node.shape = input.shape;
  if (input.sides) node.sides = input.sides;
  if (input.vector?.points?.length) {
    node.vector = {
      points: input.vector.points.map((point) => ({ x: finite(point.x), y: finite(point.y) })),
      closed: !!input.vector.closed,
    };
  }
  if (input.autoLayout) node.autoLayout = input.autoLayout;
  if (input.gap != null) node.gap = finite(input.gap);
  if (input.padX != null) node.padX = finite(input.padX);
  if (input.padY != null) node.padY = finite(input.padY);
  if (input.fillKind) node.fillKind = input.fillKind;
  if (input.gradientFrom) node.gradientFrom = input.gradientFrom;
  if (input.gradientTo) node.gradientTo = input.gradientTo;
  if (input.booleanOp) node.booleanOp = input.booleanOp;
  node.children = (input.children ?? []).map((child) => completeNode(child));
  return node;
}

export interface ImportSheet {
  name: string;
  nodes: DesignNode[];
}

export function packDocument(
  name: string,
  sheets: ImportSheet[],
  extra?: { colorStyles?: ColorStyle[]; variables?: DesignVariable[] },
): DocumentState {
  const pages = sheets.length ? sheets : [{ name: "Page 1", nodes: [] }];
  const ids = pages.map(() => uid());
  const first = pages[0].nodes;
  return {
    id: uid(),
    name: name || "Imported file",
    pages: first,
    selectedId: first[0]?.id ?? null,
    selectedIds: first[0] ? [first[0].id] : [],
    comments: [],
    colorStyles: extra?.colorStyles ?? [],
    textStyles: [],
    developPresets: [],
    variables: extra?.variables ?? [],
    sheets: pages.map((sheet, index) => ({ id: ids[index], name: sheet.name || `Page ${index + 1}`, nodes: sheet.nodes })),
    activeSheetId: ids[0],
  };
}

export function rootsOf(nodes: DesignNode[]) {
  const childIds = new Set<string>();
  const visit = (list: DesignNode[]) => {
    for (const node of list) {
      for (const child of node.children ?? []) childIds.add(child.id);
      if (node.children?.length) visit(node.children);
    }
  };
  visit(nodes);
  const roots = nodes.filter((node) => node.id && !childIds.has(node.id));
  return roots.length ? roots : nodes;
}
