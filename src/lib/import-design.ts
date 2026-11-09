import { unzipSync } from "fflate";
import { bytesToDataUrl, importFigKiwi, isFigKiwi } from "./import-fig";
import { asType, completeNode, finite, packDocument, rootsOf, unitColor, type ImportSheet } from "./import-nodes";
import { adoptDocument } from "./projects";
import { uid } from "./id";
import type { ColorStyle, DesignNode, DesignVariable, VariableKind } from "../types";

export const IMPORT_ACCEPT = [
  ".fig",
  ".pen",
  ".penpot",
  ".sketch",
  ".svg",
  ".json",
  ".designforce.json",
  ".psd",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".zip",
  "image/*",
  "image/svg+xml",
  "application/json",
].join(",");

export async function importDesignFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.replace(/\.[^.]+$/, "") || "Imported file";
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (isBinaryPsd(bytes)) throw new Error("This Photoshop file is a binary PSD. Export SVG or PNG to import the artwork.");
  if (isPdf(bytes)) throw new Error("PDF import does not recover layers. Export SVG from the design tool instead.");
  if (isZip(bytes)) return importZip(bytes, name);
  if (isFigKiwi(bytes)) return packedFig(name, bytes);
  if (isRaster(bytes, extension, file.type)) return packDocument(name, [{ name: "Page 1", nodes: [rasterNode(name, bytes, file.type || mimeFor(extension))] }]);
  const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("That file is empty.");
  if (/<svg[\s>]/i.test(text)) return packDocument(name, [{ name: "Page 1", nodes: importSvg(text) }]);
  if (text.startsWith("{") || text.startsWith("[")) return importJson(text, name);
  throw new Error("Design Force could not read that file. Import .fig, .pen, .penpot, .sketch, .svg, .json, or an image.");
}

function packedFig(name: string, bytes: Uint8Array) {
  const fig = importFigKiwi(bytes);
  return packDocument(name, fig.sheets, { colorStyles: fig.colorStyles, variables: fig.variables });
}

function importZip(bytes: Uint8Array, name: string) {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("That archive could not be opened.");
  }
  const canvas = findEntry(entries, (path) => path.endsWith("canvas.fig"));
  if (canvas) return packedFig(name, canvas);
  const jsonEntries = Object.entries(entries).filter(([path]) => path.toLowerCase().endsWith(".json"));
  const parsed = jsonEntries.map(([path, data]) => ({ path, value: parseJson(data) }));
  const penpot = parsed.map((entry) => entry.value).map((value) => penpotScene(value)).find((scene) => scene);
  if (penpot) return packDocument(name, penpot.sheets, { colorStyles: penpot.colorStyles, variables: penpot.variables });
  if (parsed.some((entry) => entry.path.endsWith("document.json") || sketchMeta(entry.value))) {
    const sketch = sketchScene(entries, parsed, name);
    if (sketch) return packDocument(name, sketch.sheets, { colorStyles: sketch.colorStyles });
  }
  for (const entry of parsed) {
    if (!entry.value) continue;
    try {
      return importJsonValue(entry.value, name);
    } catch {
      /* Keep looking through the archive. */
    }
  }
  throw new Error("That archive does not contain a .fig canvas, Penpot file, Sketch file, or design JSON.");
}

function importJson(text: string, name: string) {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("That JSON file could not be parsed.");
  }
  return importJsonValue(value, name);
}

function importJsonValue(value: unknown, name: string) {
  const adopted = adoptDocument(value);
  if (adopted && adopted.pages.every((node) => isDesignNode(node))) {
    const sheets = adopted.sheets.map((sheet) => ({ ...sheet, nodes: (sheet.nodes ?? []).map((node) => completeNode(node)) }));
    const active = sheets.find((sheet) => sheet.id === adopted.activeSheetId) ?? sheets[0];
    return { ...adopted, name: adopted.name || name, pages: active?.nodes ?? [], sheets };
  }
  const record = isRecord(value) ? value : {};
  const figma = figmaRest(record, name);
  if (figma) return figma;
  const penpot = penpotScene(value);
  if (penpot) return packDocument(stringOf(record.name) || name, penpot.sheets, { colorStyles: penpot.colorStyles, variables: penpot.variables });
  const nodes = designNodesOf(record);
  if (nodes) {
    return packDocument(stringOf(record.name) || name, [{ name: "Page 1", nodes: rootsOf(nodes).map((node) => completeNode(node)) }]);
  }
  const layers = photocraft(record);
  if (layers) return packDocument(stringOf(record.name) || name, [{ name: "Page 1", nodes: layers }]);
  const tokens = tokenScene(value);
  if (tokens) return packDocument(name, tokens.sheets, { variables: tokens.variables });
  if (isRecord(value) && (value.children || value.shapes || value.layers)) {
    const node = foreignNode(value);
    if (node) return packDocument(stringOf(record.name) || name, [{ name: "Page 1", nodes: [node] }]);
  }
  throw new Error("That JSON file does not look like a design document.");
}

