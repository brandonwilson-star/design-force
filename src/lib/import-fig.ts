import { inflateSync, unzlibSync } from "fflate";
import { decompress } from "fzstd";
import { compileSchema, decodeBinarySchema, type Schema } from "kiwi-schema";
import { uid } from "./id";
import { completeNode, finite, unitColor, type ImportSheet } from "./import-nodes";
import type { ColorStyle, DesignNode, DesignVariable, VariableKind } from "../types";

const FIG_MAGIC = "fig-kiwi";

export interface FigImport {
  sheets: ImportSheet[];
  colorStyles: ColorStyle[];
  variables: DesignVariable[];
}

export function isFigKiwi(bytes: Uint8Array) {
  return bytes.length > 12 && new TextDecoder().decode(bytes.subarray(0, 8)) === FIG_MAGIC;
}

export function importFigKiwi(bytes: Uint8Array): FigImport {
  if (!isFigKiwi(bytes)) throw new Error("This .fig file does not contain a FigKiwi canvas.");
  const chunks = readChunks(bytes);
  if (!chunks.length) throw new Error("This .fig file does not contain a scene.");
  const schemaChunk = chunks.find((chunk) => {
    try {
      decodeBinarySchema(inflateChunk(chunk));
      return true;
    } catch {
      return false;
    }
  });
  if (!schemaChunk) throw new Error("This .fig file does not contain a readable scene schema.");
  const schema = decodeBinarySchema(inflateChunk(schemaChunk));
  const compiled = compileSchema(schema) as Record<string, unknown>;
  let message: Record<string, unknown> | null = null;
  for (const chunk of chunks) {
    if (chunk === schemaChunk) continue;
    const decoded = decodeMessage(compiled, schema, chunk);
    if (decoded && nodeChangesOf(decoded).length) {
      message = decoded;
      break;
    }
    if (!message && decoded) message = decoded;
  }
  if (!message) throw new Error("This .fig file uses a scene encoding Design Force could not read.");
  const changes = nodeChangesOf(message);
  if (!changes.length) throw new Error("This .fig file did not contain any layers.");
  return sceneFromChanges(changes, blobsOf(message), variablesFromMessage(message));
}

function readChunks(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 4 <= bytes.length) {
    const length = view.getUint32(offset, true);
    offset += 4;
    if (length <= 0 || offset + length > bytes.length) break;
    chunks.push(bytes.slice(offset, offset + length));
    offset += length;
  }
  return chunks;
}

function inflateChunk(bytes: Uint8Array) {
  if (bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
    return decompress(bytes);
  }
  for (const inflate of [unzlibSync, inflateSync]) {
    try {
      return inflate(bytes);
    } catch {
      /* This chunk may already be uncompressed. */
    }
  }
  return bytes;
}

function decodeMessage(compiled: Record<string, unknown>, schema: Schema, chunk: Uint8Array) {
  const names = schema.definitions.filter((definition) => definition.kind === "MESSAGE").map((definition) => definition.name);
  const preferred = ["Message", "Archive", ...names];
  const payloads = [inflateChunk(chunk), chunk];
  for (const name of preferred) {
    const decode = compiled[`decode${name}`];
    if (typeof decode !== "function") continue;
    for (const payload of payloads) {
      try {
        const value = (decode as (this: typeof compiled, data: Uint8Array) => unknown).call(compiled, payload);
        if (value && typeof value === "object") return value as Record<string, unknown>;
      } catch {
        /* Try the next message name or the uncompressed bytes. */
      }
    }
  }
  return null;
}

function nodeChangesOf(message: Record<string, unknown>) {
  if (Array.isArray(message.nodeChanges)) return message.nodeChanges.filter(isRecord);
  for (const value of Object.values(message)) {
    if (Array.isArray(value) && value.some((item) => isRecord(item) && (item.guid || item.type || item.name))) return value.filter(isRecord);
  }
  return [];
}

function blobsOf(message: Record<string, unknown>) {
  const blobs = Array.isArray(message.blobs) ? message.blobs : [];
  return blobs.map(toBytes).filter((bytes): bytes is Uint8Array => !!bytes);
}

