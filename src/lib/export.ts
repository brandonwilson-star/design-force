import type { DesignNode, DocumentState, ModeId } from "../types";
import { flatten } from "./id";
import { simplePdf } from "./pdf";

export interface ExportFormat {
  id: string;
  ext: string;
  mime: string;
  label: string;
  group: string;
  hint: string;
  modes: Array<ModeId | "all">;
}

export const EXPORT_FORMATS: ExportFormat[] = [
  { id: "png", ext: "png", mime: "image/png", label: "PNG", group: "Raster", hint: "Lossless bitmap", modes: ["all"] },
  { id: "jpg", ext: "jpg", mime: "image/jpeg", label: "JPEG", group: "Raster", hint: "Photographs", modes: ["all"] },
  { id: "webp", ext: "webp", mime: "image/webp", label: "WebP", group: "Raster", hint: "Web-ready bitmap", modes: ["all"] },
  { id: "gif", ext: "gif", mime: "image/gif", label: "GIF", group: "Raster", hint: "Simple animation", modes: ["motion", "film", "vector"] },
  { id: "bmp", ext: "bmp", mime: "image/bmp", label: "BMP", group: "Raster", hint: "Uncompressed bitmap", modes: ["photo"] },
  { id: "svg", ext: "svg", mime: "image/svg+xml", label: "SVG", group: "Vector", hint: "Editable vectors", modes: ["vector", "layout", "ai"] },
  { id: "pdf", ext: "pdf", mime: "application/pdf", label: "PDF", group: "Print", hint: "Portable document", modes: ["all"] },
  { id: "pdfx", ext: "pdf", mime: "application/pdf", label: "PDF/X-4", group: "Print", hint: "Press-ready PDF", modes: ["layout", "pdf"] },
  { id: "eps", ext: "eps", mime: "application/postscript", label: "EPS", group: "Vector", hint: "Encapsulated PostScript", modes: ["vector", "layout"] },
  { id: "dfjson", ext: "designforce.json", mime: "application/json", label: "Design Force", group: "Native", hint: "Full scene graph", modes: ["all"] },
  { id: "penpot", ext: "penpot.json", mime: "application/json", label: "Penpot", group: "Native", hint: "Penpot-compatible JSON", modes: ["vector", "ai"] },
  { id: "fig", ext: "fig", mime: "application/json", label: ".fig", group: "Native", hint: "OpenPencil-style .fig tree (JSON interchange)", modes: ["all"] },
  { id: "pen", ext: "pen", mime: "application/json", label: ".pen", group: "Native", hint: "OpenPencil node tree (JSON interchange)", modes: ["all"] },
  { id: "psd", ext: "psd", mime: "application/json", label: ".psd", group: "Photo", hint: "Layer tree interchange (JSON, not a binary PSD)", modes: ["all"] },
  { id: "html", ext: "html", mime: "text/html", label: "HTML", group: "Code", hint: "Standalone page", modes: ["vector", "ai", "layout"] },
  { id: "jsx", ext: "jsx", mime: "text/plain", label: "React JSX", group: "Code", hint: "Tailwind-flavored JSX", modes: ["vector", "ai"] },
  { id: "css", ext: "css", mime: "text/css", label: "CSS tokens", group: "Code", hint: "Design tokens as CSS vars", modes: ["vector", "ai"] },
  { id: "tokens", ext: "tokens.json", mime: "application/json", label: "Design tokens", group: "Code", hint: "W3C-style tokens", modes: ["vector", "ai"] },
  { id: "lottie", ext: "json", mime: "application/json", label: "Lottie", group: "Motion", hint: "Bodymovin JSON", modes: ["motion"] },
  { id: "webm", ext: "webm", mime: "video/webm", label: "WebM", group: "Video", hint: "Canvas recording", modes: ["all"] },
  { id: "mp4", ext: "mp4", mime: "video/mp4", label: "MP4", group: "Video", hint: "Recorded when this browser can encode MP4", modes: ["all"] },
  { id: "mov", ext: "mov", mime: "video/quicktime", label: "MOV", group: "Video", hint: "Recorded when this browser can encode QuickTime", modes: ["all"] },
  { id: "edl", ext: "edl", mime: "text/plain", label: "CMX EDL", group: "Film", hint: "Edit decision list", modes: ["film"] },
  { id: "fcpxml", ext: "fcpxml", mime: "application/xml", label: "FCPXML", group: "Film", hint: "Final Cut / Premiere XML", modes: ["film"] },
  { id: "idml", ext: "idml.xml", mime: "application/xml", label: "IDML-like", group: "Layout", hint: "InDesign interchange XML", modes: ["layout"] },
  { id: "epub", ext: "xhtml", mime: "application/xhtml+xml", label: "EPUB XHTML", group: "Layout", hint: "Reflowable chapter", modes: ["layout"] },
  { id: "pptx", ext: "html", mime: "text/html", label: "Slides (HTML)", group: "Layout", hint: "Deck from frames", modes: ["vector", "layout", "ai"] },
  { id: "txt", ext: "txt", mime: "text/plain", label: "Plain text", group: "PDF", hint: "Extracted copy", modes: ["pdf", "layout"] },
];

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function polyPoints(x: number, y: number, w: number, h: number, sides: number, star: boolean) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.abs(w) / 2;
  const ry = Math.abs(h) / 2;
  const count = Math.max(3, sides) * (star ? 2 : 1);
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    const scale = star && index % 2 === 1 ? 0.42 : 1;
    return `${cx + Math.cos(angle) * rx * scale},${cy + Math.sin(angle) * ry * scale}`;
  }).join(" ");
}