function designNodesOf(record: Record<string, unknown>) {
  const list = [record.nodes, record.pages, record.layers].find(Array.isArray) as unknown[] | undefined;
  if (!list?.length) return null;
  if (list.every((item) => isDesignNode(item))) return list as DesignNode[];
  const pages = list.filter(isRecord);
  if (pages.every((page) => Array.isArray(page.objects) && (page.objects as unknown[]).every(isDesignNode))) {
    return pages.flatMap((page) => rootsOf(page.objects as DesignNode[]).map((node) => completeNode({ ...node, name: node.name || stringOf(page.name) })));
  }
  return null;
}

function isDesignNode(value: unknown): value is DesignNode {
  return isRecord(value) && typeof value.type === "string" && typeof value.w === "number" && Array.isArray(value.children);
}

function figmaRest(record: Record<string, unknown>, name: string) {
  const document = isRecord(record.document) ? record.document : record.type === "DOCUMENT" ? record : null;
  if (!document || !Array.isArray(document.children)) return null;
  const canvases = document.children.filter(isRecord).filter((node) => String(node.type || "").toUpperCase() === "CANVAS");
  const sheets = (canvases.length ? canvases : document.children.filter(isRecord)).map((canvas) => ({
    name: stringOf(canvas.name) || "Page",
    nodes: (Array.isArray(canvas.children) ? canvas.children : [canvas]).filter(isRecord).map((node) => figmaNode(node)),
  }));
  if (!sheets.length) return null;
  return packDocument(stringOf(document.name) || stringOf(record.name) || name, sheets);
}

function figmaNode(node: Record<string, unknown>, parent?: { x: number; y: number }): DesignNode {
  const box = isRecord(node.absoluteBoundingBox) ? node.absoluteBoundingBox : {};
  const x = finite(box.x) - (parent?.x ?? 0);
  const y = finite(box.y) - (parent?.y ?? 0);
  const fills = Array.isArray(node.fills) ? node.fills.filter(isRecord) : [];
  const strokes = Array.isArray(node.strokes) ? node.strokes.filter(isRecord) : [];
  const fill = fills.find((paint) => paint.visible !== false);
  const stroke = strokes.find((paint) => paint.visible !== false);
  const style = isRecord(node.style) ? node.style : {};
  const kind = String(node.type || "FRAME").toUpperCase();
  const here = { x: finite(box.x), y: finite(box.y) };
  return completeNode({
    id: stringOf(node.id) || uid(),
    type: kind === "TEXT" ? "text" : kind === "ELLIPSE" ? "ellipse" : kind === "GROUP" || kind === "BOOLEAN_OPERATION" ? "group" : kind === "RECTANGLE" || kind === "LINE" || kind === "VECTOR" || kind === "STAR" || kind === "REGULAR_POLYGON" ? "rect" : "frame",
    name: stringOf(node.name) || "Layer",
    x: parent ? x : finite(box.x),
    y: parent ? y : finite(box.y),
    w: finite(box.width, 100),
    h: finite(box.height, 100),
    opacity: node.opacity == null ? 1 : finite(node.opacity, 1),
    visible: node.visible !== false,
    fill: fill ? unitColor(fill.color, fill.opacity == null ? undefined : finite(fill.opacity, 1)) : "#00000000",
    stroke: stroke ? unitColor(stroke.color) : "transparent",
    strokeWidth: stroke ? finite(node.strokeWeight, 1) : 0,
    radius: finite(node.cornerRadius),
    text: stringOf(node.characters) || undefined,
    fontSize: finite(style.fontSize, kind === "TEXT" ? 16 : 0) || undefined,
    fontWeight: finite(style.fontWeight, 0) || undefined,
    component: kind === "COMPONENT" || kind === "COMPONENT_SET",
    variantName: kind === "COMPONENT" ? stringOf(node.name) : undefined,
    section: kind === "SECTION",
    shape: kind === "STAR" ? "star" : kind === "REGULAR_POLYGON" ? "polygon" : undefined,
    children: (Array.isArray(node.children) ? node.children.filter(isRecord) : []).map((child) => figmaNode(child, here)),
  });
}

interface ForeignScene {
  sheets: ImportSheet[];
  colorStyles: ColorStyle[];
  variables: DesignVariable[];
}