function sceneFromChanges(changes: Record<string, unknown>[], blobs: Uint8Array[], variables: DesignVariable[]): FigImport {
  const merged = new Map<string, Record<string, unknown>>();
  for (const change of changes) {
    const id = guidId(change.guid);
    if (!id) continue;
    const phase = String(change.phase || "");
    if (phase === "REMOVED") {
      merged.delete(id);
      continue;
    }
    const previous = merged.get(id);
    merged.set(id, previous ? { ...previous, ...change, guid: change.guid ?? previous.guid } : change);
  }
  const drafts: FigDraft[] = [];
  let imageCursor = 0;
  const takeImage = () => {
    while (imageCursor < blobs.length) {
      const bytes = blobs[imageCursor];
      imageCursor += 1;
      const mime = imageMime(bytes);
      if (mime) return bytesToDataUrl(bytes, mime);
    }
    return undefined;
  };
  for (const [id, change] of merged) {
    const figType = String(change.type || "FRAME").toUpperCase();
    if (figType === "NONE") continue;
    drafts.push(draftFromChange(id, figType, change, takeImage));
  }
  const byId = new Map(drafts.map((draft) => [draft.node.id, draft]));
  for (const draft of drafts) draft.node.children = [];
  const roots: FigDraft[] = [];
  for (const draft of drafts) {
    const parent = draft.parentId ? byId.get(draft.parentId) : undefined;
    if (parent && parent !== draft) parent.node.children.push(draft.node);
    else roots.push(draft);
  }
  const sortNodes = (nodes: DesignNode[]) => {
    nodes.sort((a, b) => (byId.get(a.id)?.order || "").localeCompare(byId.get(b.id)?.order || ""));
    for (const node of nodes) {
      const draft = byId.get(node.id);
      const parentType = draft?.parentId ? byId.get(draft.parentId)?.figType : "";
      if (parentType === "COMPONENT_SET") {
        node.component = true;
        node.componentSet = draft?.parentId || undefined;
        node.variantName = node.variantName || node.name;
      }
      if (node.children.length) sortNodes(node.children);
    }
  };
  sortNodes(roots.map((draft) => draft.node));
  const documents = roots.filter((draft) => draft.figType === "DOCUMENT");
  const canvasParents = documents.length ? documents.flatMap((draft) => childDrafts(draft, byId)) : roots;
  const canvases = canvasParents.filter((draft) => draft.figType === "CANVAS");
  const sheets = (canvases.length ? canvases : roots.filter((draft) => draft.figType !== "DOCUMENT")).map((draft) => ({
    name: draft.figType === "CANVAS" ? draft.node.name : "Page 1",
    nodes: (draft.figType === "CANVAS" ? draft.node.children : [draft.node]).map((node) => completeNode(node)),
  }));
  const colorStyles = drafts
    .filter((draft) => draft.figType.includes("STYLE") && draft.node.fill && draft.node.fill !== "#00000000")
    .map((draft) => ({ id: uid("style"), name: draft.node.name, value: draft.node.fill.slice(0, 7) }));
  return { sheets: sheets.length ? sheets : [{ name: "Page 1", nodes: [] }], colorStyles, variables };
}

interface FigDraft {
  node: DesignNode;
  parentId: string | null;
  order: string;
  figType: string;
}

function childDrafts(parent: FigDraft, byId: Map<string, FigDraft>) {
  return parent.node.children.map((child) => byId.get(child.id)).filter((draft): draft is FigDraft => !!draft);
}

