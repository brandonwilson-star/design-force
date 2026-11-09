import type { DesignNode, DesignVariable } from "../types";

export function resolveTree(nodes: DesignNode[], variables: DesignVariable[] | undefined): DesignNode[] {
  const byId = new Map((variables ?? []).map((variable) => [variable.id, variable]));
  const mains = new Map<string, DesignNode>();
  const collect = (list: DesignNode[]) => {
    for (const node of list) {
      if (node.component) mains.set(node.id, node);
      if (node.children.length) collect(node.children);
    }
  };
  collect(nodes);

  const apply = (node: DesignNode): DesignNode => {
    let fill = node.fill;
    let text = node.text;
    let visible = node.visible;
    let radius = node.radius;
    let opacity = node.opacity;
    const bindings = node.bindings;
    if (bindings?.fill) {
      const variable = byId.get(bindings.fill);
      if (variable?.kind === "color") fill = variable.value;
    }
    if (bindings?.text) {
      const variable = byId.get(bindings.text);
      if (variable?.kind === "string") text = variable.value;
    }
    if (bindings?.visible) {
      const variable = byId.get(bindings.visible);
      if (variable?.kind === "boolean") visible = variable.value !== "false";
    }
    if (bindings?.radius) {
      const variable = byId.get(bindings.radius);
      if (variable?.kind === "number") radius = Number(variable.value) || 0;
    }
    if (bindings?.opacity) {
      const variable = byId.get(bindings.opacity);
      if (variable?.kind === "number") {
        const amount = Number(variable.value);
        opacity = amount > 1 ? Math.min(1, amount / 100) : Math.max(0, amount);
      }
    }
    const definition = node.instanceOf ? mains.get(node.instanceOf)?.componentProps : node.componentProps;
    const props = node.variantProps;
    if (definition && props) {
      for (const prop of definition) {
        if (prop.targetName !== node.name || props[prop.id] == null) continue;
        if (prop.kind === "boolean") visible = props[prop.id] !== "false";
        if (prop.kind === "string") text = props[prop.id];
      }
    }
    const children = node.children.map((child) => {
      let next = child;
      if (definition && props) {
        for (const prop of definition) {
          if (prop.targetName !== child.name || props[prop.id] == null) continue;
          if (prop.kind === "boolean") next = { ...next, visible: props[prop.id] !== "false" };
          if (prop.kind === "string" && next.type === "text") next = { ...next, text: props[prop.id] };
        }
      }
      return apply(next);
    });
    return { ...node, fill, text, visible, radius, opacity, children };
  };

  return nodes.map(apply);
}
