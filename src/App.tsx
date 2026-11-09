import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AiStudio } from "./components/AiStudio";
import { CanvasStage } from "./components/CanvasStage";
import { CommandPalette } from "./components/CommandPalette";
import { ExportDialog } from "./components/ExportDialog";
import { ShortcutsPanel } from "./components/ShortcutsPanel";
import { SourcesDrawer } from "./components/SourcesDrawer";
import { ThemePicker } from "./components/ThemePicker";
import { LibraryPanel, PanelSwitch, PhotoDevelop, TimeDesk } from "./components/CraftDesks";
import { CommentDock } from "./components/CommentDock";
import { LayerPanel } from "./components/LayerPanel";
import { NodeMenu } from "./components/NodeMenu";
import { Icon } from "./components/Icons";
import { DesignInspector } from "./components/DesignInspector";
import { ProjectsHome } from "./components/ProjectsHome";
import { FramePresets, InspectExtras, PresentMode, PrototypePanel, ShareDialog } from "./components/Walkthrough";
import { getStoredKey } from "./lib/claude";
import { runCommand, shortcutId } from "./lib/commands";
import { EXPORT_FORMATS, exportDocument } from "./lib/export";
import { findNode, flatten, uid } from "./lib/id";
import { useFilePresence } from "./lib/presence";
import { isMac, primaryMod } from "./lib/platform";
import { applyTheme, loadAppearance, loadThemeId, type Appearance } from "./lib/themes";
import { IMPORT_ACCEPT, importDesignFile } from "./lib/import-design";
import { rememberDocument, saveImported } from "./lib/projects";
import { selectedNode, useStudio } from "./store";
import { MODES, UPSTREAM, type DesignNode, type ModeId, type ToolId } from "./types";

function componentFamilies(nodes: DesignNode[]) {
  const components = nodes.filter((node) => node.component && !node.instanceOf);
  const seen = new Set<string>();
  const families: { id: string; name: string; variants: DesignNode[] }[] = [];
  for (const node of components) {
    const key = node.componentSet || node.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const variants = components.filter((item) => (item.componentSet || item.id) === key);
    families.push({ id: variants[0]?.id ?? node.id, name: node.name, variants });
  }
  return families;
}