function penpotScene(value: unknown): ForeignScene | null {
  const record = isRecord(value) ? value : null;
  if (!record) return null;
  const data = isRecord(record.data) ? record.data : record;
  const pages = data["pages-index"] || data.pagesIndex;
  if (!isRecord(pages)) {
    if (record.type === "penpot/document" && Array.isArray(record.pages)) {
      const nodes = record.pages.filter(isRecord).flatMap((page) => {
        const objects = Array.isArray(page.objects) ? page.objects.filter(isDesignNode) : [];
        return rootsOf(objects).map((node) => completeNode(node));
      });
      return { sheets: [{ name: stringOf(record.name) || "Page 1", nodes }], colorStyles: [], variables: [] };
    }
    return null;
  }
  const order = Array.isArray(data.pages) ? data.pages.map(String) : Object.keys(pages);
  const sheets = order.filter((id) => isRecord(pages[id])).map((id) => {
    const page = pages[id] as Record<string, unknown>;
    const objects = isRecord(page.objects) ? page.objects : {};
    return { name: stringOf(page.name) || "Page", nodes: penpotPage(objects) };
  });
  const colors = isRecord(data.colors) ? data.colors : {};
  const colorStyles = Object.values(colors).filter(isRecord).map((color) => ({
    id: uid("style"),
    name: stringOf(color.name) || "Color",
    value: stringOf(color.color) || unitColor(color.color),
  }));
  return { sheets, colorStyles, variables: [] };
}

function penpotPage(objects: Record<string, unknown>) {
  const shapes = Object.values(objects).filter(isRecord);
  const byId = new Map(shapes.map((shape) => [stringOf(shape.id), shape]));
  const childIds = new Set<string>();
  for (const shape of shapes) {
    const kids = Array.isArray(shape.shapes) ? shape.shapes : [];
    for (const id of kids) childIds.add(String(id));
  }
  const roots = shapes.filter((shape) => !childIds.has(stringOf(shape.id)));
  const build = (shape: Record<string, unknown>): DesignNode => {
    const kids = (Array.isArray(shape.shapes) ? shape.shapes : []).map(String).map((id) => byId.get(id)).filter(isRecord);
    const fills = Array.isArray(shape.fills) ? shape.fills.filter(isRecord) : [];
    const strokes = Array.isArray(shape.strokes) ? shape.strokes.filter(isRecord) : [];
    const fill = fills.find((item) => item["fill-opacity"] !== 0);
    const stroke = strokes[0];
    const content = penpotText(shape.content);
    const kind = stringOf(shape.type);
    const bool = stringOf(shape["bool-type"]);
    return completeNode({
      id: stringOf(shape.id) || uid(),
      type: kind === "text" ? "text" : kind === "circle" || kind === "ellipse" ? "ellipse" : kind === "group" || kind === "bool" ? "group" : kind === "path" || kind === "svg-raw" ? "path" : kind === "image" ? "image" : "frame",
      name: stringOf(shape.name) || kind || "Layer",
      x: finite(shape.x),
      y: finite(shape.y),
      w: finite(shape.width, 100),
      h: finite(shape.height, 100),
      rotation: finite(shape.rotation),
      opacity: shape.opacity == null ? 1 : finite(shape.opacity, 1),
      visible: shape.hidden !== true,
      fill: fill ? penpotColor(fill["fill-color"], fill["fill-opacity"]) : "#00000000",
      stroke: stroke ? penpotColor(stroke["stroke-color"], stroke["stroke-opacity"]) : "transparent",
      strokeWidth: stroke ? finite(stroke["stroke-width"], 1) : 0,
      radius: finite(shape.rx ?? shape.r1),
      text: content.text,
      fontSize: content.fontSize,
      fontWeight: content.fontWeight,
      component: shape["component-root"] === true || shape.componentRoot === true,
      booleanOp: bool === "difference" ? "subtract" : bool === "intersection" ? "intersect" : bool === "exclude" ? "exclude" : bool === "union" ? "union" : undefined,
      vector: penpotPath(shape),
      children: kids.map(build),
    });
  };
  return roots.filter((shape) => stringOf(shape.id) !== "00000000-0000-0000-0000-000000000000" || shape.shapes).map(build).filter((node) => node.name !== "Root Frame" || node.children.length).flatMap((node) => (node.name === "Root Frame" ? node.children : [node]));
}

function penpotColor(color: unknown, opacity: unknown) {
  const hex = typeof color === "string" ? color : unitColor(color);
  return hex === "#00000000" ? hex : opacity == null ? hex : unitColor(hex, finite(opacity, 1));
}