function nodeToSvg(n: DesignNode, ox = 0, oy = 0): { body: string; defs: string } {
  if (!n.visible) return { body: "", defs: "" };
  const x = ox + n.x;
  const y = oy + n.y;
  const kids = n.children.map((child) => nodeToSvg(child, x, y));
  let defs = kids.map((kid) => kid.defs).join("");
  let fill = n.fill === "#00000000" ? "none" : n.fill;
  if (n.fillKind === "gradient") {
    const gid = `grad-${n.id}`;
    fill = `url(#${gid})`;
    defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${n.gradientFrom || "#ffffff"}"/><stop offset="100%" stop-color="${n.gradientTo || n.fill}"/></linearGradient>`;
  }
  const blend = n.blendMode && n.blendMode !== "normal" ? ` style="mix-blend-mode:${n.blendMode}"` : "";
  const stroke = n.stroke === "transparent" ? "none" : n.stroke;
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${n.strokeWidth}" opacity="${n.opacity}"${blend}`;
  let body = "";
  if (n.imageDataUrl) {
    body = `<image href="${n.imageDataUrl}" x="${x}" y="${y}" width="${n.w}" height="${n.h}" opacity="${n.opacity}"${blend}/>`;
  } else if (n.type === "ellipse") {
    body = `<ellipse cx="${x + n.w / 2}" cy="${y + n.h / 2}" rx="${Math.abs(n.w) / 2}" ry="${Math.abs(n.h) / 2}" ${common}/>`;
  } else if (n.type === "text") {
    const lines = (n.text ?? "").split("\n");
    const tspans = lines
      .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : (n.lineHeight ?? (n.fontSize ?? 16) * 1.15)}">${escapeXml(line)}</tspan>`)
      .join("");
    body = `<text x="${x}" y="${y + (n.fontSize ?? 16)}" font-size="${n.fontSize ?? 16}" font-weight="${n.fontWeight ?? 400}" letter-spacing="${n.letterSpacing ?? 0}" font-family="Syne, Source Sans 3, sans-serif" ${common}>${tspans}</text>`;
  } else if (n.vector?.points.length) {
    const d = n.vector.points.map((point, index) => `${index ? "L" : "M"}${x + point.x} ${y + point.y}`).join(" ") + (n.vector.closed ? " Z" : "");
    body = `<path d="${d}" ${common}/>`;
  } else if (n.shape === "polygon" || n.shape === "star") {
    body = `<polygon points="${polyPoints(x, y, n.w, n.h, n.sides ?? (n.shape === "star" ? 5 : 6), n.shape === "star")}" ${common}/>`;
  } else if (n.type !== "path") {
    body = `<rect x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="${n.radius || 0}" ${common}/>`;
  } else {
    body = `<line x1="${x}" y1="${y + n.h / 2}" x2="${x + n.w}" y2="${y + n.h / 2}" stroke="${stroke === "none" ? fill : stroke}" stroke-width="${Math.max(2, n.strokeWidth || 2)}" opacity="${n.opacity}"${blend}/>`;
  }
  return { body: body + kids.map((kid) => kid.body).join(""), defs };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function documentToSvg(doc: DocumentState, only?: DesignNode[]): string {
  const source = only?.length ? only : doc.pages;
  if (!source.length) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"/>`;
  }
  const minX = Math.min(...source.map((n) => n.x));
  const minY = Math.min(...source.map((n) => n.y));
  const shifted = source.map((n) => ({ ...n, x: n.x - minX + 24, y: n.y - minY + 24 }));
  const bounds = shifted.reduce(
    (acc, p) => ({
      w: Math.max(acc.w, p.x + p.w + 24),
      h: Math.max(acc.h, p.y + p.h + 24),
    }),
    { w: 32, h: 32 },
  );
  const parts = shifted.map((p) => nodeToSvg(p));
  const defs = parts.map((part) => part.defs).join("");
  const inner = parts.map((part) => part.body).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.w}" height="${bounds.h}" viewBox="0 0 ${bounds.w} ${bounds.h}" fill="none"><defs>${defs}</defs>${inner}</svg>`;
}

