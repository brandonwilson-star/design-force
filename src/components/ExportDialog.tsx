import { useMemo, useState, type RefObject } from "react";
import { EXPORT_FORMATS, exportDocument } from "../lib/export";
import { findNode } from "../lib/id";
import { useStudio } from "../store";
import type { DesignNode } from "../types";

export function ExportDialog({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const { state, dispatch } = useStudio();
  const [picked, setPicked] = useState("png");
  const [scale, setScale] = useState<1 | 2>(1);
  const [scope, setScope] = useState<"selection" | "frames" | "document">("frames");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof EXPORT_FORMATS>();
    for (const f of EXPORT_FORMATS) {
      const list = map.get(f.group) ?? [];
      list.push(f);
      map.set(f.group, list);
    }
    return [...map.entries()];
  }, []);

  if (!state.exportOpen) return toast ? <div className="toast">{toast}</div> : null;

  const run = async (id?: string) => {
    const formatId = id ?? picked;
    setBusy(true);
    try {
      const selected = state.doc.selectedIds
        .map((id) => findNode(state.doc.pages, id))
        .filter((node): node is DesignNode => !!node);
      const frames = state.doc.pages.filter(
        (page) => selected.some((node) => node.id === page.id || findNode([page], node.id)),
      );
      const nodes =
        scope === "document" ? undefined : scope === "frames" ? (frames.length ? frames : state.doc.pages) : selected.length ? selected : undefined;
      await exportDocument(state.doc, formatId, canvasRef.current, { scale, nodes });
      const fmt = EXPORT_FORMATS.find((f) => f.id === formatId)!;
      setToast(`Exported ${fmt.label}`);
      dispatch({ type: "toggleExport" });
      setTimeout(() => setToast(null), 2200);
    } catch (err) {
      setToast(String(err));
      setTimeout(() => setToast(null), 2800);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="modal-back" onClick={() => dispatch({ type: "toggleExport" })}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <header>
            <div>
              <h2>Export any format</h2>
              <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
                Export the selected frames, the current selection, or the whole document. Raster files are real images. .fig, .pen, and .psd are interchange files.
              </p>
            </div>
            <button className="textbtn ghost" onClick={() => dispatch({ type: "toggleExport" })}>
              Close
            </button>
          </header>
          <div className="seg" role="group" aria-label="Export scale and scope">
            <button type="button" className="textbtn" aria-pressed={scope === "frames"} onClick={() => setScope("frames")}>
              Frames
            </button>
            <button type="button" className="textbtn" aria-pressed={scope === "selection"} onClick={() => setScope("selection")}>
              Selection
            </button>
            <button type="button" className="textbtn" aria-pressed={scope === "document"} onClick={() => setScope("document")}>
              Document
            </button>
            <button type="button" className="textbtn" aria-pressed={scale === 1} onClick={() => setScale(1)}>
              1×
            </button>
            <button type="button" className="textbtn" aria-pressed={scale === 2} onClick={() => setScale(2)}>
              2×
            </button>
          </div>
          <div className="formats">
            {grouped.map(([group, items]) => (
              <div key={group} style={{ display: "contents" }}>
                <div className="group-label">{group}</div>
                {items.map((f) => {
                  const suggested = f.modes.includes("all") || f.modes.includes(state.mode);
                  return (
                    <button
                      key={f.id}
                      className={`format ${picked === f.id ? "active" : ""}`}
                      onClick={() => setPicked(f.id)}
                      onDoubleClick={() => run(f.id)}
                    >
                      <b>
                        {f.label}
                        {suggested ? "" : " ·"}
                      </b>
                      <small>
                        .{f.ext} — {f.hint}
                      </small>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 20px 20px" }}>
            <button className="textbtn" onClick={() => run()} disabled={busy}>
              {busy ? "Exporting…" : `Export ${EXPORT_FORMATS.find((f) => f.id === picked)?.label}`}
            </button>
            <button className="textbtn primary" onClick={() => run("png")} disabled={busy}>
              Quick PNG
            </button>
          </div>
        </div>
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
