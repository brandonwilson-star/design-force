import { useMemo, useRef, useState } from "react";
import {
  addFile,
  addProject,
  blankDocument,
  documentFor,
  loadProjects,
  moveFile,
  togglePin,
  type ProjectFile,
  type ProjectFolder,
} from "../lib/projects";
import { IMPORT_ACCEPT, importDesignFile } from "../lib/import-design";
import type { DocumentState } from "../types";
import { Icon } from "./Icons";

const LIBRARIES = [
  { id: "tokens", name: "Design tokens starter kit", tone: "tokens" },
  { id: "system", name: "Forma design system", tone: "system" },
  { id: "wire", name: "Wireframe library", tone: "wire" },
  { id: "proto", name: "Prototype template", tone: "proto" },
  { id: "mock", name: "UI mockup example", tone: "mock" },
];

const FONTS = ["Geist", "Geist Mono", "Syne", "Source Sans 3"];

type Nav = "projects" | "drafts" | "fonts" | "libraries";

export function ProjectsHome({ onOpen }: { onOpen: (doc: DocumentState) => void }) {
  const [index, setIndex] = useState(loadProjects);
  const [projectId, setProjectId] = useState(index.projects[0]?.id ?? "personal");
  const [nav, setNav] = useState<Nav>("projects");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"recent" | "deleted">("recent");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [librariesOpen, setLibrariesOpen] = useState(true);
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [teamOpen, setTeamOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [naming, setNaming] = useState<null | { kind: "project" | "file" | "draft" }>(null);
  const [draftName, setDraftName] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const you = (typeof localStorage !== "undefined" && localStorage.getItem("df.presenceName")?.trim()) || "You";
  const project = index.projects.find((item) => item.id === projectId) ?? index.projects[0];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return index.files.filter((file) => {
      if (file.projectId !== project?.id) return false;
      if (needle && !file.name.toLowerCase().includes(needle)) return false;
      if (tab === "deleted") return file.deletedAt !== null;
      if (file.deletedAt) return false;
      if (nav === "drafts") return file.draft;
      return true;
    });
  }, [index.files, nav, project?.id, query, tab]);

  const latest = visible.reduce((max, file) => Math.max(max, file.updatedAt), 0);
  const pinned = index.projects.filter((item) => item.pinned);

  const openFile = (file: ProjectFile) => {
    const doc = documentFor(file.id);
    if (!doc) {
      setNotice("That file is no longer on this device.");
      return;
    }
    onOpen({ ...doc, name: file.name });
  };

  const createNamed = () => {
    const name = draftName.trim();
    if (!name || !project) return;
    if (naming?.kind === "project") {
      const next = addProject(name);
      setIndex(next);
      setProjectId(next.projects.at(-1)?.id ?? projectId);
      setNav("projects");
      setTab("recent");
    } else {
      const doc = blankDocument(name);
      setIndex(addFile(doc, project.id, naming?.kind === "draft"));
      onOpen(doc);
    }
    setNaming(null);
    setDraftName("");
  };

  const onImport = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file || !project) return;
    try {
      const doc = await importDesignFile(file);
      doc.name = doc.name || file.name.replace(/\.[^.]+$/, "");
      setIndex(addFile(doc, project.id, false));
      onOpen(doc);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "That file could not be read.");
    }
    if (importRef.current) importRef.current.value = "";
  };

  return (
    <div className="projects-home">
      <aside className="projects-side">
        <div className="projects-team">
          <button type="button" aria-expanded={teamOpen} onClick={() => setTeamOpen((open) => !open)}>
            <Icon name="folder" size={16} />
            <span>{project?.name ?? "Personal Projects"}</span>
          </button>
          {teamOpen && (
            <div className="projects-team-menu" role="menu">
              {index.projects.map((item) => (
                <div key={item.id} role="menuitem">
                  <button
                    type="button"
                    onClick={() => {
                      setProjectId(item.id);
                      setTeamOpen(false);
                      setNav("projects");
                    }}
                  >
                    {item.name}
                  </button>
                  <button type="button" onClick={() => setIndex(togglePin(item.id))}>
                    {item.pinned ? "Unpin" : "Pin"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <label className="projects-search">
          <input value={query} placeholder="Search…" aria-label="Search files" onChange={(event) => setQuery(event.target.value)} />
          <Icon name="search" size={14} />
        </label>
        <nav className="projects-nav" aria-label="Library">
          <button type="button" aria-current={nav === "projects" ? "page" : undefined} onClick={() => setNav("projects")}>
            Projects
          </button>
          <button type="button" aria-current={nav === "drafts" ? "page" : undefined} onClick={() => setNav("drafts")}>
            Drafts
          </button>
          <p>Sources</p>
          <button type="button" aria-current={nav === "fonts" ? "page" : undefined} onClick={() => setNav("fonts")}>
            Fonts
          </button>
          <button type="button" aria-current={nav === "libraries" ? "page" : undefined} onClick={() => setNav("libraries")}>
            Libraries
          </button>
        </nav>
        <div className="projects-pin">
          <p>Pinned projects</p>
          {pinned.length === 0 ? (
            <span>
              <Icon name="pin" size={14} /> Pinned projects will appear here
            </span>
          ) : (
            pinned.map((item) => (
              <button key={item.id} type="button" onClick={() => setProjectId(item.id)}>
                {item.name}
              </button>
            ))
          )}
          {project && (
            <button type="button" className="projects-pin-toggle" onClick={() => setIndex(togglePin(project.id))}>
              {project.pinned ? "Unpin this project" : "Pin this project"}
            </button>
          )}
        </div>
        <div className="projects-side-foot">
          <section className="projects-plan">
            <strong>Teams on one file</strong>
            <p>People on the same file show up live. There is no separate seat to unlock.</p>
            <button type="button" onClick={() => setNotice("Sharing starts after you open a file.")}>
              Open a file to share
            </button>
          </section>
          <section className="projects-you">
            <span>Your subscription</span>
            <strong>Studio</strong>
          </section>
          <footer>
            <span className="projects-avatar" aria-hidden="true">
              {you.slice(0, 1).toUpperCase()}
            </span>
            <span>{you}</span>
            <button type="button" aria-label="Notifications" onClick={() => setNotice(notice === "No new notifications." ? null : "No new notifications.")}>
              <Icon name="bell" size={16} />
            </button>
          </footer>
        </div>
      </aside>
      <main className="projects-main">
        <header>
          <h1>{nav === "fonts" ? "Fonts" : nav === "libraries" ? "Libraries" : project?.name}</h1>
          <div className="projects-actions">
            <div role="group" aria-label="File layout">
              <button type="button" aria-pressed={layout === "list"} aria-label="List" onClick={() => setLayout("list")}>
                <Icon name="list" size={14} />
              </button>
              <button type="button" aria-pressed={layout === "grid"} aria-label="Grid" onClick={() => setLayout("grid")}>
                <Icon name="grid" size={14} />
              </button>
            </div>
            <button type="button" className="projects-new" onClick={() => { setDraftName(""); setNaming({ kind: "project" }); }}>
              <Icon name="plus" size={14} /> New project
            </button>
          </div>
        </header>
        {nav === "fonts" ? (
          <section className="projects-fonts">
            {FONTS.map((font) => (
              <article key={font}>
                <strong style={{ fontFamily: font }}>{font}</strong>
                <span>Available in every file</span>
              </article>
            ))}
          </section>
        ) : nav === "libraries" ? (
          <LibraryGrid added={added} onAdd={(id) => setAdded((current) => new Set(current).add(id))} />
        ) : (
          <>
            <div className="projects-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "recent"} onClick={() => setTab("recent")}>
                Recent
              </button>
              <button type="button" role="tab" aria-selected={tab === "deleted"} onClick={() => setTab("deleted")}>
                Deleted
              </button>
            </div>
            <div className="projects-scroll">
              <div className="projects-count">
                <strong>{nav === "drafts" ? "Drafts" : "Files"}</strong>
                <span>
                  {visible.length} {visible.length === 1 ? "file" : "files"}
                  {latest ? `, ${ago(latest)}` : ""}
                </span>
              </div>
              {tab === "recent" && (
                <div className="projects-create">
                  <button type="button" onClick={() => { setDraftName("Untitled"); setNaming({ kind: "file" }); }}>
                    <strong>Create new file</strong>
                    <span>Start building amazing stuff</span>
                  </button>
                  <button type="button" onClick={() => importRef.current?.click()}>
                    <strong>Import a file</strong>
                    <span>Import .fig, Penpot, Sketch, SVG, or JSON</span>
                  </button>
                  <button type="button" onClick={() => { setLibrariesOpen(true); setNav("libraries"); }}>
                    <strong>Add a library or a template</strong>
                    <span>Explore some to add</span>
                  </button>
                </div>
              )}
              {visible.length > 0 && (
                <div className={layout === "grid" ? "projects-grid" : "projects-list"}>
                  {visible.map((file) => (
                    <article key={file.id}>
                      <button type="button" onClick={() => (file.deletedAt ? setIndex(moveFile(file.id, { deletedAt: null })) : openFile(file))}>
                        <span className="projects-thumb" aria-hidden="true">
                          {file.name.slice(0, 1)}
                        </span>
                        <span>
                          <strong>{file.name}</strong>
                          <em>{file.deletedAt ? "Deleted" : file.draft ? "Draft" : ago(file.updatedAt)}</em>
                        </span>
                      </button>
                      {file.deletedAt ? (
                        <button type="button" onClick={() => setIndex(moveFile(file.id, { deletedAt: null }))}>
                          Restore
                        </button>
                      ) : (
                        <button type="button" aria-label={`Delete ${file.name}`} onClick={() => setIndex(moveFile(file.id, { deletedAt: Date.now() }))}>
                          Delete
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
            {librariesOpen && tab === "recent" && (
              <section className="projects-shelf">
                <header>
                  <strong>Libraries & templates</strong>
                  <button type="button" onClick={() => setLibrariesOpen(false)}>
                    Hide <Icon name="chevron" size={12} />
                  </button>
                </header>
                <p>Here you have some libraries and templates you can add to your project</p>
                <LibraryGrid added={added} onAdd={(id) => setAdded((current) => new Set(current).add(id))} compact />
              </section>
            )}
          </>
        )}
        {notice && <p className="projects-notice" role="status">{notice}</p>}
      </main>
      <input ref={importRef} type="file" accept={IMPORT_ACCEPT} hidden onChange={(event) => onImport(event.target.files)} />
      {naming && (
        <form
          className="projects-name"
          onSubmit={(event) => {
            event.preventDefault();
            createNamed();
          }}
        >
          <label htmlFor="project-name">{naming.kind === "project" ? "Project name" : "File name"}</label>
          <input id="project-name" value={draftName} autoFocus onChange={(event) => setDraftName(event.target.value)} />
          <div>
            <button type="button" onClick={() => setNaming(null)}>
              Cancel
            </button>
            <button type="submit">Create</button>
          </div>
        </form>
      )}
      {teamOpen && <button type="button" className="projects-team-dismiss" aria-label="Close project menu" onClick={() => setTeamOpen(false)} />}
    </div>
  );
}

function LibraryGrid({ added, onAdd, compact = false }: { added: Set<string>; onAdd: (id: string) => void; compact?: boolean }) {
  return (
    <div className={`projects-libraries ${compact ? "compact" : ""}`}>
      {LIBRARIES.map((item) => (
        <article key={item.id}>
          <div className={`projects-cover ${item.tone}`} aria-hidden="true">
            <span>{item.name}</span>
          </div>
          <footer>
            <span>{item.name}</span>
            <button type="button" aria-label={added.has(item.id) ? `${item.name} added` : `Add ${item.name}`} disabled={added.has(item.id)} onClick={() => onAdd(item.id)}>
              {added.has(item.id) ? "Added" : "+"}
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}

function ago(time: number) {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export type { ProjectFolder };