function penpotText(value: unknown) {
  const parts: string[] = [];
  let fontSize: number | undefined;
  let fontWeight: number | undefined;
  const visit = (node: unknown) => {
    if (!isRecord(node)) return;
    if (typeof node.text === "string") parts.push(node.text);
    if (node["font-size"] != null) fontSize = finite(node["font-size"], 16);
    if (node["font-weight"] != null) fontWeight = finite(node["font-weight"], 400);
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(value);
  return { text: parts.join("") || undefined, fontSize, fontWeight };
}

function penpotPath(shape: Record<string, unknown>) {
  const content = Array.isArray(shape.content) ? shape.content.filter(isRecord) : [];
  const points = content
    .map((command) => {
      const params = isRecord(command.params) ? command.params : command;
      if (params.x == null || params.y == null) return null;
      return { x: finite(params.x), y: finite(params.y) };
    })
    .filter((point): point is { x: number; y: number } => !!point);
  if (points.length < 2) return undefined;
  const closed = content.some((command) => stringOf(command.command) === "close-path");
  return { points, closed };
}

function photocraft(record: Record<string, unknown>) {
  if (!Array.isArray(record.layers)) return null;
  const layers = record.layers.filter(isRecord);
  if (!layers.length || !layers.every((layer) => isRecord(layer.bounds) || typeof layer.name === "string")) return null;
  return layers.map((layer) => {
    const bounds = isRecord(layer.bounds) ? layer.bounds : {};
    return completeNode({
      type: asType(layer.type || "rect"),
      name: stringOf(layer.name) || "Layer",
      x: finite(bounds.x),
      y: finite(bounds.y),
      w: finite(bounds.w, 100),
      h: finite(bounds.h, 100),
      fill: stringOf(layer.fill) || "#00000000",
      opacity: layer.opacity == null ? 1 : finite(layer.opacity, 1),
      children: [],
    });
  });
}

function tokenScene(value: unknown): { sheets: ImportSheet[]; variables: DesignVariable[] } | null {
  const tokens: { name: string; kind: VariableKind; value: string }[] = [];
  const visit = (node: unknown, path: string[]) => {
    if (!isRecord(node)) return;
    const type = stringOf(node.$type || node.type);
    const raw = node.$value ?? node.value;
    const kind = tokenKind(type);
    if (kind && raw != null && (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean")) {
      tokens.push({ name: path.join(" / ") || "Token", kind, value: tokenValue(kind, raw) });
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      visit(child, [...path, key]);
    }
  };
  visit(value, []);
  if (!tokens.length) return null;
  const variables = tokens.map((token) => ({ id: uid("var"), ...token }));
  const swatches = tokens.filter((token) => token.kind === "color").map((token, index) =>
    completeNode({
      type: "rect",
      name: token.name,
      x: 80,
      y: 80 + index * 72,
      w: 160,
      h: 56,
      fill: token.value,
      radius: 8,
      children: [],
    }),
  );
  return { sheets: [{ name: "Tokens", nodes: swatches }], variables };
}

function tokenKind(type: string): VariableKind | null {
  const kind = type.toLowerCase();
  if (!kind) return null;
  if (kind.includes("color")) return "color";
  if (kind.includes("bool")) return "boolean";
  if (kind === "number" || kind.includes("dimension") || kind.includes("opacity") || kind.includes("fontweight")) return "number";
  if (kind.includes("string") || kind.includes("font") || kind.includes("text")) return "string";
  return null;
}

function tokenValue(kind: VariableKind, value: string | number | boolean) {
  if (kind === "boolean") return value === false || value === "false" ? "false" : "true";
  if (kind === "number") {
    const number = parseFloat(String(value));
    return Number.isFinite(number) ? String(number) : "0";
  }
  return String(value);
}

function sketchScene(entries: Record<string, Uint8Array>, parsed: { path: string; value: unknown }[], name: string): { sheets: ImportSheet[]; colorStyles: ColorStyle[] } | null {
  const document = parsed.find((entry) => entry.path.endsWith("document.json"))?.value;
  if (!isRecord(document)) return null;
  const refs = Array.isArray(document.pages) ? document.pages.filter(isRecord).map((page) => stringOf(page._ref || page.ref)) : [];
  const pageEntries = refs.length
    ? refs.map((ref) => parsed.find((entry) => entry.path.endsWith(`${ref}.json`) || entry.path.endsWith(ref)))
    : parsed.filter((entry) => /pages\//.test(entry.path));
  const sheets = pageEntries.filter((entry): entry is { path: string; value: unknown } => !!entry && isRecord(entry.value)).map((entry) => {
    const page = entry.value as Record<string, unknown>;
    const layers = Array.isArray(page.layers) ? page.layers.filter(isRecord) : [];
    return { name: stringOf(page.name) || "Page", nodes: layers.map((layer) => sketchNode(layer, entries)) };
  });
  if (!sheets.length) return null;
  const swatches = isRecord(document.sharedSwatches) && Array.isArray(document.sharedSwatches.objects) ? document.sharedSwatches.objects : [];
  const colorStyles = swatches.filter(isRecord).map((swatch) => ({
    id: uid("style"),
    name: stringOf(swatch.name) || "Swatch",
    value: unitColor(swatch.value),
  }));
  return { sheets: sheets.length ? sheets : [{ name, nodes: [] }], colorStyles };
}

function sketchMeta(value: unknown) {
  if (!isRecord(value)) return false;
  const created = isRecord(value.created) ? value.created : {};
  const app = stringOf(value.app || created.app || value.commit);
  return app.includes("sketch");
}

function sketchNode(layer: Record<string, unknown>, entries: Record<string, Uint8Array>): DesignNode {
  const frame = isRecord(layer.frame) ? layer.frame : {};
  const style = isRecord(layer.style) ? layer.style : {};
  const fills = Array.isArray(style.fills) ? style.fills.filter(isRecord) : [];
  const borders = Array.isArray(style.borders) ? style.borders.filter(isRecord) : [];
  const fill = fills.find((item) => item.isEnabled !== false);
  const border = borders.find((item) => item.isEnabled !== false);
  const context = isRecord(style.contextSettings) ? style.contextSettings : {};
  const attributed = isRecord(layer.attributedString) ? layer.attributedString : {};
  const kind = stringOf(layer._class);
  const image = sketchImage(layer, entries);
  const children = Array.isArray(layer.layers) ? layer.layers.filter(isRecord).map((child) => sketchNode(child, entries)) : [];
  return completeNode({
    type: image ? "image" : kind === "text" ? "text" : kind === "oval" ? "ellipse" : kind === "group" || kind === "shapeGroup" ? "group" : kind === "star" || kind === "polygon" || kind === "triangle" ? "rect" : kind === "rectangle" || kind === "shapePath" ? "rect" : "frame",
    name: stringOf(layer.name) || kind || "Layer",
    x: finite(frame.x),
    y: finite(frame.y),
    w: finite(frame.width, 100),
    h: finite(frame.height, 100),
    rotation: finite(layer.rotation),
    opacity: context.opacity == null ? 1 : finite(context.opacity, 1),
    visible: layer.isVisible !== false,
    locked: layer.isLocked === true,
    fill: fill ? unitColor(fill.color) : kind === "artboard" ? unitColor(layer.backgroundColor) : "#00000000",
    stroke: border ? unitColor(border.color) : "transparent",
    strokeWidth: border ? finite(border.thickness, 1) : 0,
    radius: finite(layer.fixedRadius),
    text: stringOf(attributed.string) || undefined,
    fontSize: finite(layer.fontSize, kind === "text" ? 16 : 0) || undefined,
    imageDataUrl: image,
    component: kind === "symbolMaster",
    shape: kind === "star" ? "star" : kind === "polygon" || kind === "triangle" ? "polygon" : undefined,
    sides: kind === "star" ? 5 : kind === "triangle" ? 3 : kind === "polygon" ? finite(layer.numberOfPoints, 6) : undefined,
    children,
  });
}

function sketchImage(layer: Record<string, unknown>, entries: Record<string, Uint8Array>) {
  const image = isRecord(layer.image) ? layer.image : null;
  const ref = stringOf(image?._ref || image?.ref);
  if (!ref) return undefined;
  const file = findEntry(entries, (path) => path.endsWith(ref) || path.endsWith(ref.split("/").pop() || ref));
  if (!file) return undefined;
  const mime = imageMime(file);
  return mime ? bytesToDataUrl(file, mime) : undefined;
}

function foreignNode(value: Record<string, unknown>): DesignNode | null {
  const children = [value.children, value.shapes, value.layers].find(Array.isArray) as unknown[] | undefined;
  if (!children) return null;
  return completeNode({
    type: asType(value.type || "frame"),
    name: stringOf(value.name) || "Layer",
    x: finite(value.x),
    y: finite(value.y),
    w: finite(value.width ?? value.w, 100),
    h: finite(value.height ?? value.h, 100),
    fill: stringOf(value.fill) || "#00000000",
    children: children.filter(isRecord).map((child) => foreignNode(child)).filter((node): node is DesignNode => !!node),
  });
}

function importSvg(text: string) {
  if (typeof DOMParser === "undefined") return importSvgMarkup(text);
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg || doc.querySelector("parsererror")) throw new Error("That SVG could not be read.");
  const nodes = readSvgChildren(svg, 0, 0);
  if (!nodes.length) throw new Error("That SVG has no shapes.");
  return nodes;
}

function readSvgChildren(element: Element, ox: number, oy: number) {
  const nodes: DesignNode[] = [];
  for (const child of element.children) nodes.push(...readSvgElement(child, ox, oy));
  return nodes;
}

function readSvgElement(element: Element, ox: number, oy: number): DesignNode[] {
  const styles = styleMap(element.getAttribute("style") || "");
  const shift = translateOf(element.getAttribute("transform") || styles.transform || "");
  const x = ox + shift.x;
  const y = oy + shift.y;
  const tag = element.localName.toLowerCase();
  if (tag === "g" || tag === "svg" || tag === "symbol") return readSvgChildren(element, x, y);
  const fill = tint(paintOf(attr(element, "fill", styles), "#141715"), attr(element, "fill-opacity", styles));
  const stroke = tint(paintOf(attr(element, "stroke", styles), "transparent"), attr(element, "stroke-opacity", styles));
  const opacity = finite(attr(element, "opacity", styles), 1);
  const strokeWidth = finite(attr(element, "stroke-width", styles));
  const hidden = attr(element, "display", styles) === "none" || attr(element, "visibility", styles) === "hidden";
  if (tag === "rect") {
    return [svgNode("rect", element, x + finite(attr(element, "x", styles)), y + finite(attr(element, "y", styles)), finite(attr(element, "width", styles), 100), finite(attr(element, "height", styles), 100), { fill, stroke, strokeWidth, opacity, hidden, radius: finite(attr(element, "rx", styles)) })];
  }
  if (tag === "circle") {
    const radius = finite(attr(element, "r", styles));
    return [svgNode("ellipse", element, x + finite(attr(element, "cx", styles)) - radius, y + finite(attr(element, "cy", styles)) - radius, radius * 2, radius * 2, { fill, stroke, strokeWidth, opacity, hidden })];
  }
  if (tag === "ellipse") {
    const rx = finite(attr(element, "rx", styles));
    const ry = finite(attr(element, "ry", styles));
    return [svgNode("ellipse", element, x + finite(attr(element, "cx", styles)) - rx, y + finite(attr(element, "cy", styles)) - ry, rx * 2, ry * 2, { fill, stroke, strokeWidth, opacity, hidden })];
  }
  if (tag === "line") {
    return [lineNode(element, x, y, finite(attr(element, "x1", styles)), finite(attr(element, "y1", styles)), finite(attr(element, "x2", styles)), finite(attr(element, "y2", styles)), stroke === "transparent" ? fill : stroke, opacity, hidden)];
  }
  if (tag === "polyline" || tag === "polygon") {
    return [pointsNode(element, x, y, attr(element, "points", styles), tag === "polygon", fill, stroke, strokeWidth, opacity, hidden)];
  }
  if (tag === "path") {
    return [pathNode(element, x, y, attr(element, "d", styles), fill, stroke, strokeWidth, opacity, hidden)];
  }
  if (tag === "text") {
    const size = finite(attr(element, "font-size", styles), 16);
    const content = element.textContent?.replace(/\s+/g, " ").trim() || "Text";
    return [svgNode("text", element, x + finite(attr(element, "x", styles)), y + finite(attr(element, "y", styles)) - size, Math.max(40, content.length * size * 0.6), size * 1.4, { fill, stroke, strokeWidth, opacity, hidden, text: content, fontSize: size, fontWeight: finite(attr(element, "font-weight", styles), 400) })];
  }
  if (tag === "image") {
    const href = element.getAttribute("href") || element.getAttribute("xlink:href") || "";
    if (!href.startsWith("data:image")) return [];
    return [svgNode("image", element, x + finite(attr(element, "x", styles)), y + finite(attr(element, "y", styles)), finite(attr(element, "width", styles), 200), finite(attr(element, "height", styles), 200), { fill: "#00000000", stroke: "transparent", strokeWidth: 0, opacity, hidden, imageDataUrl: href })];
  }
  return readSvgChildren(element, x, y);
}

function svgNode(type: DesignNode["type"], element: Element, x: number, y: number, w: number, h: number, extra: Partial<DesignNode> & { hidden?: boolean }) {
  return completeNode({
    type,
    name: element.getAttribute("id") || element.getAttribute("aria-label") || type,
    x, y, w: Math.max(1, w), h: Math.max(1, h),
    fill: extra.fill,
    stroke: extra.stroke,
    strokeWidth: extra.strokeWidth,
    opacity: extra.opacity,
    visible: !extra.hidden,
    radius: extra.radius,
    text: extra.text,
    fontSize: extra.fontSize,
    fontWeight: extra.fontWeight,
    imageDataUrl: extra.imageDataUrl,
    vector: extra.vector,
    children: [],
  });
}

function lineNode(element: Element, ox: number, oy: number, x1: number, y1: number, x2: number, y2: number, stroke: string, opacity: number, hidden: boolean) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return svgNode("path", element, ox + x, oy + y, Math.max(1, Math.abs(x2 - x1)), Math.max(1, Math.abs(y2 - y1)), {
    fill: "#00000000",
    stroke,
    strokeWidth: 2,
    opacity,
    hidden,
    vector: { points: [{ x: x1 - x, y: y1 - y }, { x: x2 - x, y: y2 - y }], closed: false },
  });
}

function pointsNode(element: Element, ox: number, oy: number, raw: string, closed: boolean, fill: string, stroke: string, strokeWidth: number, opacity: number, hidden: boolean) {
  const pairs = raw.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  const points = [];
  for (let index = 0; index + 1 < pairs.length; index += 2) points.push({ x: pairs[index], y: pairs[index + 1] });
  return placedVector(element, ox, oy, points, closed, fill, stroke, strokeWidth, opacity, hidden);
}

function pathNode(element: Element, ox: number, oy: number, data: string, fill: string, stroke: string, strokeWidth: number, opacity: number, hidden: boolean) {
  return placedVector(element, ox, oy, samplePath(data), !/z\s*$/i.test(data.trim()) ? false : true, fill, stroke, strokeWidth, opacity, hidden);
}

function placedVector(element: Element, ox: number, oy: number, points: { x: number; y: number }[], closed: boolean, fill: string, stroke: string, strokeWidth: number, opacity: number, hidden: boolean) {
  if (points.length < 2) return svgNode("rect", element, ox, oy, 100, 100, { fill, stroke, strokeWidth, opacity, hidden });
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return svgNode("path", element, ox + minX, oy + minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY), {
    fill: closed ? fill : "#00000000",
    stroke,
    strokeWidth: strokeWidth || (closed ? 0 : 2),
    opacity,
    hidden,
    vector: { points: points.map((point) => ({ x: point.x - minX, y: point.y - minY })), closed },
  });
}

