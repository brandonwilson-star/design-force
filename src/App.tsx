import { useEffect, useRef } from "react";
import { AiStudio } from "./components/AiStudio";
import { CanvasStage } from "./components/CanvasStage";
import { ExportDialog } from "./components/ExportDialog";
import { SourcesDrawer } from "./components/SourcesDrawer";
import { flatten } from "./lib/id";
import { getStoredKey } from "./lib/claude";
import { selectedNode, useStudio } from "./store";
import { MODES, UPSTREAM, type ToolId } from "./types";

const TOOLS: { id: ToolId; glyph: string; title: string }[] = [
  { id: "select", glyph: "▣", title: "Select (V)" },
  { id: "frame", glyph: "▭", title: "Frame (F)" },
  { id: "rect", glyph: "■", title: "Rectangle (R)" },
  { id: "ellipse", glyph: "●", title: "Ellipse (O)" },
  { id: "text", glyph: "T", title: "Text (T)" },
  { id: "pen", glyph: "✎", title: "Pen (P)" },
  { id: "image", glyph: "▣", title: "Image" },
  { id: "crop", glyph: "⛶", title: "Crop" },
  { id: "brush", glyph: "🖌", title: "Brush" },
  { id: "comment", glyph: "💬", title: "Comment (C)" },
  { id: "hand", glyph: "✋", title: "Hand (H)" },
];

