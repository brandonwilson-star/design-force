import { useRef, useState } from "react";
import type { CommentAttachment, CommentPin } from "../types";
import { uid } from "../lib/id";
import { loadPresenceSelf } from "../lib/presence";
import { Icon } from "./Icons";
import { pageComments, useStudio } from "../store";

export function CommentDock() {
  const { state, dispatch } = useStudio();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<CommentAttachment[]>([]);
  const open = state.tool === "comment";
  if (!open) return null;

  const comments = pageComments(state.doc);
  const active = comments.find((pin) => pin.id === state.activeCommentId) ?? comments.at(-1);
  const author = loadPresenceSelf().name.trim() || "You";

  const readFiles = (files: FileList | null) =>
    Promise.all(
      Array.from(files ?? []).map(
        (file) =>
          new Promise<CommentAttachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: uid("file"),
                name: file.name,
                mime: file.type || "application/octet-stream",
                dataUrl: String(reader.result),
              });
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          }),
      ),
    );

  const post = () => {
    const body = draft.trim();
    if (!body && pending.length === 0) return;
    if (active && !active.body && (active.attachments ?? []).length === 0) {
      dispatch({ type: "commentPatch", id: active.id, patch: { body, author, attachments: pending, createdAt: active.createdAt ?? Date.now() }, history: false });
    } else {
      const pin: CommentPin = {
        id: uid("c"),
        x: active ? active.x + 28 : 180,
        y: active ? active.y + 28 : 160,
        author,
        body,
        resolved: false,
        createdAt: Date.now(),
        attachments: pending,
      };
      dispatch({ type: "comment", pin });
      dispatch({ type: "ui", patch: { activeCommentId: pin.id, showComments: true } });
    }
    setDraft("");
    setPending([]);
  };

  return (
    <section className="comment-dock" aria-label="Comments">
      <header>
        <h2>Comments</h2>
        <span>{comments.length}</span>
      </header>
      <div className="comment-thread">
        {comments.length === 0 && <p>Click the canvas to place a comment, or write one here.</p>}
        {comments.map((pin) => (
          <article key={pin.id} className={pin.id === active?.id ? "active" : ""}>
            <button type="button" className="comment-meta" onClick={() => dispatch({ type: "ui", patch: { activeCommentId: pin.id } })}>
              <span className="avatar you" aria-hidden="true">{(pin.author || "You").slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{pin.author || "You"}</strong>
                <em>{when(pin.createdAt)}</em>
              </span>
            </button>
            {pin.body && <p>{pin.body}</p>}
            <Attachments pin={pin} />
            {pin.resolved && <p className="resolved">Resolved</p>}
          </article>
        ))}
      </div>
      <form
        className="comment-compose"
        onSubmit={(event) => {
          event.preventDefault();
          post();
        }}
      >
        <label className="sr" htmlFor="comment-draft">
          Comment
        </label>
        <textarea
          id="comment-draft"
          value={draft}
          placeholder="Add a comment…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              post();
            }
          }}
        />
        {pending.length > 0 && (
          <ul className="pending-files">
            {pending.map((file) => (
              <li key={file.id}>{file.name}</li>
            ))}
          </ul>
        )}
        <div className="comment-actions">
          <button type="button" className="iconbare" aria-label="Upload screenshots or documents" onClick={() => fileRef.current?.click()}>
            <Icon name="paperclip" />
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept="image/*,.pdf,.txt,.md,.json,.svg,.csv,.doc,.docx"
            onChange={(event) => {
              const files = event.target.files;
              const target = active;
              event.target.value = "";
              void readFiles(files).then((attachments) => {
                if (!attachments.length) return;
                if (target) {
                  dispatch({
                    type: "commentPatch",
                    id: target.id,
                    patch: { attachments: [...(target.attachments ?? []), ...attachments] },
                    history: false,
                  });
                } else {
                  setPending((list) => [...list, ...attachments]);
                }
              });
            }}
          />
          <span>⌘ ↵</span>
          <button type="submit" className="textbtn" disabled={!draft.trim() && pending.length === 0}>
            Reply
          </button>
        </div>
      </form>
    </section>
  );
}

function Attachments({ pin }: { pin: CommentPin }) {
  const files = pin.attachments ?? [];
  if (!files.length) return null;
  return (
    <ul className="comment-files">
      {files.map((file) => (
        <li key={file.id}>
          {file.mime.startsWith("image/") ? <img src={file.dataUrl} alt={file.name} /> : null}
          <a href={file.dataUrl} download={file.name}>
            {file.name}
          </a>
        </li>
      ))}
    </ul>
  );
}

function when(time?: number) {
  if (!time) return "Just now";
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}
