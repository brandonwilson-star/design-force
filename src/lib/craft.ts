import { findNode, flatten, uid } from "./id";
import type { CommentPin, DesignNode, DevelopPreset, DocumentState, Keyframe, PhotoFilters } from "../types";

export const ZERO_FILTERS: PhotoFilters = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  highlights: 0,
  shadows: 0,
};

export const BUILTIN_DEVELOPS: DevelopPreset[] = [
  {
    id: "develop-harbor",
    name: "Harbor warm",
    filters: { exposure: 0.08, contrast: 0.12, saturation: -0.08, temperature: 0.35, highlights: -0.1, shadows: 0.16 },
  },
  {
    id: "develop-cool",
    name: "Cool plate",
    filters: { exposure: -0.04, contrast: 0.18, saturation: -0.2, temperature: -0.4, highlights: -0.05, shadows: 0.08 },
  },
];

export function clipRange(page: DesignNode, index: number): { start: number; duration: number } {
  return { start: page.start ?? index * 3, duration: page.duration ?? 3 };
}

export function sequenceEnd(pages: DesignNode[]): number {
  return Math.max(8, ...pages.map((page, index) => {
    const range = clipRange(page, index);
    return range.start + range.duration;
  }));
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export function sampleMotion(node: DesignNode, t: number): { x: number; y: number; opacity: number; rotation: number } {
  const frames = [...(node.keyframes ?? [])].sort((a, b) => a.t - b.t);
  if (!frames.length) return { x: node.x, y: node.y, opacity: node.opacity, rotation: node.rotation };
  const before = [...frames].reverse().find((frame) => frame.t <= t) ?? frames[0];
  const after = frames.find((frame) => frame.t >= t) ?? frames[frames.length - 1];
  const span = after.t - before.t;
  const u = span <= 0 ? 0 : Math.min(1, Math.max(0, (t - before.t) / span));
  return {
    x: lerp(before.x ?? node.x, after.x ?? node.x, u),
    y: lerp(before.y ?? node.y, after.y ?? node.y, u),
    opacity: lerp(before.opacity ?? node.opacity, after.opacity ?? node.opacity, u),
    rotation: lerp(before.rotation ?? node.rotation, after.rotation ?? node.rotation, u),
  };
}

export function withKeyframe(node: DesignNode, t: number): Keyframe[] {
  const next = (node.keyframes ?? []).filter((frame) => Math.abs(frame.t - t) > 0.05);
  next.push({ t, x: node.x, y: node.y, opacity: node.opacity, rotation: node.rotation });
  return next.sort((a, b) => a.t - b.t);
}

export function splitClip(pages: DesignNode[], id: string, t: number): DesignNode[] | null {
  const index = pages.findIndex((page) => page.id === id);
  if (index < 0) return null;
  const page = pages[index];
  const range = clipRange(page, index);
  if (t <= range.start + 0.15 || t >= range.start + range.duration - 0.15) return null;
  const left: DesignNode = { ...page, start: range.start, duration: t - range.start };
  const right: DesignNode = {
    ...structuredClone(page),
    id: uid("clip"),
    name: `${page.name} cut`,
    start: t,
    duration: range.start + range.duration - t,
    x: page.x + 48,
  };
  const next = pages.slice();
  next.splice(index, 1, left, right);
  return next;
}

export function movePage(pages: DesignNode[], id: string, dir: -1 | 1): DesignNode[] {
  const index = pages.findIndex((page) => page.id === id);
  const nextIndex = index + dir;
  if (index < 0 || nextIndex < 0 || nextIndex >= pages.length) return pages;
  const next = pages.slice();
  const [page] = next.splice(index, 1);
  next.splice(nextIndex, 0, page);
  return next;
}

function baseNode(partial: Partial<DesignNode> & Pick<DesignNode, "name" | "type" | "x" | "y" | "w" | "h">): DesignNode {
  return {
    id: uid(),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: "#f6f1ea",
    stroke: "transparent",
    strokeWidth: 0,
    radius: 0,
    children: [],
    ...partial,
  };
}

function textNode(name: string, text: string, x: number, y: number, w: number, h: number, fill: string, fontSize: number, fontWeight: number): DesignNode {
  return baseNode({ type: "text", name, text, x, y, w, h, fill, fontSize, fontWeight });
}

export function frameFromHtml(html: string, prompt: string, pages: DesignNode[]): DesignNode {
  const spread = /spread|editorial|magazine|print/i.test(prompt);
  const parsed = typeof DOMParser !== "undefined" ? new DOMParser().parseFromString(html, "text/html") : null;
  const headline = parsed?.querySelector("h1")?.textContent?.trim() || prompt.replace(/\s+/g, " ").trim().slice(0, 72) || "Untitled";
  const body = parsed?.querySelector("p")?.textContent?.trim() || "";
  const cta = parsed?.querySelector("a, button, .cta")?.textContent?.trim() || "Open a file";
  const x = pages.reduce((max, page) => Math.max(max, page.x + page.w), 40) + 80;
  const w = spread ? 1600 : 1440;
  const h = spread ? 1000 : 900;
  const column = spread ? 680 : 760;
  return baseNode({
    type: "frame",
    name: headline.slice(0, 42),
    x,
    y: 80,
    w,
    h,
    fill: "#161310",
    children: [
      textNode("Kicker", spread ? "SPREAD" : "DESIGN FORCE", 72, 64, 400, 24, "#c45c26", 13, 700),
      textNode("Headline", headline, 72, 110, column, 180, "#f3ece1", spread ? 64 : 56, 750),
      textNode("Body", body || prompt, 72, 320, column, 160, "#c9b9a6", 18, 500),
      baseNode({
        type: "rect",
        name: "Call to action",
        x: 72,
        y: h - 140,
        w: 220,
        h: 52,
        fill: "#c45c26",
        radius: 4,
        text: cta,
        fontSize: 16,
        fontWeight: 650,
      }),
      ...(spread
        ? [
            textNode("Deck", "Facing page", w / 2 + 40, 110, column - 80, 80, "#f3ece1", 28, 650),
            textNode("Sidebar", body.slice(0, 280) || "Master text flows onto the facing page.", w / 2 + 40, 220, column - 80, 400, "#c9b9a6", 16, 500),
          ]
        : [
            baseNode({
              type: "rect",
              name: "Source card",
              x: 980,
              y: 180,
              w: 360,
              h: 420,
              fill: "#f3ece1",
              radius: 12,
              children: [
                baseNode({ type: "rect", name: "Plate", x: 24, y: 24, w: 312, h: 180, fill: "#8f2d14", radius: 8, children: [] }),
                textNode("Card title", "Grounded in sources", 24, 224, 312, 32, "#161310", 18, 700),
                textNode("Card body", body.slice(0, 140) || "Sources keep the voice on the brief.", 24, 268, 312, 120, "#3a3228", 15, 500),
              ],
            }),
          ]),
    ],
  });
}

export type CraftPlan =
  | { kind: "place"; node: DesignNode; note: string }
  | { kind: "filters"; id: string; filters: PhotoFilters; note: string }
  | { kind: "keyframes"; id: string; keyframes: Keyframe[]; note: string }
  | { kind: "comment"; pin: CommentPin; note: string }
  | { kind: "master"; id: string; note: string }
  | { kind: "clips"; pages: DesignNode[]; note: string };

export function planFromPrompt(prompt: string, html: string, doc: DocumentState, selectedId: string | null): CraftPlan {
  const selected = selectedId ? findNode(doc.pages, selectedId) : null;
  const image =
    selected && (selected.imageDataUrl || selected.filters)
      ? selected
      : flatten(doc.pages).find((node) => node.imageDataUrl || node.filters) ?? null;

  if (/cooler|warmer|grade|exposure|contrast|saturat|bright|darken/i.test(prompt) && image) {
    const current = { ...ZERO_FILTERS, ...image.filters };
    return {
      kind: "filters",
      id: image.id,
      filters: {
        ...current,
        temperature: /cool/i.test(prompt) ? -0.45 : /warm|grade/i.test(prompt) ? 0.4 : current.temperature,
        exposure: /dark/i.test(prompt) ? -0.28 : /bright/i.test(prompt) ? 0.28 : current.exposure,
        contrast: /contrast/i.test(prompt) ? 0.22 : current.contrast,
        saturation: /saturat/i.test(prompt) ? (/less|muted|dull/i.test(prompt) ? -0.35 : 0.28) : current.saturation,
      },
      note: `Graded “${image.name}” on the shared plate. Open Photo to keep developing it.`,
    };
  }

  if (/animate|keyframe|title card|motion comp/i.test(prompt)) {
    const target = selected ?? flatten(doc.pages).find((node) => node.type === "text") ?? doc.pages[0];
    if (target) {
      return {
        kind: "keyframes",
        id: target.id,
        keyframes: [
          { t: 0, x: target.x, y: target.y, opacity: 0, rotation: target.rotation },
          { t: 1.2, x: target.x, y: target.y - 28, opacity: 1, rotation: target.rotation },
          { t: 3.2, x: target.x + 90, y: target.y - 28, opacity: 1, rotation: target.rotation + 8 },
        ],
        note: `Keyed “${target.name}”. Open Motion and press Play.`,
      };
    }
  }

  if (/annotat|comment on|callout/i.test(prompt)) {
    const page = selected ?? doc.pages[0];
    return {
      kind: "comment",
      pin: {
        id: uid("c"),
        x: (page?.x ?? 80) + 64,
        y: (page?.y ?? 80) + 64,
        author: "You",
        body: prompt.slice(0, 180),
        resolved: false,
        createdAt: Date.now(),
        attachments: [],
      },
      note: "Annotation added on the shared pages. Open PDF to review it.",
    };
  }

  if (/master page|apply master/i.test(prompt)) {
    const frame = selected ?? doc.pages.find((page) => page.type === "frame") ?? doc.pages[0];
    if (frame) return { kind: "master", id: frame.id, note: `“${frame.name}” is now the master page. Open Layout to apply it.` };
  }

  if (/sequence|rough cut|film timeline|trim the/i.test(prompt)) {
    return {
      kind: "clips",
      pages: doc.pages.map((page, index) => ({ ...page, start: index * 3, duration: /short/i.test(prompt) ? 1.5 : 3 })),
      note: "Assembled a sequence from the open frames. Open Film and press Play.",
    };
  }

  const node = frameFromHtml(html, prompt, doc.pages);
  return { kind: "place", node, note: `Placed “${node.name}” on the shared canvas. Vector, Layout, and PDF all open the same frame.` };
}