function samplePath(data: string) {
  const points: { x: number; y: number }[] = [];
  const tokens = data.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  let index = 0;
  let command = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const read = () => finite(tokens[index++]);
  const add = (px: number, py: number) => {
    x = px;
    y = py;
    points.push({ x, y });
  };
  while (index < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[index])) command = tokens[index++];
    const relative = command === command.toLowerCase();
    const code = command.toUpperCase();
    if (code === "M") {
      const nx = (relative ? x : 0) + read();
      const ny = (relative ? y : 0) + read();
      add(nx, ny);
      startX = nx;
      startY = ny;
      command = relative ? "l" : "L";
    } else if (code === "L") add((relative ? x : 0) + read(), (relative ? y : 0) + read());
    else if (code === "H") add((relative ? x : 0) + read(), y);
    else if (code === "V") add(x, (relative ? y : 0) + read());
    else if (code === "C") {
      const x1 = (relative ? x : 0) + read();
      const y1 = (relative ? y : 0) + read();
      const x2 = (relative ? x : 0) + read();
      const y2 = (relative ? y : 0) + read();
      const x3 = (relative ? x : 0) + read();
      const y3 = (relative ? y : 0) + read();
      for (let step = 1; step <= 8; step += 1) points.push(cubic(x, y, x1, y1, x2, y2, x3, y3, step / 8));
      x = x3;
      y = y3;
    } else if (code === "Z") {
      add(startX, startY);
    } else if (code === "Q") {
      const x1 = (relative ? x : 0) + read();
      const y1 = (relative ? y : 0) + read();
      const x2 = (relative ? x : 0) + read();
      const y2 = (relative ? y : 0) + read();
      for (let step = 1; step <= 8; step += 1) points.push(quadratic(x, y, x1, y1, x2, y2, step / 8));
      x = x2;
      y = y2;
    } else {
      break;
    }
  }
  return points;
}

