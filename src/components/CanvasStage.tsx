import { useEffect, useRef, type RefObject } from "react";
import type { DesignNode } from "../types";
import { findNode, flatten, uid } from "../lib/id";
import { selectedNode, useStudio } from "../store";

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

function applyFilters(n: DesignNode): string {
  const f = n.filters;
  if (!f) return "";
  const b = 1 + f.exposure + f.highlights * 0.2;
  const c = 1 + f.contrast;
  const s = 1 + f.saturation;
  const hue = f.temperature * 18;
  return `brightness(${b}) contrast(${c}) saturate(${s}) hue-rotate(${hue}deg)`;
}

function drawNode(ctx: CanvasRenderingContext2D, n: DesignNode, ox: number, oy: number, t: number) {
  if (!n.visible) return;
  let x = ox + n.x;
  let y = oy + n.y;
  let opacity = n.opacity;
  if (n.keyframes?.length) {
    const kf = n.keyframes;
    const last = kf.reduce((a, b) => (b.t <= t ? b : a), kf[0]);
    x += last.x ?? 0;
    y += last.y ?? 0;
    opacity *= last.opacity ?? 1;
  }
  ctx.save();
  ctx.globalAlpha = opacity;
  const filter = applyFilters(n);
  if (filter) ctx.filter = filter;
  ctx.translate(x + n.w / 2, y + n.h / 2);
  ctx.rotate((n.rotation * Math.PI) / 180);
  ctx.translate(-(x + n.w / 2), -(y + n.h / 2));

  if (n.type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(x + n.w / 2, y + n.h / 2, n.w / 2, n.h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = n.fill;
    ctx.fill();
    if (n.strokeWidth) {
      ctx.strokeStyle = n.stroke;
      ctx.lineWidth = n.strokeWidth;
      ctx.stroke();
    }
  } else if (n.type === "text") {
    ctx.fillStyle = n.fill;
    ctx.font = `${n.fontWeight ?? 500} ${n.fontSize ?? 16}px Syne, "Source Sans 3", sans-serif`;
    ctx.textBaseline = "top";
    const lines = (n.text ?? "").split("\n");
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * (n.fontSize ?? 16) * 1.15, n.w));
  } else {
    roundRect(ctx, x, y, n.w, n.h, n.radius);
    ctx.fillStyle = n.fill === "#00000000" ? "transparent" : n.fill;
    ctx.fill();
    if (n.strokeWidth) {
      ctx.strokeStyle = n.stroke;
      ctx.lineWidth = n.strokeWidth;
      ctx.stroke();
    }
  }
  ctx.filter = "none";
  for (const child of n.children) drawNode(ctx, child, x, y, t);
  ctx.restore();
}

function hit(nodes: DesignNode[], wx: number, wy: number, ox = 0, oy = 0): DesignNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (!n.visible || n.locked) continue;
    const x = ox + n.x;
    const y = oy + n.y;
    const child = hit(n.children, wx, wy, x, y);
    if (child) return child;
    if (wx >= x && wy >= y && wx <= x + n.w && wy <= y + n.h) return n;
  }
  return null;
}

