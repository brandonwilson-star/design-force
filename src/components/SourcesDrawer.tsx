import { useState } from "react";
import { uid } from "../lib/id";
import { useStudio } from "../store";
import type { SourceKind } from "../types";

export function SourcesDrawer() {
  const { state, dispatch } = useStudio();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<SourceKind>("note");

  if (!state.sourceOpen) return null;

  const add = (sourceKind: SourceKind, sourceTitle: string, sourceContent: string) => {
    dispatch({
      type: "addSource",
      source: {
        id: uid("src"),
        kind: sourceKind,
        title: sourceTitle,
        excerpt: sourceContent.slice(0, 110),
        content: sourceContent,
        addedAt: Date.now(),
      },
    });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of files) {
      const text = await file.text().catch(() => `[binary file: ${file.name}, ${file.size} bytes]`);
      add("file", file.name, text.slice(0, 20000));
    }
  };

  return (
    <aside className="sources">
      <h3>Sources · Notebook</h3>
      <p style={{ margin: "0 14px 12px", color: "var(--muted)", fontSize: 12, lineHeight: 1.45 }}>
        Like NotebookLM: drop briefs, transcripts, brand PDFs, and URLs. AI Design and in-mode
        edits cite these instead of inventing a new brand.
      </p>
      <label className="drop">
        Drop files or click to attach
        <input
          type="file"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>
      <div className="field">
        <label>Add a source</label>
        <div className="row">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SourceKind)}
            style={{ background: "var(--field)", border: "1px solid var(--rule-strong)", borderRadius: 6, padding: 6 }}
          >
            <option value="note">Note</option>
            <option value="url">URL</option>
            <option value="file">File</option>
            <option value="repo">Repo</option>
            <option value="image">Image</option>
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        </div>
      </div>
      <div className="field">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste copy, a URL, or notes the model should obey…"
        />
      </div>
      <div className="field">
        <button
          className="textbtn primary"
          onClick={() => {
            if (!title.trim() && !content.trim()) return;
            add(kind, title.trim() || "Untitled source", content.trim());
            setTitle("");
            setContent("");
          }}
        >
          Ground the desk
        </button>
      </div>
      {state.sources.map((s) => (
        <article key={s.id} className="source-card">
          <span className="kind">{s.kind}</span>
          <strong>{s.title}</strong>
          <p>{s.excerpt}</p>
          <button className="textbtn ghost" style={{ marginTop: 8, height: 26 }} onClick={() => dispatch({ type: "removeSource", id: s.id })}>
            Remove
          </button>
        </article>
      ))}
    </aside>
  );
}
