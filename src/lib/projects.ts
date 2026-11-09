import { seedDocument } from "../data";
import { uid } from "./id";
import type { DocumentState } from "../types";

export interface ProjectFolder {
  id: string;
  name: string;
  pinned: boolean;
}

export interface ProjectFile {
  id: string;
  name: string;
  projectId: string;
  draft: boolean;
  updatedAt: number;
  deletedAt: number | null;
}

interface ProjectIndex {
  projects: ProjectFolder[];
  files: ProjectFile[];
}

const KEY = "df.projects";
const memory = new Map<string, DocumentState>();

function northlight(): DocumentState {
  const seeded = seedDocument();
  return {
    id: "file-northlight",
    name: seeded.name,
    pages: seeded.pages,
    selectedId: seeded.pages[0]?.id ?? null,
    selectedIds: seeded.pages[0] ? [seeded.pages[0].id] : [],
    comments: [],
    colorStyles: [
      { id: "style-pink", name: "Pink", value: "#f9dada" },
      { id: "style-ink", name: "Dark purple", value: "#17152d" },
    ],
    textStyles: [],
    developPresets: [],
    variables: [],
    sheets: [{ id: "page-1", name: "Page 1", nodes: seeded.pages }],
    activeSheetId: "page-1",
  };
}

function fallback(): ProjectIndex {
  return {
    projects: [{ id: "personal", name: "Personal Projects", pinned: false }],
    files: [
      {
        id: "file-northlight",
        name: "Northlight — campaign desk",
        projectId: "personal",
        draft: false,
        updatedAt: Date.now(),
        deletedAt: null,
      },
    ],
  };
}

function read(): ProjectIndex {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback();
    const parsed = JSON.parse(raw) as ProjectIndex;
    if (!parsed.projects?.length || !parsed.files) return fallback();
    return parsed;
  } catch {
    return fallback();
  }
}

function write(index: ProjectIndex) {
  localStorage.setItem(KEY, JSON.stringify(index));
}

export function loadProjects() {
  const index = read();
  if (!memory.has("file-northlight")) memory.set("file-northlight", northlight());
  return index;
}

export function saveImported(doc: DocumentState, nearId?: string) {
  const index = read();
  const near = nearId ? index.files.find((file) => file.id === nearId) : undefined;
  const projectId = near?.projectId || index.projects[0]?.id;
  if (!projectId) {
    memory.set(doc.id, structuredClone(doc));
    return index;
  }
  return addFile(doc, projectId, false);
}

export function rememberDocument(doc: DocumentState) {
  memory.set(doc.id, structuredClone(doc));
  const index = read();
  const existing = index.files.find((file) => file.id === doc.id);
  if (existing) {
    existing.name = doc.name;
    existing.updatedAt = Date.now();
    write(index);
  }
}

export function documentFor(id: string): DocumentState | null {
  const stored = memory.get(id);
  if (stored) return structuredClone(stored);
  if (id === "file-northlight") return northlight();
  return null;
}

export function blankDocument(name: string): DocumentState {
  const sheetId = uid();
  return {
    id: uid(),
    name,
    pages: [],
    selectedId: null,
    selectedIds: [],
    comments: [],
    colorStyles: [],
    textStyles: [],
    developPresets: [],
    variables: [],
    sheets: [{ id: sheetId, name: "Page 1", nodes: [] }],
    activeSheetId: sheetId,
  };
}

export function addProject(name: string): ProjectIndex {
  const index = read();
  index.projects = [...index.projects, { id: uid(), name, pinned: false }];
  write(index);
  return index;
}

export function togglePin(projectId: string): ProjectIndex {
  const index = read();
  index.projects = index.projects.map((project) => (project.id === projectId ? { ...project, pinned: !project.pinned } : project));
  write(index);
  return index;
}

export function addFile(doc: DocumentState, projectId: string, draft: boolean): ProjectIndex {
  memory.set(doc.id, structuredClone(doc));
  const index = read();
  index.files = [
    { id: doc.id, name: doc.name, projectId, draft, updatedAt: Date.now(), deletedAt: null },
    ...index.files.filter((file) => file.id !== doc.id),
  ];
  write(index);
  return index;
}

export function moveFile(id: string, patch: Partial<Pick<ProjectFile, "deletedAt" | "name" | "draft">>): ProjectIndex {
  const index = read();
  index.files = index.files.map((file) => (file.id === id ? { ...file, ...patch, updatedAt: Date.now() } : file));
  write(index);
  return index;
}

export function adoptDocument(raw: unknown): DocumentState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { kind?: string; document?: Partial<DocumentState>; name?: string; pages?: DocumentState["pages"] };
  const source: Partial<DocumentState> = record.kind === "design-force" && record.document ? record.document : record;
  if (!source.pages || !Array.isArray(source.pages)) return null;
  const sheetId = source.activeSheetId || source.sheets?.[0]?.id || uid();
  return {
    id: uid(),
    name: source.name || "Imported file",
    pages: source.pages,
    selectedId: source.pages[0]?.id ?? null,
    selectedIds: source.pages[0] ? [source.pages[0].id] : [],
    comments: source.comments ?? [],
    colorStyles: source.colorStyles ?? [],
    textStyles: source.textStyles ?? [],
    developPresets: source.developPresets ?? [],
    variables: source.variables ?? [],
    sheets: source.sheets?.length ? source.sheets : [{ id: sheetId, name: "Page 1", nodes: source.pages }],
    activeSheetId: sheetId,
  };
}
