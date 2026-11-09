import { useEffect, useId } from "react";
import { THEMES, type Appearance } from "../lib/themes";

const APPEARANCES: { id: Appearance; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

export function ThemePicker({
  open,
  appearance,
  themeId,
  onAppearance,
  onTheme,
  onClose,
}: {
  open: boolean;
  appearance: Appearance;
  themeId: string;
  onAppearance: (appearance: Appearance) => void;
  onTheme: (id: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="theme-back" onClick={onClose}>
      <div
        className="theme-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id={titleId}>Themes</h2>
          <button type="button" className="textbtn ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="theme-note">Appearance changes the canvas and panels. A theme colors the sidebar and accent, the same way Slack does.</p>
        <div className="appearance" role="radiogroup" aria-label="Appearance">
          {APPEARANCES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={appearance === item.id}
              className={appearance === item.id ? "active" : ""}
              onClick={() => onAppearance(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className="theme-card"
              aria-pressed={themeId === theme.id}
              onClick={() => onTheme(theme.id)}
            >
              <span className="theme-preview" style={{ background: theme.chrome }} aria-hidden="true">
                <span style={{ background: theme.chromeRaised }} />
                <span style={{ background: theme.accent }} />
                <span style={{ background: theme.chromeText }} />
              </span>
              {theme.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