const RAIL: Record<string, { id: ToolId; icon: string; label: string }[]> = {
  design: [
    { id: "select", icon: "pointer", label: "Move" },
    { id: "frame", icon: "frame", label: "Frame" },
    { id: "rect", icon: "square", label: "Rectangle" },
    { id: "ellipse", icon: "circle", label: "Ellipse" },
    { id: "polygon", icon: "polygon", label: "Polygon" },
    { id: "star", icon: "star", label: "Star" },
    { id: "pen", icon: "pen", label: "Pen" },
    { id: "text", icon: "type", label: "Text" },
    { id: "comment", icon: "comment", label: "Comment" },
    { id: "component", icon: "component", label: "Component" },
    { id: "slice", icon: "slice", label: "Slice" },
  ],
  photo: [
    { id: "brush", icon: "brush", label: "Brush" },
    { id: "select", icon: "pointer", label: "Move" },
    { id: "zoom", icon: "scan", label: "Scan" },
    { id: "crop", icon: "crop", label: "Crop" },
    { id: "wand", icon: "wand", label: "Heal" },
    { id: "stamp", icon: "stamp", label: "Clone stamp" },
    { id: "eraser", icon: "eraser", label: "Eraser" },
    { id: "bucket", icon: "bucket", label: "Fill" },
    { id: "text", icon: "type", label: "Text" },
  ],
  vector: [
    { id: "pen", icon: "pen", label: "Pen" },
    { id: "select", icon: "pointer", label: "Move" },
    { id: "direct", icon: "direct", label: "Direct select" },
    { id: "rect", icon: "square", label: "Rectangle" },
    { id: "ellipse", icon: "circle", label: "Ellipse" },
    { id: "polygon", icon: "polygon", label: "Polygon" },
    { id: "star", icon: "star", label: "Star" },
    { id: "text", icon: "type", label: "Text" },
    { id: "pencil", icon: "spline", label: "Pencil" },
    { id: "eyedropper", icon: "eyedropper", label: "Eyedropper" },
    { id: "slice", icon: "scissors", label: "Cut" },
  ],
  motion: [
    { id: "select", icon: "pointer", label: "Move" },
    { id: "hand", icon: "hand", label: "Hand" },
    { id: "camera", icon: "camera", label: "Camera" },
    { id: "pen", icon: "pen", label: "Pen" },
    { id: "text", icon: "type", label: "Text" },
    { id: "rect", icon: "square", label: "Rectangle" },
    { id: "ellipse", icon: "circle", label: "Ellipse" },
    { id: "comment", icon: "pin", label: "Marker" },
    { id: "wand", icon: "wand", label: "Ease" },
  ],
  film: [
    { id: "select", icon: "pointer", label: "Move" },
    { id: "razor", icon: "scissors", label: "Razor" },
    { id: "slip", icon: "slip", label: "Slip" },
    { id: "reposition", icon: "move", label: "Reposition" },
    { id: "magnet", icon: "magnet", label: "Snap" },
    { id: "text", icon: "type", label: "Text" },
    { id: "pen", icon: "pen", label: "Pen" },
    { id: "audio", icon: "audio", label: "Audio" },
  ],
  ai: [
    { id: "sparkles", icon: "sparkles", label: "Generate" },
    { id: "select", icon: "pointer", label: "Move" },
    { id: "zoom", icon: "scan", label: "Scan" },
    { id: "wand", icon: "wand", label: "Edit" },
    { id: "eraser", icon: "eraser", label: "Eraser" },
    { id: "expand", icon: "expand", label: "Expand" },
    { id: "image", icon: "image", label: "Place image" },
    { id: "history", icon: "history", label: "History" },
  ],
  prototype: [
    { id: "select", icon: "pointer", label: "Move" },
    { id: "flow", icon: "flow", label: "Connector" },
    { id: "hotspot", icon: "hotspot", label: "Hotspot" },
    { id: "comment", icon: "comment", label: "Comment" },
    { id: "hand", icon: "play", label: "Preview" },
  ],
};

const CONTEXT: Record<string, string> = {
  design: "Frame  ·  Auto layout  ·  Components",
  photo: "Brush  ·  Retouch  ·  Develop",
  vector: "Pen  ·  Shapes  ·  Type",
  motion: "Camera  ·  Keyframe  ·  Ease",
  film: "Trim  ·  Slip  ·  Audio",
  ai: "Generate  ·  Edit  ·  Reference",
  prototype: "Flow  ·  Hotspot  ·  Preview",
};

const FRAME_FORMATS = ["png", "jpg", "webp", "gif", "svg", "pdf", "fig", "pen", "psd", "webm", "mp4", "mov"];

