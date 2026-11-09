import type { DesignNode, SourceItem } from "./types";
import { uid } from "./lib/id";

function node(partial: Partial<DesignNode> & Pick<DesignNode, "type" | "name" | "x" | "y" | "w" | "h">): DesignNode {
  return {
    id: uid(),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: "#f3ece1",
    stroke: "transparent",
    strokeWidth: 0,
    radius: 0,
    children: [],
    ...partial,
  };
}

export function seedDocument(): { name: string; pages: DesignNode[] } {
  const hero = node({
    type: "frame",
    name: "Hero — Northlight",
    x: 80,
    y: 80,
    w: 1440,
    h: 900,
    fill: "#161310",
    children: [
      node({
        type: "rect",
        name: "Atmosphere",
        x: 0,
        y: 0,
        w: 1440,
        h: 900,
        fill: "#1c1713",
      }),
      node({
        type: "ellipse",
        name: "Copper bloom",
        x: 980,
        y: -80,
        w: 520,
        h: 520,
        fill: "#c45c26",
        opacity: 0.35,
      }),
      node({
        type: "rect",
        name: "Nav bar",
        x: 48,
        y: 36,
        w: 1344,
        h: 56,
        fill: "#00000000",
        children: [
          node({
            type: "text",
            name: "Wordmark",
            x: 0,
            y: 12,
            w: 220,
            h: 32,
            fill: "#f3ece1",
            text: "NORTHLIGHT",
            fontSize: 18,
            fontWeight: 700,
          }),
          node({
            type: "text",
            name: "Links",
            x: 860,
            y: 16,
            w: 480,
            h: 24,
            fill: "#c9b9a6",
            text: "Work    Studio    Journal    Contact",
            fontSize: 14,
            fontWeight: 500,
          }),
        ],
      }),
      node({
        type: "text",
        name: "Headline",
        x: 72,
        y: 280,
        w: 760,
        h: 180,
        fill: "#f3ece1",
        text: "Print-room\nprecision,\nlive on the canvas.",
        fontSize: 64,
        fontWeight: 700,
      }),
      node({
        type: "text",
        name: "Subhead",
        x: 72,
        y: 500,
        w: 520,
        h: 80,
        fill: "#c9b9a6",
        text: "A single studio for interface, photo, motion, film, layout, and PDF — with sources that keep every prompt on-brief.",
        fontSize: 18,
        fontWeight: 400,
      }),
      node({
        type: "rect",
        name: "Primary CTA",
        x: 72,
        y: 620,
        w: 180,
        h: 48,
        radius: 4,
        fill: "#c45c26",
        children: [
          node({
            type: "text",
            name: "CTA label",
            x: 28,
            y: 14,
            w: 124,
            h: 20,
            fill: "#f3ece1",
            text: "Open a file",
            fontSize: 14,
            fontWeight: 600,
          }),
        ],
      }),
      node({
        type: "rect",
        name: "Card",
        x: 900,
        y: 280,
        w: 420,
        h: 460,
        radius: 12,
        fill: "#f3ece1",
        children: [
          node({
            type: "rect",
            name: "Card image",
            x: 20,
            y: 20,
            w: 380,
            h: 220,
            radius: 8,
            fill: "#8f2d14",
          }),
          node({
            type: "text",
            name: "Card kicker",
            x: 28,
            y: 260,
            w: 300,
            h: 20,
            fill: "#8f2d14",
            text: "ISSUE 04  ·  STUDIO NOTES",
            fontSize: 12,
            fontWeight: 600,
          }),
          node({
            type: "text",
            name: "Card title",
            x: 28,
            y: 292,
            w: 360,
            h: 80,
            fill: "#161310",
            text: "How we merged nine editors into one desk.",
            fontSize: 24,
            fontWeight: 700,
          }),
        ],
      }),
    ],
  });

  const mobile = node({
    type: "frame",
    name: "Mobile — Northlight",
    x: 1640,
    y: 80,
    w: 390,
    h: 844,
    fill: "#161310",
    radius: 28,
    children: [
      node({
        type: "text",
        name: "Mobile wordmark",
        x: 28,
        y: 48,
        w: 200,
        h: 24,
        fill: "#f3ece1",
        text: "NORTHLIGHT",
        fontSize: 14,
        fontWeight: 700,
      }),
      node({
        type: "text",
        name: "Mobile headline",
        x: 28,
        y: 220,
        w: 334,
        h: 160,
        fill: "#f3ece1",
        text: "One desk.\nEvery craft.",
        fontSize: 40,
        fontWeight: 700,
      }),
      node({
        type: "rect",
        name: "Mobile CTA",
        x: 28,
        y: 720,
        w: 334,
        h: 52,
        radius: 6,
        fill: "#c45c26",
      }),
    ],
  });

  const photoPlate = node({
    type: "frame",
    name: "Plate — Harbor",
    x: 80,
    y: 1100,
    w: 1200,
    h: 800,
    fill: "#2a241c",
    children: [
      node({
        type: "rect",
        name: "Sky",
        x: 0,
        y: 0,
        w: 1200,
        h: 420,
        fill: "#5c4a38",
        filters: { exposure: 0.1, contrast: 0.08, saturation: -0.1, temperature: 0.15, highlights: -0.05, shadows: 0.1 },
      }),
      node({
        type: "rect",
        name: "Water",
        x: 0,
        y: 420,
        w: 1200,
        h: 380,
        fill: "#1e2a2e",
        filters: { exposure: -0.05, contrast: 0.12, saturation: 0.05, temperature: -0.08, highlights: 0, shadows: 0.2 },
      }),
      node({
        type: "ellipse",
        name: "Sun",
        x: 820,
        y: 120,
        w: 160,
        h: 160,
        fill: "#e8b26a",
        opacity: 0.85,
      }),
    ],
  });

  const spread = node({
    type: "page",
    name: "Spread 12–13",
    x: 2160,
    y: 1100,
    w: 1400,
    h: 900,
    fill: "#efe6d8",
    children: [
      node({
        type: "text",
        name: "Folio",
        x: 48,
        y: 40,
        w: 200,
        h: 20,
        fill: "#8f2d14",
        text: "VOL. II  /  12",
        fontSize: 12,
        fontWeight: 600,
      }),
      node({
        type: "text",
        name: "Essay title",
        x: 48,
        y: 120,
        w: 620,
        h: 140,
        fill: "#161310",
        text: "The desk that remembers every craft.",
        fontSize: 42,
        fontWeight: 700,
      }),
      node({
        type: "text",
        name: "Body",
        x: 48,
        y: 300,
        w: 600,
        h: 480,
        fill: "#3a3228",
        text: "Design Force keeps a single scene graph for interface, photo plates, motion comps, film sequences, print spreads, and PDFs. Sources sit beside the canvas — briefs, transcripts, brand tokens — so AI edits stay on-brief instead of inventing a new brand every prompt.",
        fontSize: 16,
        fontWeight: 400,
      }),
      node({
        type: "rect",
        name: "Pull quote rule",
        x: 760,
        y: 180,
        w: 8,
        h: 220,
        fill: "#c45c26",
      }),
      node({
        type: "text",
        name: "Pull quote",
        x: 792,
        y: 180,
        w: 520,
        h: 220,
        fill: "#161310",
        text: "“Export is not an afterthought. A file should leave this desk in whatever language the next tool speaks.”",
        fontSize: 22,
        fontWeight: 500,
      }),
    ],
  });

  hero.start = 0;
  hero.duration = 5;
  mobile.start = 5;
  mobile.duration = 4;
  photoPlate.start = 9;
  photoPlate.duration = 6;
  spread.start = 15;
  spread.duration = 5;

  hero.start = 0;
  hero.duration = 5;
  mobile.start = 5;
  mobile.duration = 4;
  photoPlate.start = 9;
  photoPlate.duration = 6;
  spread.start = 15;
  spread.duration = 5;

  return {
    name: "Northlight — campaign desk",
    pages: [hero, mobile, photoPlate, spread],
  };
}