function cubic(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, t: number) {
  const u = 1 - t;
  return {
    x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
    y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
  };
}

function quadratic(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, t: number) {
  const u = 1 - t;
  return { x: u * u * x0 + 2 * u * t * x1 + t * t * x2, y: u * u * y0 + 2 * u * t * y1 + t * t * y2 };
}

function importSvgMarkup(text: string) {
  const nodes: DesignNode[] = [];
  const pattern = /<(rect|ellipse|circle|text|path)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const tag = match[1].toLowerCase();
    const attrs = attrMap(match[2]);
    const body = match[3] || "";
    if (tag === "rect") nodes.push(completeNode({ type: "rect", name: attrs.id || "Rectangle", x: finite(attrs.x), y: finite(attrs.y), w: finite(attrs.width, 100), h: finite(attrs.height, 100), fill: attrs.fill || "#141715", radius: finite(attrs.rx), children: [] }));
    if (tag === "circle") {
      const radius = finite(attrs.r);
      nodes.push(completeNode({ type: "ellipse", name: attrs.id || "Ellipse", x: finite(attrs.cx) - radius, y: finite(attrs.cy) - radius, w: radius * 2, h: radius * 2, fill: attrs.fill || "#141715", children: [] }));
    }
    if (tag === "ellipse") {
      const rx = finite(attrs.rx);
      const ry = finite(attrs.ry);
      nodes.push(completeNode({ type: "ellipse", name: attrs.id || "Ellipse", x: finite(attrs.cx) - rx, y: finite(attrs.cy) - ry, w: rx * 2, h: ry * 2, fill: attrs.fill || "#141715", children: [] }));
    }
    if (tag === "text") nodes.push(completeNode({ type: "text", name: attrs.id || "Text", x: finite(attrs.x), y: finite(attrs.y) - finite(attrs["font-size"], 16), w: 240, h: 32, fill: attrs.fill || "#141715", text: body.replace(/<[^>]+>/g, "").trim(), fontSize: finite(attrs["font-size"], 16), children: [] }));
    if (tag === "path") nodes.push(pathNode(placeholder(attrs.id || "Path"), 0, 0, attrs.d || "", attrs.fill || "#141715", attrs.stroke || "transparent", finite(attrs["stroke-width"]), 1, false));
  }
  if (!nodes.length) throw new Error("That SVG has no shapes.");
  return nodes;
}

