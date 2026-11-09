import { useRef, useState, type ReactNode } from "react";
import type { ConstraintAxis, DesignNode } from "../types";
import { EXPORT_FORMATS } from "../lib/export";
import { reflowAuto } from "../lib/scene";
import { selectedNode, useStudio } from "../store";
import { CraftProps } from "./CraftProps";
import { Icon } from "./Icons";

const ALIGNS = ["Top left", "Top center", "Top right", "Center left", "Center", "Center right", "Bottom left", "Bottom center", "Bottom right"];

const EFFECTS = ["none", "blur", "shadow", "glass", "tint"] as const;
const H_CONSTRAINTS: [ConstraintAxis, string][] = [
  ["start", "Left"],
  ["end", "Right"],
  ["center", "Center"],
  ["stretch", "Left and right"],
  ["scale", "Scale"],
];
const V_CONSTRAINTS: [ConstraintAxis, string][] = [
  ["start", "Top"],
  ["end", "Bottom"],
  ["center", "Center"],
  ["stretch", "Top and bottom"],
  ["scale", "Scale"],
];

export function DesignInspector({
  format,
  formats,
  onFormat,
  onExport,
}: {
  format: string;
  formats: string[];
  onFormat: (id: string) => void;
  onExport: () => void;
}) {
  const { state, dispatch } = useStudio();
  const sel = selectedNode(state);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [locked, setLocked] = useState(false);
  const ratio = useRef(1);
  const open = (id: string) => !closed.has(id);
  const toggle = (id: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const patch = (next: Partial<DesignNode>) => {
    if (!sel) return;
    dispatch({ type: "patch", id: sel.id, patch: next });
  };
  const layout = (next: Partial<DesignNode>) => {
    if (!sel) return;
    const pages = reflowAuto(applyPatch(state.doc.pages, sel.id, next), sel.id);
    dispatch({ type: "replaceDoc", pages, selectedIds: state.doc.selectedIds });
  };

  const fill = hex6(sel?.fill, "#141715");
  const stroked = !!sel && sel.strokeWidth > 0 && sel.stroke !== "transparent" && sel.stroke !== "#00000000";
  const formatLabel = EXPORT_FORMATS.find((item) => item.id === format);

  return (
    <div className="design-inspector">
      <header>
        <span>Design</span>
        <button
          type="button"
          aria-label="Show grid"
          aria-pressed={state.showGrid}
          onClick={() => dispatch({ type: "ui", patch: { showGrid: !state.showGrid, showGuides: !state.showGrid } })}
        >
          <Icon name="sliders" size={14} />
        </button>
      </header>
      {!sel ? (
        <>
          <section>
            <p className="insp-empty">Select a layer to inspect.</p>
          </section>
          <CraftProps />
        </>
      ) : (
        <>
          <Section title={sel.name} open={open("object")} onToggle={() => toggle("object")} onRename={(name) => patch({ name })}>
            <p className="insp-meta">
              {kindOf(sel)} · {sizeOf(sel)}
            </p>
            <div className="insp-pair">
              <Num label="X" value={String(Math.round(sel.x))} onChange={(x) => patch({ x })} />
              <Num label="Y" value={String(Math.round(sel.y))} onChange={(y) => patch({ y })} />
            </div>
            <div className="insp-size">
              <Num
                label="W"
                value={String(Math.round(sel.w))}
                onChange={(w) => patch(locked ? { w, h: Math.max(1, Math.round(w * ratio.current)) } : { w })}
              />
              <button
                type="button"
                className="insp-lock"
                aria-pressed={locked}
                aria-label="Constrain proportions"
                onClick={() => {
                  ratio.current = sel.h / Math.max(1, sel.w);
                  setLocked((on) => !on);
                }}
              >
                <Icon name="link" size={12} />
              </button>
              <Num
                label="H"
                value={String(Math.round(sel.h))}
                onChange={(h) => patch(locked ? { h, w: Math.max(1, Math.round(h / Math.max(0.001, ratio.current))) } : { h })}
              />
            </div>
            <div className="insp-pair">
              <Num label="Rotation" value={`${Math.round(sel.rotation)}°`} onChange={(rotation) => patch({ rotation })} />
              <Num label="Corner" value={String(Math.round(sel.radius))} onChange={(radius) => patch({ radius })} />
            </div>
            <div className="insp-pair">
              <Constraint
                label="Horizontal"
                value={sel.constraints?.horizontal ?? "start"}
                options={H_CONSTRAINTS}
                onChange={(horizontal) => patch({ constraints: { horizontal, vertical: sel.constraints?.vertical ?? "start" } })}
              />
              <Constraint
                label="Vertical"
                value={sel.constraints?.vertical ?? "start"}
                options={V_CONSTRAINTS}
                onChange={(vertical) => patch({ constraints: { horizontal: sel.constraints?.horizontal ?? "start", vertical } })}
              />
            </div>
            {(sel.shape === "polygon" || sel.shape === "star") && (
              <Num label="Sides" value={String(sel.sides ?? (sel.shape === "star" ? 5 : 6))} onChange={(sides) => patch({ sides: Math.max(3, Math.round(sides)) })} />
            )}
          </Section>
          <CraftProps />
          <Section title="Auto layout" open={open("layout")} onToggle={() => toggle("layout")}>
            <div className="insp-dirs" role="group" aria-label="Auto layout direction">
              <button type="button" aria-pressed={sel.autoLayout === "vertical"} onClick={() => layout({ autoLayout: "vertical" })}>
                ↓
              </button>
              <button type="button" aria-pressed={sel.autoLayout === "horizontal"} onClick={() => layout({ autoLayout: "horizontal" })}>
                →
              </button>
              <button type="button" aria-pressed={sel.autoLayout === "wrap"} onClick={() => layout({ autoLayout: "wrap" })}>
                Wrap
              </button>
            </div>
            <div className="insp-pair">
              <Num label="Gap" value={String(sel.gap ?? 32)} onChange={(gap) => layout({ gap })} />
              <Num label="Padding" value={String(sel.padX ?? sel.padY ?? 64)} onChange={(padding) => layout({ padX: padding, padY: padding })} />
            </div>
            <label className="insp-stack">
              Alignment
              <span className="insp-select">
                <select aria-label="Alignment" value={sel.layoutAlign ?? "Center left"} onChange={(event) => layout({ layoutAlign: event.target.value })}>
                  {ALIGNS.map((align) => (
                    <option key={align}>{align}</option>
                  ))}
                </select>
                <Icon name="chevrons" size={11} />
              </span>
            </label>
          </Section>
          <Section title="Fill" open={open("fill")} onToggle={() => toggle("fill")}>
            <div className="insp-color">
              <label className="insp-swatch" style={{ background: sel.fillKind === "gradient" ? sel.gradientFrom || fill : sel.fill || fill }}>
                <input
                  type="color"
                  aria-label="Fill color"
                  value={fill}
                  onChange={(event) => patch({ fill: event.target.value, fillKind: "solid" })}
                />
              </label>
              <input
                className="insp-hex"
                aria-label="Fill hex"
                value={fill.slice(1)}
                onChange={(event) => {
                  const next = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6);
                  if (next.length === 6) patch({ fill: `#${next}`, fillKind: "solid" });
                }}
              />
              <input
                className="insp-opacity"
                aria-label="Fill opacity"
                value={`${Math.round(sel.opacity * 100)}%`}
                onChange={(event) => {
                  const n = Number(event.target.value.replace(/[^\d.]/g, ""));
                  if (Number.isFinite(n)) patch({ opacity: Math.min(1, Math.max(0, n / 100)) });
                }}
              />
            </div>
          </Section>
          <Section title="Stroke" open={open("stroke")} onToggle={() => toggle("stroke")}>
            {stroked ? (
              <div className="insp-color">
                <label className="insp-swatch" style={{ background: hex6(sel.stroke, "#eceeeb") }}>
                  <input type="color" aria-label="Stroke color" value={hex6(sel.stroke, "#eceeeb")} onChange={(event) => patch({ stroke: event.target.value })} />
                </label>
                <input
                  className="insp-hex"
                  aria-label="Stroke hex"
                  value={hex6(sel.stroke, "#eceeeb").slice(1)}
                  onChange={(event) => {
                    const next = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6);
                    if (next.length === 6) patch({ stroke: `#${next}` });
                  }}
                />
                <input
                  className="insp-opacity"
                  aria-label="Stroke weight"
                  value={String(sel.strokeWidth)}
                  onChange={(event) => patch({ strokeWidth: Number(event.target.value) || 0 })}
                />
              </div>
            ) : (
              <button type="button" className="insp-quiet" onClick={() => patch({ stroke: "#eceeeb", strokeWidth: 1 })}>
                No stroke
              </button>
            )}
          </Section>
          <Section title="Effects" open={open("effects")} onToggle={() => toggle("effects")}>
            <button
              type="button"
              className="insp-quiet"
              onClick={() => {
                const current = sel.effect && sel.effect !== "none" ? sel.effect : "none";
                const index = EFFECTS.indexOf(current);
                const next = EFFECTS[(index + 1) % EFFECTS.length];
                patch({ effect: next });
              }}
            >
              {effectLabel(sel.effect)}
            </button>
          </Section>
          <Section title="Export" open={open("export")} onToggle={() => toggle("export")}>
            <label className="insp-stack">
              Format
              <span className="insp-select">
                <select aria-label="Export format" value={format} onChange={(event) => onFormat(event.target.value)}>
                  {formats.map((id) => {
                    const item = EXPORT_FORMATS.find((entry) => entry.id === id);
                    return (
                      <option key={id} value={id}>
                        1× {item?.label ?? id.toUpperCase()}
                      </option>
                    );
                  })}
                </select>
                <Icon name="chevrons" size={11} />
              </span>
            </label>
            <button type="button" className="insp-export" onClick={onExport}>
              Export {sel.name}
            </button>
            <span className="sr">{formatLabel?.label}</span>
          </Section>
          <Section title="Code" open={open("code")} onToggle={() => toggle("code")}>
            <pre className="insp-code">{cssOf(sel)}</pre>
            <button
              type="button"
              className="insp-export"
              onClick={() => {
                void navigator.clipboard?.writeText(cssOf(sel));
              }}
            >
              Copy CSS
            </button>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  open,
  onToggle,
  onRename,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  onRename?: (name: string) => void;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="insp-head">
        {onRename ? (
          <input className="insp-name" aria-label="Layer name" value={title} onChange={(event) => onRename(event.target.value)} />
        ) : (
          <span>{title}</span>
        )}
        <button type="button" aria-label={open ? `Collapse ${title}` : `Expand ${title}`} aria-expanded={open} onClick={onToggle}>
          <Icon name={open ? "minus" : "plus"} size={12} />
        </button>
      </div>
      {open && children}
    </section>
  );
}

function Num({ label, value, onChange }: { label: string; value: string; onChange: (value: number) => void }) {
  return (
    <label className="insp-num">
      <span>{label}</span>
      <input
        aria-label={label}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value.replace(/[^\d.-]/g, ""));
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

function applyPatch(pages: DesignNode[], id: string, patch: Partial<DesignNode>): DesignNode[] {
  return pages.map((page) => {
    if (page.id === id) return { ...page, ...patch };
    return { ...page, children: applyPatch(page.children, id, patch) };
  });
}

function Constraint({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: ConstraintAxis;
  options: [ConstraintAxis, string][];
  onChange: (value: ConstraintAxis) => void;
}) {
  return (
    <label className="insp-num">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as ConstraintAxis)}>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function effectLabel(effect: DesignNode["effect"]) {
  if (!effect || effect === "none") return "No effects";
  if (effect === "glass") return "Glass";
  return effect[0].toUpperCase() + effect.slice(1);
}

function cssOf(node: DesignNode) {
  const lines = [
    `width: ${Math.round(node.w)}px;`,
    `height: ${Math.round(node.h)}px;`,
    node.fill && node.fill !== "#00000000" ? `background: ${node.fill};` : "",
    node.radius ? `border-radius: ${Math.round(node.radius)}px;` : "",
    node.opacity < 1 ? `opacity: ${node.opacity};` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function kindOf(node: DesignNode) {
  if (node.section) return "Section";
  if (node.instanceOf) return "Instance";
  if (node.component) return "Component";
  if (node.shape === "star") return "Star";
  if (node.shape === "polygon") return "Polygon";
  if (node.vector?.points.length) return "Vector";
  if (node.type === "frame" || node.type === "page") return "Frame";
  if (node.type === "text") return "Text";
  if (node.type === "ellipse") return "Ellipse";
  if (node.type === "image") return "Image";
  if (node.type === "path") return "Path";
  if (node.type === "group") return "Group";
  return "Rectangle";
}

function sizeOf(node: DesignNode) {
  const width = Math.round(node.w);
  if (width >= 1400 && width <= 1600) return `Desktop — ${width}`;
  if (width >= 740 && width <= 1024) return `Tablet — ${width}`;
  if (width >= 320 && width <= 430) return `Mobile — ${width}`;
  return String(width);
}

function hex6(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{8}$/.test(v)) return v.slice(0, 7).toLowerCase();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  return fallback;
}