export function CanvasStage({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const { state, dispatch } = useStudio();
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const pan = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

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
      for (const page of state.doc.pages) drawNode(ctx, page, 0, 0, state.playhead);
      const sel = selectedNode(state);
      if (sel) {
        const abs = absPos(state.doc.pages, sel.id);
        if (abs) {
          ctx.strokeStyle = "#c45c26";
          ctx.lineWidth = 1.5 / state.camera.zoom;
          ctx.setLineDash([6 / state.camera.zoom, 4 / state.camera.zoom]);
          ctx.strokeRect(abs.x - 2, abs.y - 2, sel.w + 4, sel.h + 4);
          ctx.setLineDash([]);
        }
      }
      for (const c of state.collaborators) {
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 6 / state.camera.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `${12 / state.camera.zoom}px "Source Sans 3"`;
        ctx.fillText(c.name, c.x + 10 / state.camera.zoom, c.y - 8 / state.camera.zoom);
      }
      for (const pin of state.doc.comments) {
        ctx.fillStyle = "#f3ece1";
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, 8 / state.camera.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#8f2d14";
        ctx.font = `600 ${10 / state.camera.zoom}px "IBM Plex Mono"`;
        ctx.fillText("!", pin.x - 3 / state.camera.zoom, pin.y + 4 / state.camera.zoom);
      }
      ctx.restore();
    };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [state, canvasRef]);

  const toWorld = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - state.camera.x) / state.camera.zoom,
      y: (e.clientY - rect.top - state.camera.y) / state.camera.zoom,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const w = toWorld(e);
    if (state.tool === "hand" || e.button === 1 || e.altKey) {
      pan.current = { x: e.clientX, y: e.clientY, cx: state.camera.x, cy: state.camera.y };
      return;
    }
    if (state.tool === "comment") {
      dispatch({
        type: "comment",
        pin: { id: uid("c"), x: w.x, y: w.y, author: "You", body: "Look at this.", resolved: false },
      });
      return;
    }
    if (["frame", "rect", "ellipse", "text"].includes(state.tool)) {
      const parent = state.doc.pages[0]?.id ?? null;
      const node: DesignNode = {
        id: uid(),
        type: state.tool === "frame" ? "frame" : (state.tool as DesignNode["type"]),
        name: state.tool,
        x: w.x,
        y: w.y,
        w: state.tool === "text" ? 240 : 180,
        h: state.tool === "text" ? 48 : 120,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: state.tool === "text" ? "#f3ece1" : state.tool === "frame" ? "#1c1713" : "#c45c26",
        stroke: "transparent",
        strokeWidth: 0,
        radius: state.tool === "ellipse" ? 999 : 0,
        text: state.tool === "text" ? "New copy" : undefined,
        fontSize: 24,
        fontWeight: 600,
        children: [],
      };
      dispatch({ type: "add", parentId: parent, node });
      dispatch({ type: "tool", tool: "select" });
      return;
    }
    const target = hit(state.doc.pages, w.x, w.y);
    dispatch({ type: "select", id: target?.id ?? null });
    if (target && !target.locked) {
      const abs = absPos(state.doc.pages, target.id);
      drag.current = { id: target.id, dx: w.x - (abs?.x ?? 0), dy: w.y - (abs?.y ?? 0) };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
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
    if (!drag.current) return;
    const w = toWorld(e);
    const node = findNode(state.doc.pages, drag.current.id);
    if (!node) return;
    const parentAbs = parentOffset(state.doc.pages, drag.current.id);
    dispatch({
      type: "patch",
      id: drag.current.id,
      patch: { x: w.x - drag.current.dx - parentAbs.x, y: w.y - drag.current.dy - parentAbs.y },
    });
  };

  const onPointerUp = () => {
    drag.current = null;
    pan.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoom = Math.min(3, Math.max(0.15, state.camera.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    dispatch({ type: "camera", camera: { zoom } });
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
    />
  );
}

function absPos(nodes: DesignNode[], id: string, ox = 0, oy = 0): { x: number; y: number } | null {
  for (const n of nodes) {
    if (n.id === id) return { x: ox + n.x, y: oy + n.y };
    const inner = absPos(n.children, id, ox + n.x, oy + n.y);
    if (inner) return inner;
  }
  return null;
}

function parentOffset(nodes: DesignNode[], id: string, ox = 0, oy = 0, parent: DesignNode | null = null): { x: number; y: number } {
  for (const n of nodes) {
    if (n.id === id) return { x: ox, y: oy };
    const found = flatten([n]).some((c) => c.id === id && c !== n);
    if (found) return parentOffset(n.children, id, ox + n.x, oy + n.y, n);
  }
  return parent ? { x: ox, y: oy } : { x: 0, y: 0 };
}
