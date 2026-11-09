import { useEffect, useMemo, useRef, useState } from "react";
import { isMac } from "../lib/platform";
import { SHORTCUTS } from "../lib/shortcut-catalog";
import { useStudio } from "../store";

export function CommandPalette({ onRun }: { onRun: (id: string) => void }) {
  const { state, dispatch } = useStudio();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.paletteOpen) {
      setQuery("");
      input.current?.focus();
    }
  }, [state.paletteOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SHORTCUTS.filter((s) => !q || s.label.toLowerCase().includes(q) || s.group.toLowerCase().includes(q)).slice(0, 12);
  }, [query]);

  if (!state.paletteOpen) return null;

  return (
    <div className="modal-back" onClick={() => dispatch({ type: "ui", patch: { paletteOpen: false } })}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={query}
          placeholder={isMac ? "Search actions…" : "Search actions…"}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              dispatch({ type: "ui", patch: { paletteOpen: false } });
            }
            if (e.key === "Enter" && results[0]) {
              e.preventDefault();
              dispatch({ type: "ui", patch: { paletteOpen: false } });
              onRun(results[0].id);
            }
          }}
        />
        <ul>
          {results.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => {
                  dispatch({ type: "ui", patch: { paletteOpen: false } });
                  onRun(s.id);
                }}
              >
                <span>{s.label}</span>
                <kbd>{isMac ? s.mac : s.win}</kbd>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
