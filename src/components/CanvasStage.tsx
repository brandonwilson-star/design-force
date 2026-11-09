import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { DesignNode } from "../types";
import { clipRange, sampleMotion } from "../lib/craft";
import { findNode, flatten, uid, updateNode } from "../lib/id";
import { isMac } from "../lib/platform";
import { duplicateNodes, rootFrameId } from "../lib/scene";
import { resolveTree } from "../lib/variables";
import { pageComments, useStudio } from "../store";
import { openNodeMenu } from "./NodeMenu";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function applyFilters(n: DesignNode, skip: boolean): string {
  const grade = skip || !n.filters ? "" : `brightness(${1 + n.filters.exposure + n.filters.highlights * 0.2}) contrast(${1 + n.filters.contrast}) saturate(${1 + n.filters.saturation}) hue-rotate(${n.filters.temperature * 18}deg)`;
  const blur = n.effect === "blur" ? " blur(8px)" : "";
  return `${grade}${blur}`.trim();
}

const imageCache = new Map<string, HTMLImageElement>();

function paintFill(ctx: CanvasRenderingContext2D, n: DesignNode, x: number, y: number): string | CanvasGradient {
  if (n.fillKind === "gradient") {
    const gradient = ctx.createLinearGradient(x, y, x, y + Math.max(1, n.h));
    gradient.addColorStop(0, n.gradientFrom || "#ffffff");
    gradient.addColorStop(1, n.gradientTo || n.fill || "#532bdc");
    return gradient;
  }
  return n.fill;
}

function paintLayoutGrid(ctx: CanvasRenderingContext2D, n: DesignNode, x: number, y: number) {
  const grid = n.layoutGrid;
  if (!grid) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, n.w, n.h);
  ctx.clip();
  ctx.globalAlpha *= grid.opacity;
  ctx.strokeStyle = grid.color;
  ctx.fillStyle = grid.color;
  ctx.lineWidth = 1;
  if (grid.kind === "grid") {
    const size = Math.max(2, grid.size);
    for (let gx = x; gx <= x + n.w; gx += size) {
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + n.h);
      ctx.stroke();
    }
    for (let gy = y; gy <= y + n.h; gy += size) {
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + n.w, gy);
      ctx.stroke();
    }
  } else {
    const count = Math.max(1, grid.count);
    const inner = n.w - grid.margin * 2 - grid.gutter * (count - 1);
    const col = inner / count;
    if (col > 0) {
      for (let i = 0; i < count; i++) ctx.fillRect(x + grid.margin + i * (col + grid.gutter), y, col, n.h);
    }
  }
  ctx.restore();
}

