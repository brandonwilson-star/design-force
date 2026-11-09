import { useEffect, useState, type CSSProperties } from "react";
import { findNode, flatten, uid } from "../lib/id";
import { alignNodes, alignOne, makeAutoLayout, makeComponentSet, makeMask, reflowAuto, rootFrameId, topmostIds } from "../lib/scene";
import { pageComments, selectedNode, useStudio } from "../store";
import type { DesignNode, LayoutGrid, PrototypeInteraction, ShareAccess } from "../types";

const PRESETS = [
  { name: "Desktop", w: 1440, h: 900 },
  { name: "MacBook", w: 1512, h: 982 },
  { name: "Tablet", w: 768, h: 1024 },
  { name: "Phone", w: 390, h: 844 },
];

const BLENDS = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color", "luminosity"] as const;

function hex6(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return fallback;
}

function presetFrame(name: string, w: number, h: number, index: number): DesignNode {
  return {
    id: uid(),
    type: "frame",
    name,
    x: 80 + index * 36,
    y: 80 + index * 36,
    w,
    h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: "#f6f1ea",
    stroke: "#d9cfc3",
    strokeWidth: 1,
    radius: 0,
    children: [],
  };
}

export function FramePresets() {
  const { state, dispatch } = useStudio();
  if (state.tool !== "frame" || state.mode === "pdf" || state.mode === "ai") return null;
  return (
    <div className="presets" role="toolbar" aria-label="Frame size">
      {PRESETS.map((preset) => (
        <button
          key={preset.name}
          type="button"
          className="textbtn"
          onClick={() => {
            dispatch({ type: "add", parentId: null, node: presetFrame(preset.name, preset.w, preset.h, state.doc.pages.length) });
            dispatch({ type: "tool", tool: "select" });
          }}
        >
          {preset.name}
          <span>
            {preset.w}×{preset.h}
          </span>
        </button>
      ))}
    </div>
  );
}

export function PageBar() {
  const { state, dispatch } = useStudio();
  return (
    <nav className="pagebar" aria-label="Pages">
      {state.doc.sheets.map((sheet) => (
        <button
          key={sheet.id}
          type="button"
          className="textbtn"
          aria-current={sheet.id === state.doc.activeSheetId ? "page" : undefined}
          onClick={() => dispatch({ type: "sheet", id: sheet.id })}
        >
          {sheet.name}
        </button>
      ))}
      <button type="button" className="textbtn" onClick={() => dispatch({ type: "addSheet" })}>
        Add page
      </button>
    </nav>
  );
}

