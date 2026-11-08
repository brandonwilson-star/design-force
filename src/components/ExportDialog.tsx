import { useMemo, useState, type RefObject } from "react";
import { EXPORT_FORMATS, exportDocument } from "../lib/export";
import { useStudio } from "../store";

export function ExportDialog({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const { state, dispatch } = useStudio();
  const [picked, setPicked] = useState("png");
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
      await exportDocument(state.doc, formatId, canvasRef.current);
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
              <p style={{ margin: "6px 0 0", color: "var(--paper-dim)" }}>
                Current mode filters suggestions, but every format is available. Native binaries
                (.psd, .fig, .indd) ship as structured interchange plus a flattened preview.
              </p>
            </div>
            <button className="textbtn ghost" onClick={() => dispatch({ type: "toggleExport" })}>
              Close
            </button>
          </header>
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