function drawChildren(
  ctx: CanvasRenderingContext2D,
  n: DesignNode,
  x: number,
  y: number,
  t: number,
  outline: boolean,
  accent: string,
  onLoad: () => void,
  showGuides: boolean,
  skipFilters = false,
) {
  const masks = n.children.filter((child) => child.mask && child.visible);
  if (!masks.length) {
    for (const child of n.children) drawNode(ctx, child, x, y, t, outline, accent, onLoad, showGuides, [], skipFilters);
    return;
  }
  const layer = document.createElement("canvas");
  layer.width = Math.max(1, Math.ceil(n.w));
  layer.height = Math.max(1, Math.ceil(n.h));
  const g = layer.getContext("2d");
  if (!g) return;
  for (const child of n.children) {
    if (!child.mask) drawNode(g, child, 0, 0, t, outline, accent, onLoad, showGuides, [], skipFilters);
  }
  g.globalCompositeOperation = "destination-in";
  for (const child of masks) drawNode(g, { ...child, mask: false, opacity: 1 }, 0, 0, t, false, accent, onLoad, false);
  ctx.drawImage(layer, x, y);
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  n: DesignNode,
  ox: number,
  oy: number,
  t: number,
  outline: boolean,
  accent: string,
  onLoad: () => void,
  showGuides: boolean,
  ghosts: DesignNode[] = [],
  skipFilters = false,
) {
  if (!n.visible) return;
  const motion = n.keyframes?.length ? sampleMotion(n, t) : null;
  const x = ox + (motion?.x ?? n.x);
  const y = oy + (motion?.y ?? n.y);
  const opacity = motion?.opacity ?? n.opacity;
  const rotation = motion?.rotation ?? n.rotation;
  ctx.save();
  ctx.globalAlpha = opacity;
  if (n.blendMode && n.blendMode !== "normal") ctx.globalCompositeOperation = n.blendMode;
  const filter = applyFilters(n, skipFilters);
  if (filter) ctx.filter = filter;
  ctx.translate(x + n.w / 2, y + n.h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(n.flipX ? -1 : 1, n.flipY ? -1 : 1);
  ctx.translate(-(x + n.w / 2), -(y + n.h / 2));

  if (n.effect === "shadow") {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
  }
  if (n.vector?.points.length) {
    traceVector(ctx, x, y, n.vector.points, n.vector.closed);
    ctx.fillStyle = n.vector.closed ? paintFill(ctx, n, x, y) : "transparent";
    if (n.vector.closed && !outline) ctx.fill();
    ctx.strokeStyle = outline ? accent : n.stroke === "transparent" ? n.fill : n.stroke;
    ctx.lineWidth = outline ? 1.5 : Math.max(1, n.strokeWidth || 2);
    ctx.stroke();
  } else if (n.type === "path") {
    ctx.beginPath();
    ctx.moveTo(x, y + n.h / 2);
    ctx.lineTo(x + n.w, y + n.h / 2);
    ctx.strokeStyle = n.stroke === "transparent" ? n.fill : n.stroke;
    ctx.lineWidth = Math.max(2, n.strokeWidth || 2);
    ctx.stroke();
  } else if (n.imageDataUrl) {
    let img = imageCache.get(n.imageDataUrl);
    if (!img) {
      img = new Image();
      img.src = n.imageDataUrl;
      img.onload = onLoad;
      imageCache.set(n.imageDataUrl, img);
    }
    if (img.complete && img.naturalWidth) {
      const crop = n.crop;
      if (crop) {
        ctx.drawImage(
          img,
          crop.x * img.naturalWidth,
          crop.y * img.naturalHeight,
          Math.max(1, crop.w * img.naturalWidth),
          Math.max(1, crop.h * img.naturalHeight),
          x,
          y,
          n.w,
          n.h,
        );
      } else ctx.drawImage(img, x, y, n.w, n.h);
    }
  } else if (n.shape === "polygon" || n.shape === "star") {
    tracePoly(ctx, x, y, n.w, n.h, n.sides ?? (n.shape === "star" ? 5 : 6), n.shape === "star");
    ctx.fillStyle = paintFill(ctx, n, x, y);
    if (!outline) ctx.fill();
    ctx.strokeStyle = outline ? accent : n.stroke;
    ctx.lineWidth = outline ? 1.5 : n.strokeWidth;
    if (outline || n.strokeWidth) ctx.stroke();
  } else if (n.type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(x + n.w / 2, y + n.h / 2, Math.abs(n.w) / 2, Math.abs(n.h) / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = paintFill(ctx, n, x, y);
    if (!outline) ctx.fill();
    ctx.strokeStyle = outline ? accent : n.stroke;
    ctx.lineWidth = outline ? 1.5 : n.strokeWidth;
    if (outline || n.strokeWidth) ctx.stroke();
  } else if (n.type === "text") {
    if (!outline) ctx.fillStyle = paintFill(ctx, n, x, y);
    ctx.font = `${n.italic ? "italic " : ""}${n.fontWeight ?? 500} ${n.fontSize ?? 16}px Syne, "Source Sans 3", sans-serif`;
    ctx.textBaseline = "top";
    const lines = (n.text ?? "").split("\n");
    const gap = n.lineHeight ?? (n.fontSize ?? 16) * 1.15;
    lines.forEach((line, i) => {
      if (n.letterSpacing) ctx.letterSpacing = `${n.letterSpacing}px`;
      const ly = y + i * gap;
      if (outline) {
        ctx.strokeStyle = accent;
        ctx.strokeText(line, x, ly, n.w);
      } else ctx.fillText(line, x, ly, n.w);
      if (n.underline) {
        const width = Math.min(n.w, ctx.measureText(line).width);
        ctx.beginPath();
        ctx.moveTo(x, ly + (n.fontSize ?? 16) + 2);
        ctx.lineTo(x + width, ly + (n.fontSize ?? 16) + 2);
        ctx.strokeStyle = n.fill;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
    ctx.letterSpacing = "0px";
  } else {
    roundRect(ctx, x, y, n.w, n.h, n.radius);
    ctx.fillStyle = n.fill === "#00000000" || outline ? "transparent" : paintFill(ctx, n, x, y);
    if (!outline && n.fill !== "#00000000") ctx.fill();
    ctx.strokeStyle = outline ? accent : n.stroke;
    ctx.lineWidth = outline ? 1.5 : n.strokeWidth;
    if (outline || n.strokeWidth) ctx.stroke();
  }
  ctx.shadowColor = "transparent";
  ctx.filter = "none";
  if (n.effect === "glass") {
    ctx.save();
    ctx.filter = "blur(12px)";
    ctx.fillStyle = "rgba(236,238,235,0.28)";
    ctx.fillRect(x, y, n.w, n.h);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, n.w, n.h);
  }
  if (n.effect === "tint") {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(196, 92, 38, 0.35)";
    ctx.fillRect(x, y, n.w, n.h);
    ctx.restore();
  }
  for (const stroke of n.strokes ?? []) {
    if (stroke.points.length < 1) continue;
    ctx.beginPath();
    stroke.points.forEach((point, index) => (index ? ctx.lineTo(x + point.x, y + point.y) : ctx.moveTo(x + point.x, y + point.y)));
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  if (showGuides && n.layoutGrid) paintLayoutGrid(ctx, n, x, y);
  if (n.section) {
    ctx.save();
    ctx.fillStyle = "#c45c26";
    ctx.font = "600 14px Geist, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillText(n.name, x, y - 6);
    ctx.restore();
  }
  for (const ghost of ghosts) drawNode(ctx, ghost, x, y, t, false, accent, onLoad, false, [], skipFilters);
  if (!(n.section && n.contentsHidden)) drawChildren(ctx, n, x, y, t, outline, accent, onLoad, showGuides, skipFilters);
  ctx.restore();
}

function hit(nodes: DesignNode[], wx: number, wy: number, deep: boolean, ox = 0, oy = 0): DesignNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (!n.visible || n.locked) continue;
    const x = ox + n.x;
    const y = oy + n.y;
    const inside = wx >= x && wy >= y && wx <= x + n.w && wy <= y + n.h;
    if (!inside) continue;
    if (!(n.section && n.contentsHidden)) {
      const child = hit(n.children, wx, wy, deep, x, y);
      if (deep && child) return child;
    }
    return n;
  }
  return null;
}

export function CanvasStage({
  canvasRef,
  onCursor,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onCursor?: (x: number, y: number) => void;
}) {
  const { state, dispatch } = useStudio();
  const [, bump] = useState(0);
  const drag = useRef<{ id: string; dx: number; dy: number; mode: "move" | "scale" | "resize"; handle?: ResizeHandle; sx: number; sy: number; sw: number; sh: number; ox: number; oy: number } | null>(null);
  const draft = useRef<{ id: string; kind: string; x0: number; y0: number; px: number; py: number; w: number; h: number } | null>(null);
  const pan = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const recorded = useRef(false);
  const paint = useRef<{ id: string; points: { x: number; y: number }[]; base: NonNullable<DesignNode["strokes"]> } | null>(null);
  const cropDrag = useRef<{ id: string; x0: number; y0: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const flowRef = useRef<{ id: string; x: number; y: number; px: number; py: number; ox: number; oy: number; rewire: boolean; moved: boolean } | null>(null);
  const [flowTick, setFlowTick] = useState(0);
  const linkHover = useRef(false);
  const [linkCursor, setLinkCursor] = useState(false);
  const penRef = useRef<{ id: string; points: { x: number; y: number }[]; originX: number; originY: number } | null>(null);
  const penCursor = useRef<{ x: number; y: number } | null>(null);
  const pencilRef = useRef<{ id: string; points: { x: number; y: number }[]; originX: number; originY: number } | null>(null);
  const [penTick, setPenTick] = useState(0);
  const [resizeCursor, setResizeCursor] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const parent = canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;

    const render = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(state.camera.x, state.camera.y);
      ctx.scale(state.camera.zoom, state.camera.zoom);
      if (state.pixelPreview) ctx.imageSmoothingEnabled = false;
      if (state.showGrid) paintCanvasGrid(ctx, state.camera, w, h);
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#c45c26";
      const visuals = resolveTree(state.doc.pages, state.doc.variables);
      const master = visuals.find((page) => page.master);
      for (const [index, page] of visuals.entries()) {
        const range = clipRange(page, index);
        const filmDim = state.mode === "film" && (state.playhead < range.start || state.playhead >= range.start + range.duration);
        const ghosts = page.usesMaster && master && master.id !== page.id ? master.children : [];
        const drawn = filmDim ? { ...page, opacity: page.opacity * 0.18 } : page;
        drawNode(ctx, drawn, 0, 0, state.playhead, state.outline, accent, () => bump((n) => n + 1), state.showGuides, ghosts, state.compareDevelop);
      }
      for (const id of state.doc.selectedIds) {
        const visual = findNode(visuals, id);
        if (visual && !visual.visible) continue;
        const sel = findNode(state.doc.pages, id);
        const abs = sel ? absPos(state.doc.pages, sel.id) : null;
        if (sel && abs) {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.5 / state.camera.zoom;
          ctx.setLineDash([6 / state.camera.zoom, 4 / state.camera.zoom]);
          ctx.strokeRect(abs.x - 2, abs.y - 2, sel.w + 4, sel.h + 4);
          ctx.setLineDash([]);
          if (state.tool === "select" && state.mode !== "prototype" && id === state.doc.selectedId) {
            const size = 6 / state.camera.zoom;
            ctx.fillStyle = "#141817";
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1 / state.camera.zoom;
            for (const name of RESIZE_HANDLES) {
              const point = handlePoint(abs, sel, name);
              ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
              ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
            }
          }
        }
      }
      if (penRef.current) {
        const live = penRef.current;
        ctx.beginPath();
        live.points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
        if (penCursor.current) ctx.lineTo(penCursor.current.x, penCursor.current.y);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5 / state.camera.zoom;
        ctx.stroke();
      }
      if (state.showCursors) for (const c of state.collaborators) {
        if (c.x == null || c.y == null) continue;
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + 14 / state.camera.zoom, c.y + 12 / state.camera.zoom);
        ctx.lineTo(c.x + 5 / state.camera.zoom, c.y + 12 / state.camera.zoom);
        ctx.closePath();
        ctx.fill();
        const label = c.name.trim() || "Online";
        ctx.font = `600 ${12 / state.camera.zoom}px Geist, "Source Sans 3", sans-serif`;
        ctx.fillText(label, c.x + 16 / state.camera.zoom, c.y + 14 / state.camera.zoom);
      }
      if (state.mode === "prototype") {
        const accent = "#d6ff45";
        ctx.save();
        ctx.lineWidth = 1.75 / state.camera.zoom;
        ctx.strokeStyle = accent;
        ctx.fillStyle = accent;
        ctx.font = `500 ${11 / state.camera.zoom}px Geist, sans-serif`;
        for (const node of flatten(state.doc.pages)) {
          const link = node.interaction;
          if (!link?.targetId) continue;
          const from = absPos(state.doc.pages, node.id);
          const target = findNode(state.doc.pages, link.targetId);
          const to = target ? absPos(state.doc.pages, target.id) : null;
          if (!from || !to || !target) continue;
          const x1 = from.x + node.w;
          const y1 = from.y + node.h / 2;
          const x2 = to.x;
          const y2 = to.y + target.h / 2;
          const pull = Math.max(48, Math.abs(x2 - x1) / 2);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.bezierCurveTo(x1 + pull, y1, x2 - pull, y2, x2, y2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x2, y2, 6 / state.camera.zoom, 0, Math.PI * 2);
          ctx.fillStyle = "#141817";
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = accent;
          const label = link.trigger === "hover" ? "Hover" : link.trigger === "drag" ? "Drag" : link.trigger === "after-delay" ? "Delay" : "On click";
          ctx.fillText(label, (x1 + x2) / 2 - 18 / state.camera.zoom, (y1 + y2) / 2 - 8 / state.camera.zoom);
        }
        const source = prototypeFrame(state.doc.pages, state.doc.selectedId);
        const sourceAt = source ? absPos(state.doc.pages, source.id) : null;
        if (source && sourceAt && (state.tool === "select" || state.tool === "flow")) {
          const handle = linkHandle(sourceAt, source);
          ctx.beginPath();
          ctx.arc(handle.x, handle.y, 7 / state.camera.zoom, 0, Math.PI * 2);
          ctx.fillStyle = "#141817";
          ctx.fill();
          ctx.lineWidth = 1.75 / state.camera.zoom;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(handle.x - 3 / state.camera.zoom, handle.y);
          ctx.lineTo(handle.x + 3 / state.camera.zoom, handle.y);
          ctx.moveTo(handle.x, handle.y - 3 / state.camera.zoom);
          ctx.lineTo(handle.x, handle.y + 3 / state.camera.zoom);
          ctx.stroke();
        }
        const live = flowRef.current;
        if (live) {
          const pull = Math.max(48, Math.abs(live.px - live.x) / 2);
          ctx.beginPath();
          ctx.moveTo(live.x, live.y);
          ctx.bezierCurveTo(live.x + pull, live.y, live.px - pull, live.py, live.px, live.py);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(live.px, live.py, 4 / state.camera.zoom, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (state.showComments || state.tool === "comment") for (const pin of pageComments(state.doc)) {
        ctx.fillStyle = "#f3ece1";
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, 8 / state.camera.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#8f2d14";
        ctx.font = `600 ${10 / state.camera.zoom}px "IBM Plex Mono"`;
        ctx.fillText("!", pin.x - 3 / state.camera.zoom, pin.y + 4 / state.camera.zoom);
      }
      ctx.restore();
      const selected = state.doc.selectedId ? findNode(state.doc.pages, state.doc.selectedId) : null;
      const selectedAt = selected ? absPos(state.doc.pages, selected.id) : null;
      const mark = selected && selectedAt ? { x: selectedAt.x, y: selectedAt.y, w: selected.w, h: selected.h } : null;
      if (state.showRulers) {
        paintRulers(ctx, state.camera, w, h, mark);
        if (mark) paintSizeBadge(ctx, state.camera, mark);
      }
    };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [state, canvasRef, flowTick, penTick]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const session = penRef.current;
      if (!session || (event.key !== "Escape" && event.key !== "Enter")) return;
      event.preventDefault();
      event.stopPropagation();
      penRef.current = null;
      penCursor.current = null;
      setPenTick((tick) => tick + 1);
      if (event.key === "Escape" || session.points.length < 2) dispatch({ type: "remove", id: session.id });
      else dispatch({ type: "patch", id: session.id, patch: fitVector(session.points, session.originX, session.originY, false) });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dispatch]);

  useEffect(() => {
    if (state.tool === "pen" || !penRef.current) return;
    const session = penRef.current;
    penRef.current = null;
    penCursor.current = null;
    if (session.points.length < 2) dispatch({ type: "remove", id: session.id });
    else dispatch({ type: "patch", id: session.id, patch: fitVector(session.points, session.originX, session.originY, false) });
  }, [state.tool, dispatch]);

  const worldFromClient = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - state.camera.x) / state.camera.zoom,
      y: (clientY - rect.top - state.camera.y) / state.camera.zoom,
    };
  };

  const toWorld = (e: React.PointerEvent) => worldFromClient(e.clientX, e.clientY);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const down = toWorld(e);
    onCursor?.(down.x, down.y);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* Pointer capture is only available for a live pointer. */
    }
    const w = toWorld(e);
    recorded.current = false;
    if (state.tool === "hand" || state.spacePan || e.button === 1) {
      pan.current = { x: e.clientX, y: e.clientY, cx: state.camera.x, cy: state.camera.y };
      return;
    }
    if (state.tool === "zoom") {
      const rect = canvasRef.current!.getBoundingClientRect();
      const zoom = Math.min(64, Math.max(0.02, state.camera.zoom * (e.altKey ? 1 / 1.5 : 1.5)));
      dispatch({
        type: "camera",
        camera: {
          zoom,
          x: e.clientX - rect.left - w.x * zoom,
          y: e.clientY - rect.top - w.y * zoom,
        },
      });
      return;
    }
    if (state.tool === "crop" || state.tool === "brush") {
      const target = hit(resolveTree(state.doc.pages, state.doc.variables), w.x, w.y, false) ?? state.doc.pages[0];
      if (!target) return;
      dispatch({ type: "select", id: target.id });
      if (state.tool === "brush") paint.current = { id: target.id, points: [], base: target.strokes ?? [] };
      else cropDrag.current = { id: target.id, x0: w.x, y0: w.y };
      return;
    }
    const nearPin = pageComments(state.doc).find((pin) => Math.hypot(pin.x - w.x, pin.y - w.y) < 16 / state.camera.zoom);
    if (nearPin && (state.tool === "select" || state.tool === "comment")) {
      dispatch({ type: "tool", tool: "comment" });
      dispatch({ type: "ui", patch: { activeCommentId: nearPin.id, showComments: true } });
      return;
    }
    if (state.tool === "comment") {
      const id = uid("c");
      dispatch({ type: "comment", pin: { id, x: w.x, y: w.y, author: "You", body: "", resolved: false, createdAt: Date.now(), attachments: [] } });
      dispatch({ type: "ui", patch: { activeCommentId: id, showComments: true } });
      return;
    }
    if (state.mode === "prototype" && (state.tool === "select" || state.tool === "flow")) {
      const grabbed = connectorAt(state.doc.pages, w, state.camera.zoom);
      if (grabbed) {
        const from = absPos(state.doc.pages, grabbed.id);
        const handle = from ? linkHandle(from, grabbed) : w;
        flowRef.current = { id: grabbed.id, x: handle.x, y: handle.y, px: w.x, py: w.y, ox: w.x, oy: w.y, rewire: true, moved: false };
        setFlowTick((tick) => tick + 1);
        dispatch({ type: "select", id: grabbed.id });
        return;
      }
      const source = prototypeFrame(state.doc.pages, state.doc.selectedId);
      const abs = source ? absPos(state.doc.pages, source.id) : null;
      if (source && abs && nearLinkHandle(abs, source, w, state.camera.zoom)) {
        const handle = linkHandle(abs, source);
        flowRef.current = { id: source.id, x: handle.x, y: handle.y, px: w.x, py: w.y, ox: w.x, oy: w.y, rewire: false, moved: false };
        setFlowTick((tick) => tick + 1);
        return;
      }
    }
    if (state.tool === "flow") {
      const source = screenAt(state.doc.pages, w.x, w.y) ?? hit(resolveTree(state.doc.pages, state.doc.variables), w.x, w.y, false);
      if (source) {
        const abs = absPos(state.doc.pages, source.id);
        const handle = abs ? linkHandle(abs, source) : w;
        flowRef.current = { id: source.id, x: handle.x, y: handle.y, px: w.x, py: w.y, ox: w.x, oy: w.y, rewire: false, moved: false };
        setFlowTick((tick) => tick + 1);
        dispatch({ type: "select", id: source.id });
      }
      return;
    }
    if (state.tool === "eraser") {
      const target = hit(resolveTree(state.doc.pages, state.doc.variables), w.x, w.y, true);
      if (!target) return;
      if (target.strokes?.length) dispatch({ type: "patch", id: target.id, patch: { strokes: [] } });
      else dispatch({ type: "remove", id: target.id });
      return;
    }
    if (state.tool === "bucket" || state.tool === "wand" || state.tool === "stamp" || state.tool === "razor" || state.tool === "slip" || state.tool === "audio") {
      const target = hit(resolveTree(state.doc.pages, state.doc.variables), w.x, w.y, true);
      if (state.tool === "audio") {
        const host = containingFrame(state.doc.pages, w.x, w.y);
        dispatch({
          type: "add",
          parentId: host?.id ?? null,
          node: {
            id: uid(),
            type: "rect",
            name: "Audio",
            x: w.x - (host?.x ?? 0),
            y: w.y - (host?.y ?? 0),
            w: 240,
            h: 36,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            fill: "#3d6f8f",
            stroke: "transparent",
            strokeWidth: 0,
            radius: 4,
            start: 0,
            duration: 4,
            children: [],
          },
        });
        return;
      }
      if (!target) return;
      if (state.tool === "bucket") {
        const ink = document.querySelector<HTMLInputElement>('input[aria-label="Foreground color"]')?.value || "#d6ff45";
        dispatch({ type: "patch", id: target.id, patch: { fill: ink } });
      } else if (state.tool === "wand") {
        dispatch({ type: "select", id: target.id });
        dispatch({ type: "filters", id: target.id, filters: { saturation: Math.min(1, (target.filters?.saturation ?? 0) + 0.15) } });
      } else if (state.tool === "stamp") {
        const dup = duplicateNodes(state.doc.pages, [target.id]);
        if (dup) dispatch({ type: "replaceDoc", pages: dup.pages, selectedIds: dup.ids });
      } else if (state.tool === "razor") {
        const half = (target.duration ?? 4) / 2;
        const dup = duplicateNodes(state.doc.pages, [target.id]);
        if (!dup) return;
        const pages = updateNode(updateNode(dup.pages, target.id, { duration: half }), dup.ids[0], { start: (target.start ?? 0) + half, duration: half });
        dispatch({ type: "replaceDoc", pages, selectedIds: [target.id, dup.ids[0]] });
      } else if (state.tool === "slip") {
        dispatch({ type: "patch", id: target.id, patch: { start: (target.start ?? 0) + 0.5 } });
      }
      return;
    }
    if ((state.tool === "pen" || state.tool === "pencil") && (state.mode === "design" || state.mode === "vector")) {
      const host = containingFrame(state.doc.pages, w.x, w.y);
      const originX = host?.x ?? 0;
      const originY = host?.y ?? 0;
      if (state.tool === "pencil" || !penRef.current) {
        const id = uid();
        dispatch({
          type: "add",
          parentId: host?.id ?? null,
          node: vectorNode(id, state.tool === "pencil" ? "Pencil" : "Path", w, originX, originY),
        });
        const session = { id, points: [w], originX, originY };
        if (state.tool === "pencil") pencilRef.current = session;
        else {
          penRef.current = session;
          setPenTick((tick) => tick + 1);
        }
        dispatch({ type: "select", id });
        return;
      }
      if (e.detail > 1) {
        const session = penRef.current;
        penRef.current = null;
        penCursor.current = null;
        setPenTick((tick) => tick + 1);
        if (session.points.length < 2) dispatch({ type: "remove", id: session.id });
        else dispatch({ type: "patch", id: session.id, patch: fitVector(session.points, session.originX, session.originY, false) });
        return;
      }
      const first = penRef.current.points[0];
      const close = penRef.current.points.length > 2 && Math.hypot(w.x - first.x, w.y - first.y) < 10 / state.camera.zoom;
      if (close) {
        dispatch({ type: "patch", id: penRef.current.id, patch: fitVector(penRef.current.points, penRef.current.originX, penRef.current.originY, true) });
        penRef.current = null;
        penCursor.current = null;
        setPenTick((tick) => tick + 1);
        return;
      }
      penRef.current.points.push(w);
      dispatch({ type: "patch", id: penRef.current.id, history: false, patch: fitVector(penRef.current.points, penRef.current.originX, penRef.current.originY, false) });
      setPenTick((tick) => tick + 1);
      return;
    }
    if (state.tool === "select" && state.mode !== "prototype" && state.doc.selectedId) {
      const selected = findNode(state.doc.pages, state.doc.selectedId);
      const selectedAt = selected ? absPos(state.doc.pages, selected.id) : null;
      const handle = selected && selectedAt ? handleAt(selectedAt, selected, w, state.camera.zoom) : null;
      if (handle && selected && !selected.locked) {
        drag.current = { id: selected.id, dx: 0, dy: 0, mode: "resize", handle, sx: w.x, sy: w.y, sw: selected.w, sh: selected.h, ox: selectedAt?.x ?? 0, oy: selectedAt?.y ?? 0 };
        return;
      }
    }
    const shapeTools = ["frame", "section", "rect", "ellipse", "polygon", "star", "line", "text", "slice", "hotspot", "camera"];
    if (shapeTools.includes(state.tool)) {
      const host = containingFrame(state.doc.pages, w.x, w.y);
      const line = state.tool === "line" || state.tool === "pen" || state.tool === "pencil";
      const node: DesignNode = {
        id: uid(),
        type: line ? "path" : state.tool === "ellipse" ? "ellipse" : state.tool === "text" ? "text" : state.tool === "rect" || state.tool === "polygon" || state.tool === "star" ? "rect" : "frame",
        name: state.tool === "section" ? "Section" : state.tool === "slice" ? "Slice" : state.tool === "text" ? "Text" : state.tool === "hotspot" ? "Hotspot" : state.tool === "camera" ? "Camera" : state.tool === "frame" ? "Frame" : state.tool === "polygon" ? "Polygon" : state.tool === "star" ? "Star" : state.tool,
        shape: state.tool === "polygon" || state.tool === "star" ? state.tool : undefined,
        sides: state.tool === "star" ? 5 : state.tool === "polygon" ? 6 : undefined,
        x: w.x - (host?.x ?? 0),
        y: w.y - (host?.y ?? 0),
        w: 1,
        h: 1,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: state.tool === "text" || line ? "#f3ece1" : state.tool === "hotspot" ? "#00000000" : state.tool === "rect" || state.tool === "ellipse" || state.tool === "polygon" || state.tool === "star" ? "#c45c26" : state.tool === "slice" ? "#00000000" : state.tool === "camera" ? "#141817" : "#f6f1ea",
        stroke: state.tool === "hotspot" ? "#d6ff45" : state.tool === "slice" || state.tool === "section" ? "#c45c26" : state.tool === "frame" || state.tool === "camera" ? "#d9cfc3" : "transparent",
        strokeWidth: state.tool === "slice" || state.tool === "section" || state.tool === "frame" || state.tool === "hotspot" || state.tool === "camera" ? 1 : line ? 2 : 0,
        section: state.tool === "section",
        radius: state.tool === "ellipse" ? 999 : 0,
        text: state.tool === "text" ? "Text" : undefined,
        fontSize: state.tool === "text" ? 32 : undefined,
        fontWeight: 600,
        children: [],
      };
      dispatch({ type: "add", parentId: host?.id ?? null, node });
      draft.current = { id: node.id, kind: state.tool, x0: w.x, y0: w.y, px: host?.x ?? 0, py: host?.y ?? 0, w: 1, h: 1 };
      return;
    }
    const deep = isMac ? e.metaKey : e.ctrlKey;
    const target = hit(resolveTree(state.doc.pages, state.doc.variables), w.x, w.y, deep || state.tool === "eyedropper" || state.tool === "direct");
    if (state.tool === "eyedropper" && target && state.doc.selectedId) {
      dispatch({ type: "patch", id: state.doc.selectedId, patch: { fill: target.fill } });
      dispatch({ type: "tool", tool: "select" });
      return;
    }
    if (e.altKey && state.tool === "select" && target && !target.locked) {
      const dup = duplicateNodes(state.doc.pages, [target.id]);
      if (dup) {
        dispatch({ type: "replaceDoc", pages: dup.pages, selectedIds: dup.ids });
        const abs = absPos(dup.pages, dup.ids[0]);
        drag.current = { id: dup.ids[0], dx: w.x - (abs?.x ?? 0), dy: w.y - (abs?.y ?? 0), mode: "move", sx: 0, sy: 0, sw: 0, sh: 0, ox: 0, oy: 0 };
        recorded.current = true;
        return;
      }
    }
    dispatch({ type: "select", id: target?.id ?? null, shift: e.shiftKey });
    if (target && !target.locked && !e.shiftKey) {
      const abs = absPos(state.doc.pages, target.id);
      drag.current = {
        id: target.id,
        dx: w.x - (abs?.x ?? 0),
        dy: w.y - (abs?.y ?? 0),
        mode: state.tool === "scale" || state.tool === "expand" ? "scale" : "move",
        sx: w.x,
        sy: w.y,
        sw: target.w,
        sh: target.h,
        ox: target.x,
        oy: target.y,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pointed = toWorld(e);
    onCursor?.(pointed.x, pointed.y);
    if (state.mode === "prototype" && state.tool === "select" && !flowRef.current && !drag.current) {
      const source = prototypeFrame(state.doc.pages, state.doc.selectedId);
      const abs = source ? absPos(state.doc.pages, source.id) : null;
      const near = !!(
        (source && abs && nearLinkHandle(abs, source, pointed, state.camera.zoom)) ||
        connectorAt(state.doc.pages, pointed, state.camera.zoom)
      );
      if (near !== linkHover.current) {
        linkHover.current = near;
        setLinkCursor(near);
      }
    } else if (linkHover.current) {
      linkHover.current = false;
      setLinkCursor(false);
    }
    if (pencilRef.current) {
      pencilRef.current.points.push(pointed);
      dispatch({
        type: "patch",
        id: pencilRef.current.id,
        history: false,
        patch: fitVector(pencilRef.current.points, pencilRef.current.originX, pencilRef.current.originY, false),
      });
      return;
    }
    if (penRef.current) {
      penCursor.current = pointed;
      setPenTick((tick) => tick + 1);
    }
    if (state.tool === "select" && state.mode !== "prototype" && !drag.current) {
      const selected = state.doc.selectedId ? findNode(state.doc.pages, state.doc.selectedId) : null;
      const selectedAt = selected ? absPos(state.doc.pages, selected.id) : null;
      const handle = selected && selectedAt ? handleAt(selectedAt, selected, pointed, state.camera.zoom) : null;
      const next = handle ? RESIZE_CURSOR[handle] : "";
      if (next !== resizeCursor) setResizeCursor(next);
    } else if (resizeCursor) setResizeCursor("");
    if (flowRef.current) {
      const moved = flowRef.current.moved || Math.hypot(pointed.x - flowRef.current.ox, pointed.y - flowRef.current.oy) > 4 / state.camera.zoom;
      flowRef.current = { ...flowRef.current, px: pointed.x, py: pointed.y, moved };
      setFlowTick((tick) => tick + 1);
      return;
    }
    if (paint.current || cropDrag.current) {
      const w = toWorld(e);
      const mark = paint.current ?? cropDrag.current;
      if (!mark) return;
      if (!recorded.current) {
        dispatch({ type: "checkpoint" });
        recorded.current = true;
      }
      const node = findNode(state.doc.pages, mark.id);
      const abs = node ? absPos(state.doc.pages, mark.id) : null;
      if (!node || !abs) return;
      if (paint.current) {
        paint.current.points.push({ x: w.x - abs.x, y: w.y - abs.y });
        dispatch({
          type: "patch",
          id: node.id,
          history: false,
          patch: { strokes: [...paint.current.base, { points: paint.current.points, color: "#c45c26", size: 10 }] },
        });
      } else if (cropDrag.current) {
        const x0 = Math.min(cropDrag.current.x0, w.x);
        const y0 = Math.min(cropDrag.current.y0, w.y);
        const cw = Math.min(1, Math.max(0.05, Math.abs(w.x - cropDrag.current.x0) / Math.max(1, node.w)));
        const ch = Math.min(1, Math.max(0.05, Math.abs(w.y - cropDrag.current.y0) / Math.max(1, node.h)));
        dispatch({
          type: "patch",
          id: node.id,
          history: false,
          patch: {
            crop: {
              x: Math.min(Math.max(0, (x0 - abs.x) / Math.max(1, node.w)), 1 - cw),
              y: Math.min(Math.max(0, (y0 - abs.y) / Math.max(1, node.h)), 1 - ch),
              w: cw,
              h: ch,
            },
          },
        });
      }
      return;
    }
    if (pan.current) {
      dispatch({
        type: "camera",
        camera: {
          x: pan.current.cx + (e.clientX - pan.current.x),
          y: pan.current.cy + (e.clientY - pan.current.y),
        },
      });
      return;
    }
    if (draft.current) {
      const w = toWorld(e);
      let dx = w.x - draft.current.x0;
      let dy = w.y - draft.current.y0;
      if (e.shiftKey) {
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx || 1) * side;
        dy = Math.sign(dy || 1) * side;
      }
      const width = Math.max(1, Math.abs(dx));
      const height = Math.max(1, Math.abs(dy));
      draft.current.w = width;
      draft.current.h = height;
      dispatch({
        type: "patch",
        id: draft.current.id,
        history: false,
        patch: {
          x: Math.min(draft.current.x0, draft.current.x0 + dx) - draft.current.px,
          y: Math.min(draft.current.y0, draft.current.y0 + dy) - draft.current.py,
          w: width,
          h: height,
        },
      });
      return;
    }
    if (!drag.current) return;
    if (!recorded.current) {
      dispatch({ type: "checkpoint" });
      recorded.current = true;
    }
    const w = toWorld(e);
    const node = findNode(state.doc.pages, drag.current.id);
    if (!node) return;
    if (drag.current.mode === "resize" && drag.current.handle) {
      const handle = drag.current.handle;
      let left = drag.current.ox;
      let top = drag.current.oy;
      let width = drag.current.sw;
      let height = drag.current.sh;
      const dx = w.x - drag.current.sx;
      const dy = w.y - drag.current.sy;
      if (handle.includes("e")) width = Math.max(1, drag.current.sw + dx);
      if (handle.includes("s")) height = Math.max(1, drag.current.sh + dy);
      if (handle.includes("w")) {
        width = Math.max(1, drag.current.sw - dx);
        left = drag.current.ox + drag.current.sw - width;
      }
      if (handle.includes("n")) {
        height = Math.max(1, drag.current.sh - dy);
        top = drag.current.oy + drag.current.sh - height;
      }
      if (e.shiftKey && drag.current.sw > 0) {
        const ratio = drag.current.sh / drag.current.sw;
        if (handle === "n" || handle === "s") width = Math.max(1, height / ratio);
        else height = Math.max(1, width * ratio);
      }
      const parent = parentOffset(state.doc.pages, drag.current.id);
      dispatch({
        type: "patch",
        id: drag.current.id,
        history: false,
        patch: { x: left - parent.x, y: top - parent.y, w: width, h: height },
      });
      return;
    }
    if (drag.current.mode === "scale") {
      let dw = w.x - drag.current.sx;
      let dh = w.y - drag.current.sy;
      if (e.shiftKey && drag.current.sw > 0 && drag.current.sh > 0) {
        const ratio = drag.current.sh / drag.current.sw;
        if (Math.abs(dw) * ratio > Math.abs(dh)) dh = dw * ratio;
        else dw = dh / ratio;
      }
      dispatch({
        type: "patch",
        id: drag.current.id,
        history: false,
        patch: e.altKey
          ? {
              x: drag.current.ox - dw,
              y: drag.current.oy - dh,
              w: Math.max(1, drag.current.sw + dw * 2),
              h: Math.max(1, drag.current.sh + dh * 2),
            }
          : {
              w: Math.max(1, drag.current.sw + dw),
              h: Math.max(1, drag.current.sh + dh),
            },
      });
      return;
    }
    const parentAbs = parentOffset(state.doc.pages, drag.current.id);
    dispatch({
      type: "patch",
      id: drag.current.id,
      history: false,
      patch: { x: w.x - drag.current.dx - parentAbs.x, y: w.y - drag.current.dy - parentAbs.y },
    });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (flowRef.current) {
      const live = flowRef.current;
      const sourceId = live.id;
      const point = worldFromClient(e.clientX, e.clientY);
      const dest = screenAt(state.doc.pages, point.x, point.y) ?? hit(resolveTree(state.doc.pages, state.doc.variables), point.x, point.y, false);
      const onto = dest && dest.id !== sourceId ? dest : null;
      const existing = findNode(state.doc.pages, sourceId)?.interaction;
      flowRef.current = null;
      setFlowTick((tick) => tick + 1);
      if (onto) {
        dispatch({
          type: "patch",
          id: sourceId,
          patch: {
            interaction: {
              trigger: existing?.trigger ?? "click",
              action: existing?.action ?? "navigate",
              duration: existing?.duration ?? 300,
              delay: existing?.delay ?? 0,
              easing: existing?.easing ?? "ease-out",
              animation: existing?.animation ?? "smart",
              preserveScroll: existing?.preserveScroll ?? false,
              targetId: onto.id,
            },
          },
        });
        dispatch({ type: "select", id: sourceId });
      } else if (live.rewire && live.moved) {
        dispatch({ type: "patch", id: sourceId, patch: { interaction: null } });
        dispatch({ type: "select", id: sourceId });
      }
    }
    if (draft.current) {
      const drawn = draft.current;
      draft.current = null;
      if (drawn.w < 4 && drawn.h < 4) {
        const [w, h] = clickSize(drawn.kind);
        dispatch({ type: "patch", id: drawn.id, history: false, patch: { w, h } });
      }
      if (drawn.kind === "text") setEditingId(drawn.id);
      dispatch({ type: "tool", tool: "select" });
    }
    drag.current = null;
    pencilRef.current = null;
    pan.current = null;
    paint.current = null;
    cropDrag.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const w = worldFromClient(e.clientX, e.clientY);
    const target = hit(resolveTree(state.doc.pages, state.doc.variables), w.x, w.y, true);
    if (target?.type === "text") {
      dispatch({ type: "select", id: target.id });
      setEditingId(target.id);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const w = worldFromClient(e.clientX, e.clientY);
    const host = containingFrame(state.doc.pages, w.x, w.y);
    const assetId = e.dataTransfer.getData("text/df-node");
    if (assetId) {
      const dup = duplicateNodes(state.doc.pages, [assetId]);
      if (!dup) return;
      const source = findNode(state.doc.pages, assetId);
      const parent = parentOffset(dup.pages, dup.ids[0]);
      dispatch({
        type: "replaceDoc",
        pages: updateNode(dup.pages, dup.ids[0], {
          x: w.x - parent.x,
          y: w.y - parent.y,
          ...(source?.component ? { component: false, instanceOf: assetId, variantName: source.variantName, variantProps: source.variantProps } : {}),
        }),
        selectedIds: dup.ids,
      });
      return;
    }
    const file = [...e.dataTransfer.files].find((item) => item.type.startsWith("image/"));
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const node: DesignNode = {
        id: uid(),
        type: "image",
        name: file.name,
        x: w.x - (host?.x ?? 0),
        y: w.y - (host?.y ?? 0),
        w: 320,
        h: 220,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: "#00000000",
        stroke: "transparent",
        strokeWidth: 0,
        radius: 0,
        imageDataUrl: String(reader.result),
        children: [],
      };
      dispatch({ type: "add", parentId: host?.id ?? null, node });
    };
    reader.readAsDataURL(file);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const zoom = Math.min(64, Math.max(0.02, state.camera.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
      dispatch({ type: "camera", camera: { zoom } });
      return;
    }
    if (e.shiftKey) dispatch({ type: "camera", camera: { x: state.camera.x - e.deltaY } });
    else dispatch({ type: "camera", camera: { x: state.camera.x - e.deltaX, y: state.camera.y - e.deltaY } });
  };

  const editing = editingId ? findNode(state.doc.pages, editingId) : null;
  const editingAt = editingId ? absPos(state.doc.pages, editingId) : null;

  return (
    <div
      className="canvas-host"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <canvas
        ref={canvasRef}
        role="application"
        aria-label="Design canvas"
        style={{ cursor: resizeCursor || (linkCursor ? "crosshair" : canvasCursor(state.tool, state.spacePan)) }}
        onPointerDown={onPointerDown}
        onContextMenu={(event) => {
          event.preventDefault();
          const world = worldFromClient(event.clientX, event.clientY);
          const target = hit(resolveTree(state.doc.pages, state.doc.variables), world.x, world.y, isMac ? event.metaKey : event.ctrlKey);
          if (target) {
            if (!state.doc.selectedIds.includes(target.id)) dispatch({ type: "select", id: target.id });
          } else if (state.doc.selectedId) {
            dispatch({ type: "select", id: null });
          }
          openNodeMenu({ x: event.clientX, y: event.clientY, world });
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
      />
      {editing && editingAt && (
        <textarea
          className="text-editor"
          aria-label="Edit text"
          autoFocus
          value={editing.text ?? ""}
          onChange={(e) => dispatch({ type: "patch", id: editing.id, patch: { text: e.target.value }, history: false })}
          onBlur={() => setEditingId(null)}
          style={{
            left: state.camera.x + editingAt.x * state.camera.zoom,
            top: state.camera.y + editingAt.y * state.camera.zoom,
            width: Math.max(40, editing.w * state.camera.zoom),
            height: Math.max(24, editing.h * state.camera.zoom),
            color: editing.fill,
            fontSize: (editing.fontSize ?? 16) * state.camera.zoom,
            fontWeight: editing.fontWeight ?? 600,
            letterSpacing: (editing.letterSpacing ?? 0) * state.camera.zoom,
            lineHeight: editing.lineHeight ? `${editing.lineHeight * state.camera.zoom}px` : undefined,
            fontStyle: editing.italic ? "italic" : "normal",
            textDecoration: editing.underline ? "underline" : "none",
          }}
        />
      )}
    </div>
  );
}

const RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type ResizeHandle = (typeof RESIZE_HANDLES)[number];
const RESIZE_CURSOR: Record<ResizeHandle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

function handlePoint(abs: { x: number; y: number }, node: DesignNode, handle: ResizeHandle) {
  const east = handle.includes("e");
  const south = handle.includes("s");
  const west = handle.includes("w");
  const north = handle.includes("n");
  return {
    x: west ? abs.x : east ? abs.x + node.w : abs.x + node.w / 2,
    y: north ? abs.y : south ? abs.y + node.h : abs.y + node.h / 2,
  };
}

function handleAt(abs: { x: number; y: number }, node: DesignNode, point: { x: number; y: number }, zoom: number): ResizeHandle | null {
  const reach = 8 / zoom;
  for (const handle of RESIZE_HANDLES) {
    const at = handlePoint(abs, node, handle);
    if (Math.hypot(point.x - at.x, point.y - at.y) <= reach) return handle;
  }
  return null;
}

function traceVector(ctx: CanvasRenderingContext2D, x: number, y: number, points: { x: number; y: number }[], closed: boolean) {
  ctx.beginPath();
  points.forEach((point, index) => (index ? ctx.lineTo(x + point.x, y + point.y) : ctx.moveTo(x + point.x, y + point.y)));
  if (closed) ctx.closePath();
}

function tracePoly(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sides: number, star: boolean) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.abs(w) / 2;
  const ry = Math.abs(h) / 2;
  const count = Math.max(3, sides) * (star ? 2 : 1);
  ctx.beginPath();
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    const scale = star && index % 2 === 1 ? 0.42 : 1;
    const px = cx + Math.cos(angle) * rx * scale;
    const py = cy + Math.sin(angle) * ry * scale;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function fitVector(points: { x: number; y: number }[], originX: number, originY: number, closed: boolean) {
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    x: minX - originX,
    y: minY - originY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
    vector: { closed, points: points.map((point) => ({ x: point.x - minX, y: point.y - minY })) },
  };
}

function vectorNode(id: string, name: string, point: { x: number; y: number }, originX: number, originY: number): DesignNode {
  return {
    id,
    type: "path",
    name,
    x: point.x - originX,
    y: point.y - originY,
    w: 1,
    h: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: "#c45c26",
    stroke: "#f3ece1",
    strokeWidth: 2,
    radius: 0,
    vector: { points: [{ x: 0, y: 0 }], closed: false },
    children: [],
  };
}

function canvasCursor(tool: string, spacePan: boolean): string {
  if (tool === "hand" || spacePan) return "grab";
  if (tool === "zoom") return "zoom-in";
  if (tool === "text") return "text";
  if (tool === "crop" || tool === "brush") return "crosshair";
  if (["frame", "section", "rect", "ellipse", "polygon", "star", "line", "pen", "pencil", "slice", "hotspot", "camera", "flow", "razor"].includes(tool)) return "crosshair";
  return "default";
}

function clickSize(kind: string): [number, number] {
  if (kind === "text") return [280, 48];
  if (kind === "line" || kind === "pen" || kind === "pencil") return [160, 4];
  if (kind === "ellipse") return [120, 120];
  if (kind === "frame" || kind === "section") return [390, 280];
  return [160, 120];
}

function prototypeFrame(pages: DesignNode[], selectedId: string | null): DesignNode | null {
  if (!selectedId) return null;
  const id = rootFrameId(pages, selectedId);
  if (!id) return null;
  return pages.find((page) => page.id === id) ?? null;
}

function linkHandle(abs: { x: number; y: number }, node: DesignNode) {
  return { x: abs.x + node.w, y: abs.y + node.h / 2 };
}

function nearLinkHandle(abs: { x: number; y: number }, node: DesignNode, point: { x: number; y: number }, zoom: number) {
  const handle = linkHandle(abs, node);
  return Math.hypot(point.x - handle.x, point.y - handle.y) <= 14 / zoom;
}

function connectorAt(pages: DesignNode[], point: { x: number; y: number }, zoom: number): DesignNode | null {
  const radius = 12 / zoom;
  let best: { node: DesignNode; distance: number } | null = null;
  for (const node of flatten(pages)) {
    const link = linkGeometry(pages, node);
    if (!link) continue;
    let distance = Math.hypot(point.x - link.x2, point.y - link.y2);
    if (distance > radius) {
      distance = Infinity;
      for (let step = 0; step <= 16; step += 1) {
        const at = bezierPoint(link, step / 16);
        distance = Math.min(distance, Math.hypot(point.x - at.x, point.y - at.y));
      }
    }
    if (distance <= radius && (!best || distance < best.distance)) best = { node, distance };
  }
  return best?.node ?? null;
}

function linkGeometry(pages: DesignNode[], node: DesignNode) {
  const targetId = node.interaction?.targetId;
  if (!targetId) return null;
  const from = absPos(pages, node.id);
  const target = findNode(pages, targetId);
  const to = target ? absPos(pages, target.id) : null;
  if (!from || !to || !target) return null;
  const x1 = from.x + node.w;
  const y1 = from.y + node.h / 2;
  const x2 = to.x;
  const y2 = to.y + target.h / 2;
  const pull = Math.max(48, Math.abs(x2 - x1) / 2);
  return { x1, y1, x2, y2, c1x: x1 + pull, c1y: y1, c2x: x2 - pull, c2y: y2 };
}

function bezierPoint(link: { x1: number; y1: number; c1x: number; c1y: number; c2x: number; c2y: number; x2: number; y2: number }, t: number) {
  const u = 1 - t;
  return {
    x: u * u * u * link.x1 + 3 * u * u * t * link.c1x + 3 * u * t * t * link.c2x + t * t * t * link.x2,
    y: u * u * u * link.y1 + 3 * u * u * t * link.c1y + 3 * u * t * t * link.c2y + t * t * t * link.y2,
  };
}

function screenAt(nodes: DesignNode[], wx: number, wy: number): DesignNode | null {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (wx >= node.x && wy >= node.y && wx <= node.x + node.w && wy <= node.y + node.h) return node;
  }
  return null;
}

