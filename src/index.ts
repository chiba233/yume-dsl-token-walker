import type { TextToken } from "yume-dsl-rich-text";

export type RenderResult<TNode> =
  | { type: "tokens"; tokens: Iterable<TNode> }
  | { type: "text"; text?: string }
  | { type: "defer" }
  | { type: "empty" };

export interface RenderHelpers<TNode, TEnv = unknown> {
  renderChildren: (value: string | TextToken[]) => Iterable<TNode>;
  flattenText: (value: string | TextToken[]) => string;
  env: TEnv;
}

export interface TokenRenderer<TNode, TEnv = unknown> {
  createText: (text: string) => TNode;
  render: (token: TextToken, helpers: RenderHelpers<TNode, TEnv>) => RenderResult<TNode>;
  fallbackRender?: (token: TextToken, helpers: RenderHelpers<TNode, TEnv>) => RenderResult<TNode>;
  strict?: boolean;
}

const flattenTokenText = (
  value: string | TextToken[],
  seenValues: WeakSet<object>,
  seenTokens: WeakSet<object>,
): string => {
  if (typeof value === "string") return value;

  if (seenValues.has(value)) {
    throw new Error("Circular DSL token value detected while flattening text");
  }
  seenValues.add(value);
  try {
    return value
      .map((token) => {
        if (seenTokens.has(token)) {
          throw new Error(
            `Circular DSL token detected while flattening text for type "${token.type}"`,
          );
        }
        seenTokens.add(token);
        try {
          return flattenTokenText(token.value, seenValues, seenTokens);
        } finally {
          seenTokens.delete(token);
        }
      })
      .join("");
  } finally {
    seenValues.delete(value);
  }
};

export const flattenText = (value: string | TextToken[]): string =>
  flattenTokenText(value, new WeakSet<object>(), new WeakSet<object>());

const iterateRendered = function* <TNode>(
  result: RenderResult<TNode>,
  createText: (text: string) => TNode,
  token: TextToken,
): Generator<TNode> {
  if (result.type === "tokens") {
    yield* result.tokens;
    return;
  }

  if (result.type === "text") {
    const text = result.text ?? flattenText(token.value);
    yield createText(text);
  }
};

const resolveRenderResult = <TNode, TEnv>(
  token: TextToken,
  renderer: TokenRenderer<TNode, TEnv>,
  helpers: RenderHelpers<TNode, TEnv>,
): RenderResult<TNode> => {
  const result = renderer.render(token, helpers);
  if (result.type !== "defer") return result;

  if (renderer.fallbackRender) {
    return renderer.fallbackRender(token, helpers);
  }

  if (renderer.strict ?? false) {
    throw new Error(`No renderer defined for DSL token type "${token.type}"`);
  }

  return { type: "text" };
};

const renderTokenIterable = function* <TNode, TEnv>(
  tokens: TextToken[],
  renderer: TokenRenderer<TNode, TEnv>,
  helpers: RenderHelpers<TNode, TEnv>,
  activeTokens: WeakSet<object>,
): Generator<TNode> {
  for (const token of tokens) {
    if (token.type === "text") {
      if (typeof token.value === "string") {
        yield renderer.createText(token.value);
      } else {
        yield renderer.createText(flattenText(token.value));
      }
      continue;
    }

    if (activeTokens.has(token)) {
      throw new Error(`Recursive DSL token rendering detected for type "${token.type}"`);
    }

    activeTokens.add(token);
    try {
      const result = resolveRenderResult(token, renderer, helpers);
      yield* iterateRendered(result, renderer.createText, token);
    } finally {
      activeTokens.delete(token);
    }
  }
};

export const renderTokens = function* <TNode, TEnv = unknown>(
  tokens: TextToken[],
  renderer: TokenRenderer<TNode, TEnv>,
  env: TEnv,
): Generator<TNode> {
  const activeTokens = new WeakSet<object>();

  const helpers: RenderHelpers<TNode, TEnv> = {
    renderChildren: (value) =>
      typeof value === "string"
        ? [renderer.createText(value)]
        : renderTokenIterable(value, renderer, helpers, activeTokens),
    flattenText,
    env,
  };

  yield* renderTokenIterable(tokens, renderer, helpers, activeTokens);
};

export const collectRendered = <TNode>(iterable: Iterable<TNode>): TNode[] => Array.from(iterable);
