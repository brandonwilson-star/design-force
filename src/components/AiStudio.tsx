import { useState } from "react";
import { askClaude, getStoredKey, localDesign, setStoredKey } from "../lib/claude";
import { uid } from "../lib/id";
import { useStudio } from "../store";
import { MODES } from "../types";

export function AiStudio() {
  const { state, dispatch } = useStudio();
  const [prompt, setPrompt] = useState(
    "Design a landing hero for the Northlight campaign. Keep the copper/ink palette. Mobile + desktop artboards. CTA: Open a file.",
  );

  const send = async () => {
    const text = prompt.trim();
    if (!text || state.busy) return;
    dispatch({ type: "chat", message: { id: uid("m"), role: "user", content: text } });
    dispatch({ type: "busy", busy: true });
    setPrompt("");
    try {
      const key = state.apiKey || getStoredKey();
      const result = key
        ? await askClaude({
            apiKey: key,
            mode: state.mode,
            sources: state.sources,
            history: state.chat,
            prompt: text,
          })
        : localDesign(text, state.sources);
      dispatch({
        type: "chat",
        message: { id: uid("m"), role: "assistant", content: result.text, html: result.html },
      });
      if (result.html) dispatch({ type: "artboard", html: result.html });
    } catch (err) {
      const fallback = localDesign(text, state.sources);
      dispatch({
        type: "chat",
        message: {
          id: uid("m"),
          role: "assistant",
          content: `Claude unavailable (${String(err)}). Showing a local, source-grounded artboard instead.\n\n${fallback.text}`,
          html: fallback.html,
        },
      });
      dispatch({ type: "artboard", html: fallback.html });
    } finally {
      dispatch({ type: "busy", busy: false });
    }
  };

  return (
    <>
      <div className="stage-wrap ai-split">
        <div className="artboard">
          {state.artboardHtml ? (
            <iframe title="AI artboard" sandbox="allow-scripts" srcDoc={state.artboardHtml} />
          ) : (
            <div className="empty">
              <h2>Prompt across every craft</h2>
              <p>
                Claude Design–style canvas. Describe a screen, a grade, a motion board, a spread,
                or a PDF packet. Sources on the right keep the voice honest. Edits apply to the
                active mode: {MODES.find((m) => m.id === state.mode)?.label}.
              </p>
            </div>
          )}
        </div>
      </div>
      <aside className="panel right chat">
        <h3>Design chat</h3>
        <div className="messages">
          {state.chat.length === 0 ? (
            <div className="bubble">
              Ask for a design or an edit. Try: “Grade the harbor plate cooler and export a Lightroom-style recipe” or
              “Turn the hero into a 6-second title card for EffectCraft.”
            </div>
          ) : null}
          {state.chat.map((m) => (
            <div key={m.id} className={`bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          {state.busy ? <div className="bubble">Composing on the desk…</div> : null}
        </div>
        <div className="composer">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            placeholder="Describe a design or an edit across modes…"
          />
          <button className="textbtn primary" onClick={send} disabled={state.busy}>
            Design
          </button>
        </div>
        <div className="field">
          <label>Anthropic API key (stored locally)</label>
          <input
            type="password"
            value={state.apiKey}
            placeholder="sk-ant-…"
            onChange={(e) => {
              dispatch({ type: "apiKey", apiKey: e.target.value });
              setStoredKey(e.target.value);
            }}
          />
        </div>
      </aside>
    </>
  );
}