function draftFromChange(id: string, figType: string, change: Record<string, unknown>, takeImage: () => string | undefined): FigDraft {
  const parent = isRecord(change.parentIndex) ? change.parentIndex : undefined;
  const parentId = guidId(parent?.guid);
  const size = isRecord(change.size) ? change.size : {};
  const transform = isRecord(change.transform) ? change.transform : {};
  const paints = paintsOf(change.fillPaints);
  const strokes = paintsOf(change.strokePaints);
  const fill = paints.find((paint) => paint.solid) || paints[0];
  const stroke = strokes.find((paint) => paint.solid) || strokes[0];
  const image = paints.some((paint) => paint.image) || figType === "IMAGE" ? takeImage() : undefined;
  const text = stringOf(change.characters) || textOf(change.textData);
  const font = isRecord(change.fontName) ? change.fontName : {};
  const corners = Array.isArray(change.rectangleCornerRadii) ? change.rectangleCornerRadii.map((value) => finite(value)) : [];
  const stack = String(change.stackMode || "").toUpperCase();
  const symbol = guidId(symbolId(change));
  const vector = vectorOf(change);
  const node = completeNode({
    id,
    type: nodeType(figType, !!text, !!image, !!vector),
    name: stringOf(change.name) || figType.toLowerCase(),
    x: finite(transform.m02),
    y: finite(transform.m12),
    w: finite(size.x, 100),
    h: finite(size.y, 100),
    rotation: rotationOf(transform),
    opacity: change.opacity == null ? 1 : finite(change.opacity, 1),
    visible: change.visible !== false,
    locked: change.locked === true,
    fill: fill?.color || (image ? "#00000000" : "#00000000"),
    fillKind: fill?.gradient ? "gradient" : undefined,
    gradientFrom: fill?.gradientFrom,
    gradientTo: fill?.gradientTo,
    stroke: stroke?.color || "transparent",
    strokeWidth: stroke ? finite(change.strokeWeight, 1) : 0,
    radius: finite(change.cornerRadius, corners.length ? corners.reduce((sum, value) => sum + value, 0) / corners.length : 0),
    text,
    fontSize: finite(change.fontSize, text ? 16 : 0) || undefined,
    fontWeight: fontWeight(font.style),
    imageDataUrl: image,
    component: figType === "COMPONENT" || figType === "COMPONENT_SET",
    variantName: figType === "COMPONENT" ? stringOf(change.name) : undefined,
    instanceOf: figType === "INSTANCE" ? symbol || undefined : undefined,
    section: figType === "SECTION",
    shape: figType === "STAR" ? "star" : figType === "REGULAR_POLYGON" ? "polygon" : undefined,
    sides: figType === "STAR" || figType === "REGULAR_POLYGON" ? finite(change.count, figType === "STAR" ? 5 : 6) : undefined,
    vector,
    autoLayout: stack === "HORIZONTAL" ? "horizontal" : stack === "VERTICAL" ? "vertical" : undefined,
    gap: change.itemSpacing == null ? undefined : finite(change.itemSpacing),
    padX: change.paddingLeft == null ? undefined : finite(change.paddingLeft),
    padY: change.paddingTop == null ? undefined : finite(change.paddingTop),
    booleanOp: booleanOp(change.booleanOperation),
    children: [],
  });
  return { node, parentId: parentId && parentId !== "0:0" ? parentId : null, order: stringOf(parent?.position), figType };
}

function nodeType(figType: string, text: boolean, image: boolean, vector: boolean): DesignNode["type"] {
  if (image) return "image";
  if (figType === "TEXT" || (text && figType === "SHAPE_WITH_TEXT")) return "text";
  if (figType === "ELLIPSE") return "ellipse";
  if (figType === "GROUP" || figType === "BOOLEAN_OPERATION") return "group";
  if (figType === "LINE" || figType === "VECTOR" || vector) return "path";
  if (figType === "RECTANGLE" || figType === "ROUNDED_RECTANGLE" || figType === "STAR" || figType === "REGULAR_POLYGON") return "rect";
  return "frame";
}

function paintsOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((paint) => {
    const kind = String(paint.type || "SOLID").toUpperCase();
    const visible = paint.visible !== false && paint.opacity !== 0;
    const stops = Array.isArray(paint.stops) ? paint.stops.filter(isRecord) : [];
    const color = unitColor(paint.color, paint.opacity == null ? undefined : finite(paint.opacity, 1));
    return {
      solid: visible && (kind === "SOLID" || kind === ""),
      image: visible && kind.includes("IMAGE"),
      gradient: visible && kind.includes("GRADIENT") && stops.length >= 2,
      color: visible ? color : "#00000000",
      gradientFrom: stops[0] ? unitColor(stops[0].color) : undefined,
      gradientTo: stops.length ? unitColor(stops[stops.length - 1].color) : undefined,
    };
  }).filter((paint) => paint.solid || paint.image || paint.gradient);
}

