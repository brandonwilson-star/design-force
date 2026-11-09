import type { ComponentProp, DesignNode } from "../types";
import { findNode, uid, updateNode, walk } from "./id";

export interface Located {
  node: DesignNode;
  parent: DesignNode | null;
  index: number;
  absX: number;
  absY: number;
}

export function locate(
  nodes: DesignNode[],
  id: string,
  ox = 0,
  oy = 0,
  parent: DesignNode | null = null,
): Located | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) return { node: n, parent, index: i, absX: ox + n.x, absY: oy + n.y };
    const inner = locate(n.children, id, ox + n.x, oy + n.y, n);
    if (inner) return inner;
  }
  return null;
}

export function reassignIds(node: DesignNode): DesignNode {
  return { ...structuredClone(node), id: uid(), children: node.children.map(reassignIds) };
}

export function removeIds(nodes: DesignNode[], ids: Set<string>): DesignNode[] {
  return nodes
    .filter((n) => !ids.has(n.id))
    .map((n) => ({ ...n, children: removeIds(n.children, ids) }));
}

export function insertAt(nodes: DesignNode[], parentId: string | null, child: DesignNode, index?: number): DesignNode[] {
  if (parentId === null) {
    const next = [...nodes];
    next.splice(index ?? next.length, 0, child);
    return next;
  }
  return nodes.map((n) => {
    if (n.id === parentId) {
      const children = [...n.children];
      children.splice(index ?? children.length, 0, child);
      return { ...n, children };
    }
    return { ...n, children: insertAt(n.children, parentId, child, index) };
  });
}

function replaceChildren(nodes: DesignNode[], parentId: string, children: DesignNode[]): DesignNode[] {
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children };
    return { ...n, children: replaceChildren(n.children, parentId, children) };
  });
}

export function topmostIds(pages: DesignNode[], ids: string[]): string[] {
  const set = new Set(ids);
  const tops: string[] = [];
  const visit = (nodes: DesignNode[], ancestor: boolean) => {
    for (const n of nodes) {
      const sel = set.has(n.id);
      if (sel && !ancestor) tops.push(n.id);
      if (n.children.length) visit(n.children, ancestor || sel);
    }
  };
  visit(pages, false);
  return tops;
}

export function groupNodes(
  pages: DesignNode[],
  ids: string[],
  kind: "group" | "frame" = "group",
): { pages: DesignNode[]; id: string } | null {
  const tops = topmostIds(pages, ids);
  if (kind === "group" && tops.length < 2) return null;
  if (!tops.length) return null;
  const locs = tops.map((id) => locate(pages, id)).filter((l): l is Located => !!l);
  if (!locs.length) return null;
  const minX = Math.min(...locs.map((l) => l.absX));
  const minY = Math.min(...locs.map((l) => l.absY));
  const maxX = Math.max(...locs.map((l) => l.absX + l.node.w));
  const maxY = Math.max(...locs.map((l) => l.absY + l.node.h));
  const parent = locs[0].parent;
  const same = locs.every((l) => (l.parent?.id ?? null) === (parent?.id ?? null));
  const originX = same ? locs[0].absX - locs[0].node.x : 0;
  const originY = same ? locs[0].absY - locs[0].node.y : 0;
  const id = uid();
  const group: DesignNode = {
    id,
    type: kind === "frame" ? "frame" : "group",
    name: kind === "frame" ? "Frame" : "Group",
    x: minX - originX,
    y: minY - originY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: kind === "frame" ? "#1c1713" : "#00000000",
    stroke: "transparent",
    strokeWidth: 0,
    radius: 0,
    children: locs.map((l) => ({ ...structuredClone(l.node), x: l.absX - minX, y: l.absY - minY })),
  };
  let next = removeIds(pages, new Set(tops));
  next = insertAt(next, same ? (parent?.id ?? null) : null, group, same ? Math.min(...locs.map((l) => l.index)) : undefined);
  return { pages: next, id };
}

export function ungroupNodes(pages: DesignNode[], ids: string[]): { pages: DesignNode[]; ids: string[] } | null {
  let next = pages;
  const created: string[] = [];
  for (const id of topmostIds(pages, ids)) {
    const loc = locate(next, id);
    if (!loc) continue;
    if (loc.node.type !== "group" && loc.node.type !== "frame") continue;
    if (!loc.node.children.length) continue;
    const parentId = loc.parent?.id ?? null;
    const kids = loc.node.children.map((c) => ({ ...c, x: c.x + loc.node.x, y: c.y + loc.node.y }));
    next = removeIds(next, new Set([id]));
    kids.forEach((kid, i) => {
      next = insertAt(next, parentId, kid, loc.index + i);
      created.push(kid.id);
    });
  }
  return created.length ? { pages: next, ids: created } : null;
}

