import { useState } from "react";
import { planFromPrompt, type CraftPlan } from "../lib/craft";
import { askClaude, getStoredKey, localDesign, setStoredKey } from "../lib/claude";
import { uid } from "../lib/id";
import { useStudio } from "../store";

export function AiStudio() {
  const { state, dispatch } = useStudio();
  const [prompt, setPrompt] = useState(
    "Design a landing hero for the Northlight campaign. Keep the copper/ink palette. Mobile + desktop artboards. CTA: Open a file.",
  );

  const applyPlan = (plan: CraftPlan) => {
    if (plan.kind === "place") {
      dispatch({ type: "add", parentId: null, node: plan.node });
      dispatch({ type: "select", id: plan.node.id });
    } else if (plan.kind === "filters") {
      dispatch({ type: "filters", id: plan.id, filters: plan.filters });
      dispatch({ type: "select", id: plan.id });
    } else if (plan.kind === "keyframes") {
      dispatch({ type: "patch", id: plan.id, patch: { keyframes: plan.keyframes } });
      dispatch({ type: "select", id: plan.id });
    } else if (plan.kind === "comment") {
      dispatch({ type: "comment", pin: plan.pin });
    } else if (plan.kind === "master") {
      dispatch({ type: "patch", id: plan.id, patch: { master: true } });
      dispatch({ type: "select", id: plan.id });
    } else if (plan.kind === "clips") {
      dispatch({ type: "replaceDoc", pages: plan.pages, selectedIds: plan.pages[0] ? [plan.pages[0].id] : [] });
    }
    dispatch({ type: "note", note: plan.note });
  };

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
      const plan = planFromPrompt(text, result.html ?? "", state.doc, state.doc.selectedId);
      applyPlan(plan);
      dispatch({
        type: "chat",
        message: { id: uid("m"), role: "assistant", content: `${result.text}\n\n${plan.note}`, html: result.html },
      });
      if (result.html) dispatch({ type: "artboard", html: result.html });
    } catch (err) {
      const fallback = localDesign(text, state.sources);
      const plan = planFromPrompt(text, fallback.html, state.doc, state.doc.selectedId);
      applyPlan(plan);
      dispatch({
        type: "chat",
        message: {
          id: uid("m"),
          role: "assistant",
          content: `Claude unavailable (${String(err)}). The local design was still placed on the shared canvas.\n\n${fallback.text}\n\n${plan.note}`,
          html: fallback.html,
        },
      });
      dispatch({ type: "artboard", html: fallback.html });
    } finally {
      dispatch({ type: "busy", busy: false });
    }
  };

  return (
      <aside className="panel right chat">
        <h3>Prompt</h3>
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
            id="ai-prompt"
            aria-label="Design prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            placeholder="Describe a design or an edit across modes…"
          />
          <button className="textbtn primary" onClick={send} disabled={state.busy || !prompt.trim()}>
            {state.busy ? "Generating…" : "Generate"}
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
  );
}