function vectorOf(change: Record<string, unknown>) {
  const network = isRecord(change.vectorNetwork) ? change.vectorNetwork : undefined;
  const vertices = Array.isArray(network?.vertices) ? network.vertices.filter(isRecord) : [];
  if (vertices.length < 2) return undefined;
  const points = vertices.map((vertex) => ({ x: finite(vertex.x), y: finite(vertex.y) }));
  return { points, closed: true };
}

function symbolId(change: Record<string, unknown>) {
  if (isRecord(change.symbolData)) return change.symbolData.symbolID || change.symbolData.symbolId;
  return change.overriddenSymbolID || change.componentId || change.symbolID;
}

function booleanOp(value: unknown): DesignNode["booleanOp"] {
  const kind = String(value || "").toLowerCase();
  if (kind.includes("subtract") || kind.includes("difference")) return "subtract";
  if (kind.includes("intersect")) return "intersect";
  if (kind.includes("exclude")) return "exclude";
  if (kind.includes("union")) return "union";
  return undefined;
}

function rotationOf(transform: Record<string, unknown>) {
  const m00 = finite(transform.m00, 1);
  const m10 = finite(transform.m10, 0);
  if (Math.abs(m10) < 0.0001 && Math.abs(m00 - 1) < 0.0001) return 0;
  return (Math.atan2(m10, m00) * 180) / Math.PI;
}

function fontWeight(style: unknown) {
  const text = String(style || "").toLowerCase();
  if (!text) return undefined;
  if (text.includes("thin")) return 200;
  if (text.includes("light")) return 300;
  if (text.includes("medium")) return 500;
  if (text.includes("semibold") || text.includes("semi bold") || text.includes("demi")) return 600;
  if (text.includes("black") || text.includes("heavy")) return 800;
  if (text.includes("bold")) return 700;
  return 400;
}

function variablesFromMessage(message: Record<string, unknown>) {
  const found: DesignVariable[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    const kind = variableKind(record.resolvedType || record.variableResolvedType);
    const name = stringOf(record.name);
    if (kind && name) {
      found.push({ id: uid("var"), name, kind, value: variableValue(kind, record.value ?? record.variableValue ?? record.valuesByMode) });
    }
  };
  for (const [key, value] of Object.entries(message)) {
    if (/variable/i.test(key)) visit(value);
  }
  const seen = new Set<string>();
  return found.filter((variable) => {
    if (seen.has(variable.name)) return false;
    seen.add(variable.name);
    return true;
  });
}

function variableKind(value: unknown): VariableKind | null {
  const kind = String(value || "").toUpperCase();
  if (kind === "COLOR") return "color";
  if (kind === "FLOAT" || kind === "NUMBER") return "number";
  if (kind === "BOOLEAN" || kind === "BOOL") return "boolean";
  if (kind === "STRING" || kind === "TEXT") return "string";
  return null;
}

function variableValue(kind: VariableKind, value: unknown): string {
  if (kind === "color") return unitColor(value);
  if (kind === "boolean") return value === false || value === "false" ? "false" : "true";
  if (kind === "number") return String(finite(value));
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (isRecord(value)) {
    const nested = value.value ?? value.floatValue ?? value.stringValue ?? value.boolValue ?? value.colorValue;
    if (nested != null && nested !== value) return variableValue(kind, nested);
    const first = Object.values(value).find((item) => item != null && typeof item !== "object");
    if (first != null) return variableValue(kind, first);
  }
  return "";
}

function guidId(value: unknown) {
  if (!isRecord(value)) return null;
  const session = value.sessionID ?? value.sessionId;
  const local = value.localID ?? value.localId;
  if (session == null && local == null) return null;
  return `${session ?? 0}:${local ?? 0}`;
}

function textOf(value: unknown) {
  if (!isRecord(value)) return undefined;
  return stringOf(value.characters) || undefined;
}

function stringOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) return Uint8Array.from(value);
  if (isRecord(value) && value.bytes) return toBytes(value.bytes);
  return null;
}

function imageMime(bytes: Uint8Array) {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length > 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  return null;
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string) {
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