function containingFrame(nodes: DesignNode[], wx: number, wy: number, ox = 0, oy = 0): { id: string; x: number; y: number } | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (!n.visible) continue;
    const x = ox + n.x;
    const y = oy + n.y;
    const inside = wx >= x && wx <= x + n.w && wy >= y && wy <= y + n.h;
    if (!inside) continue;
    const deeper = containingFrame(n.children, wx, wy, x, y);
    if (deeper) return deeper;
    if (n.type === "frame" || n.type === "page" || n.type === "group") return { id: n.id, x, y };
  }
  return null;
}

function absPos(nodes: DesignNode[], id: string, ox = 0, oy = 0): { x: number; y: number } | null {
  for (const n of nodes) {
    if (n.id === id) return { x: ox + n.x, y: oy + n.y };
    const inner = absPos(n.children, id, ox + n.x, oy + n.y);
    if (inner) return inner;
  }
  return null;
}

type Camera = { x: number; y: number; zoom: number };
type Mark = { x: number; y: number; w: number; h: number };

function rulerStep(zoom: number) {
  const target = 72 / Math.max(zoom, 0.05);
  const pow = 10 ** Math.floor(Math.log10(target));
  const n = target / pow;
  const nice = n >= 5 ? 5 : n >= 2 ? 2 : 1;
  return Math.max(1, nice * pow);
}

