**English** | [中文](./README.zh-CN.md)

# @yume-dsl/token-walker

<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />

[![npm](https://img.shields.io/npm/v/@yume-dsl/token-walker)](https://www.npmjs.com/package/@yume-dsl/token-walker)
[![GitHub](https://img.shields.io/badge/GitHub-chiba233%2Fyume--dsl--token--walker-181717?logo=github)](https://github.com/chiba233/yume-dsl-token-walker)

A generic, lazy, generator-based token tree interpreter for
[`yume-dsl-rich-text`](https://github.com/chiba233/yumeDSL).

You provide rules. It walks the tree, yields output nodes, and gets out of the way.

---

## Ecosystem

| Package                                                     | Role                                                    |
|-------------------------------------------------------------|---------------------------------------------------------|
| [`yume-dsl-rich-text`](https://github.com/chiba233/yumeDSL) | Parser — text to token tree                             |
| **`@yume-dsl/token-walker`**                                | Interpreter — token tree to output nodes (this package) |

---

## Install

```bash
npm install @yume-dsl/token-walker
# or
pnpm add @yume-dsl/token-walker
```

`yume-dsl-rich-text` is a dependency and will be installed automatically.

---

## Quick Start

```ts
import { parseRichText, createSimpleInlineHandlers } from "yume-dsl-rich-text";
import { interpretTokens } from "@yume-dsl/token-walker";

const handlers = createSimpleInlineHandlers(["bold", "italic"]);
const tokens = parseRichText("$$bold(a $$italic(b)$$ c)$$", { handlers });

const html = Array.from(
  interpretTokens(tokens, {
    createText: (text) => text,
    interpret: (token, helpers) => {
      if (token.type === "bold")
        return { type: "nodes", nodes: ["<strong>", ...helpers.interpretChildren(token.value), "</strong>"] };
      if (token.type === "italic")
        return { type: "nodes", nodes: ["<em>", ...helpers.interpretChildren(token.value), "</em>"] };
      return { type: "unhandled" };
    },
  }, {}),
).join("");

// → "<strong>a <em>b</em> c</strong>"
```

---

## API

### `interpretTokens(tokens, ruleset, env)`

Lazily walks a `TextToken[]` tree and yields `TNode` values via a generator.

```ts
function* interpretTokens<TNode, TEnv>(
  tokens: TextToken[],
  ruleset: InterpretRuleset<TNode, TEnv>,
  env: TEnv,
): Generator<TNode>;
```

- Streaming — nodes are yielded one at a time, never buffered
- Recursion-safe — detects self-referencing tokens and throws
- Circular-safe — detects circular `value` arrays during `flattenText` and throws

### `flattenText(value)`

Companion utility. Recursively extracts plain text from a `string | TextToken[]` value.

```ts
const flattenText: (value: string | TextToken[]) => string;
```

---

## InterpretRuleset

The ruleset you pass to `interpretTokens`:

```ts
interface InterpretRuleset<TNode, TEnv = unknown> {
  createText: (text: string) => TNode;
  interpret: (token: TextToken, helpers: InterpretHelpers<TNode, TEnv>) => InterpretResult<TNode>;
  onUnhandled?: UnhandledStrategy<TNode, TEnv>;
}
```

| Field         | Description                                                              |
|---------------|--------------------------------------------------------------------------|
| `createText`  | Wrap a plain string into your node type                                  |
| `interpret`   | Map a DSL token to an interpret result                                   |
| `onUnhandled` | What to do when `interpret` returns `"unhandled"` (default: `"flatten"`) |

---

## InterpretResult

The return type of `interpret`:

```ts
type InterpretResult<TNode> =
  | { type: "nodes"; nodes: Iterable<TNode> }
  | { type: "text"; text: string }
  | { type: "flatten" }
  | { type: "unhandled" }
  | { type: "drop" };
```

| Result        | Meaning                                                        |
|---------------|----------------------------------------------------------------|
| `"nodes"`     | Yield the provided nodes                                       |
| `"text"`      | Emit a specific text string (explicit)                         |
| `"flatten"`   | Flatten `token.value` to plain text and emit                   |
| `"unhandled"` | This token has no handler — delegate to `onUnhandled` strategy |
| `"drop"`      | Emit nothing                                                   |

---

## UnhandledStrategy

Controls what happens when `interpret` returns `{ type: "unhandled" }`:

```ts
type UnhandledStrategy<TNode, TEnv = unknown> =
  | "throw"
  | "flatten"
  | "drop"
  | ((token: TextToken, helpers: InterpretHelpers<TNode, TEnv>) => ResolvedResult<TNode>);
```

| Strategy    | Behavior                                                                      |
|-------------|-------------------------------------------------------------------------------|
| `"throw"`   | Throw an error                                                                |
| `"flatten"` | Flatten to plain text (default)                                               |
| `"drop"`    | Emit nothing                                                                  |
| function    | Custom resolution — must return a `ResolvedResult` (no `"unhandled"` allowed) |

`ResolvedResult<TNode>` = `InterpretResult<TNode>` minus `{ type: "unhandled" }`.

---

## InterpretHelpers

Passed to `interpret` and strategy functions:

```ts
interface InterpretHelpers<TNode, TEnv = unknown> {
  interpretChildren: (value: string | TextToken[]) => Iterable<TNode>;
  flattenText: (value: string | TextToken[]) => string;
  env: TEnv;
}
```

| Field               | Description                                                         |
|---------------------|---------------------------------------------------------------------|
| `interpretChildren` | Recursively interpret child tokens — returns lazy `Iterable<TNode>` |
| `flattenText`       | Extract plain text from a token value                               |
| `env`               | User-provided environment, passed through from `interpretTokens`    |

---

## Safety

- **Self-recursion detection**: if a handler feeds a token back into `interpretChildren` referencing itself, an error is
  thrown immediately
- **Circular value detection**: `flattenText` tracks visited tokens per recursion path (not globally), so shared references are safe but true cycles throw

---

## Changelog

### 0.1.0

- Renamed package to `@yume-dsl/token-walker`
- `renderTokens` → `interpretTokens`, `TokenRenderer` → `InterpretRuleset`
- `defer` → `unhandled`, `empty` → `drop`
- Split `{ type: "text"; text?: string }` into `{ type: "text"; text: string }` + `{ type: "flatten" }`
- Replaced `strict` + `fallbackRender` with `onUnhandled` strategy enum
- Strategy function return type narrowed to `ResolvedResult` (cannot return `"unhandled"`)
- Removed `collectRendered`

---

## License

MIT
