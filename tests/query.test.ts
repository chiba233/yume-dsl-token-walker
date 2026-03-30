import assert from "node:assert/strict";
import { parseStructural } from "yume-dsl-rich-text";
import type { StructuralNode } from "yume-dsl-rich-text";
import { findFirst, findAll, nodeAtOffset, enclosingNode } from "../src/index.ts";

interface TestCase {
  name: string;
  run: () => void | Promise<void>;
}

// ── Fixtures ──

const tree: StructuralNode[] = [
  { type: "text", value: "before " },
  {
    type: "inline",
    tag: "bold",
    children: [
      { type: "text", value: "hello " },
      {
        type: "inline",
        tag: "italic",
        children: [{ type: "text", value: "world" }],
      },
    ],
  },
  { type: "text", value: " after" },
];

// ── Cases ──

const cases: TestCase[] = [
  // ── findFirst ──
  {
    name: "findFirst: finds first text node",
    run: () => {
      const result = findFirst(tree, (n) => n.type === "text");
      assert.ok(result);
      assert.equal(result.type, "text");
      assert.equal((result as { value: string }).value, "before ");
    },
  },
  {
    name: "findFirst: finds nested node",
    run: () => {
      const result = findFirst(tree, (n) => n.type === "inline" && n.tag === "italic");
      assert.ok(result);
      assert.equal(result.type, "inline");
    },
  },
  {
    name: "findFirst: returns undefined when no match",
    run: () => {
      const result = findFirst(tree, () => false);
      assert.equal(result, undefined);
    },
  },
  {
    name: "findFirst: empty array returns undefined",
    run: () => {
      const result = findFirst([], () => true);
      assert.equal(result, undefined);
    },
  },
  {
    name: "findFirst: context provides parent, depth, index",
    run: () => {
      const result = findFirst(tree, (n, ctx) =>
        n.type === "text" && ctx.parent?.type === "inline" && ctx.depth === 2,
      );
      assert.ok(result);
      assert.equal((result as { value: string }).value, "world");
    },
  },

  // ── findAll ──
  {
    name: "findAll: collects all text nodes",
    run: () => {
      const result = findAll(tree, (n) => n.type === "text");
      assert.equal(result.length, 4);
    },
  },
  {
    name: "findAll: collects by tag name",
    run: () => {
      const result = findAll(tree, (n) => n.type === "inline");
      assert.equal(result.length, 2);
    },
  },
  {
    name: "findAll: no matches returns empty array",
    run: () => {
      const result = findAll(tree, () => false);
      assert.deepEqual(result, []);
    },
  },
  {
    name: "findAll: empty array returns empty array",
    run: () => {
      const result = findAll([], () => true);
      assert.deepEqual(result, []);
    },
  },

  // ── nodeAtOffset ──
  {
    name: "nodeAtOffset: finds deepest node at offset",
    run: () => {
      const input = "before $$bold(hello $$italic(world)$$)$$";
      const nodes = parseStructural(input, { trackPositions: true });
      const result = nodeAtOffset(nodes, 30);
      assert.ok(result);
      assert.equal(result.type, "text");
      assert.equal((result as { value: string }).value, "world");
    },
  },
  {
    name: "nodeAtOffset: finds text at beginning",
    run: () => {
      const input = "before $$bold(hello)$$";
      const nodes = parseStructural(input, { trackPositions: true });
      const result = nodeAtOffset(nodes, 0);
      assert.ok(result);
      assert.equal(result.type, "text");
      assert.equal((result as { value: string }).value, "before ");
    },
  },
  {
    name: "nodeAtOffset: returns undefined for out-of-range offset",
    run: () => {
      const input = "hello";
      const nodes = parseStructural(input, { trackPositions: true });
      const result = nodeAtOffset(nodes, 999);
      assert.equal(result, undefined);
    },
  },
  {
    name: "nodeAtOffset: returns undefined when positions not tracked",
    run: () => {
      const nodes = parseStructural("$$bold(text)$$");
      const result = nodeAtOffset(nodes, 0);
      assert.equal(result, undefined);
    },
  },

  // ── enclosingNode ──
  {
    name: "enclosingNode: finds deepest enclosing tag",
    run: () => {
      const input = "before $$bold(hello $$italic(world)$$)$$";
      const nodes = parseStructural(input, { trackPositions: true });
      const result = enclosingNode(nodes, 30);
      assert.ok(result);
      assert.equal(result.type, "inline");
      assert.equal((result as { tag: string }).tag, "italic");
    },
  },
  {
    name: "enclosingNode: returns outer tag when not inside inner",
    run: () => {
      const input = "$$bold(hello $$italic(world)$$)$$";
      const nodes = parseStructural(input, { trackPositions: true });
      const result = enclosingNode(nodes, 7);
      assert.ok(result);
      assert.equal(result.type, "inline");
      assert.equal((result as { tag: string }).tag, "bold");
    },
  },
  {
    name: "enclosingNode: returns undefined outside all tags",
    run: () => {
      const input = "before $$bold(hello)$$";
      const nodes = parseStructural(input, { trackPositions: true });
      const result = enclosingNode(nodes, 0);
      assert.equal(result, undefined);
    },
  },
  {
    name: "enclosingNode: returns undefined when positions not tracked",
    run: () => {
      const nodes = parseStructural("$$bold(text)$$");
      const result = enclosingNode(nodes, 5);
      assert.equal(result, undefined);
    },
  },
  {
    name: "enclosingNode: works with raw tags",
    run: () => {
      const input = "$$code(js)%\ncontent\n%end$$";
      const nodes = parseStructural(input, { trackPositions: true });
      const result = enclosingNode(nodes, 12);
      assert.ok(result);
      assert.equal(result.type, "raw");
      assert.equal((result as { tag: string }).tag, "code");
    },
  },
  {
    name: "enclosingNode: works with block tags",
    run: () => {
      const input = "$$div()*\ncontent\n*end$$";
      const nodes = parseStructural(input, { trackPositions: true });
      const result = enclosingNode(nodes, 9);
      assert.ok(result);
      assert.equal(result.type, "block");
      assert.equal((result as { tag: string }).tag, "div");
    },
  },
];

// ── Runner ──

const run = async () => {
  for (const testCase of cases) {
    try {
      await testCase.run();
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      console.error(`FAIL ${testCase.name}`);
      throw error;
    }
  }
  console.log(`PASS ${cases.length} 个query case`);
};

await run();