function paintCanvasGrid(ctx: CanvasRenderingContext2D, camera: Camera, viewW: number, viewH: number) {
  const zoom = Math.max(camera.zoom, 0.05);
  const major = rulerStep(zoom);
  const minor = major / 5;
  const showMinor = minor * zoom >= 8;
  const left = -camera.x / zoom;
  const top = -camera.y / zoom;
  const right = (viewW - camera.x) / zoom;
  const bottom = (viewH - camera.y) / zoom;
  ctx.save();
  ctx.lineWidth = 1 / zoom;
  const strokeLines = (step: number, color: string, skipMajor: boolean) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    const x0 = Math.floor(left / step) * step;
    const y0 = Math.floor(top / step) * step;
    for (let x = x0; x <= right + step; x += step) {
      if (skipMajor && Math.abs(x / major - Math.round(x / major)) < 1e-6) continue;
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = y0; y <= bottom + step; y += step) {
      if (skipMajor && Math.abs(y / major - Math.round(y / major)) < 1e-6) continue;
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
  };
  if (showMinor) strokeLines(minor, "rgba(214, 255, 69, 0.08)", true);
  strokeLines(major, "rgba(214, 255, 69, 0.32)", false);
  ctx.restore();
}

const RULER = 24;

function paintRulers(ctx: CanvasRenderingContext2D, camera: Camera, viewW: number, viewH: number, mark: Mark | null) {
  const zoom = Math.max(camera.zoom, 0.05);
  const step = rulerStep(zoom);
  const minor = step / 5;
  ctx.save();
  ctx.fillStyle = "#1d1f21";
  ctx.fillRect(0, 0, viewW, RULER);
  ctx.fillRect(0, 0, RULER, viewH);
  ctx.fillStyle = "#151719";
  ctx.fillRect(0, 0, RULER, RULER);
  ctx.strokeStyle = "#34373a";
  ctx.beginPath();
  ctx.moveTo(0, RULER + 0.5);
  ctx.lineTo(viewW, RULER + 0.5);
  ctx.moveTo(RULER + 0.5, 0);
  ctx.lineTo(RULER + 0.5, viewH);
  ctx.stroke();

  const worldLeft = -camera.x / zoom;
  const worldRight = (viewW - camera.x) / zoom;
  const worldTop = -camera.y / zoom;
  const worldBottom = (viewH - camera.y) / zoom;
  ctx.font = "10px Geist, sans-serif";
  ctx.textBaseline = "top";
  const x0 = Math.floor(worldLeft / step) * step;
  for (let world = x0; world <= worldRight + step; world += step) {
    const sx = camera.x + world * zoom;
    if (sx < RULER - 1) continue;
    ctx.fillStyle = "#8b908c";
    ctx.fillRect(sx, RULER - 8, 1, 8);
    for (let i = 1; i < 5; i += 1) {
      const mx = camera.x + (world + minor * i) * zoom;
      if (mx > RULER) ctx.fillRect(mx, RULER - 4, 1, 4);
    }
    if (sx > RULER + 2) {
      ctx.fillStyle = "#969c9f";
      ctx.fillText(String(Math.round(world)), sx + 4, 4);
    }
  }
  const y0 = Math.floor(worldTop / step) * step;
  for (let world = y0; world <= worldBottom + step; world += step) {
    const sy = camera.y + world * zoom;
    if (sy < RULER - 1) continue;
    ctx.fillStyle = "#8b908c";
    ctx.fillRect(RULER - 8, sy, 8, 1);
    for (let i = 1; i < 5; i += 1) {
      const my = camera.y + (world + minor * i) * zoom;
      if (my > RULER) ctx.fillRect(RULER - 4, my, 4, 1);
    }
    if (sy > RULER + 14) {
      ctx.save();
      ctx.fillStyle = "#969c9f";
      ctx.translate(11, sy - 4);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "left";
      ctx.fillText(String(Math.round(world)), 0, 0);
      ctx.restore();
    }
  }

  if (mark) {
    const x1 = camera.x + mark.x * zoom;
    const x2 = camera.x + (mark.x + mark.w) * zoom;
    const y1 = camera.y + mark.y * zoom;
    const y2 = camera.y + (mark.y + mark.h) * zoom;
    ctx.fillStyle = "rgba(214, 255, 69, 0.85)";
    ctx.fillRect(Math.max(RULER, Math.min(x1, x2)), RULER - 2, Math.max(2, Math.abs(x2 - x1)), 2);
    ctx.fillRect(RULER - 2, Math.max(RULER, Math.min(y1, y2)), 2, Math.max(2, Math.abs(y2 - y1)));
    rulerReadout(ctx, x2, 0, String(Math.round(mark.x + mark.w)), true, viewW, viewH);
    rulerReadout(ctx, 0, y2, String(Math.round(mark.y + mark.h)), false, viewW, viewH);
  }
  ctx.restore();
}