export function duplicateNodes(pages: DesignNode[], ids: string[]): { pages: DesignNode[]; ids: string[] } | null {
  let next = pages;
  const created: string[] = [];
  for (const id of topmostIds(pages, ids)) {
    const loc = locate(next, id);
    if (!loc || loc.node.locked) continue;
    const copy = reassignIds({ ...loc.node, x: loc.node.x + 10, y: loc.node.y + 10, name: `${loc.node.name} copy` });
    next = insertAt(next, loc.parent?.id ?? null, copy, loc.index + 1);
    created.push(copy.id);
  }
  return created.length ? { pages: next, ids: created } : null;
}

export function pasteNodes(
  pages: DesignNode[],
  clips: DesignNode[],
  selectedId: string | null,
  mode: "offset" | "over" | "replace",
): { pages: DesignNode[]; ids: string[] } | null {
  if (!clips.length) return null;
  const loc = selectedId ? locate(pages, selectedId) : null;
  const parentId = loc?.parent?.id ?? null;
  if (mode === "replace" && loc) {
    let next = removeIds(pages, new Set([loc.node.id]));
    const copy = reassignIds({ ...clips[0], x: loc.node.x, y: loc.node.y, w: loc.node.w, h: loc.node.h });
    next = insertAt(next, parentId, copy, loc.index);
    return { pages: next, ids: [copy.id] };
  }
  let next = pages;
  const ids: string[] = [];
  clips.forEach((clip, i) => {
    const copy = reassignIds({
      ...clip,
      x: mode === "over" ? clip.x : clip.x + 20 + i * 8,
      y: mode === "over" ? clip.y : clip.y + 20 + i * 8,
    });
    next = insertAt(next, parentId, copy);
    ids.push(copy.id);
  });
  return { pages: next, ids };
}

export function pasteAtPoint(
  pages: DesignNode[],
  clips: DesignNode[],
  x: number,
  y: number,
): { pages: DesignNode[]; ids: string[] } | null {
  if (!clips.length) return null;
  const minX = Math.min(...clips.map((clip) => clip.x));
  const minY = Math.min(...clips.map((clip) => clip.y));
  let next = pages;
  const ids: string[] = [];
  for (const clip of clips) {
    const copy = reassignIds({ ...structuredClone(clip), x: x + (clip.x - minX), y: y + (clip.y - minY) });
    next = insertAt(next, null, copy);
    ids.push(copy.id);
  }
  return { pages: next, ids };
}

export function reorderNode(pages: DesignNode[], id: string, dir: "forward" | "backward" | "front" | "back"): DesignNode[] {
  const loc = locate(pages, id);
  if (!loc) return pages;
  const siblings = loc.parent ? loc.parent.children : pages;
  let to = loc.index;
  if (dir === "forward") to = Math.min(siblings.length - 1, loc.index + 1);
  if (dir === "backward") to = Math.max(0, loc.index - 1);
  if (dir === "front") to = siblings.length - 1;
  if (dir === "back") to = 0;
  if (to === loc.index) return pages;
  const nextSiblings = [...siblings];
  const [item] = nextSiblings.splice(loc.index, 1);
  nextSiblings.splice(to, 0, item);
  if (!loc.parent) return nextSiblings;
  return replaceChildren(pages, loc.parent.id, nextSiblings);
}

