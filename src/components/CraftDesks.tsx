import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { BUILTIN_DEVELOPS, clipRange, movePage, sequenceEnd, splitClip, withKeyframe, ZERO_FILTERS } from "../lib/craft";
import { flatten, uid } from "../lib/id";
import { selectedNode, useStudio } from "../store";
import type { DesignNode, TextStyle } from "../types";

const TEXT_STYLES: TextStyle[] = [
  { id: "ts-display", name: "Display", fontSize: 64, fontWeight: 750, fill: "#161310", letterSpacing: -1 },
  { id: "ts-deck", name: "Deck", fontSize: 28, fontWeight: 650, fill: "#161310" },
  { id: "ts-body", name: "Body", fontSize: 18, fontWeight: 500, fill: "#3a3228", lineHeight: 28 },
  { id: "ts-caption", name: "Caption", fontSize: 12, fontWeight: 600, fill: "#8f2d14", letterSpacing: 1.2 },
];

export function PanelSwitch() {
  const { state, dispatch } = useStudio();
  const tabs = [
    ["layers", "Layers"],
    ["assets", "Assets"],
    ["libraries", "Library"],
  ] as const;
  return (
    <div className="seg" role="tablist" aria-label="Left panel">
      {tabs.map(([id, label]) => (
        <button key={id} type="button" role="tab" className="textbtn" aria-selected={state.leftPanel === id} onClick={() => dispatch({ type: "ui", patch: { leftPanel: id } })}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function LibraryPanel() {
  const { state, dispatch } = useStudio();
  const sel = selectedNode(state);
  const components = flatten(state.doc.pages).filter((node) => node.component);
  const presets = [...BUILTIN_DEVELOPS, ...(state.doc.developPresets ?? [])];
  const applyType = (style: TextStyle) => {
    if (!sel) return;
    dispatch({
      type: "patch",
      id: sel.id,
      patch: { fontSize: style.fontSize, fontWeight: style.fontWeight, fill: style.fill, letterSpacing: style.letterSpacing, lineHeight: style.lineHeight },
    });
  };
  return (
    <div className="library">
      <p>Colors, type, components, and develop recipes belong to the document. Every mode reads them.</p>
      <h4>Color</h4>
      <div className="styles">
        {(state.doc.colorStyles ?? []).map((style) => (
          <button key={style.id} type="button" className="textbtn" onClick={() => sel && dispatch({ type: "patch", id: sel.id, patch: { fill: style.value } })}>
            <i style={{ background: style.value }} />
            {style.name}
          </button>
        ))}
      </div>
      <h4>Type</h4>
      <div className="styles">
        {TEXT_STYLES.map((style) => (
          <button key={style.id} type="button" className="textbtn" onClick={() => applyType(style)}>
            {style.name}
          </button>
        ))}
      </div>
      <h4>Components</h4>
      {components.length === 0 ? <p>Mark a set in Vector, then drag it here onto any mode’s canvas.</p> : null}
      {components.map((node) => (
        <button
          key={node.id}
          type="button"
          className="layer"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/df-node", node.id);
            e.dataTransfer.effectAllowed = "copy";
          }}
        >
          {node.name}
        </button>
      ))}
      <h4>Develop</h4>
      <div className="styles">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="textbtn"
            onClick={() => sel && dispatch({ type: "filters", id: sel.id, filters: preset.filters })}
          >
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PhotoStrip() {
  const { state, dispatch } = useStudio();
  const plates = flatten(state.doc.pages).filter((node) => node.imageDataUrl || node.filters || node.type === "image");
  if (!plates.length) return null;
  return (
    <div className="filmstrip" role="list" aria-label="Photo library">
      {plates.map((plate) => (
        <button
          key={plate.id}
          type="button"
          role="listitem"
          className={`plate ${state.doc.selectedIds.includes(plate.id) ? "active" : ""}`}
          aria-pressed={state.doc.selectedIds.includes(plate.id)}
          onClick={(e) => dispatch({ type: "select", id: plate.id, shift: e.shiftKey })}
        >
          <span style={{ background: plate.fill }} />
          <b>{plate.name}</b>
          <small>{plate.flag === "pick" ? "Pick" : plate.flag === "reject" ? "Reject" : `${plate.rating ?? 0}★`}</small>
        </button>
      ))}
    </div>
  );
}

export function PhotoDevelop() {
  const { state, dispatch } = useStudio();
  const sel = selectedNode(state);
  if (!sel) return <p className="craft-note">Select a plate to develop, crop, or paint it.</p>;
  const copy = () => {
    const filters = { ...ZERO_FILTERS, ...sel.filters };
    for (const id of state.doc.selectedIds) {
      if (id !== sel.id) dispatch({ type: "filters", id, filters });
    }
  };
  return (
    <div className="craft-block">
      <p className="craft-note">Crop and Brush are on the toolbar. Ratings and recipes stay with the plate.</p>
      <div className="seg" role="group" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} type="button" className="textbtn" aria-pressed={(sel.rating ?? 0) >= star} onClick={() => dispatch({ type: "patch", id: sel.id, patch: { rating: star } })}>
            {star}★
          </button>
        ))}
      </div>
      <div className="seg">
        <button type="button" className="textbtn" aria-pressed={sel.flag === "pick"} onClick={() => dispatch({ type: "patch", id: sel.id, patch: { flag: sel.flag === "pick" ? null : "pick" } })}>
          Pick
        </button>
        <button type="button" className="textbtn" aria-pressed={sel.flag === "reject"} onClick={() => dispatch({ type: "patch", id: sel.id, patch: { flag: sel.flag === "reject" ? null : "reject" } })}>
          Reject
        </button>
        <button type="button" className="textbtn" aria-pressed={state.compareDevelop} onClick={() => dispatch({ type: "ui", patch: { compareDevelop: !state.compareDevelop } })}>
          {state.compareDevelop ? "After" : "Before"}
        </button>
      </div>
      <div className="seg">
        <button type="button" className="textbtn" disabled={state.doc.selectedIds.length < 2} onClick={copy}>
          Copy develop
        </button>
        <button
          type="button"
          className="textbtn"
          onClick={() =>
            dispatch({
              type: "developPreset",
              preset: { id: uid("develop"), name: `${sel.name} recipe`, filters: { ...ZERO_FILTERS, ...sel.filters } },
            })
          }
        >
          Save recipe
        </button>
        <button type="button" className="textbtn" onClick={() => dispatch({ type: "filters", id: sel.id, filters: ZERO_FILTERS })}>
          Reset
        </button>
      </div>
    </div>
  );
}

export function TimeDesk({ kind }: { kind: "motion" | "film" }) {
  const { state, dispatch } = useStudio();
  const sel = selectedNode(state);
  const end = sequenceEnd(state.doc.pages);
  const rows = motionRows(state.doc.pages, state.doc.selectedId);
  const split = () => {
    const underPlayhead = state.doc.pages.find((page, index) => {
      const range = clipRange(page, index);
      return state.playhead >= range.start && state.playhead < range.start + range.duration;
    });
    const host = underPlayhead ?? state.doc.pages.find((page) => page.id === sel?.id) ?? state.doc.pages[0];
    if (!host) return;
    const pages = splitClip(state.doc.pages, host.id, state.playhead);
    if (pages) dispatch({ type: "replaceDoc", pages, selectedIds: [pages.find((page) => page.name.endsWith(" cut"))?.id ?? host.id] });
  };
  return (
    <div className={`timeline ${kind}`} aria-label={kind === "motion" ? "Motion timeline" : "Film sequence"}>
      <div className="seg">
        <button type="button" className="textbtn" onClick={() => dispatch({ type: "playing", playing: !state.playing })}>
          {state.playing ? "Pause" : "Play"}
        </button>
        <label>
          Playhead
          <input
            type="range"
            min={0}
            max={end}
            step={0.1}
            value={Math.min(end, state.playhead)}
            aria-valuetext={`${state.playhead.toFixed(1)} seconds`}
            onChange={(e) => dispatch({ type: "playhead", t: Number(e.target.value) })}
          />
        </label>
        <span className="ticks">{state.playhead.toFixed(2)}s</span>
        {kind === "motion" && sel ? (
          <>
            <button type="button" className="textbtn" onClick={() => dispatch({ type: "patch", id: sel.id, patch: { keyframes: withKeyframe(sel, state.playhead) } })}>
              Keyframe
            </button>
            <label>
              Effect
              <select
                aria-label="Layer effect"
                value={sel.effect ?? "none"}
                onChange={(e) => dispatch({ type: "patch", id: sel.id, patch: { effect: e.target.value as DesignNode["effect"] } })}
              >
                <option value="none">None</option>
                <option value="blur">Blur</option>
                <option value="tint">Tint</option>
              </select>
            </label>
          </>
        ) : null}
        {kind === "film" ? (
          <>
            <button type="button" className="textbtn" onClick={split}>
              Split at playhead
            </button>
            <button
              type="button"
              className="textbtn"
              onClick={() =>
                dispatch({
                  type: "replaceDoc",
                  pages: state.doc.pages.map((page, index) => ({ ...page, start: index * 3, duration: page.duration ?? 3 })),
                  selectedIds: state.doc.selectedIds,
                })
              }
            >
              Lay out sequence
            </button>
          </>
        ) : null}
      </div>
      {kind === "motion" ? (
        <div className="tracks">
          {rows.map((row) => (
            <button key={row.id} type="button" className={`track ${state.doc.selectedId === row.id ? "active" : ""}`} onClick={() => dispatch({ type: "select", id: row.id })}>
              <span>{row.name}</span>
              <span className="lane" style={{ ["--end" as string]: `${end}s` }}>
                {(row.keyframes ?? []).map((frame) => (
                  <i key={frame.t} style={{ left: `${(frame.t / end) * 100}%` }} title={`${frame.t.toFixed(1)}s`} />
                ))}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="film-lane">
          {state.doc.pages.map((clip, index) => {
            const range = clipRange(clip, index);
            return (
              <button
                key={clip.id}
                type="button"
                className={`clip ${state.doc.selectedId === clip.id ? "active" : ""}`}
                style={{ left: range.start * 48, width: Math.max(56, range.duration * 48) }}
                onClick={() => dispatch({ type: "select", id: clip.id })}
                onPointerDown={(e) => dragClip(e, clip, index, dispatch)}
              >
                {clip.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function motionRows(pages: DesignNode[], selectedId: string | null): DesignNode[] {
  const selected = selectedId ? pages.find((page) => page.id === selectedId) ?? flatten(pages).find((node) => node.id === selectedId) : null;
  if (selected?.children.length) return selected.children;
  const parent = pages.find((page) => page.children.some((child) => child.id === selectedId));
  if (parent) return parent.children;
  return pages;
}

function dragClip(event: ReactPointerEvent<HTMLButtonElement>, clip: DesignNode, index: number, dispatch: ReturnType<typeof useStudio>["dispatch"]) {
  if (event.button !== 0) return;
  const range = clipRange(clip, index);
  const origin = event.clientX;
  const edge = event.currentTarget.getBoundingClientRect().right - event.clientX < 14;
  dispatch({ type: "checkpoint" });
  const move = (ev: PointerEvent) => {
    const delta = (ev.clientX - origin) / 48;
    dispatch({
      type: "patch",
      id: clip.id,
      history: false,
      patch: edge
        ? { start: range.start, duration: Math.max(0.4, Math.round((range.duration + delta) * 10) / 10) }
        : { start: Math.max(0, Math.round((range.start + delta) * 10) / 10), duration: range.duration },
    });
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

export function LayoutBar() {
  const { state, dispatch } = useStudio();
  const sel = selectedNode(state);
  const master = state.doc.pages.find((page) => page.master);
  return (
    <div className="layout-bar">
      <div className="seg">
        <button type="button" className="textbtn" disabled={!sel} aria-pressed={!!sel?.master} onClick={() => sel && dispatch({ type: "patch", id: sel.id, patch: { master: !sel.master } })}>
          {sel?.master ? "Master page" : "Set as master"}
        </button>
        <button
          type="button"
          className="textbtn"
          disabled={!sel || !master || master.id === sel?.id}
          aria-pressed={!!sel?.usesMaster}
          onClick={() => sel && dispatch({ type: "patch", id: sel.id, patch: { usesMaster: !sel.usesMaster } })}
        >
          {sel?.usesMaster ? "Using master" : "Apply master"}
        </button>
      </div>
      <div className="spreads" aria-label="Spreads">
        {pairs(state.doc.pages).map((pair) => (
          <button key={pair.map((page) => page.id).join("-")} type="button" className="textbtn" onClick={() => dispatch({ type: "select", id: pair[0].id })}>
            {pair.map((page) => page.name).join("  ·  ")}
          </button>
        ))}
      </div>
      <p className="craft-note">{master ? `Master: ${master.name}. Applying it paints those items onto the selected page.` : "Set one frame as the master, then apply it to facing pages."}</p>
    </div>
  );
}

function pairs(pages: DesignNode[]): DesignNode[][] {
  const out: DesignNode[][] = [];
  for (let i = 0; i < pages.length; i += 2) out.push(pages.slice(i, i + 2));
  return out;
}

export function PageTools() {
  const { state, dispatch } = useStudio();
  const pages = state.doc.pages;
  const selected = selectedNode(state);
  const addPage = () => {
    const x = pages.reduce((max, page) => Math.max(max, page.x + page.w), 40) + 80;
    const node: DesignNode = {
      id: uid("page"),
      type: "frame",
      name: `Page ${pages.length + 1}`,
      x,
      y: 80,
      w: 816,
      h: 1056,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      fill: "#f7f3ec",
      stroke: "#d9cfc3",
      strokeWidth: 1,
      radius: 0,
      children: [],
    };
    dispatch({ type: "add", parentId: null, node });
  };
  return (
    <div className="page-tools">
      <button type="button" className="textbtn" onClick={addPage}>
        Add page
      </button>
      <button type="button" className="textbtn" disabled={!selected} onClick={() => selected && dispatch({ type: "replaceDoc", pages: movePage(pages, selected.id, -1), selectedIds: [selected.id] })}>
        Earlier
      </button>
      <button type="button" className="textbtn" disabled={!selected} onClick={() => selected && dispatch({ type: "replaceDoc", pages: movePage(pages, selected.id, 1), selectedIds: [selected.id] })}>
        Later
      </button>
      <button type="button" className="textbtn" disabled={!selected} onClick={() => selected && dispatch({ type: "patch", id: selected.id, patch: { rotation: (selected.rotation + 90) % 360 } })}>
        Rotate
      </button>
      <button type="button" className="textbtn" disabled={!selected || pages.length < 2} onClick={() => selected && dispatch({ type: "splitPage", id: selected.id })}>
        Split file
      </button>
    </div>
  );
}

export function PdfDesk() {
  const { state, dispatch } = useStudio();
  const [query, setQuery] = useState("");
  const pages = state.doc.pages;
  const selected = selectedNode(state);
  const addPage = () => {
    const x = pages.reduce((max, page) => Math.max(max, page.x + page.w), 40) + 80;
    const node: DesignNode = {
      id: uid("page"),
      type: "frame",
      name: `Page ${pages.length + 1}`,
      x,
      y: 80,
      w: 816,
      h: 1056,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      fill: "#f7f3ec",
      stroke: "#d9cfc3",
      strokeWidth: 1,
      radius: 0,
      children: [],
    };
    dispatch({ type: "add", parentId: null, node });
  };
  return (
    <div className="pdf-desk">
      <div className="pdf-tools">
        <label>
          Find
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search page text" />
        </label>
        <button type="button" className="textbtn" onClick={addPage}>
          Add page
        </button>
        <button type="button" className="textbtn" disabled={!selected} onClick={() => selected && dispatch({ type: "replaceDoc", pages: movePage(pages, selected.id, -1), selectedIds: [selected.id] })}>
          Move earlier
        </button>
        <button type="button" className="textbtn" disabled={!selected} onClick={() => selected && dispatch({ type: "replaceDoc", pages: movePage(pages, selected.id, 1), selectedIds: [selected.id] })}>
          Move later
        </button>
        <button type="button" className="textbtn" disabled={!selected} onClick={() => selected && dispatch({ type: "patch", id: selected.id, patch: { rotation: ((selected.rotation + 90) % 360) } })}>
          Rotate
        </button>
        <button type="button" className="textbtn" disabled={!selected || pages.length < 2} onClick={() => selected && dispatch({ type: "splitPage", id: selected.id })}>
          Split to its own file
        </button>
        <button
          type="button"
          className="textbtn"
          disabled={!selected}
          onClick={() =>
            selected &&
            dispatch({
              type: "comment",
              pin: { id: uid("c"), x: selected.x + 36, y: selected.y + 36, author: "You", body: "Note", resolved: false, createdAt: Date.now(), attachments: [] },
            })
          }
        >
          Annotate
        </button>
      </div>
      <div className="pdf-pages">
        {pages.map((page, index) => {
          const text = flatten([page])
            .map((node) => node.text ?? "")
            .join(" ");
          const miss = query && !text.toLowerCase().includes(query.toLowerCase());
          return (
            <article
              key={page.id}
              className={`pdf-page ${state.doc.selectedId === page.id ? "active" : ""}`}
              style={{ opacity: miss ? 0.35 : 1 }}
              role="button"
              tabIndex={0}
              aria-pressed={state.doc.selectedId === page.id}
              onClick={() => dispatch({ type: "select", id: page.id })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  dispatch({ type: "select", id: page.id });
                }
              }}
            >
              <header>
                <h2>{page.name}</h2>
                <span>{index + 1}</span>
              </header>
              <div className="paper-scale" style={{ width: page.w * 0.32, height: page.h * 0.32, transform: `rotate(${page.rotation}deg)` }}>
                <div className="paper" style={{ width: page.w, height: page.h, background: page.fill, transform: "scale(0.32)", transformOrigin: "top left" }}>
                  {page.children.map((child) => (
                    <PaperNode key={child.id} node={child} />
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PaperNode({ node }: { node: DesignNode }) {
  if (!node.visible) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        background: node.type === "text" ? "transparent" : node.fill,
        color: node.type === "text" ? node.fill : "#1d1c1d",
        borderRadius: node.radius,
        fontSize: node.fontSize,
        fontWeight: node.fontWeight,
        overflow: "hidden",
      }}
    >
      {node.type === "text" ? node.text : node.text && node.type === "rect" ? <span className="paper-label">{node.text}</span> : null}
      {node.children.map((child) => (
        <PaperNode key={child.id} node={child} />
      ))}
    </div>
  );
}