export function App() {
  const { state, dispatch } = useStudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sel = selectedNode(state);

  useEffect(() => {
    const key = getStoredKey();
    if (key) dispatch({ type: "apiKey", apiKey: key });
  }, [dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input, textarea")) return;
      const map: Record<string, ToolId> = { v: "select", f: "frame", r: "rect", o: "ellipse", t: "text", p: "pen", c: "comment", h: "hand" };
      if (map[e.key.toLowerCase()]) dispatch({ type: "tool", tool: map[e.key.toLowerCase()] });
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault();
        dispatch({ type: "toggleExport" });
      }
      if (e.key === " " && state.mode === "motion") {
        e.preventDefault();
        dispatch({ type: "playing", playing: !state.playing });
      }
      if ((e.key === "Backspace" || e.key === "Delete") && state.doc.selectedId) {
        dispatch({ type: "remove", id: state.doc.selectedId });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, state.mode, state.playing, state.doc.selectedId]);

  useEffect(() => {
    if (!state.playing) return;
    const id = window.setInterval(() => dispatch({ type: "playTick" }), 80);
    return () => window.clearInterval(id);
  }, [state.playing, dispatch]);

  useEffect(() => {
    const id = window.setInterval(() => dispatch({ type: "nudgeCollabs" }), 1800);
    return () => window.clearInterval(id);
  }, [dispatch]);

  const layers = flatten(state.doc.pages);
  const mode = MODES.find((m) => m.id === state.mode)!;
  const ai = state.mode === "ai";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="mark" />
          <div>
            <h1>Design Force</h1>
            <span>ArtCraft Core</span>
          </div>
        </div>
        <input
          className="docname"
          value={state.doc.name}
          onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
        />
        <div className="presence">
          {state.collaborators.map((c) => (
            <div key={c.id} className="avatar" style={{ background: c.color }} title={`${c.name} · ${c.mode}`}>
              {c.name.slice(0, 1)}
            </div>
          ))}
          <div className="avatar" style={{ background: "#3d6ea8" }} title="You">
            Y
          </div>
        </div>
        <button className="textbtn ghost" onClick={() => dispatch({ type: "toggleSource" })}>
          Sources {state.sources.length}
        </button>
        <button className="textbtn ghost" onClick={() => dispatch({ type: "toggleSettings" })}>
          Lineage
        </button>
        <button className="textbtn primary" onClick={() => dispatch({ type: "toggleExport" })}>
          Export
        </button>
      </header>

      <nav className="modetabs">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`mode ${state.mode === m.id ? "active" : ""}`}
            onClick={() => dispatch({ type: "mode", mode: m.id })}
            title={m.blurb}
          >
            {m.label}
            <span className="lineage">{m.lineage.join(" · ")}</span>
          </button>
        ))}
      </nav>

      <div className={`workspace ${state.mode} ${state.sourceOpen ? "sources-open" : ""}`}>
        <div className="toolbar">
          {TOOLS.filter((t) => {
            if (ai) return ["select", "comment", "hand"].includes(t.id);
            if (state.mode === "photo") return ["select", "crop", "brush", "hand"].includes(t.id);
            if (state.mode === "film" || state.mode === "motion") return ["select", "hand", "comment"].includes(t.id);
            return true;
          }).map((t) => (
            <button
              key={t.id}
              className={`tool ${state.tool === t.id ? "active" : ""}`}
              title={t.title}
              onClick={() => dispatch({ type: "tool", tool: t.id })}
            >
              {t.glyph}
            </button>
          ))}
        </div>

        {ai ? (
          <AiStudio />
        ) : (
          <>
            <aside className="panel">
              <h3>Layers</h3>
              {layers.map((n) => (
                <button
                  key={n.id}
                  className={`layer ${state.doc.selectedId === n.id ? "active" : ""}`}
                  onClick={() => dispatch({ type: "select", id: n.id })}
                >
                  <span className="swatch" style={{ background: n.fill === "#00000000" ? "transparent" : n.fill }} />
                  {n.name}
                </button>
              ))}
            </aside>
            <div className={`stage-wrap ${state.mode === "photo" ? "photo-lab" : ""}`}>
              {state.mode === "pdf" ? (
                <div className="pdf-pages">
                  {state.doc.pages.map((p) => (
                    <article key={p.id} className="pdf-page">
                      <h2>{p.name}</h2>
                      {flatten([p])
                        .filter((n) => n.type === "text" && n.text)
                        .map((n) => (
                          <p key={n.id}>{n.text}</p>
                        ))}
                    </article>
                  ))}
                </div>
              ) : (
                <CanvasStage canvasRef={canvasRef} />
              )}
              {(state.mode === "motion" || state.mode === "film") && (
                <div className="timeline">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button className="textbtn" onClick={() => dispatch({ type: "playing", playing: !state.playing })}>
                      {state.playing ? "Pause" : "Play"}
                    </button>
                    <span className="ticks">{state.playhead.toFixed(2)}s · 24 fps</span>
                  </div>
                  <div className="ticks">
                    {Array.from({ length: 9 }, (_, i) => (
                      <span key={i}>{i}s</span>
                    ))}
                  </div>
                  <div className="clips">
                    {state.doc.pages.map((p, i) => (
                      <div key={p.id} className="clip" style={{ width: 120 + i * 40, background: i % 2 ? "#6b7f5a" : "#8f2d14" }}>
                        {p.name}
                      </div>
                    ))}
                  </div>
                  <div className="playhead" style={{ left: `${12 + state.playhead * 36}px` }} />
                </div>
              )}
              <div className="hint">
                {mode.blurb} · {mode.lineage.join(" + ")} · ⌘E export
              </div>
            </div>
            <aside className="panel right">
              <h3>Inspect · {mode.short}</h3>
              {sel ? (
                <>
                  <div className="field">
                    <label>Name</label>
                    <input value={sel.name} onChange={(e) => dispatch({ type: "patch", id: sel.id, patch: { name: e.target.value } })} />
                  </div>
                  <div className="row field">
                    <div>
                      <label>X</label>
                      <input type="number" value={Math.round(sel.x)} onChange={(e) => dispatch({ type: "patch", id: sel.id, patch: { x: Number(e.target.value) } })} />
                    </div>
                    <div>
                      <label>Y</label>
                      <input type="number" value={Math.round(sel.y)} onChange={(e) => dispatch({ type: "patch", id: sel.id, patch: { y: Number(e.target.value) } })} />
                    </div>
                  </div>
                  <div className="row field">
                    <div>
                      <label>W</label>
                      <input type="number" value={Math.round(sel.w)} onChange={(e) => dispatch({ type: "patch", id: sel.id, patch: { w: Number(e.target.value) } })} />
                    </div>
                    <div>
                      <label>H</label>
                      <input type="number" value={Math.round(sel.h)} onChange={(e) => dispatch({ type: "patch", id: sel.id, patch: { h: Number(e.target.value) } })} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Fill</label>
                    <input value={sel.fill} onChange={(e) => dispatch({ type: "patch", id: sel.id, patch: { fill: e.target.value } })} />
                  </div>
                  {sel.type === "text" && (
                    <div className="field">
                      <label>Copy</label>
                      <textarea value={sel.text} onChange={(e) => dispatch({ type: "patch", id: sel.id, patch: { text: e.target.value } })} />
                    </div>
                  )}
                  {state.mode === "photo" && (
                    <>
                      <div className="meter" />
                      {(["exposure", "contrast", "saturation", "temperature", "highlights", "shadows"] as const).map((k) => (
                        <div className="field" key={k}>
                          <label>{k}</label>
                          <input
                            type="range"
                            min={-1}
                            max={1}
                            step={0.01}
                            value={sel.filters?.[k] ?? 0}
                            onChange={(e) => dispatch({ type: "filters", id: sel.id, filters: { [k]: Number(e.target.value) } })}
                          />
                        </div>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <p style={{ padding: "0 14px", color: "var(--paper-dim)" }}>Select a layer to inspect.</p>
              )}
            </aside>
          </>
        )}
        <SourcesDrawer />
      </div>

      <footer className="statusbar">
        <span>
          {state.doc.pages.length} artboards · {layers.length} nodes · {state.collaborators.length + 1} on the desk
        </span>
        <span>
          {Math.round(state.camera.zoom * 100)}% · {state.tool} · MIT · grounded in {state.sources.length} sources
        </span>
      </footer>

      <ExportDialog canvasRef={canvasRef} />

      {state.settingsOpen && (
        <div className="modal-back" onClick={() => dispatch({ type: "toggleSettings" })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>Lineage</h2>
              <button className="textbtn ghost" onClick={() => dispatch({ type: "toggleSettings" })}>
                Close
              </button>
            </header>
            <div className="settings">
              <p style={{ color: "var(--paper-dim)", marginTop: 0 }}>
                Design Force is a unified studio shell. Similar crafts are merged into modes; each
                mode credits the open-source desk it sits on.
              </p>
              {UPSTREAM.map((u) => (
                <a key={u.url} href={u.url} target="_blank" rel="noreferrer" className="source-card" style={{ textDecoration: "none", color: "inherit" }}>
                  <strong>{u.name}</strong>
                  <p>{u.role}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