export function alignNodes(
  pages: DesignNode[],
  ids: string[],
  mode: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter",
): DesignNode[] {
  const tops = topmostIds(pages, ids)
    .map((id) => locate(pages, id))
    .filter((l): l is Located => !!l);
  if (tops.length < 2) return pages;
  const minX = Math.min(...tops.map((l) => l.absX));
  const minY = Math.min(...tops.map((l) => l.absY));
  const maxX = Math.max(...tops.map((l) => l.absX + l.node.w));
  const maxY = Math.max(...tops.map((l) => l.absY + l.node.h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let next = pages;
  for (const l of tops) {
    let absX = l.absX;
    let absY = l.absY;
    if (mode === "left") absX = minX;
    if (mode === "right") absX = maxX - l.node.w;
    if (mode === "top") absY = minY;
    if (mode === "bottom") absY = maxY - l.node.h;
    if (mode === "hcenter") absX = cx - l.node.w / 2;
    if (mode === "vcenter") absY = cy - l.node.h / 2;
    next = updateNode(next, l.node.id, { x: absX - (l.absX - l.node.x), y: absY - (l.absY - l.node.y) });
  }
  return next;
}

export function flipNodes(pages: DesignNode[], ids: string[], axis: "x" | "y"): DesignNode[] {
  const tops = topmostIds(pages, ids)
    .map((id) => locate(pages, id))
    .filter((l): l is Located => !!l && !l.node.locked);
  if (!tops.length) return pages;
  if (tops.length === 1) {
    const n = tops[0].node;
    return updateNode(pages, n.id, axis === "x" ? { flipX: !n.flipX } : { flipY: !n.flipY });
  }
  const minX = Math.min(...tops.map((l) => l.absX));
  const maxX = Math.max(...tops.map((l) => l.absX + l.node.w));
  const minY = Math.min(...tops.map((l) => l.absY));
  const maxY = Math.max(...tops.map((l) => l.absY + l.node.h));
  let next = pages;
  for (const l of tops) {
    if (axis === "x") {
      const absX = minX + (maxX - (l.absX + l.node.w));
      next = updateNode(next, l.node.id, { x: absX - (l.absX - l.node.x), flipX: !l.node.flipX });
    } else {
      const absY = minY + (maxY - (l.absY + l.node.h));
      next = updateNode(next, l.node.id, { y: absY - (l.absY - l.node.y), flipY: !l.node.flipY });
    }
  }
  return next;
}

export function nudgeNodes(pages: DesignNode[], ids: string[], dx: number, dy: number, snap: boolean): DesignNode[] {
  let next = pages;
  for (const id of topmostIds(pages, ids)) {
    const n = locate(next, id)?.node;
    if (!n || n.locked) continue;
    let x = n.x + dx;
    let y = n.y + dy;
    if (snap) {
      x = Math.round(x);
      y = Math.round(y);
    }
    next = updateNode(next, id, { x, y });
  }
  return next;
}

export function patchTops(
  pages: DesignNode[],
  ids: string[],
  patch: Partial<DesignNode> | ((n: DesignNode) => Partial<DesignNode>),
): DesignNode[] {
  let next = pages;
  for (const id of topmostIds(pages, ids)) {
    const n = locate(next, id)?.node;
    if (!n || n.locked) continue;
    next = updateNode(next, id, typeof patch === "function" ? patch(n) : patch);
  }
  return next;
}

export function resizeFrameToFit(pages: DesignNode[], id: string): DesignNode[] {
  const loc = locate(pages, id);
  if (!loc || !loc.node.children.length) return pages;
  const maxX = Math.max(...loc.node.children.map((c) => c.x + c.w));
  const maxY = Math.max(...loc.node.children.map((c) => c.y + c.h));
  return updateNode(pages, id, { w: Math.max(1, maxX), h: Math.max(1, maxY) });
}

export function siblingId(pages: DesignNode[], id: string, dir: 1 | -1): string | null {
  const loc = locate(pages, id);
  if (!loc) return null;
  const siblings = loc.parent ? loc.parent.children : pages;
  return siblings[loc.index + dir]?.id ?? null;
}

export function parentOf(pages: DesignNode[], id: string): string | null {
  return locate(pages, id)?.parent?.id ?? null;
}

export function firstChildId(pages: DesignNode[], id: string): string | null {
  return locate(pages, id)?.node.children[0]?.id ?? null;
}

export function matchingIds(pages: DesignNode[], id: string): string[] {
  const n = locate(pages, id)?.node;
  if (!n) return [];
  const out: string[] = [];
  walk(pages, (node) => {
    if (node.type === n.type && node.name === n.name) out.push(node.id);
  });
  return out;
}

export function inverseIds(pages: DesignNode[], ids: string[]): string[] {
  if (!ids.length) return pages.map((p) => p.id);
  const loc = locate(pages, ids[0]);
  const siblings = loc?.parent ? loc.parent.children : pages;
  const set = new Set(ids);
  return siblings.filter((s) => !set.has(s.id)).map((s) => s.id);
}

export function allTopIds(pages: DesignNode[]): string[] {
  return pages.map((p) => p.id);
}

export function boundsOf(pages: DesignNode[], ids?: string[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const locs = (ids?.length ? ids : pages.map((p) => p.id))
    .map((id) => locate(pages, id))
    .filter((l): l is Located => !!l);
  if (!locs.length) return null;
  return {
    minX: Math.min(...locs.map((l) => l.absX)),
    minY: Math.min(...locs.map((l) => l.absY)),
    maxX: Math.max(...locs.map((l) => l.absX + l.node.w)),
    maxY: Math.max(...locs.map((l) => l.absY + l.node.h)),
  };
}

export function findComponent(nodes: DesignNode[]): string | null {
  let found: string | null = null;
  walk(nodes, (n) => {
    if (!found && n.component) found = n.id;
  });
  return found;
}

export function constrainChildren(node: DesignNode, nextW: number, nextH: number): DesignNode[] {
  const dw = nextW - node.w;
  const dh = nextH - node.h;
  const sx = node.w ? nextW / node.w : 1;
  const sy = node.h ? nextH / node.h : 1;
  return node.children.map((child) => {
    const horizontal = child.constraints?.horizontal ?? "start";
    const vertical = child.constraints?.vertical ?? "start";
    let x = child.x;
    let y = child.y;
    let w = child.w;
    let h = child.h;
    if (horizontal === "end") x += dw;
    else if (horizontal === "center") x += dw / 2;
    else if (horizontal === "stretch") w = Math.max(1, child.w + dw);
    else if (horizontal === "scale") {
      x = child.x * sx;
      w = Math.max(1, child.w * sx);
    }
    if (vertical === "end") y += dh;
    else if (vertical === "center") y += dh / 2;
    else if (vertical === "stretch") h = Math.max(1, child.h + dh);
    else if (vertical === "scale") {
      y = child.y * sy;
      h = Math.max(1, child.h * sy);
    }
    const children = (w !== child.w || h !== child.h) && child.children.length ? constrainChildren(child, w, h) : child.children;
    return { ...child, x, y, w, h, children };
  });
}

function crossAlign(align = "Center left"): "start" | "center" | "end" {
  if (align.endsWith("right")) return "end";
  if (align.endsWith("center") || align === "Center") return "center";
  return "start";
}

function reflowNode(n: DesignNode): DesignNode {
  if (!n.autoLayout || !n.children.length) return n;
  const gap = n.gap ?? 16;
  const padX = n.padX ?? 16;
  const padY = n.padY ?? 16;
  if (n.autoLayout === "wrap") return n;
  const cross = crossAlign(n.layoutAlign);
  let cursor = n.autoLayout === "horizontal" ? padX : padY;
  const children = n.children.map((child) => {
    if (n.autoLayout === "horizontal") {
      const next = { ...child, x: cursor, y: padY };
      cursor += child.w + gap;
      return next;
    }
    const next = { ...child, x: padX, y: cursor };
    cursor += child.h + gap;
    return next;
  });
  const contentW = n.autoLayout === "horizontal" ? cursor - gap + padX : padX * 2 + Math.max(...children.map((c) => c.w));
  const contentH = n.autoLayout === "vertical" ? cursor - gap + padY : padY * 2 + Math.max(...children.map((c) => c.h));
  const placed = children.map((child) => {
    if (n.autoLayout === "horizontal") {
      const inner = contentH - padY * 2;
      const y = cross === "end" ? contentH - padY - child.h : cross === "center" ? padY + (inner - child.h) / 2 : padY;
      return { ...child, y };
    }
    const inner = contentW - padX * 2;
    const x = cross === "end" ? contentW - padX - child.w : cross === "center" ? padX + (inner - child.w) / 2 : padX;
    return { ...child, x };
  });
  return { ...n, children: placed, w: Math.max(1, contentW), h: Math.max(1, contentH) };
}

export function reflowAuto(pages: DesignNode[], id: string): DesignNode[] {
  const loc = locate(pages, id);
  if (!loc) return pages;
  return updateNode(pages, id, reflowNode(loc.node));
}

export function makeAutoLayout(pages: DesignNode[], ids: string[]): { pages: DesignNode[]; id: string } | null {
  const tops = topmostIds(pages, ids);
  if (!tops.length) return null;
  if (tops.length >= 2) {
    const grouped = groupNodes(pages, tops, "frame");
    if (!grouped) return null;
    const loc = locate(grouped.pages, grouped.id);
    if (!loc) return grouped;
    const laid = reflowNode({
      ...loc.node,
      name: "Auto layout",
      autoLayout: "horizontal",
      gap: 80,
      padX: 80,
      padY: 48,
      radius: 999,
      fill: "#2a2144",
      stroke: "#f3ece1",
      strokeWidth: 1,
    });
    return { pages: updateNode(grouped.pages, grouped.id, laid), id: grouped.id };
  }
  const loc = locate(pages, tops[0]);
  if (!loc) return null;
  const laid = reflowNode({
    ...loc.node,
    autoLayout: loc.node.autoLayout === "horizontal" ? "vertical" : "horizontal",
    gap: loc.node.gap ?? 16,
    padX: loc.node.padX ?? 16,
    padY: loc.node.padY ?? 16,
  });
  return { pages: updateNode(pages, tops[0], laid), id: tops[0] };
}

export function makeMask(pages: DesignNode[], ids: string[]): { pages: DesignNode[]; id: string } | null {
  const tops = topmostIds(pages, ids);
  if (!tops.length) return null;
  if (tops.length < 2) {
    const loc = locate(pages, tops[0]);
    if (!loc) return null;
    return { pages: updateNode(pages, tops[0], { mask: !loc.node.mask }), id: tops[0] };
  }
  const grouped = groupNodes(pages, tops, "group");
  if (!grouped) return null;
  const loc = locate(grouped.pages, grouped.id);
  const maskChild = loc?.node.children.find((c) => c.type === "text") ?? loc?.node.children[0];
  if (!maskChild) return grouped;
  return { pages: updateNode(grouped.pages, maskChild.id, { mask: true }), id: grouped.id };
}

export function makeComponentSet(pages: DesignNode[], ids: string[]): { pages: DesignNode[]; ids: string[] } | null {
  const tops = topmostIds(pages, ids);
  if (!tops.length) return null;
  if (tops.length < 2) {
    return { pages: updateNode(pages, tops[0], { component: true, variantName: "Default" }), ids: tops };
  }
  const setId = uid("set");
  let next = pages;
  tops.forEach((id, index) => {
    const variantName = index === 0 ? "Default" : "Hover";
    next = updateNode(next, id, {
      component: true,
      componentSet: setId,
      variantName,
      variantProps: { Variant: variantName },
    });
  });
  next = updateNode(next, tops[0], {
    interaction: { trigger: "hover", action: "swap", targetId: tops[1], duration: 200 },
  });
  return { pages: next, ids: tops };
}

export function createComponent(pages: DesignNode[], ids: string[]): { pages: DesignNode[]; ids: string[] } | null {
  const tops = topmostIds(pages, ids);
  if (!tops.length) return null;
  if (tops.length === 1) {
    const loc = locate(pages, tops[0]);
    if (!loc) return null;
    const variantName = loc.node.variantName || "Default";
    return {
      pages: updateNode(pages, tops[0], {
        component: true,
        instanceOf: undefined,
        variantName,
        variantProps: { Variant: variantName, ...(loc.node.variantProps ?? {}) },
      }),
      ids: tops,
    };
  }
  const grouped = groupNodes(pages, tops, "frame");
  if (!grouped) return null;
  return {
    pages: updateNode(grouped.pages, grouped.id, {
      component: true,
      name: "Component",
      variantName: "Default",
      variantProps: { Variant: "Default" },
    }),
    ids: [grouped.id],
  };
}

function nextVariantName(pages: DesignNode[], setId: string) {
  const taken = new Set<string>();
  walk(pages, (node) => {
    if (node.componentSet === setId && node.variantName) taken.add(node.variantName);
  });
  let index = taken.size + 1;
  let name = index === 1 ? "Default" : `Variant ${index}`;
  while (taken.has(name)) {
    index += 1;
    name = `Variant ${index}`;
  }
  return name;
}

export function createVariant(pages: DesignNode[], ids: string[]): { pages: DesignNode[]; ids: string[] } | null {
  const tops = topmostIds(pages, ids);
  if (!tops.length) return null;
  if (tops.length >= 2) return makeComponentSet(pages, tops);
  const loc = locate(pages, tops[0]);
  if (!loc) return null;
  const mainId = loc.node.instanceOf || loc.node.id;
  const mainLoc = locate(pages, mainId) ?? loc;
  const source = mainLoc.node;
  const setId = source.componentSet || uid("set");
  const variantName = source.variantName || "Default";
  let next = updateNode(pages, source.id, {
    component: true,
    instanceOf: undefined,
    componentSet: setId,
    variantName,
    variantProps: { Variant: variantName, ...(source.variantProps ?? {}) },
  });
  const placed = locate(next, source.id);
  const value = nextVariantName(next, setId);
  const copy = reassignIds({
    ...source,
    component: true,
    instanceOf: undefined,
    componentSet: setId,
    variantName: value,
    variantProps: { ...(source.variantProps ?? {}), Variant: value },
    name: source.name,
    x: source.x + source.w + 48,
    y: source.y,
  });
  next = insertAt(next, placed?.parent?.id ?? null, copy, (placed?.index ?? 0) + 1);
  return { pages: next, ids: [copy.id] };
}

export function applyVariant(pages: DesignNode[], instanceId: string, variantId: string): DesignNode[] | null {
  const instance = locate(pages, instanceId);
  const variant = locate(pages, variantId);
  if (!instance || !variant?.node.component) return null;
  return updateNode(pages, instanceId, {
    instanceOf: variant.node.id,
    component: false,
    variantName: variant.node.variantName,
    variantProps: { ...(variant.node.variantProps ?? {}) },
    fill: variant.node.fill,
    stroke: variant.node.stroke,
    strokeWidth: variant.node.strokeWidth,
    radius: variant.node.radius,
    text: variant.node.text,
    fontSize: variant.node.fontSize,
    fontWeight: variant.node.fontWeight,
    w: variant.node.w,
    h: variant.node.h,
    children: variant.node.children.map((child) => reassignIds(child)),
  });
}

export function addComponentProp(
  pages: DesignNode[],
  selectedId: string,
  kind: "boolean" | "string",
): { pages: DesignNode[]; id: string } | null {
  const loc = locate(pages, selectedId);
  if (!loc) return null;
  const start = loc.node.instanceOf ? locate(pages, loc.node.instanceOf) ?? loc : loc;
  let host: DesignNode | null = start.node.component && !start.node.instanceOf ? start.node : null;
  let target = start.node;
  if (!host) {
    let cursor: Located | null = start;
    while (cursor?.parent) {
      if (cursor.parent.component && !cursor.parent.instanceOf) {
        host = cursor.parent;
        target = start.node;
        break;
      }
      cursor = locate(pages, cursor.parent.id);
    }
  }
  if (host && host.id === target.id) {
    const preferred = kind === "string" ? firstText(host) : host.children[0];
    if (preferred) target = preferred;
  }
  if (!host) return null;
  const prop: ComponentProp = {
    id: uid("prop"),
    name: kind === "boolean" ? "Visible" : "Label",
    kind,
    targetName: target.name,
  };
  const members = host.componentSet
    ? collectSet(pages, host.componentSet)
    : [host.id];
  let next = pages;
  for (const id of members) {
    const node = locate(next, id)?.node;
    if (!node) continue;
    next = updateNode(next, id, { component: true, componentProps: [...(node.componentProps ?? []), prop] });
  }
  return { pages: next, id: host.id };
}

function firstText(node: DesignNode): DesignNode | null {
  if (node.type === "text") return node;
  for (const child of node.children) {
    const found = firstText(child);
    if (found) return found;
  }
  return null;
}

function collectSet(pages: DesignNode[], setId: string) {
  const ids: string[] = [];
  walk(pages, (node) => {
    if (node.component && node.componentSet === setId) ids.push(node.id);
  });
  return ids;
}

export function alignOne(
  pages: DesignNode[],
  id: string,
  mode: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter",
): DesignNode[] {
  const loc = locate(pages, id);
  if (!loc?.parent) return pages;
  const n = loc.node;
  const p = loc.parent;
  let x = n.x;
  let y = n.y;
  if (mode === "left") x = 0;
  if (mode === "hcenter") x = (p.w - n.w) / 2;
  if (mode === "right") x = p.w - n.w;
  if (mode === "top") y = 0;
  if (mode === "vcenter") y = (p.h - n.h) / 2;
  if (mode === "bottom") y = p.h - n.h;
  return updateNode(pages, id, { x, y });
}

export function rootFrameId(pages: DesignNode[], id: string | null): string | null {
  if (!pages.length) return null;
  if (!id) return pages[0].id;
  for (const page of pages) {
    if (page.id === id) return page.id;
    if (findNode(page.children, id)) return page.id;
  }
  return pages[0].id;
}

export function textIds(pages: DesignNode[], ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const n = locate(pages, id)?.node;
    if (!n) continue;
    walk([n], (node) => {
      if (node.type === "text") out.push(node.id);
    });
  }
  return out;
}
