[English](./README.md) | **中文**

# @yume-dsl/token-walker

<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />

[![npm](https://img.shields.io/npm/v/@yume-dsl/token-walker)](https://www.npmjs.com/package/@yume-dsl/token-walker)
[![GitHub](https://img.shields.io/badge/GitHub-chiba233%2Fyume--dsl--token--walker-181717?logo=github)](https://github.com/chiba233/yume-dsl-token-walker)

通用的、惰性的、基于 generator 的
[`yume-dsl-rich-text`](https://github.com/chiba233/yumeDSL) token 树解释器。

你提供规则，它遍历树、yield 输出节点，然后闪开。

---

## 生态

| 包                                                           | 角色                     |
|-------------------------------------------------------------|------------------------|
| [`yume-dsl-rich-text`](https://github.com/chiba233/yumeDSL) | 解析器 — 文本到 token 树      |
| **`@yume-dsl/token-walker`**                                | 解释器 — token 树到输出节点（本包） |

---

## 安装

```bash
npm install @yume-dsl/token-walker
# 或
pnpm add @yume-dsl/token-walker
```

`yume-dsl-rich-text` 是依赖项，会自动安装。

---

## 快速上手

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

惰性遍历 `TextToken[]` 树，通过 generator 逐个 yield `TNode`。

```ts
function* interpretTokens<TNode, TEnv>(
  tokens: TextToken[],
  ruleset: InterpretRuleset<TNode, TEnv>,
  env: TEnv,
): Generator<TNode>;
```

- 流式输出 — 节点逐个 yield，内部不缓冲
- 自引用安全 — 检测到 token 自引用时立即抛出
- 循环安全 — `flattenText` 按递归路径追踪已访问 token，共享引用安全，真正的循环会抛出

### `flattenText(value)`

辅助工具。递归提取 `string | TextToken[]` 中的纯文本。

```ts
const flattenText: (value: string | TextToken[]) => string;
```

---

## InterpretRuleset

传给 `interpretTokens` 的规则集：

```ts
interface InterpretRuleset<TNode, TEnv = unknown> {
  createText: (text: string) => TNode;
  interpret: (token: TextToken, helpers: InterpretHelpers<TNode, TEnv>) => InterpretResult<TNode>;
  onUnhandled?: UnhandledStrategy<TNode, TEnv>;
}
```

| 字段            | 说明                                                    |
|---------------|-------------------------------------------------------|
| `createText`  | 将纯字符串包装为你的节点类型                                        |
| `interpret`   | 将 DSL token 映射为解释结果                                   |
| `onUnhandled` | 当 `interpret` 返回 `"unhandled"` 时的处理策略（默认：`"flatten"`） |

---

## InterpretResult

`interpret` 的返回类型：

```ts
type InterpretResult<TNode> =
  | { type: "nodes"; nodes: Iterable<TNode> }
  | { type: "text"; text: string }
  | { type: "flatten" }
  | { type: "unhandled" }
  | { type: "drop" };
```

| 结果            | 含义                                  |
|---------------|-------------------------------------|
| `"nodes"`     | yield 提供的节点                         |
| `"text"`      | 输出指定的文本字符串（显式）                      |
| `"flatten"`   | 将 `token.value` 展平为纯文本后输出           |
| `"unhandled"` | 该 token 没有处理器 — 交给 `onUnhandled` 策略 |
| `"drop"`      | 不输出任何内容                             |

---

## UnhandledStrategy

控制 `interpret` 返回 `{ type: "unhandled" }` 时的行为：

```ts
type UnhandledStrategy<TNode, TEnv = unknown> =
  | "throw"
  | "flatten"
  | "drop"
  | ((token: TextToken, helpers: InterpretHelpers<TNode, TEnv>) => ResolvedResult<TNode>);
```

| 策略          | 行为                                                 |
|-------------|----------------------------------------------------|
| `"throw"`   | 抛出错误                                               |
| `"flatten"` | 展平为纯文本（默认）                                         |
| `"drop"`    | 不输出                                                |
| 函数          | 自定义处理 — 必须返回 `ResolvedResult`（不允许返回 `"unhandled"`） |

`ResolvedResult<TNode>` = `InterpretResult<TNode>` 去掉 `{ type: "unhandled" }`。

---

## InterpretHelpers

传给 `interpret` 和策略函数的辅助对象：

```ts
interface InterpretHelpers<TNode, TEnv = unknown> {
  interpretChildren: (value: string | TextToken[]) => Iterable<TNode>;
  flattenText: (value: string | TextToken[]) => string;
  env: TEnv;
}
```

| 字段                  | 说明                                   |
|---------------------|--------------------------------------|
| `interpretChildren` | 递归解释子 token — 返回惰性 `Iterable<TNode>` |
| `flattenText`       | 从 token value 中提取纯文本                 |
| `env`               | 用户提供的环境对象，从 `interpretTokens` 透传     |

---

## 安全性

- **自引用检测**：如果处理器将 token 自身回传给 `interpretChildren`，立即抛出错误
- **循环引用检测**：`flattenText` 按递归路径追踪已访问 token（非全局），共享引用安全，真正的循环会抛出

---

## 更新日志

### 0.1.0

- 包重命名为 `@yume-dsl/token-walker`
- `renderTokens` → `interpretTokens`，`TokenRenderer` → `InterpretRuleset`
- `defer` → `unhandled`，`empty` → `drop`
- `{ type: "text"; text?: string }` 拆分为 `{ type: "text"; text: string }` + `{ type: "flatten" }`
- `strict` + `fallbackRender` 合并为 `onUnhandled` 策略枚举
- 策略函数返回类型收紧为 `ResolvedResult`（不允许返回 `"unhandled"`）
- 移除 `collectRendered`

---

## 许可证

MIT
