export function uid(prefix = "n"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function walk(nodes: import("../types").DesignNode[], fn: (n: import("../types").DesignNode, parent: import("../types").DesignNode | null) => void, parent: import("../types").DesignNode | null = null) {
  for (const n of nodes) {
    fn(n, parent);
    if (n.children.length) walk(n.children, fn, n);
  }
}

export function findNode(nodes: import("../types").DesignNode[], id: string): import("../types").DesignNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const child = findNode(n.children, id);
    if (child) return child;
  }
  return null;
}

export function findParent(nodes: import("../types").DesignNode[], id: string, parent: import("../types").DesignNode | null = null): import("../types").DesignNode | null {
  for (const n of nodes) {
    if (n.id === id) return parent;
    const found = findParent(n.children, id, n);
    if (found !== undefined && n.children.some((c) => c.id === id || findNode([c], id))) {
      const inner = findParent(n.children, id, n);
      if (inner) return inner;
      if (n.children.some((c) => c.id === id)) return n;
    }
  }
  return null;
}

export function flatten(nodes: import("../types").DesignNode[]): import("../types").DesignNode[] {
  const out: import("../types").DesignNode[] = [];
  walk(nodes, (n) => out.push(n));
  return out;
}

export function updateNode(
  nodes: import("../types").DesignNode[],
  id: string,
  patch: Partial<import("../types").DesignNode>,
): import("../types").DesignNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch };
    if (n.children.length) return { ...n, children: updateNode(n.children, id, patch) };
    return n;
  });
}

export function removeNode(nodes: import("../types").DesignNode[], id: string): import("../types").DesignNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }));
}

export function insertChild(
  nodes: import("../types").DesignNode[],
  parentId: string | null,
  child: import("../types").DesignNode,
): import("../types").DesignNode[] {
  if (!parentId) return [...nodes, child];
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: [...n.children, child] };
    if (n.children.length) return { ...n, children: insertChild(n.children, parentId, child) };
    return n;
  });
}