function rasterize(svg: string, mime: string, quality = 0.92, scale = 1): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No 2d context"));
        return;
      }
      ctx.fillStyle = mime === "image/jpeg" ? "#ffffff" : "#12100e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        mime,
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG raster failed"));
    };
    img.src = url;
  });
}

function htmlFromDoc(doc: DocumentState): string {
  const frames = flatten(doc.pages).filter((n) => n.type === "frame" || n.type === "page");
  const sections = frames
    .map((f) => {
      const texts = flatten([f])
        .filter((n) => n.type === "text" && n.text)
        .map((n) => `<p style="margin:0 0 12px;font-size:${n.fontSize ?? 16}px;font-weight:${n.fontWeight ?? 400};color:${n.fill}">${escapeXml(n.text ?? "")}</p>`)
        .join("\n");
      return `<section style="max-width:${f.w}px;margin:48px auto;padding:48px;background:${f.fill};color:#f3ece1;border-radius:${f.radius}px">${texts}</section>`;
    })
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(doc.name)}</title><style>body{margin:0;background:#12100e;font-family:Syne,Source Sans 3,sans-serif}</style></head><body>${sections}</body></html>`;
}

function jsxFromDoc(doc: DocumentState): string {
  const frames = flatten(doc.pages).filter((n) => n.type === "frame");
  const components = frames
    .map((f, i) => {
      const texts = flatten([f])
        .filter((n) => n.type === "text" && n.text)
        .map((n) => `      <p className="text-[${n.fontSize ?? 16}px] font-[${n.fontWeight ?? 400}]">${(n.text ?? "").replace(/\n/g, " ")}</p>`)
        .join("\n");
      return `export function Frame${i + 1}() {\n  return (\n    <section className="relative overflow-hidden" style={{ width: ${f.w}, height: ${f.h}, background: "${f.fill}" }}>\n${texts}\n    </section>\n  );\n}`;
    })
    .join("\n\n");
  return `/* Generated by Design Force from "${doc.name}" */\n\n${components}\n`;
}