export function InspectExtras() {
  const { state, dispatch } = useStudio();
  const sel = selectedNode(state);
  if (!sel) return null;
  const ids = state.doc.selectedIds.length ? state.doc.selectedIds : [sel.id];
  const patch = (next: Partial<DesignNode>) => dispatch({ type: "patch", id: sel.id, patch: next });
  const align = (mode: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter") => {
    const tops = topmostIds(state.doc.pages, ids);
    const pages = tops.length >= 2 ? alignNodes(state.doc.pages, ids, mode) : alignOne(state.doc.pages, tops[0] ?? sel.id, mode);
    dispatch({ type: "replaceDoc", pages, selectedIds: ids });
  };
  const layout = (next: Partial<DesignNode>) => {
    const pages = reflowAuto(updatePages(state.doc.pages, sel.id, next), sel.id);
    dispatch({ type: "replaceDoc", pages, selectedIds: state.doc.selectedIds });
  };
  const showImage = state.mode === "photo" || !!sel.imageDataUrl || sel.type === "image";

  return (
    <>
      <div className="seg" role="group" aria-label="Align">
        {(
          [
            ["left", "Left"],
            ["hcenter", "Center"],
            ["right", "Right"],
            ["top", "Top"],
            ["vcenter", "Middle"],
            ["bottom", "Bottom"],
          ] as const
        ).map(([mode, label]) => (
          <button key={mode} type="button" className="textbtn" onClick={() => align(mode)}>
            {label}
          </button>
        ))}
      </div>
      <div className="field">
        <label>
          Fill color
          <input type="color" value={hex6(sel.fill, "#c45c26")} aria-label="Fill color" onChange={(e) => patch({ fill: e.target.value, fillKind: "solid" })} />
        </label>
      </div>
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={sel.fillKind === "gradient"}
            onChange={(e) =>
              patch(
                e.target.checked
                  ? { fillKind: "gradient", gradientFrom: sel.gradientFrom || "#ffffff", gradientTo: sel.gradientTo || hex6(sel.fill, "#532bdc") }
                  : { fillKind: "solid" },
              )
            }
          />{" "}
          Linear gradient
        </label>
        {sel.fillKind === "gradient" && (
          <div className="row">
            <label>
              Top
              <input type="color" aria-label="Gradient top" value={hex6(sel.gradientFrom, "#ffffff")} onChange={(e) => patch({ gradientFrom: e.target.value, fillKind: "gradient" })} />
            </label>
            <label>
              Bottom
              <input type="color" aria-label="Gradient bottom" value={hex6(sel.gradientTo, "#532bdc")} onChange={(e) => patch({ gradientTo: e.target.value, fillKind: "gradient" })} />
            </label>
          </div>
        )}
      </div>
      <div className="styles" aria-label="Color styles">
        {state.doc.colorStyles.map((style) => (
          <button key={style.id} type="button" className="textbtn" onClick={() => patch({ fill: style.value, fillKind: "solid" })}>
            <i style={{ background: style.value }} />
            {style.name}
          </button>
        ))}
        <button
          type="button"
          className="textbtn"
          onClick={() =>
            dispatch({
              type: "style",
              style: { id: uid("style"), name: `Style ${state.doc.colorStyles.length + 1}`, value: sel.fill },
            })
          }
        >
          Create style
        </button>
      </div>
      <div className="row field">
        <label>
          Stroke
          <input value={sel.stroke} onChange={(e) => patch({ stroke: e.target.value })} />
        </label>
        <label>
          Weight
          <input type="number" value={sel.strokeWidth} onChange={(e) => patch({ strokeWidth: Number(e.target.value) })} />
        </label>
      </div>
      <div className="field">
        <label>
          Corner radius
          <input type="number" value={sel.radius} onChange={(e) => patch({ radius: Number(e.target.value) })} />
        </label>
      </div>
      {sel.type === "text" && (
        <div className="row field">
          <label>
            Size
            <input type="number" value={sel.fontSize ?? 16} onChange={(e) => patch({ fontSize: Number(e.target.value) })} />
          </label>
          <label>
            Weight
            <input type="number" min={100} max={900} step={100} value={sel.fontWeight ?? 400} onChange={(e) => patch({ fontWeight: Number(e.target.value) })} />
          </label>
          <label>
            Tracking
            <input type="number" value={sel.letterSpacing ?? 0} onChange={(e) => patch({ letterSpacing: Number(e.target.value) })} />
          </label>
          <label>
            Line height
            <input type="number" value={sel.lineHeight ?? Math.round((sel.fontSize ?? 16) * 1.2)} onChange={(e) => patch({ lineHeight: Number(e.target.value) })} />
          </label>
        </div>
      )}
      <div className="field">
        <label>
          Blend
          <select value={sel.blendMode ?? "normal"} onChange={(e) => patch({ blendMode: e.target.value as DesignNode["blendMode"] })}>
            {BLENDS.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="seg">
        <button
          type="button"
          className="textbtn"
          onClick={() => {
            const laid = makeAutoLayout(state.doc.pages, ids);
            if (laid) dispatch({ type: "replaceDoc", pages: laid.pages, selectedIds: [laid.id] });
          }}
        >
          Auto layout
        </button>
        <button
          type="button"
          className="textbtn"
          onClick={() => {
            const masked = makeMask(state.doc.pages, ids);
            if (masked) dispatch({ type: "replaceDoc", pages: masked.pages, selectedIds: [masked.id] });
          }}
        >
          Use as mask
        </button>
        <button
          type="button"
          className="textbtn"
          onClick={() => {
            const made = makeComponentSet(state.doc.pages, ids);
            if (made) dispatch({ type: "replaceDoc", pages: made.pages, selectedIds: made.ids });
          }}
        >
          Component set
        </button>
      </div>
      {sel.autoLayout && (
        <div className="row field">
          <label>
            Gap
            <input type="number" value={sel.gap ?? 16} onChange={(e) => layout({ gap: Number(e.target.value) })} />
          </label>
          <label>
            Padding X
            <input type="number" value={sel.padX ?? 16} onChange={(e) => layout({ padX: Number(e.target.value) })} />
          </label>
          <label>
            Padding Y
            <input type="number" value={sel.padY ?? 16} onChange={(e) => layout({ padY: Number(e.target.value) })} />
          </label>
        </div>
      )}
      <div className="field">
        <button
          type="button"
          className="textbtn"
          onClick={() => {
            if (sel.layoutGrid) {
              patch({ layoutGrid: null });
              return;
            }
            dispatch({ type: "ui", patch: { showGuides: true } });
            patch({
              layoutGrid: { kind: "columns", size: 8, count: 12, gutter: 20, margin: 64, color: "#e24b4b", opacity: 0.22 },
            });
          }}
        >
          {sel.layoutGrid ? "Remove layout grid" : "Layout grid"}
        </button>
        {sel.layoutGrid && (
          <>
            <div className="seg">
              <button type="button" className="textbtn" aria-pressed={sel.layoutGrid.kind === "columns"} onClick={() => patch({ layoutGrid: { ...sel.layoutGrid!, kind: "columns" } })}>
                Columns
              </button>
              <button type="button" className="textbtn" aria-pressed={sel.layoutGrid.kind === "grid"} onClick={() => patch({ layoutGrid: { ...sel.layoutGrid!, kind: "grid" } })}>
                Square
              </button>
              <button type="button" className="textbtn" aria-pressed={state.showGuides} onClick={() => dispatch({ type: "ui", patch: { showGuides: !state.showGuides } })}>
                {state.showGuides ? "Hide grids" : "Show grids"}
              </button>
            </div>
            <GridFields grid={sel.layoutGrid} onChange={(layoutGrid) => patch({ layoutGrid })} />
          </>
        )}
      </div>
      {showImage &&
        (["exposure", "contrast", "saturation", "temperature", "highlights", "shadows"] as const).map((key) => (
          <div className="field" key={key}>
            <label>
              {key}
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={sel.filters?.[key] ?? 0}
                onChange={(e) => dispatch({ type: "filters", id: sel.id, filters: { [key]: Number(e.target.value) } })}
              />
            </label>
          </div>
        ))}
      {pageComments(state.doc).length > 0 && (
        <div className="field">
          <span className="group-label">Comments</span>
          {pageComments(state.doc).map((pin) => (
            <input
              key={pin.id}
              aria-label={`Comment by ${pin.author}`}
              value={pin.body}
              placeholder="Add a comment"
              onChange={(e) => dispatch({ type: "patchComment", id: pin.id, body: e.target.value, history: false })}
            />
          ))}
        </div>
      )}
    </>
  );
}

function GridFields({ grid, onChange }: { grid: LayoutGrid; onChange: (grid: LayoutGrid) => void }) {
  const set = (patch: Partial<LayoutGrid>) => onChange({ ...grid, ...patch });
  return (
    <div className="row">
      {grid.kind === "grid" ? (
        <label>
          Size
          <input type="number" value={grid.size} onChange={(e) => set({ size: Number(e.target.value) })} />
        </label>
      ) : (
        <>
          <label>
            Count
            <input type="number" min={1} value={grid.count} onChange={(e) => set({ count: Number(e.target.value) })} />
          </label>
          <label>
            Margin
            <input type="number" value={grid.margin} onChange={(e) => set({ margin: Number(e.target.value) })} />
          </label>
          <label>
            Gutter
            <input type="number" value={grid.gutter} onChange={(e) => set({ gutter: Number(e.target.value) })} />
          </label>
        </>
      )}
      <label>
        Color
        <input type="color" aria-label="Grid color" value={hex6(grid.color, "#e24b4b")} onChange={(e) => set({ color: e.target.value })} />
      </label>
      <label>
        Opacity
        <input type="number" min={0} max={1} step={0.05} value={grid.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />
      </label>
    </div>
  );
}

function updatePages(pages: DesignNode[], id: string, patch: Partial<DesignNode>): DesignNode[] {
  return pages.map((node) => {
    if (node.id === id) return { ...node, ...patch };
    if (!node.children.length) return node;
    return { ...node, children: updatePages(node.children, id, patch) };
  });
}

export function PrototypePanel() {
  const { state, dispatch } = useStudio();
  const sel = selectedNode(state);
  const frames = flatten(state.doc.pages).filter((node) => node.type === "frame" || node.type === "page");
  const present = () =>
    dispatch({
      type: "ui",
      patch: { presenting: true, uiHidden: true, presentFrameId: rootFrameId(state.doc.pages, state.doc.selectedId) },
    });
  const write = (partial: Partial<PrototypeInteraction>) => {
    if (!sel) return;
    const current: PrototypeInteraction = sel.interaction ?? {
      trigger: "click",
      action: "navigate",
      targetId: frames.find((frame) => frame.id !== sel.id)?.id ?? "",
      duration: 300,
    };
    dispatch({ type: "patch", id: sel.id, patch: { interaction: { ...current, ...partial } } });
  };

  const link = sel?.interaction;
  const destination = frames.find((frame) => frame.id === link?.targetId);
  return (
    <div className="proto">
      <section>
        <header>
          <span>{sel?.name ?? "Selection"}</span>
        </header>
        <p className="proto-meta">{sel ? `${sel.type} · ${sel.w | 0} × ${sel.h | 0}` : "Select a frame, then drag a connector."}</p>
        <p className="proto-count">{link?.targetId ? "1 interaction" : "No interaction"}</p>
      </section>
      <section>
        <header><span>Interaction</span></header>
        <label>
          Trigger
          <select value={link?.trigger ?? "click"} onChange={(e) => write({ trigger: e.target.value as PrototypeInteraction["trigger"] })}>
            <option value="click">On click</option>
            <option value="hover">While hovering</option>
            <option value="drag">On drag</option>
            <option value="after-delay">After delay</option>
          </select>
        </label>
        <label>
          Action
          <select value={link?.action ?? "navigate"} onChange={(e) => write({ action: e.target.value as PrototypeInteraction["action"] })}>
            <option value="navigate">Navigate to</option>
            <option value="swap">Change to</option>
            <option value="overlay">Open overlay</option>
            <option value="back">Back</option>
          </select>
        </label>
        <label>
          Destination
          <select className={link?.targetId ? "linked" : ""} value={link?.targetId ?? ""} onChange={(e) => write({ targetId: e.target.value })}>
            <option value="">Choose a frame</option>
            {frames.map((frame) => (
              <option key={frame.id} value={frame.id}>
                {frame.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={!!link?.preserveScroll} onChange={(e) => write({ preserveScroll: e.target.checked })} />
          Preserve scroll position
        </label>
      </section>
      <section>
        <header><span>Transition</span></header>
        <label>
          Animation
          <select value={link?.animation ?? "smart"} onChange={(e) => write({ animation: e.target.value as PrototypeInteraction["animation"] })}>
            <option value="smart">Smart animate</option>
            <option value="dissolve">Dissolve</option>
            <option value="move">Move in</option>
            <option value="instant">Instant</option>
          </select>
        </label>
        <div className="row">
          <label>
            Duration
            <input type="number" min={0} step={50} value={link?.duration ?? 300} onChange={(e) => write({ duration: Number(e.target.value) })} />
          </label>
          <label>
            Delay
            <input type="number" min={0} step={50} value={link?.delay ?? 0} onChange={(e) => write({ delay: Number(e.target.value) })} />
          </label>
        </div>
        <svg className="ease" viewBox="0 0 228 40" aria-hidden="true">
          <path d={link?.easing === "linear" ? "M4 36 L224 4" : link?.easing === "ease-in" ? "M4 36 C120 36 180 20 224 4" : "M4 36 C40 36 80 4 224 4"} />
        </svg>
        <label>
          Easing
          <select value={link?.easing ?? "ease-out"} onChange={(e) => write({ easing: e.target.value as PrototypeInteraction["easing"] })}>
            <option value="ease-out">Ease out</option>
            <option value="ease-in">Ease in</option>
            <option value="ease-in-out">Ease in out</option>
            <option value="linear">Linear</option>
          </select>
        </label>
      </section>
      <section>
        <header><span>Preview settings</span></header>
        <label>
          Device
          <select defaultValue="mobile">
            <option value="mobile">Mobile · 390 × 752</option>
            <option value="desktop">Desktop · 1440 × 900</option>
          </select>
        </label>
      </section>
      <div className="proto-actions">
        <button type="button" className="textbtn" onClick={() => sel && dispatch({ type: "patch", id: sel.id, patch: { interaction: null } })}>
          Clear
        </button>
        <button type="button" className="textbtn" onClick={present}>
          Preview flow
        </button>
        <p>{destination ? `Starts toward ${destination.name}` : `Start from ${frames[0]?.name ?? "the first screen"} · ${frames.length} screens`}</p>
      </div>
    </div>
  );
}

export function PresentMode() {
  const { state, dispatch } = useStudio();
  const [frameId, setFrameId] = useState(state.presentFrameId ?? state.doc.pages[0]?.id ?? "");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(1);
  const [fade, setFade] = useState(300);
  useEffect(() => {
    if (!state.presenting) return;
    setFrameId(state.presentFrameId ?? state.doc.pages[0]?.id ?? "");
    setOpacity(1);
    setHoverId(null);
  }, [state.presenting, state.presentFrameId, state.doc.pages]);
  if (!state.presenting) return null;
  const frame = findNode(state.doc.pages, frameId) ?? state.doc.pages[0];
  if (!frame) return null;
  const scale = Math.min((window.innerWidth - 96) / Math.max(1, frame.w), (window.innerHeight - 96) / Math.max(1, frame.h), 1);
  const go = (id: string, duration: number) => {
    setFade(duration || 300);
    setOpacity(0);
    window.setTimeout(() => {
      setFrameId(id);
      setHoverId(null);
      setOpacity(1);
    }, duration || 300);
  };

  return (
    <div className="present-stage" role="dialog" aria-modal="true" aria-label={`Presenting ${frame.name}`}>
      <button type="button" className="textbtn present-exit" onClick={() => dispatch({ type: "ui", patch: { presenting: false, uiHidden: false } })}>
        Exit
      </button>
      <div
        className="present-frame"
        style={{
          width: frame.w,
          height: frame.h,
          background: frame.fillKind === "gradient" ? `linear-gradient(${frame.gradientFrom || "#fff"}, ${frame.gradientTo || frame.fill})` : frame.fill,
          transform: `scale(${scale})`,
          opacity,
          transition: `opacity ${fade}ms ease`,
        }}
      >
        {frame.children.map((child) => (
          <PresentNode key={child.id} node={child} pages={state.doc.pages} hoverId={hoverId} setHover={setHoverId} go={go} />
        ))}
      </div>
    </div>
  );
}

function PresentNode({
  node,
  pages,
  hoverId,
  setHover,
  go,
}: {
  node: DesignNode;
  pages: DesignNode[];
  hoverId: string | null;
  setHover: (id: string | null) => void;
  go: (id: string, duration: number) => void;
}) {
  if (!node.visible || node.mask) return null;
  const swapped = hoverId === node.id && node.interaction?.trigger === "hover" && node.interaction.action === "swap" ? findNode(pages, node.interaction.targetId) : null;
  const shown = swapped ?? node;
  const click = node.interaction?.trigger === "click" && node.interaction.action === "navigate" ? node.interaction : null;
  const style: CSSProperties = {
    position: "absolute",
    left: node.x,
    top: node.y,
    width: shown.w,
    height: shown.h,
    opacity: shown.opacity,
    borderRadius: shown.radius,
    overflow: "hidden",
    color: shown.type === "text" ? shown.fill : "inherit",
    background:
      shown.type === "text" || shown.imageDataUrl || shown.fill === "#00000000"
        ? "transparent"
        : shown.fillKind === "gradient"
          ? `linear-gradient(${shown.gradientFrom || "#fff"}, ${shown.gradientTo || shown.fill})`
          : shown.fill,
    fontSize: shown.fontSize,
    fontWeight: shown.fontWeight,
    letterSpacing: shown.letterSpacing,
    lineHeight: shown.lineHeight ? `${shown.lineHeight}px` : undefined,
    fontStyle: shown.italic ? "italic" : undefined,
    textDecoration: shown.underline ? "underline" : undefined,
    mixBlendMode: shown.blendMode && shown.blendMode !== "normal" ? shown.blendMode : undefined,
    border: shown.strokeWidth ? `${shown.strokeWidth}px solid ${shown.stroke}` : undefined,
    cursor: click ? "pointer" : undefined,
    whiteSpace: "pre-wrap",
    filter: filterCss(shown),
  };
  return (
    <div
      style={style}
      role={click ? "button" : undefined}
      tabIndex={click ? 0 : undefined}
      onMouseEnter={() => {
        if (node.interaction?.trigger === "hover") setHover(node.id);
      }}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => {
        if (!click?.targetId) return;
        e.stopPropagation();
        go(click.targetId, click.duration || 300);
      }}
    >
      {shown.imageDataUrl && <img src={shown.imageDataUrl} alt="" draggable={false} />}
      {shown.type === "text" ? shown.text : null}
      {shown.children.map((child) => (
        <PresentNode key={child.id} node={child} pages={pages} hoverId={swapped ? null : hoverId} setHover={setHover} go={go} />
      ))}
    </div>
  );
}

function filterCss(node: DesignNode): string | undefined {
  const filters = node.filters;
  if (!filters) return undefined;
  return `brightness(${1 + filters.exposure + filters.highlights * 0.2}) contrast(${1 + filters.contrast}) saturate(${1 + filters.saturation}) hue-rotate(${filters.temperature * 18}deg)`;
}

const ACCESS: { id: ShareAccess; label: string; detail: string }[] = [
  { id: "view", label: "Can view", detail: "Open the file and look around." },
  { id: "comment", label: "Can comment", detail: "Leave comments on the canvas." },
  { id: "edit", label: "Can edit", detail: "Change frames, layers, and prototypes." },
];

export function ShareDialog() {
  const { state, dispatch } = useStudio();
  const [copied, setCopied] = useState(false);
  if (!state.shareOpen) return null;
  return (
    <div className="modal-back" onClick={() => dispatch({ type: "ui", patch: { shareOpen: false } })}>
      <div className="modal share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2 id="share-title">Share</h2>
            <p>Anyone with the link gets the access you choose.</p>
          </div>
          <button type="button" className="textbtn ghost" onClick={() => dispatch({ type: "ui", patch: { shareOpen: false } })}>
            Close
          </button>
        </header>
        <fieldset>
          <legend>Access</legend>
          {ACCESS.map((item) => (
            <label key={item.id}>
              <input
                type="radio"
                name="share-access"
                checked={state.shareAccess === item.id}
                onChange={() => dispatch({ type: "ui", patch: { shareAccess: item.id } })}
              />
              <span>
                <b>{item.label}</b>
                {item.detail}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="seg">
          <button
            type="button"
            className="textbtn primary"
            onClick={() => {
              void navigator.clipboard.writeText(window.location.href).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              });
            }}
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
        <ul className="share-people">
          <li>You · {state.shareAccess}</li>
          {state.collaborators.map((person) => (
            <li key={person.id}>
              {person.name.trim() || "Online"} · {person.mode}
            </li>
          ))}
          {state.collaborators.length === 0 ? <li>Nobody else is on this file.</li> : null}
        </ul>
      </div>
    </div>
  );
}