function placeholder(name: string) {
  return { localName: "path", getAttribute: (key: string) => (key === "id" ? name : null) } as Element;
}

function attrMap(raw: string) {
  const attrs: Record<string, string> = {};
  const pattern = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) attrs[match[1]] = match[3] ?? match[4] ?? "";
  return attrs;
}

function styleMap(style: string) {
  const map: Record<string, string> = {};
  for (const part of style.split(";")) {
    const [key, value] = part.split(":");
    if (key && value) map[key.trim()] = value.trim();
  }
  return map;
}

function attr(element: Element, name: string, styles: Record<string, string>) {
  return element.getAttribute(name) || styles[name] || "";
}

function tint(color: string, opacity: string) {
  return opacity ? unitColor(color, finite(opacity, 1)) : color;
}

function paintOf(value: string, fallback: string) {
  if (!value || value === "none") return value === "none" ? (fallback === "transparent" ? "transparent" : "#00000000") : fallback;
  if (value === "currentColor") return "#141715";
  return value;
}

function translateOf(transform: string) {
  const translate = /translate\(\s*(-?\d*\.?\d+)(?:[\s,]+(-?\d*\.?\d+))?\s*\)/.exec(transform);
  if (translate) return { x: finite(translate[1]), y: finite(translate[2]) };
  const matrix = /matrix\(\s*(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)\s*\)/.exec(transform);
  if (matrix && finite(matrix[1]) === 1 && finite(matrix[4]) === 1) return { x: finite(matrix[5]), y: finite(matrix[6]) };
  return { x: 0, y: 0 };
}

