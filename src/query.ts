import type { StructuralNode } from "yume-dsl-rich-text";

export interface StructuralVisitContext {
  parent: StructuralNode | null;
  depth: number;
  index: number;
}

export type StructuralPredicate = (
  node: StructuralNode,
  ctx: StructuralVisitContext,
) => boolean;

/**
 * A `StructuralNode` whose type is one of the tag forms: inline, raw, or block.
 */
export type StructuralTagNode = Extract<StructuralNode, { type: "inline" | "raw" | "block" }>;

// ── Internal helpers ──

const getChildGroups = (node: StructuralNode): StructuralNode[][] => {
  switch (node.type) {
    case "text":
    case "escape":
    case "separator":
      return [];
    case "inline":
      return [node.children];
    case "raw":
      return [node.args];
    case "block":
      return [node.args, node.children];
  }
};

// ── findFirst ──

const walkFirst = (
  nodes: StructuralNode[],
  predicate: StructuralPredicate,
  parent: StructuralNode | null,
  depth: number,
): StructuralNode | undefined => {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (predicate(node, { parent, depth, index: i })) return node;
    for (const group of getChildGroups(node)) {
      const found = walkFirst(group, predicate, node, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
};

/**
 * Depth-first pre-order search. Returns the first node matching the predicate, or `undefined`.
 */
export const findFirst = (
  nodes: StructuralNode[],
  predicate: StructuralPredicate,
): StructuralNode | undefined => walkFirst(nodes, predicate, null, 0);

// ── findAll ──

const walkAll = (
  nodes: StructuralNode[],
  predicate: StructuralPredicate,
  parent: StructuralNode | null,
  depth: number,
  result: StructuralNode[],
): void => {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (predicate(node, { parent, depth, index: i })) result.push(node);
    for (const group of getChildGroups(node)) {
      walkAll(group, predicate, node, depth + 1, result);
    }
  }
};

/**
 * Depth-first pre-order search. Returns all nodes matching the predicate.
 */
export const findAll = (
  nodes: StructuralNode[],
  predicate: StructuralPredicate,
): StructuralNode[] => {
  const result: StructuralNode[] = [];
  walkAll(nodes, predicate, null, 0, result);
  return result;
};

// ── nodeAtOffset ──

const walkAtOffset = (
  nodes: StructuralNode[],
  offset: number,
  best: StructuralNode | undefined,
): StructuralNode | undefined => {
  for (const node of nodes) {
    const pos = node.position;
    if (!pos) continue;
    if (offset < pos.start.offset || offset >= pos.end.offset) continue;
    best = node;
    for (const group of getChildGroups(node)) {
      best = walkAtOffset(group, offset, best);
    }
  }
  return best;
};

/**
 * Find the deepest node whose source span contains the given source offset.
 *
 * The offset must be a string index into the **original source text** that was
 * passed to `parseStructural` — not an offset into rendered, printed, or
 * display text.
 *
 * Requires nodes parsed with `trackPositions: true`.
 * Returns `undefined` if no node contains the offset or positions are absent.
 */
export const nodeAtOffset = (
  nodes: StructuralNode[],
  offset: number,
): StructuralNode | undefined => walkAtOffset(nodes, offset, undefined);

// ── enclosingNode ──

const isTagNode = (node: StructuralNode): node is StructuralTagNode =>
  node.type === "inline" || node.type === "raw" || node.type === "block";

const walkEnclosing = (
  nodes: StructuralNode[],
  offset: number,
  best: StructuralTagNode | undefined,
): StructuralTagNode | undefined => {
  for (const node of nodes) {
    const pos = node.position;
    if (!pos) continue;
    if (offset < pos.start.offset || offset >= pos.end.offset) continue;
    if (isTagNode(node)) best = node;
    for (const group of getChildGroups(node)) {
      best = walkEnclosing(group, offset, best);
    }
  }
  return best;
};

/**
 * Find the deepest tag node (inline / raw / block) whose source span
 * contains the given source offset.
 *
 * Unlike {@link nodeAtOffset}, this skips text, escape, and separator nodes —
 * it returns only structurally meaningful "enclosing" tag nodes.
 *
 * The offset must be a string index into the **original source text** that was
 * passed to `parseStructural` — not an offset into rendered, printed, or
 * display text.
 *
 * Requires nodes parsed with `trackPositions: true`.
 * Returns `undefined` if the offset is not inside any tag, or positions are absent.
 */
export const enclosingNode = (
  nodes: StructuralNode[],
  offset: number,
): StructuralTagNode | undefined => walkEnclosing(nodes, offset, undefined);
