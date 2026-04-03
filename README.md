**English** | [中文](GUIDE.zh-CN.md)

# yume-dsl-token-walker

<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />

[![npm](https://img.shields.io/npm/v/yume-dsl-token-walker)](https://www.npmjs.com/package/yume-dsl-token-walker)
[![GitHub](https://img.shields.io/badge/GitHub-chiba233%2Fyume--dsl--token--walker-181717?logo=github)](https://github.com/chiba233/yume-dsl-token-walker)
[![CI](https://github.com/chiba233/yume-dsl-token-walker/actions/workflows/publish-yume-dsl-token-walker.yml/badge.svg)](https://github.com/chiba233/yume-dsl-token-walker/actions/workflows/publish-yume-dsl-token-walker.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Wiki](https://img.shields.io/badge/Wiki-docs-6A57D5?logo=gitbook&logoColor=white)](https://github.com/chiba233/yume-dsl-token-walker/wiki/)
[![Contributing](https://img.shields.io/badge/Contributing-guide-blue.svg)](./CONTRIBUTING.md)
[![Security](https://img.shields.io/badge/Security-policy-red.svg)](./SECURITY.md)

Zero-dependency operation layer for [`yume-dsl-rich-text`](https://github.com/chiba233/yumeDSL).
Parser gives you trees — this package interprets, queries, lints, and slices them.

- **Not** a renderer — is a framework-agnostic tree machine that yields whatever output type you define
- Lazy `Generator` / `AsyncGenerator` throughout — stream thousands of tokens without buffering
- Recursion-safe, circular-reference-safe — detects self-referencing tokens and cycles before they blow the stack
- Sync + async interpret with identical semantics — swap `interpretTokens` ↔ `interpretTokensAsync` without rewriting rules
- Structural query in O(n) single DFS — `findFirst` early-exits, `nodeAtOffset` / `enclosingNode` binary-narrow then walk
- Lint framework with atomic all-or-nothing auto-fix — overlapping edits are rejected per-fix, not per-edit
- Region re-parse via `parseSlice` — ideal for editor and incremental workflows, only reparses the touched region

> **200 KB benchmark (Kunpeng 920 / Node v24.14.0):** full-document parsing is already fast (`parseRichText` ~24 ms, `parseStructural` ~21 ms). `nodeAtOffset` + `parseSlice` is still the right tool for editor and incremental workflows at **~0.17 ms**, because it reparses only the touched region. Interpret 10,000 tokens → HTML string in **~2 ms**. Lint 50 rules against a 200 KB document in **~45 ms**.

## Ecosystem

```
text ──▶ yume-dsl-rich-text (parse) ──▶ TextToken[] / StructuralNode[]
                                              │
                                  yume-dsl-token-walker
                                   ├─ interpret  (TextToken[] → TNode[])
                                   ├─ query      (StructuralNode[] search)
                                   ├─ lint       (StructuralNode[] validation)
                                   └─ slice      (region re-parse)
```

| Package                                                                            | Role                                                     |
|------------------------------------------------------------------------------------|----------------------------------------------------------|
| [`yume-dsl-rich-text`](https://github.com/chiba233/yumeDSL)                        | Parser — text to token tree                              |
| **`yume-dsl-token-walker`**                                                        | Operations — interpret, query, lint, slice (this package) |
| [`yume-dsl-shiki-highlight`](https://github.com/chiba233/yume-dsl-shiki-highlight) | Syntax highlighting — tokens or TextMate grammar         |
| [`yume-dsl-markdown-it`](https://github.com/chiba233/yume-dsl-markdown-it)         | markdown-it plugin — DSL tags inside Markdown            |

---

## Quick Navigation

**Start here:**
[Install](#install) · [Quick Start](#quick-start) · [Where to start](#where-to-start)

**API:**
[Interpret](#interpret) · [Async Interpret](#async-interpret) · [Structural Query](#structural-query) · [Lint](#lint) · [Structural Slice](#structural-slice)

**Reference:**
[Error Handling & Safety](#error-handling--safety) · [Exports](#exports) · [Changelog](#changelog)

**Hands-on tutorials** — step-by-step guides on the [Wiki](https://github.com/chiba233/yume-dsl-token-walker/wiki/):

- [Building a Blog Renderer from Scratch](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Tutorial-Blog-Renderer) — from zero to a working DSL → HTML pipeline
- [Game Dialogue Engine](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Tutorial-Game-Dialogue) — shake / color / wait commands for a visual novel typewriter
- [Editor Lint + Auto-fix](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Tutorial-Editor-Lint) — custom lint rules, diagnostics, atomic auto-fix

---

## Install

```bash
npm install yume-dsl-token-walker
pnpm add yume-dsl-token-walker
```

`yume-dsl-rich-text` is a dependency and will be installed automatically.

---

## Quick Start

```ts
import { createParser, createSimpleInlineHandlers } from "yume-dsl-rich-text";
import { interpretText, collectNodes } from "yume-dsl-token-walker";

const parser = createParser({
    handlers: createSimpleInlineHandlers(["bold", "italic"]),
});

const html = collectNodes(
    interpretText("Hello $$bold($$italic(world)$$)$$!", parser, {
        createText: (text) => text,
        interpret: (token, helpers) => {
            if (token.type === "bold")
                return { type: "nodes", nodes: ["<b>", ...helpers.interpretChildren(token.value), "</b>"] };
            if (token.type === "italic")
                return { type: "nodes", nodes: ["<em>", ...helpers.interpretChildren(token.value), "</em>"] };
            return { type: "unhandled" };
        },
    }, undefined),
).join("");

// → "Hello <b><em>world</em></b>!"
```

For direct `TextToken[]` input, use `interpretTokens(...)`.

### Recommended reading order

1. **Quick Start** (you are here)
2. [Interpret](#interpret) — core API, types, helpers
3. [Structural Query](#structural-query) — search trees
4. [Lint](#lint) — validate + auto-fix
5. [Structural Slice](#structural-slice) — incremental parsing

---

## Where to start

| You want to… | Read |
|---|---|
| Turn `TextToken[]` into HTML / VNodes / strings | [Interpret](#interpret) or [Async Interpret](#async-interpret) |
| Search / locate nodes in a `StructuralNode[]` tree | [Structural Query](#structural-query) |
| Validate DSL source with custom rules + auto-fix | [Lint](#lint) |
| Re-parse a region without full-document re-parse | [Structural Slice](#structural-slice) |

---

## Interpret

Walk a `TextToken[]` tree and yield arbitrary output nodes.

### Core API

```ts
function* interpretText<TNode, TEnv>(
    input: string, parser: ParserLike,
    ruleset: InterpretRuleset<TNode, TEnv>, env: TEnv,
): Generator<TNode>;

function* interpretTokens<TNode, TEnv>(
    tokens: TextToken[], ruleset: InterpretRuleset<TNode, TEnv>, env: TEnv,
): Generator<TNode>;
```

`interpretText` is sugar for `parser.parse(input)` + `interpretTokens(...)`.

### InterpretResult — what your handler returns

| Result | Meaning | When to use |
|--------|---------|-------------|
| `{ type: "nodes", nodes: [...] }` | Yield these nodes | Most cases — wrap children, add tags |
| `{ type: "text", text: "..." }` | Yield a text node | Output specific text, don't recurse children |
| `{ type: "flatten" }` | Flatten token.value to plain text | Search index, aria label, preview |
| `{ type: "drop" }` | Emit nothing | Comment, metadata |
| `{ type: "unhandled" }` | Delegate to onUnhandled strategy | You don't recognize this tag |

### InterpretRuleset

```ts
interface InterpretRuleset<TNode, TEnv = unknown> {
    createText: (text: string) => TNode;
    interpret: (token: TextToken, helpers: InterpretHelpers<TNode, TEnv>) => InterpretResult<TNode>;
    onUnhandled?: UnhandledStrategy<TNode, TEnv>;
    onError?: (context: { error: Error; phase: "interpret" | "flatten" | "traversal" | "internal"; token?: TextToken; position?: SourceSpan; env: TEnv }) => void;
}
```

| Field | Description |
|-------|-------------|
| `createText` | Wrap a plain string into your node type |
| `interpret` | Map a DSL token to an interpret result |
| `onUnhandled` | `"throw"` / `"flatten"` (default) / `"drop"` / custom function |
| `onError` | Optional observer called before any error is thrown |

### InterpretHelpers

```ts
interface InterpretHelpers<TNode, TEnv = unknown> {
    interpretChildren: (value: string | TextToken[]) => Iterable<TNode>;
    flattenText: (value: string | TextToken[]) => string;
    env: TEnv;
}
```

| Field | Description |
|-------|-------------|
| `interpretChildren` | Recursively interpret child tokens — returns lazy `Iterable<TNode>` |
| `flattenText` | Extract plain text from a token value |
| `env` | User-provided environment, passed through from `interpretTokens` |

### Example: `fromHandlerMap` + `env`

```ts
import { createRuleset, fromHandlerMap, interpretTokens, collectNodes } from "yume-dsl-token-walker";

interface Env { theme: "light" | "dark" }

const ruleset = createRuleset<string, Env>({
    createText: (text) => text,
    interpret: fromHandlerMap({
        bold: (token, h) => {
            const color = h.env.theme === "dark" ? "#fff" : "#000";
            return { type: "nodes", nodes: [`<b style="color:${color}">`, ...h.interpretChildren(token.value), "</b>"] };
        },
        italic: (token, h) => ({ type: "nodes", nodes: ["<em>", ...h.interpretChildren(token.value), "</em>"] }),
    }),
    onUnhandled: "flatten",
});

const html = collectNodes(interpretTokens(tokens, ruleset, { theme: "dark" })).join("");
```

### Example: plain text extraction

```ts
import { flattenText } from "yume-dsl-token-walker";

const plain = flattenText(tokens);
// "Hello world" — no ruleset needed, standalone utility
```

Use for search indexes, aria labels, RSS feeds, notification previews.

### Helpers

| Helper | Description |
|--------|-------------|
| `createRuleset(ruleset)` | Identity function for type inference |
| `fromHandlerMap(handlers)` | Build `interpret` from a `Record<type, handler>` map |
| `dropToken` | Ready-made handler: emit nothing |
| `unwrapChildren` | Ready-made handler: pass through children |
| `wrapHandlers(handlers, wrap)` | Wrap every handler with shared logic |
| `debugUnhandled(format?)` | `onUnhandled` function that renders visible placeholders |
| `collectNodes(iterable)` | `Array.from` sugar for generators |

See the [Interpret wiki](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Interpret) for
three complete demos (HTML / custom AST / plain text), onUnhandled strategies, recommended project structure,
and the [Blog Renderer tutorial](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Tutorial-Blog-Renderer)
for a step-by-step walkthrough.

---

## Async Interpret

Same semantics as sync — but `interpret` can `await`, and `interpretChildren` returns `AsyncIterable`.

```ts
import { interpretTextAsync, collectNodesAsync } from "yume-dsl-token-walker";

const html = (
    await collectNodesAsync(
        interpretTextAsync("Hello $$bold(world)$$", parser, {
            createText: (text) => text,
            interpret: async (token, helpers) => {
                if (token.type === "bold") {
                    return {
                        type: "nodes",
                        nodes: (async function* () {
                            yield "<b>";
                            yield* helpers.interpretChildren(token.value);
                            yield "</b>";
                        })(),
                    };
                }
                return { type: "unhandled" };
            },
        }, undefined),
    )
).join("");
```

**Design:**
- `createText` is always synchronous — text wrapping is a pure operation
- `interpret` and `onUnhandled` strategy functions may return `Promise`
- `nodes` can be `Iterable` or `AsyncIterable` — plain arrays and async generators both work

Async helpers: `fromAsyncHandlerMap`, `wrapAsyncHandlers`, `collectNodesAsync`.

See the [Async Interpret wiki](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Async-Interpret) for
full type reference and the [Game Dialogue tutorial](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Tutorial-Game-Dialogue)
for async portrait fetching.

---

## Structural Query

Search and locate nodes in a `StructuralNode[]` tree from `parseStructural`.

### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `findFirst` | `(nodes, predicate) => StructuralNode \| undefined` | DFS — first match, early-exit |
| `findAll` | `(nodes, predicate) => StructuralNode[]` | DFS — all matches |
| `walkStructural` | `(nodes, visitor) => void` | DFS — visit every node with context |
| `nodeAtOffset` | `(nodes, offset) => StructuralNode \| undefined` | Deepest node at source offset |
| `nodePathAtOffset` | `(nodes, offset) => StructuralNode[]` | Full path from root to deepest node at offset |
| `enclosingNode` | `(nodes, offset) => StructuralTagNode \| undefined` | Deepest **tag** node (skips text/escape) |

### Example: editor cursor location

```ts
import { parseStructural } from "yume-dsl-rich-text";
import { enclosingNode } from "yume-dsl-token-walker";

const source = "Hello $$bold($$italic(world)$$)$$!";
const tree = parseStructural(source, { trackPositions: true });

const tag = enclosingNode(tree, 22);
// tag.tag === "italic" — the deepest enclosing tag
```

### Example: find all bold tags

```ts
import { findAll } from "yume-dsl-token-walker";

const bolds = findAll(tree, (node) => node.type === "inline" && node.tag === "bold");
```

### StructuralVisitContext

```ts
interface StructuralVisitContext {
    parent: StructuralNode | null;
    depth: number;
    index: number;
}
```

See the [Structural Query wiki](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Structural-Query) for
child traversal rules, `nodeAtOffset` vs `enclosingNode` comparison, and `walkStructural` examples.

---

## Lint

Run custom rules against DSL source, report diagnostics, apply auto-fixes atomically.

### Quick Start

```ts
import { lintStructural, applyLintFixes, type LintRule } from "yume-dsl-token-walker";

const noEmptyTag: LintRule = {
    id: "no-empty-tag",
    severity: "warning",
    check: (ctx) => {
        ctx.walk(ctx.tree, (node) => {
            if (node.type === "inline" && node.children.length === 0 && node.position) {
                ctx.report({
                    message: `Empty inline tag: ${node.tag}`,
                    span: node.position,
                    node,
                    fix: { description: "Remove empty tag", edits: [{ span: node.position, newText: "" }] },
                });
            }
        });
    },
};

const diagnostics = lintStructural("Hello $$bold()$$ world", { rules: [noEmptyTag] });
const fixed = applyLintFixes("Hello $$bold()$$ world", diagnostics);
// fixed === "Hello  world"
```

### LintOptions

```ts
interface LintOptions {
    rules: LintRule[];
    overrides?: Record<string, DiagnosticSeverity | "off">;
    parseOptions?: Omit<StructuralParseOptions, "trackPositions">;
    onRuleError?: (context: { ruleId: string; error: unknown }) => void;
    failFast?: boolean;
}
```

| Field | Description |
|-------|-------------|
| `rules` | Rules to run |
| `overrides` | Override severity per rule id — `"off"` to disable |
| `parseOptions` | Forwarded to `parseStructural` — pass same config as your runtime parser |
| `onRuleError` | Called when a rule throws; error swallowed, other rules continue |
| `failFast` | `true` → abort immediately on rule error. Takes precedence over `onRuleError` |

**Error behavior at a glance:**
- **Default:** rule throws → swallowed, other rules continue
- **`onRuleError`:** rule throws → your callback is called, other rules continue
- **`failFast: true`:** rule throws → `lintStructural` immediately rethrows

### Key types

```ts
interface LintRule { id: string; severity?: DiagnosticSeverity; check: (ctx: LintContext) => void; }
interface LintContext { source: string; tree: StructuralNode[]; report: (info: ReportInfo) => void; findFirst; findAll; walk; }
interface Diagnostic { ruleId: string; severity: DiagnosticSeverity; message: string; span: SourceSpan; node?: StructuralNode; fix?: Fix; }
interface Fix { description: string; edits: TextEdit[]; }
interface TextEdit { span: SourceSpan; newText: string; }
type DiagnosticSeverity = "error" | "warning" | "info" | "hint";
```

See the [Lint wiki](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Lint) for multi-rule lint,
severity overrides, applyLintFixes conflict strategy, and the
[Editor Lint tutorial](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Tutorial-Editor-Lint)
for a CI-ready pipeline.

---

## Structural Slice

Re-parse only the region you touched. Full parsing is already fast, but `parseSlice` is for cursor-local and incremental workflows where reparsing the whole document is unnecessary. `parseStructural` gives you the map; `parseSlice` jumps to any point.

```ts
import { createParser, createSimpleInlineHandlers, buildPositionTracker } from "yume-dsl-rich-text";
import { parseSlice } from "yume-dsl-token-walker";

const parser = createParser({ handlers: createSimpleInlineHandlers(["bold"]) });
const fullText = "intro\n$$bold(hello world)$$\noutro";

const structural = parser.structural(fullText, { trackPositions: true });
const tracker = buildPositionTracker(fullText);

const boldNode = structural.find((n) => n.type === "inline" && n.tag === "bold");
if (boldNode?.position) {
    const tokens = parseSlice(fullText, boldNode.position, parser, tracker);
    // tokens have correct offset/line/column relative to fullText
}
```

### API

```ts
function parseSlice(fullText: string, span: SourceSpan, parser: ParserLike, tracker?: PositionTracker): TextToken[];
```

Without `tracker`: offset correct, line/column local to slice. With `tracker`: all three correct.
Build the tracker **once** with `buildPositionTracker(fullText)` — only rebuild when newlines change.

### Performance (200 KB document)

| Step | Time |
|------|------|
| Full `parseRichText` | ~24 ms |
| `parseStructural` + tracking | ~31 ms |
| `nodeAtOffset` + `parseSlice` | ~0.17 ms (cursor-local reparse) |
| `buildPositionTracker` (rebuild) | ~1.06 ms (only when newlines change) |

See the [Structural Slice wiki](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Structural-Slice) for
the full incremental pipeline demo with interpret.

---

## Error Handling & Safety

`onError` is called **before** an error is thrown — it observes but does not suppress:

```ts
const ruleset = {
    createText: (text: string) => text,
    interpret: () => ({ type: "unhandled" as const }),
    onUnhandled: "throw" as const,
    onError: ({ error, phase, position }) => {
        console.error(`[${phase}] ${error.message}`, position?.start);
    },
};
```

**Error phases:** `"interpret"` · `"flatten"` · `"traversal"` · `"internal"`

**Safety guarantees:**
- **Self-recursion detection** — token fed back into `interpretChildren` → throws before stack overflow
- **Circular value detection** — `flattenText` tracks per-path; shared refs safe, true cycles throw
- **Text token validation** — non-string `value` on text tokens → throws instead of producing garbage

> `flattenText()` is standalone and does **not** go through `onError`.

See the [Error Handling wiki](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Error-Handling)
for logging demos, error phase table, and safety implementation details.

---

## Exports

| Category | Exports |
|----------|---------|
| **Sync** | `interpretText`, `interpretTokens`, `flattenText`, `createRuleset`, `fromHandlerMap`, `dropToken`, `unwrapChildren`, `wrapHandlers`, `debugUnhandled`, `collectNodes` |
| **Structural query** | `findFirst`, `findAll`, `walkStructural`, `nodeAtOffset`, `nodePathAtOffset`, `enclosingNode` |
| **Lint** | `lintStructural`, `applyLintFixes` |
| **Structural slice** | `parseSlice` |
| **Async** | `interpretTextAsync`, `interpretTokensAsync`, `fromAsyncHandlerMap`, `wrapAsyncHandlers`, `collectNodesAsync` |
| **Types** | `InterpretRuleset`, `InterpretResult`, `ResolvedResult`, `InterpretHelpers`, `UnhandledStrategy`, `TokenHandler`, `TextResult`, `ParserLike`, `ParseOverrides`, `StructuralTagNode`, `StructuralVisitContext`, `StructuralPredicate`, `StructuralVisitor`, `LintRule`, `LintContext`, `LintOptions`, `Diagnostic`, `DiagnosticSeverity`, `Fix`, `TextEdit`, `ReportInfo`, `AsyncInterpretRuleset`, `AsyncInterpretResult`, `AsyncResolvedResult`, `AsyncInterpretHelpers`, `AsyncUnhandledStrategy`, `AsyncTokenHandler`, `Awaitable` |

See the [Exports wiki](https://github.com/chiba233/yume-dsl-token-walker/wiki/en-Exports) for
full signatures, descriptions, and wiki links per export.

---

## Changelog

See [CHANGELOG](./CHANGELOG.md) for the full history.

---

## License

MIT
