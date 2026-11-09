import { isMac } from "../lib/platform";
import { SHORTCUTS, usedShortcuts } from "../lib/shortcut-catalog";
import { useStudio } from "../store";

const GROUPS = ["Essentials", "Tools", "Selection", "Edit", "Arrange", "Layout", "Components", "Text", "View", "Panels"];

export function ShortcutsPanel() {
  const { state, dispatch } = useStudio();
  if (!state.shortcutsOpen) return null;
  return (
    <section className="shortcuts-panel" role="dialog" aria-label="Keyboard shortcuts">
      <header>
        <h2>Keyboard shortcuts</h2>
        <span>{isMac ? "Mac" : "Windows"} · same commands as Figma</span>
        <button className="textbtn ghost" onClick={() => dispatch({ type: "ui", patch: { shortcutsOpen: false } })}>
          Close
        </button>
      </header>
      <div className="shortcut-grid">
        {GROUPS.map((group) => (
          <div key={group}>
            <div className="group-label">{group}</div>
            {SHORTCUTS.filter((s) => s.group === group).map((s) => (
              <div key={s.id} className={`shortcut-row ${usedShortcuts.has(s.id) ? "used" : ""}`}>
                <span>{s.label}</span>
                <kbd>{isMac ? s.mac : s.win}</kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