export function App() {
  const { state, dispatch } = useStudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance);
  const [themeId, setThemeId] = useState(loadThemeId);
  const [themesOpen, setThemesOpen] = useState(false);
  const [menu, setMenu] = useState<"file" | "edit" | "view" | "essentials" | null>(null);
  const [frameFormat, setFrameFormat] = useState("png");
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [leftW, setLeftW] = useState(() => Number(localStorage.getItem("df.paneLeft")) || 224);
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem("df.paneRight")) || 280);
  const [home, setHome] = useState(true);
  const presence = useFilePresence(state.doc.id, state.mode, (peers) => dispatch({ type: "peers", peers }));
  const [presenceName, setPresenceName] = useState(presence.self.name);
  const sel = selectedNode(state);
  const commandCtx = {
    state,
    dispatch,
    canvas: canvasRef.current,
    placeImage: () => fileRef.current?.click(),
    focusRename: () => {
      const el = document.getElementById("layer-name") as HTMLInputElement | null;
      el?.focus();
      el?.select();
    },
    focusText: () => {
      const el = document.getElementById("layer-copy") as HTMLTextAreaElement | null;
      el?.focus();
    },
  };

  const remembered = useRef(false);
  if (!remembered.current) {
    rememberDocument(state.doc);
    remembered.current = true;
  }

  useEffect(() => {
    const key = getStoredKey();
    if (key) dispatch({ type: "apiKey", apiKey: key });
  }, [dispatch]);

  const leaveStudio = () => {
    rememberDocument(state.doc);
    setHome(true);
  };

  useEffect(() => {
    applyTheme(appearance, themeId);
    if (appearance !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system", themeId);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [appearance, themeId]);

  useEffect(() => {
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable='true']");
    const onKey = (e: KeyboardEvent) => {
      if (home) return;
      if (e.code === "Space" && !e.repeat && !typing(e.target) && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "ui", patch: { spacePan: true } });
        return;
      }
      if (themesOpen && e.key !== "Escape") return;
      if (state.shareOpen && e.key !== "Escape") return;
      if (typing(e.target) && e.key !== "Escape") return;
      const hasSelection = state.doc.selectedIds.length > 0;
      const id = shortcutId(e, hasSelection);
      if (!id) return;
      if (state.paletteOpen && id !== "escape") return;
      e.preventDefault();
      runCommand(id, { ...commandCtx, canvas: canvasRef.current }, e.repeat);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") dispatch({ type: "ui", patch: { spacePan: false } });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  });

  useEffect(() => {
    if (!state.playing) return;
    const id = window.setInterval(() => dispatch({ type: "playTick" }), 80);
    return () => window.clearInterval(id);
  }, [state.playing, dispatch]);

  const layers = flatten(state.doc.pages);
  const mode = MODES.find((m) => m.id === state.mode) ?? MODES[0];
  const rail = RAIL[state.mode] ?? RAIL.design;
  const activeTool = rail.find((tool) => tool.id === state.tool) ?? rail[0];
  const frame =
    state.doc.pages.find((page) => state.doc.selectedIds.some((id) => id === page.id || findNode([page], id))) ??
    state.doc.pages[0];

  const onImportDesign = async (files: FileList | null) => {
    const file = files?.[0];
    if (importRef.current) importRef.current.value = "";
    if (!file) return;
    try {
      const imported = await importDesignFile(file);
      saveImported(imported, state.doc.id);
      dispatch({ type: "openDocument", doc: imported });
      dispatch({ type: "note", note: `Imported ${imported.name}` });
    } catch (err) {
      dispatch({ type: "note", note: err instanceof Error ? err.message : "Could not import that file" });
    }
  };

  const onPlaceImage = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const node: DesignNode = {
        id: uid(),
        type: "image",
        name: file.name,
        x: 120,
        y: 120,
        w: 320,
        h: 220,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: "#00000000",
        stroke: "transparent",
        strokeWidth: 0,
        radius: 0,
        imageDataUrl: String(reader.result),
        children: [],
      };
      dispatch({ type: "add", parentId: state.doc.pages[0]?.id ?? null, node });
    };
    reader.readAsDataURL(file);
  };

  const exportFrames = async (formatId: string) => {
    try {
      await exportDocument(state.doc, formatId, canvasRef.current, { nodes: frame ? [frame] : state.doc.pages });
      const fmt = EXPORT_FORMATS.find((item) => item.id === formatId);
      setExportNote(`Exported ${frame?.name ?? "frame"} as ${fmt?.label ?? formatId}`);
    } catch (err) {
      setExportNote(String(err));
    }
    window.setTimeout(() => setExportNote(null), 2400);
  };

  const pickTool = (id: ToolId) => {
    if (state.mode === "prototype" && id === "hand") {
      runCommand("present", { ...commandCtx, canvas: canvasRef.current });
      return;
    }
    if (id === "image") fileRef.current?.click();
    if (id === "component") {
      runCommand("component", { ...commandCtx, canvas: canvasRef.current });
      return;
    }
    if (id === "history") {
      dispatch({ type: "undo" });
      return;
    }
    if (id === "magnet") {
      dispatch({ type: "ui", patch: { snapPixels: !state.snapPixels } });
      dispatch({ type: "note", note: state.snapPixels ? "Snapping off" : "Snapping on" });
      return;
    }
    if (id === "sparkles") {
      dispatch({ type: "tool", tool: id });
      window.setTimeout(() => document.getElementById("ai-prompt")?.focus(), 0);
      return;
    }
    if (id === "comment") dispatch({ type: "ui", patch: { showComments: true } });
    dispatch({ type: "tool", tool: id });
  };

  const resizePane = (side: "left" | "right", event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const start = side === "left" ? leftW : rightW;
    let next = start;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      next = Math.min(480, Math.max(180, side === "left" ? start + dx : start - dx));
      if (side === "left") setLeftW(next);
      else setRightW(next);
    };
    const up = () => {
      localStorage.setItem(side === "left" ? "df.paneLeft" : "df.paneRight", String(next));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const fill = sel && /^#[0-9a-fA-F]{6}$/.test(sel.fill) ? sel.fill : "#d6ff45";

  if (home) {
    return (
      <ProjectsHome
        onOpen={(doc) => {
          rememberDocument(doc);
          dispatch({ type: "openDocument", doc });
          setHome(false);
        }}
      />
    );
  }

  return (
    <div className={`app forma ${state.uiHidden ? "ui-hidden" : ""} ${state.uiMinimized ? "ui-min" : ""} ${state.presenting ? "presenting" : ""}`}>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPlaceImage(e.target.files)} />
      <input ref={importRef} type="file" accept={IMPORT_ACCEPT} hidden onChange={(event) => onImportDesign(event.target.files)} />
      <header className="topbar">
        <button type="button" className="brand" onClick={leaveStudio}>
          <span className="mark" aria-hidden="true">f</span>
          <h1>forma</h1>
        </button>
        <div className="menus">
          {(
            [
              ["file", "File"],
              ["edit", "Edit"],
              ["view", "View"],
            ] as const
          ).map(([id, label]) => (
            <div className="menu" key={id}>
              <button type="button" className="menubtn" aria-expanded={menu === id} onClick={() => setMenu(menu === id ? null : id)}>
                {label}
              </button>
              {menu === id && (
                <div className="menu-pop" role="menu">
                  {id === "file" && (
                    <>
                      <button type="button" onClick={() => { setMenu(null); leaveStudio(); }}>All projects</button>
                      <button type="button" onClick={() => { setMenu(null); importRef.current?.click(); }}>Import design…</button>
                      <button type="button" onClick={() => { setMenu(null); dispatch({ type: "toggleExport" }); }}>Export frames…</button>
                      <button type="button" onClick={() => { setMenu(null); dispatch({ type: "toggleSource" }); }}>Sources</button>
                      <button type="button" onClick={() => { setMenu(null); dispatch({ type: "toggleSettings" }); }}>Lineage</button>
                    </>
                  )}
                  {id === "edit" && (
                    <>
                      <button type="button" onClick={() => { setMenu(null); dispatch({ type: "undo" }); }}>Undo</button>
                      <button type="button" onClick={() => { setMenu(null); dispatch({ type: "redo" }); }}>Redo</button>
                    </>
                  )}
                  {id === "view" && (
                    <>
                      <button type="button" onClick={() => { setMenu(null); dispatch({ type: "camera", camera: { zoom: Math.min(4, state.camera.zoom * 1.25) } }); }}>Zoom in</button>
                      <button type="button" onClick={() => { setMenu(null); dispatch({ type: "camera", camera: { zoom: Math.max(0.1, state.camera.zoom / 1.25) } }); }}>Zoom out</button>
                      <button type="button" className="menu-toggle" role="menuitemcheckbox" aria-checked={state.showGrid} onClick={() => { setMenu(null); dispatch({ type: "ui", patch: { showGrid: !state.showGrid } }); }}>
                        <i aria-hidden="true">{state.showGrid ? "✓" : ""}</i>
                        {state.showGrid ? "Hide grid lines" : "Show grid lines"}
                        <kbd>{isMac ? "⇧'" : "Shift '"}</kbd>
                      </button>
                      <button type="button" className="menu-toggle" role="menuitemcheckbox" aria-checked={state.showRulers} onClick={() => { setMenu(null); dispatch({ type: "ui", patch: { showRulers: !state.showRulers } }); }}>
                        <i aria-hidden="true">{state.showRulers ? "✓" : ""}</i>
                        {state.showRulers ? "Hide rulers" : "Show rulers"}
                        <kbd>{isMac ? "⇧R" : "Shift R"}</kbd>
                      </button>
                      <button type="button" onClick={() => { setMenu(null); dispatch({ type: "ui", patch: { shortcutsOpen: true } }); }}>Keyboard shortcuts</button>
                      <button type="button" onClick={() => { setMenu(null); setThemesOpen(true); }}>Appearance</button>
                      <a className="menu-link" href="/docs">How to use</a>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="crumb">
          <Icon name="folder" />
          <span>Studio</span>
          <input className="docname" aria-label="Document name" value={state.doc.name} onChange={(e) => dispatch({ type: "rename", name: e.target.value })} />
          <span className="saved" title="All changes synced" />
        </div>
        <span className="saved-label">Saved just now</span>
        <div className="presence-wrap">
          <div className="presence" role="list" aria-label={state.collaborators.length ? `${state.collaborators.length + 1} people on this file` : "Only you are on this file"}>
            {state.collaborators.map((person) => {
              const label = person.name.trim() || "Online";
              return (
                <div key={person.id} className="avatar" role="listitem" aria-label={`${label}, ${person.mode}`} style={{ background: person.color }} title={`${label} · ${person.mode}`}>
                  {label.slice(0, 1).toUpperCase()}
                </div>
              );
            })}
            <button
              type="button"
              className="avatar you"
              style={{ background: presence.self.color }}
              title={presence.self.name.trim() ? `${presence.self.name.trim()} · You` : "You — set the name other people see"}
              aria-expanded={naming}
              onClick={() => setNaming((open) => !open)}
            >
              {presence.self.name.trim() ? presence.self.name.trim().slice(0, 1).toUpperCase() : "You"}
            </button>
          </div>
          {naming ? (
            <form
              className="name-pop"
              onSubmit={(event) => {
                event.preventDefault();
                presence.setName(presenceName);
                setNaming(false);
              }}
            >
              <label htmlFor="presence-name">Name on this file</label>
              <input id="presence-name" value={presenceName} onChange={(event) => setPresenceName(event.target.value)} placeholder="Your name" autoFocus />
              <button type="submit" className="textbtn primary">Save</button>
            </form>
          ) : null}
        </div>
        <button className="textbtn" aria-haspopup="dialog" aria-expanded={state.shareOpen} onClick={() => dispatch({ type: "ui", patch: { shareOpen: !state.shareOpen } })}>
          Share
        </button>
        <button className="textbtn primary" onClick={() => dispatch({ type: "toggleExport" })}>
          Export
        </button>
      </header>

      <nav className="modetabs" aria-label="Modes">
        <div className="modes-scroll">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`mode ${state.mode === m.id ? "active" : ""}`}
            aria-pressed={state.mode === m.id}
            onClick={() => dispatch({ type: "mode", mode: m.id as ModeId })}
            title={m.blurb}
          >
            {m.label}
          </button>
        ))}
        </div>
        <div className="mode-side">
          <div className="menu">
            <button type="button" className="menubtn" aria-expanded={menu === "essentials"} onClick={() => setMenu(menu === "essentials" ? null : "essentials")}>
              Essentials
              <Icon name="chevron" />
            </button>
            {menu === "essentials" && (
              <div className="menu-pop end">
                <button type="button" onClick={() => { setMenu(null); dispatch({ type: "toggleSource" }); }}>Sources {state.sources.length}</button>
                <button type="button" onClick={() => { setMenu(null); dispatch({ type: "ui", patch: { leftPanel: "libraries" } }); }}>Library</button>
                <button type="button" onClick={() => { setMenu(null); setThemesOpen(true); }}>Appearance</button>
                <button type="button" onClick={() => { setMenu(null); dispatch({ type: "toggleSettings" }); }}>Lineage</button>
                <a className="menu-link" href="/docs">How to use</a>
              </div>
            )}
          </div>
          <button type="button" className="iconbare" aria-label="Keyboard shortcuts" onClick={() => dispatch({ type: "ui", patch: { shortcutsOpen: !state.shortcutsOpen } })}>
            ?
          </button>
        </div>
      </nav>

      <div className="contextbar">
        <Icon name={activeTool.icon} />
        <span>{activeTool.label}</span>
        <i />
        <span className="context-hint">{CONTEXT[state.mode] ?? CONTEXT.design}</span>
        <div className="context-side">
          <button type="button" aria-label="Undo" onClick={() => dispatch({ type: "undo" })}><Icon name="undo" /></button>
          <button type="button" aria-label="Redo" onClick={() => dispatch({ type: "redo" })}><Icon name="redo" /></button>
          <button type="button" onClick={() => dispatch({ type: "camera", camera: { zoom: 1 } })}>{Math.round(state.camera.zoom * 100)}%</button>
        </div>
      </div>

      <div
        className={`workspace ${state.mode} ${state.sourceOpen ? "sources-open" : ""}`}
        style={{ ["--pane-left" as string]: `${leftW}px`, ["--pane-right" as string]: `${rightW}px` }}
      >
        <div className="toolbar" role="toolbar" aria-label={`${mode.label} tools`}>
          <div className="rail-main">
            {rail.map((tool, index) => (
              <button
                key={`${tool.id}-${index}`}
                type="button"
                className={`tool ${state.tool === tool.id || (tool.id === "magnet" && state.snapPixels) ? "active" : ""}`}
                title={tool.label}
                aria-label={tool.label}
                aria-pressed={tool.id === "magnet" ? state.snapPixels : state.tool === tool.id}
                onClick={() => pickTool(tool.id)}
              >
                <Icon name={tool.icon} />
              </button>
            ))}
          </div>
          <div className="rail-util">
            <button type="button" className={`tool ${state.tool === "hand" ? "active" : ""}`} aria-label="Hand" title="Hand" onClick={() => dispatch({ type: "tool", tool: "hand" })}>
              <Icon name="hand" />
            </button>
            <button type="button" className={`tool ${state.tool === "zoom" ? "active" : ""}`} aria-label="Zoom" title="Zoom" onClick={() => dispatch({ type: "tool", tool: "zoom" })}>
              <Icon name="zoom" />
            </button>
            <label className="ink" title="Foreground">
              <input
                type="color"
                aria-label="Foreground color"
                value={fill}
                onChange={(e) => sel && dispatch({ type: "patch", id: sel.id, patch: { fill: e.target.value } })}
              />
            </label>
          </div>
        </div>

        <aside className="panel">
          <button type="button" className="pane-resize left" aria-label="Resize left panel" onPointerDown={(event) => resizePane("left", event)} />
          <PanelSwitch />
          {state.leftPanel === "layers" && <LayerPanel />}
          {state.leftPanel === "assets" && (
            <div className="asset-list">
              <p>Drag a component onto the canvas to place an instance.</p>
              {componentFamilies(layers).map((family) => (
                <button
                  key={family.id}
                  type="button"
                  className="layer"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/df-node", family.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => dispatch({ type: "select", id: family.id })}
                >
                  {family.name}
                  {family.variants.length > 1 ? ` · ${family.variants.map((variant) => variant.variantName || variant.name).join(", ")}` : ""}
                </button>
              ))}
              {!layers.some((n) => n.component) && <p>No components yet. Select layers and choose Create component.</p>}
            </div>
          )}
          {state.leftPanel === "libraries" && <LibraryPanel />}
        </aside>

        <div className={`stage-wrap ${state.mode === "motion" || state.mode === "film" ? "has-time" : ""} ${state.showGuides ? "guides" : ""} ${state.showRulers ? "show-rulers" : ""} ${state.pixelPreview ? "pixel-preview" : ""}`}>
          <div className="canvas-crumb">
            <span>{state.doc.name} / {frame?.name ?? "Canvas"}</span>
            <span>{Math.round(state.camera.zoom * 100)}%</span>
          </div>
          <FramePresets />
          <CanvasStage canvasRef={canvasRef} onCursor={presence.move} />
          <CommentDock />
          {state.mode === "motion" && <TimeDesk kind="motion" />}
          {state.mode === "film" && <TimeDesk kind="film" />}
        </div>

        {state.mode === "ai" ? (
          <AiStudio />
        ) : (
          <aside className="panel right">
            <button type="button" className="pane-resize right" aria-label="Resize right panel" onPointerDown={(event) => resizePane("right", event)} />
            {state.mode !== "design" && <h3>{state.mode === "prototype" ? "Prototype" : state.devMode ? "Dev" : mode.short}</h3>}
            {state.mode === "design" ? (
              <DesignInspector format={frameFormat} formats={FRAME_FORMATS} onFormat={setFrameFormat} onExport={() => exportFrames(frameFormat)} />
            ) : state.mode === "prototype" ? (
              <PrototypePanel />
            ) : sel ? (
              <>
                <div className="field">
                  <label htmlFor="layer-name">Name</label>
                  <input id="layer-name" value={sel.name} onChange={(e) => dispatch({ type: "patch", id: sel.id, patch: { name: e.target.value } })} />
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
                  <label htmlFor="layer-fill">Fill</label>
                  <input id="layer-fill" value={sel.fill} onChange={(e) => dispatch({ type: "patch", id: sel.id, patch: { fill: e.target.value } })} />
                </div>
                {state.mode === "photo" && <PhotoDevelop />}
                <InspectExtras />
                {sel.type === "text" && (
                  <div className="field">
                    <label htmlFor="layer-copy">Copy</label>
                    <textarea id="layer-copy" value={sel.text} onChange={(e) => dispatch({ type: "patch", id: sel.id, patch: { text: e.target.value } })} />
                  </div>
                )}
                {state.devMode && (
                  <pre style={{ margin: "0 14px", color: "var(--muted)", whiteSpace: "pre-wrap" }}>{`width: ${Math.round(sel.w)}px;\nheight: ${Math.round(sel.h)}px;\nbackground: ${sel.fill};`}</pre>
                )}
                <div className="field frame-export">
                  <label htmlFor="frame-format">Export {frame?.name ?? "frame"}</label>
                  <select id="frame-format" value={frameFormat} onChange={(e) => setFrameFormat(e.target.value)}>
                    {FRAME_FORMATS.map((id) => {
                      const fmt = EXPORT_FORMATS.find((item) => item.id === id);
                      return <option key={id} value={id}>{fmt ? `${fmt.label} (.${fmt.ext})` : id}</option>;
                    })}
                  </select>
                  <button type="button" className="textbtn" onClick={() => exportFrames(frameFormat)}>
                    Export {frame?.name ?? "frame"}
                  </button>
                  <button type="button" className="textbtn ghost" onClick={() => dispatch({ type: "toggleExport" })}>
                    All formats
                  </button>
                </div>
              </>
            ) : (
              <p style={{ padding: "0 14px", color: "var(--muted)" }}>Select a layer to inspect.</p>
            )}
          </aside>
        )}
        <SourcesDrawer />
      </div>

      <footer className="statusbar">
        <span>
          {state.doc.name} / {mode.label} · {state.doc.pages.length} frames · {layers.length} layers
          {state.note ? ` · ${state.note}` : ""}
        </span>
        <span>{exportNote ?? `${isMac ? "⇧⌘E" : "Ctrl+Shift+E"} export · ${primaryMod()}K commands`}</span>
      </footer>

      <ThemePicker
        open={themesOpen}
        appearance={appearance}
        themeId={themeId}
        onAppearance={setAppearance}
        onTheme={setThemeId}
        onClose={() => setThemesOpen(false)}
      />
      <ExportDialog canvasRef={canvasRef} />
      <ShareDialog />
      <PresentMode />
      <ShortcutsPanel />
      <CommandPalette onRun={(id) => runCommand(id, { ...commandCtx, canvas: canvasRef.current })} />
      <NodeMenu />

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
              <p style={{ color: "var(--muted)", marginTop: 0 }}>
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