function rasterNode(name: string, bytes: Uint8Array, mime: string) {
  const size = imageSize(bytes);
  return completeNode({
    type: "image",
    name,
    x: 80,
    y: 80,
    w: size.w,
    h: size.h,
    fill: "#00000000",
    imageDataUrl: bytesToDataUrl(bytes, mime || imageMime(bytes) || "image/png"),
    children: [],
  });
}

function imageSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) return { w: view.getUint32(16), h: view.getUint32(20) };
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49) return { w: view.getUint16(6, true), h: view.getUint16(8, true) };
  if (bytes.length > 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) return { w: Math.abs(view.getInt32(18, true)), h: Math.abs(view.getInt32(22, true)) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      if (marker === 0xc0 || marker === 0xc2) return { w: view.getUint16(offset + 7), h: view.getUint16(offset + 5) };
      offset += 2 + length;
    }
  }
  return { w: 800, h: 600 };
}

function isZip(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isBinaryPsd(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53;
}

function isPdf(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isRaster(bytes: Uint8Array, extension: string, mime: string) {
  return !!imageMime(bytes) || ["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(extension) || mime.startsWith("image/") && mime !== "image/svg+xml";
}

function imageMime(bytes: Uint8Array) {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length > 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[8] === 0x57) return "image/webp";
  if (bytes.length > 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  return null;
}

function mimeFor(extension: string) {
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "bmp") return "image/bmp";
  return "image/png";
}

function findEntry(entries: Record<string, Uint8Array>, test: (path: string) => boolean) {
  const path = Object.keys(entries).find((item) => test(item.replace(/\\/g, "/")));
  return path ? entries[path] : undefined;
}

function parseJson(bytes: Uint8Array) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringOf(value: unknown) {
  return typeof value === "string" ? value : "";
}