export const seedSources: SourceItem[] = [
  {
    id: uid("src"),
    kind: "note",
    title: "Brand voice — Northlight",
    excerpt: "Warm, precise, print-room. Never neon. Copper, ink, cream.",
    content:
      "Northlight is a print and product studio. Voice: warm, precise, slightly literary. Palette: ink #161310, cream #f3ece1, copper #c45c26, oxide #8f2d14. Type: Syne for display, Source Serif/Sans for body. Avoid purple gradients, glassmorphism, and generic SaaS layouts.",
    addedAt: Date.now() - 86400000,
  },
  {
    id: uid("src"),
    kind: "file",
    title: "Campaign brief.pdf",
    excerpt: "Q1 launch: 'One desk, every craft.' Audience: independent studios.",
    content:
      "Campaign brief: Launch Design Force to independent studios tired of bouncing between Figma, Photoshop, After Effects, Premiere, Lightroom, InDesign, and Acrobat. Promise: one collaborative canvas, sources that ground AI, export to any format the next vendor needs. Hero product shot is a physical desk with copper tools. CTA: Open a file.",
    addedAt: Date.now() - 3600000,
  },
  {
    id: uid("src"),
    kind: "url",
    title: "openpencil.dev — capabilities",
    excerpt: "Opens .fig and .pen, AI tools, design-to-code, P2P collab.",
    content:
      "OpenPencil is an AI-native design editor. It opens .fig and .pen files, supports components, auto layout, design-to-code (JSX/Tailwind), PPTX export, and peer-to-peer collaboration. Programmable via CLI, MCP, and Vue SDK.",
    addedAt: Date.now() - 7200000,
  },
];