function tokensFromDoc(doc: DocumentState) {
  const fills = [...new Set(flatten(doc.pages).map((n) => n.fill).filter((c) => c && c !== "transparent" && c !== "#00000000"))];
  const fonts = [...new Set(flatten(doc.pages).filter((n) => n.fontSize).map((n) => n.fontSize))];
  return {
    $schema: "https://design-tokens.org/schema.json",
    color: Object.fromEntries(fills.map((c, i) => [`swatch-${i + 1}`, { $type: "color", $value: c }])),
    fontSize: Object.fromEntries((fonts as number[]).map((s, i) => [`step-${i + 1}`, { $type: "dimension", $value: `${s}px` }])),
  };
}

function cssTokens(doc: DocumentState): string {
  const t = tokensFromDoc(doc);
  const colors = Object.entries(t.color)
    .map(([k, v]) => `  --color-${k}: ${v.$value};`)
    .join("\n");
  const sizes = Object.entries(t.fontSize)
    .map(([k, v]) => `  --font-${k}: ${v.$value};`)
    .join("\n");
  return `:root {\n${colors}\n${sizes}\n}\n`;
}

function lottieFromDoc(doc: DocumentState) {
  const frame = doc.pages[0];
  return {
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 90,
    w: Math.round(frame?.w ?? 1440),
    h: Math.round(frame?.h ?? 900),
    nm: doc.name,
    ddd: 0,
    assets: [],
    layers: flatten(doc.pages)
      .filter((n) => n.type === "rect" || n.type === "ellipse")
      .slice(0, 24)
      .map((n, i) => ({
        ty: n.type === "ellipse" ? 4 : 4,
        nm: n.name,
        sr: 1,
        st: 0,
        op: 90,
        ip: 0,
        ks: {
          o: { a: 0, k: Math.round(n.opacity * 100) },
          p: { a: 1, k: [
            { t: 0, s: [n.x, n.y, 0] },
            { t: 60, s: [n.x + 40, n.y, 0] },
          ] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] },
          r: { a: 0, k: n.rotation },
        },
        shapes: [
          {
            ty: "gr",
            it: [
              n.type === "ellipse"
                ? { ty: "el", s: { a: 0, k: [n.w, n.h] }, p: { a: 0, k: [n.w / 2, n.h / 2] } }
                : { ty: "rc", s: { a: 0, k: [n.w, n.h] }, p: { a: 0, k: [n.w / 2, n.h / 2] }, r: { a: 0, k: n.radius } },
              { ty: "fl", c: { a: 0, k: hexToRgb01(n.fill) }, o: { a: 0, k: 100 } },
              { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
            ],
          },
        ],
        ind: i + 1,
      })),
  };
}