function rulerReadout(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, horizontal: boolean, viewW: number, viewH: number) {
  ctx.save();
  ctx.font = "600 10px Geist, sans-serif";
  const width = ctx.measureText(label).width + 12;
  ctx.fillStyle = "#d6ff45";
  ctx.textBaseline = "top";
  if (horizontal) {
    const left = Math.min(Math.max(RULER, x - width / 2), Math.max(RULER, viewW - width - 4));
    ctx.fillRect(left, 3, width, 16);
    ctx.fillStyle = "#141817";
    ctx.fillText(label, left + 6, 6);
  } else {
    const top = Math.min(Math.max(RULER, y - width / 2), Math.max(RULER, viewH - width - 4));
    ctx.translate(3, top + width);
    ctx.rotate(-Math.PI / 2);
    ctx.fillRect(0, 0, width, 16);
    ctx.fillStyle = "#141817";
    ctx.fillText(label, 6, 3);
  }
  ctx.restore();
}

function paintSizeBadge(ctx: CanvasRenderingContext2D, camera: Camera, mark: Mark) {
  const label = `${Math.round(mark.w)} x ${Math.round(mark.h)}`;
  ctx.save();
  ctx.font = "600 11px Geist, sans-serif";
  const width = ctx.measureText(label).width + 14;
  const sx = camera.x + (mark.x + mark.w / 2) * camera.zoom - width / 2;
  const sy = camera.y + (mark.y + mark.h) * camera.zoom + 8;
  ctx.fillStyle = "#d6ff45";
  ctx.fillRect(sx, sy, width, 18);
  ctx.fillStyle = "#141817";
  ctx.textBaseline = "top";
  ctx.fillText(label, sx + 7, sy + 3);
  ctx.restore();
}

function parentOffset(nodes: DesignNode[], id: string, ox = 0, oy = 0, parent: DesignNode | null = null): { x: number; y: number } {
  for (const n of nodes) {
    if (n.id === id) return { x: ox, y: oy };
    const found = flatten([n]).some((c) => c.id === id && c !== n);
    if (found) return parentOffset(n.children, id, ox + n.x, oy + n.y, n);
  }
  return parent ? { x: ox, y: oy } : { x: 0, y: 0 };
}
