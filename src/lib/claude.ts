import type { ChatMessage, ModeId, SourceItem } from "../types";
import { MODES } from "../types";

export function getStoredKey(): string {
  return localStorage.getItem("df.anthropicKey") || import.meta.env.VITE_ANTHROPIC_API_KEY || "";
}

export function setStoredKey(key: string) {
  localStorage.setItem("df.anthropicKey", key);
}

export function buildSystemPrompt(mode: ModeId, sources: SourceItem[]): string {
  const modeMeta = MODES.find((m) => m.id === mode);
  const sourceBlock = sources.length
    ? sources
        .map((s, i) => `[Source ${i + 1}: ${s.title} (${s.kind})]\n${s.content}`)
        .join("\n\n")
    : "(no sources attached)";

  return `You are Design Force, an AI design partner in the style of Claude Design.

You sit inside a unified studio that merges Penpot, OpenPencil, and the ArtCraft suite (PhotoCraft, EffectCraft, FilmCraft, LightCraft, DesignCraft, PdfCraft) under ArtCraft Core.

Current mode: ${modeMeta?.label} — ${modeMeta?.blurb}
Lineage: ${modeMeta?.lineage.join(", ")}

When the user asks for a design, respond with:
1. A short craft note (2-4 sentences) explaining choices, citing sources by title when you use them.
2. A fenced HTML block (\`\`\`html ... \`\`\`) containing a self-contained artboard: inline CSS, no external assets, 1440×900 (or 390×844 if they ask mobile). Use the Northlight palette unless sources specify otherwise: ink #161310, cream #f3ece1, copper #c45c26, oxide #8f2d14. Display type: Syne or Georgia. Body: Source Sans 3 / system-ui.
3. If they ask for an edit in another mode (photo, motion, film, layout, PDF), still produce HTML that *represents* that craft (a color-graded plate, a timeline, a spread, annotated PDF pages).

Never invent a competing brand when sources define one. Prefer print-room warmth over generic SaaS purple.

SOURCES
${sourceBlock}`;
}

export async function askClaude(opts: {
  apiKey: string;
  mode: ModeId;
  sources: SourceItem[];
  history: ChatMessage[];
  prompt: string;
}): Promise<{ text: string; html?: string }> {
  const messages = [
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: opts.prompt },
  ];

  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      apiKey: opts.apiKey,
      system: buildSystemPrompt(opts.mode, opts.sources),
      messages,
    }),
  });

  const data = (await res.json()) as {
    error?: string | { message?: string };
    content?: { type: string; text?: string }[];
  };
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : data.error?.message || `Claude ${res.status}`;
    throw new Error(msg);
  }
  const text = data.content?.map((c) => c.text ?? "").join("\n") ?? "";
  const html = extractHtml(text);
  return { text: stripHtmlFence(text), html };
}

export function extractHtml(text: string): string | undefined {
  const m = text.match(/```html\s*([\s\S]*?)```/i);
  return m?.[1]?.trim();
}

function stripHtmlFence(text: string): string {
  return text.replace(/```html\s*[\s\S]*?```/i, "").trim();
}

export function localDesign(prompt: string, sources: SourceItem[]): { text: string; html: string } {
  const brand = sources.find((s) => /brand|voice|northlight/i.test(s.title))?.content ?? "";
  const brief = sources.find((s) => /brief/i.test(s.title))?.content ?? prompt;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Source+Sans+3:wght@400;600&display=swap');
  html,body{margin:0;height:100%;background:#161310;color:#f3ece1;font-family:'Source Sans 3',system-ui,sans-serif}
  .board{min-height:100%;padding:64px 72px;background:radial-gradient(1200px 600px at 90% -10%, rgba(196,92,38,.35), transparent 55%), #161310}
  .kicker{letter-spacing:.22em;font-size:12px;color:#c45c26;font-weight:600}
  h1{font-family:Syne,serif;font-size:64px;line-height:.95;margin:24px 0 20px;max-width:14ch}
  p.lede{max-width:42ch;color:#c9b9a6;font-size:18px}
  .cta{display:inline-block;margin-top:36px;background:#c45c26;color:#f3ece1;padding:14px 22px;border-radius:4px;font-weight:600}
  .card{position:absolute;right:72px;top:180px;width:360px;background:#f3ece1;color:#161310;border-radius:12px;padding:20px}
  .swatch{height:180px;border-radius:8px;background:#8f2d14;margin-bottom:16px}
</style></head><body>
  <div class="board">
    <div class="kicker">DESIGN FORCE  ·  AI ARTBOARD</div>
    <h1>${escapeHtml(headlineFrom(prompt))}</h1>
    <p class="lede">${escapeHtml(brief.slice(0, 220))}</p>
    <span class="cta">Open a file</span>
    <aside class="card">
      <div class="swatch"></div>
      <strong>Grounded in sources</strong>
      <p>${escapeHtml(brand.slice(0, 160) || "Add a brief or brand note in Sources to lock the voice.")}</p>
    </aside>
  </div>
</body></html>`;
  return {
    text: `Local preview (add an Anthropic key in Settings for Claude). I treated this as a Northlight artboard: copper on ink, one CTA, and a source card so the prompt stays on-brief.\n\nPrompt: ${prompt}`,
    html,
  };
}

function headlineFrom(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (clean.length < 48) return clean || "One desk.\nEvery craft.";
  return clean.split(/[.!?]/)[0]?.slice(0, 72) || "One desk. Every craft.";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