function hexToRgb01(hex: string): [number, number, number, number] {
  const h = hex.replace("#", "");
  if (h.length < 6) return [1, 1, 1, 1];
  const n = parseInt(h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

function edlFromDoc(doc: DocumentState): string {
  const clips = flatten(doc.pages).filter((n) => n.duration);
  const lines = clips.map((c, i) => {
    const start = c.start ?? i * 5;
    const dur = c.duration ?? 5;
    return `${String(i + 1).padStart(3, "0")}  AX       V     C        ${toTc(start)} ${toTc(start + dur)} ${toTc(start)} ${toTc(start + dur)}`;
  });
  return `TITLE: ${doc.name}\nFCM: NON-DROP FRAME\n\n${lines.join("\n") || "001  AX       V     C        00:00:00:00 00:00:05:00 00:00:00:00 00:00:05:00"}\n`;
}

function toTc(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const f = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(ss)}:${pad(f)}`;
}

function bmpFromPng(png: Blob): Promise<Blob> {
  return png.arrayBuffer().then(async (buf) => {
    const img = await createImageBitmap(new Blob([buf]));
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const row = canvas.width * 3;
    const pad = (4 - (row % 4)) % 4;
    const pixelSize = (row + pad) * canvas.height;
    const file = 54 + pixelSize;
    const out = new ArrayBuffer(file);
    const v = new DataView(out);
    const u = new Uint8Array(out);
    u[0] = 0x42;
    u[1] = 0x4d;
    v.setUint32(2, file, true);
    v.setUint32(10, 54, true);
    v.setUint32(14, 40, true);
    v.setInt32(18, canvas.width, true);
    v.setInt32(22, canvas.height, true);
    v.setUint16(26, 1, true);
    v.setUint16(28, 24, true);
    v.setUint32(34, pixelSize, true);
    let o = 54;
    for (let y = canvas.height - 1; y >= 0; y--) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        u[o++] = data.data[i + 2];
        u[o++] = data.data[i + 1];
        u[o++] = data.data[i];
      }
      o += pad;
    }
    return new Blob([out], { type: "image/bmp" });
  });
}

export async function exportDocument(
  doc: DocumentState,
  formatId: string,
  canvasEl?: HTMLCanvasElement | null,
  options?: { scale?: number; nodes?: DesignNode[] },
): Promise<void> {
  const fmt = EXPORT_FORMATS.find((f) => f.id === formatId);
  if (!fmt) throw new Error("Unknown format");
  const scale = options?.scale ?? 1;
  const scoped = options?.nodes?.length ? { ...doc, pages: options.nodes } : doc;
  const label = options?.nodes?.length === 1 ? options.nodes[0].name : doc.name;
  const safe = label.replace(/[^\w\-]+/g, "-").toLowerCase();
  const filename = `${safe}${scale > 1 ? `@${scale}x` : ""}.${fmt.ext}`;
  const svg = documentToSvg(scoped);

  switch (fmt.id) {
    case "svg":
      download(new Blob([svg], { type: fmt.mime }), filename);
      return;
    case "png":
    case "jpg":
    case "webp":
    case "gif": {
      const blob = await rasterize(svg, fmt.id === "jpg" ? "image/jpeg" : fmt.mime, fmt.id === "jpg" ? 0.9 : 0.92, scale);
      download(blob, filename);
      return;
    }
    case "bmp": {
      const png = await rasterize(svg, "image/png");
      download(await bmpFromPng(png), filename);
      return;
    }
    case "pdf":
    case "pdfx": {
      const pages = scoped.pages.map((p) => ({
        title: p.name,
        lines: flatten([p])
          .filter((n) => n.type === "text" && n.text)
          .flatMap((n) => (n.text ?? "").split("\n")),
      }));
      download(simplePdf(pages.length ? pages : [{ title: doc.name, lines: ["Empty document"] }]), filename);
      return;
    }
    case "eps":
      download(new Blob([`%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 800 600\n%%Title: ${scoped.name}\n${svg}\n`], { type: fmt.mime }), filename);
      return;
    case "dfjson":
      download(new Blob([JSON.stringify({ kind: "design-force", version: 1, document: scoped }, null, 2)], { type: fmt.mime }), filename);
      return;
    case "penpot":
      download(
        new Blob(
          [JSON.stringify({ type: "penpot/document", name: scoped.name, pages: scoped.pages.map((p) => ({ id: p.id, name: p.name, objects: flatten([p]) })) }, null, 2)],
          { type: fmt.mime },
        ),
        filename,
      );
      return;
    case "fig":
    case "pen":
      download(
        new Blob(
          [JSON.stringify({ schema: fmt.id === "fig" ? "figma-compatible" : "openpencil-pen", name: scoped.name, nodes: flatten(scoped.pages) }, null, 2)],
          { type: fmt.mime },
        ),
        filename,
      );
      return;
    case "psd":
      download(
        new Blob(
          [JSON.stringify({ kind: "photocraft-layers", name: scoped.name, layers: flatten(scoped.pages).map((n) => ({ name: n.name, type: n.type, blend: "normal", opacity: n.opacity, bounds: { x: n.x, y: n.y, w: n.w, h: n.h }, fill: n.fill, filters: n.filters })) }, null, 2)],
          { type: fmt.mime },
        ),
        filename,
      );
      return;
    case "html":
    case "pptx":
      download(new Blob([htmlFromDoc(scoped)], { type: "text/html" }), filename);
      return;
    case "jsx":
      download(new Blob([jsxFromDoc(scoped)], { type: fmt.mime }), filename);
      return;
    case "css":
      download(new Blob([cssTokens(scoped)], { type: fmt.mime }), filename);
      return;
    case "tokens":
      download(new Blob([JSON.stringify(tokensFromDoc(scoped), null, 2)], { type: fmt.mime }), filename);
      return;
    case "lottie":
      download(new Blob([JSON.stringify(lottieFromDoc(scoped), null, 2)], { type: fmt.mime }), filename);
      return;
    case "webm":
    case "mp4":
    case "mov": {
      if (!canvasEl) throw new Error("Open the canvas before recording video");
      await recordCanvas(canvasEl, filename, fmt.mime);
      return;
    }
    case "edl":
      download(new Blob([edlFromDoc(scoped)], { type: fmt.mime }), filename);
      return;
    case "fcpxml":
      download(
        new Blob(
          [
            `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10"><project name="${escapeXml(scoped.name)}"><sequence>${flatten(scoped.pages)
              .filter((n) => n.duration)
              .map((n, i) => `<clip name="${escapeXml(n.name)}" offset="${n.start ?? i * 5}s" duration="${n.duration ?? 5}s"/>`)
              .join("")}</sequence></project></fcpxml>`,
          ],
          { type: fmt.mime },
        ),
        filename,
      );
      return;
    case "idml":
      download(
        new Blob(
          [
            `<?xml version="1.0"?><Document Name="${escapeXml(scoped.name)}">${scoped.pages
              .map(
                (p) =>
                  `<Spread Name="${escapeXml(p.name)}">${flatten([p])
                    .filter((n) => n.type === "text")
                    .map((n) => `<TextFrame Name="${escapeXml(n.name)}"><Content>${escapeXml(n.text ?? "")}</Content></TextFrame>`)
                    .join("")}</Spread>`,
              )
              .join("")}</Document>`,
          ],
          { type: fmt.mime },
        ),
        filename,
      );
      return;
    case "epub":
      download(
        new Blob(
          [`<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeXml(scoped.name)}</title></head><body>${flatten(scoped.pages)
            .filter((n) => n.type === "text" && n.text)
            .map((n) => `<p>${escapeXml(n.text ?? "")}</p>`)
            .join("")}</body></html>`],
          { type: fmt.mime },
        ),
        filename,
      );
      return;
    case "txt":
      download(
        new Blob(
          [
            flatten(scoped.pages)
              .filter((n) => n.type === "text" && n.text)
              .map((n) => n.text)
              .join("\n\n"),
          ],
          { type: fmt.mime },
        ),
        filename,
      );
      return;
    default:
      throw new Error("Export not implemented");
  }
}

function recordCanvas(canvas: HTMLCanvasElement, filename: string, mime: string): Promise<void> {
  const candidates = [mime, mime === "video/quicktime" ? "video/mp4" : "", "video/webm;codecs=vp9", "video/webm"].filter(Boolean);
  const chosen = candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
  if (!chosen) return Promise.reject(new Error("This browser cannot record that video format"));
  if (mime !== "video/webm" && !chosen.startsWith(mime.split(";")[0])) {
    return Promise.reject(new Error(`This browser cannot encode ${mime}. Export WebM instead.`));
  }
  return new Promise((resolve, reject) => {
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: chosen });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onerror = () => reject(new Error("Recording failed"));
    rec.onstop = () => {
      download(new Blob(chunks, { type: chosen }), filename);
      resolve();
    };
    rec.start();
    setTimeout(() => rec.stop(), 2500);
  });
}
