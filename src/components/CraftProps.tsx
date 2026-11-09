import { flatten, uid } from "../lib/id";
import { applyVariant } from "../lib/scene";
import { runCommand } from "../lib/commands";
import { selectedNode, useStudio } from "../store";
import type { DesignVariable, NodeBindings, VariableKind } from "../types";

const GROUPS = [
  ["group", "Group"],
  ["frame-selection", "Frame"],
  ["ungroup", "Ungroup"],
  ["union", "Union"],
  ["subtract", "Subtract"],
  ["intersect", "Intersect"],
  ["exclude", "Exclude"],
] as const;

export function CraftProps() {
  const { state, dispatch } = useStudio();
  const sel = selectedNode(state);
  const variables = state.doc.variables ?? [];
  const run = (id: string) => {
    runCommand(id, {
      state,
      dispatch,
      canvas: document.querySelector(".canvas-host canvas"),
      placeImage: () => undefined,
      focusRename: () => dispatch({ type: "renameTick" }),
      focusText: () => undefined,
    });
  };
  const main = sel?.instanceOf ? flatten(state.doc.pages).find((node) => node.id === sel.instanceOf) : sel?.component ? sel : null;
  const variants = main?.componentSet
    ? flatten(state.doc.pages).filter((node) => node.component && node.componentSet === main.componentSet)
    : main?.component
      ? [main]
      : [];
  const props = main?.componentProps ?? [];

  const setVariables = (next: DesignVariable[]) => dispatch({ type: "variables", variables: next });
  const addVariable = (kind: VariableKind) => {
    const value = kind === "color" ? "#d6ff45" : kind === "number" ? "16" : kind === "boolean" ? "true" : "Label";
    setVariables([...variables, { id: uid("var"), name: kind[0].toUpperCase() + kind.slice(1), kind, value }]);
  };
  const bind = (key: keyof NodeBindings, id: string) => {
    if (!sel) return;
    const bindings = { ...(sel.bindings ?? {}) };
    if (id) bindings[key] = id;
    else delete bindings[key];
    dispatch({ type: "patch", id: sel.id, patch: { bindings } });
  };

  return (
    <>
      {sel && (
        <section>
          <div className="insp-head">
            <span className="insp-name">Structure</span>
          </div>
          <div className="craft-actions">
            {GROUPS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => run(id)}>
                {label}
              </button>
            ))}
          </div>
        </section>
      )}
      {sel && (
        <section>
          <div className="insp-head">
            <span className="insp-name">Component</span>
          </div>
          <div className="craft-actions">
            <button type="button" onClick={() => run("component")}>
              Create component
            </button>
            <button type="button" onClick={() => run("create-variant")}>
              Create variant
            </button>
            <button type="button" onClick={() => run("prop-boolean")}>
              Boolean
            </button>
            <button type="button" onClick={() => run("prop-string")}>
              String
            </button>
            {sel.instanceOf && (
              <button type="button" onClick={() => run("detach")}>
                Detach
              </button>
            )}
          </div>
          {sel.instanceOf && variants.length > 1 && (
            <label className="insp-num">
              <span>Variant</span>
              <select
                aria-label="Variant"
                value={sel.instanceOf}
                onChange={(event) => {
                  const pages = applyVariant(state.doc.pages, sel.id, event.target.value);
                  if (pages) dispatch({ type: "replaceDoc", pages, selectedIds: [sel.id] });
                }}
              >
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.variantName || variant.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {sel.instanceOf &&
            props.map((prop) =>
              prop.kind === "boolean" ? (
                <label key={prop.id} className="insp-check">
                  <input
                    type="checkbox"
                    checked={(sel.variantProps?.[prop.id] ?? "true") !== "false"}
                    onChange={(event) =>
                      dispatch({
                        type: "patch",
                        id: sel.id,
                        patch: { variantProps: { ...(sel.variantProps ?? {}), [prop.id]: event.target.checked ? "true" : "false" } },
                      })
                    }
                  />
                  {prop.name}
                </label>
              ) : (
                <label key={prop.id} className="insp-num">
                  <span>{prop.name}</span>
                  <input
                    aria-label={prop.name}
                    value={sel.variantProps?.[prop.id] ?? ""}
                    onChange={(event) =>
                      dispatch({
                        type: "patch",
                        id: sel.id,
                        patch: { variantProps: { ...(sel.variantProps ?? {}), [prop.id]: event.target.value } },
                      })
                    }
                  />
                </label>
              ),
            )}
          {!sel.instanceOf && props.length > 0 && <p className="insp-meta">{props.map((prop) => `${prop.name} · ${prop.kind}`).join(", ")}</p>}
          {sel.component && variants.length > 1 && (
            <p className="insp-meta">{variants.map((variant) => variant.variantName || variant.name).join(" · ")}</p>
          )}
        </section>
      )}
      <section>
        <div className="insp-head">
          <span className="insp-name">Variables</span>
        </div>
        <div className="craft-actions">
          <button type="button" onClick={() => addVariable("color")}>
            Color
          </button>
          <button type="button" onClick={() => addVariable("number")}>
            Number
          </button>
          <button type="button" onClick={() => addVariable("boolean")}>
            Boolean
          </button>
          <button type="button" onClick={() => addVariable("string")}>
            String
          </button>
        </div>
        {variables.map((variable) => (
          <div key={variable.id} className="var-row">
            <input
              aria-label={`${variable.name} name`}
              value={variable.name}
              onChange={(event) => setVariables(variables.map((item) => (item.id === variable.id ? { ...item, name: event.target.value } : item)))}
            />
            <VariableValue
              variable={variable}
              onChange={(value) => setVariables(variables.map((item) => (item.id === variable.id ? { ...item, value } : item)))}
            />
            <button
              type="button"
              aria-label={`Delete ${variable.name}`}
              onClick={() => setVariables(variables.filter((item) => item.id !== variable.id))}
            >
              ×
            </button>
          </div>
        ))}
        {sel && (
          <>
            <Bind label="Fill" value={sel.bindings?.fill ?? ""} options={variables.filter((item) => item.kind === "color")} onChange={(id) => bind("fill", id)} />
            <Bind label="Text" value={sel.bindings?.text ?? ""} options={variables.filter((item) => item.kind === "string")} onChange={(id) => bind("text", id)} />
            <Bind label="Visible" value={sel.bindings?.visible ?? ""} options={variables.filter((item) => item.kind === "boolean")} onChange={(id) => bind("visible", id)} />
            <Bind label="Radius" value={sel.bindings?.radius ?? ""} options={variables.filter((item) => item.kind === "number")} onChange={(id) => bind("radius", id)} />
          </>
        )}
      </section>
    </>
  );
}

function VariableValue({ variable, onChange }: { variable: DesignVariable; onChange: (value: string) => void }) {
  if (variable.kind === "boolean") {
    return (
      <label className="insp-check">
        <input type="checkbox" checked={variable.value !== "false"} onChange={(event) => onChange(event.target.checked ? "true" : "false")} />
        {variable.value !== "false" ? "True" : "False"}
      </label>
    );
  }
  if (variable.kind === "color") {
    const color = /^#[0-9a-fA-F]{6}$/.test(variable.value) ? variable.value : "#d6ff45";
    return <input aria-label={`${variable.name} color`} type="color" value={color} onChange={(event) => onChange(event.target.value)} />;
  }
  return (
    <input
      aria-label={`${variable.name} value`}
      value={variable.value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function Bind({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: DesignVariable[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="insp-num">
      <span>{label}</span>
      <select aria-label={`${label} variable`} value={options.some((item) => item.id === value) ? value : ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">None</option>
        {options.map((variable) => (
          <option key={variable.id} value={variable.id}>
            {variable.name}
          </option>
        ))}
      </select>
    </label>
  );
}
