import type { TextToken } from "yume-dsl-rich-text";

// ── Result ──

export type InterpretResult<TNode> =
  | { type: "nodes"; nodes: Iterable<TNode> }
  | { type: "text"; text: string }
  | { type: "flatten" }
  | { type: "unhandled" }
  | { type: "drop" };

export type ResolvedResult<TNode> = Exclude<InterpretResult<TNode>, { type: "unhandled" }>;

// ── Helpers ──

export interface InterpretHelpers<TNode, TEnv = unknown> {
  interpretChildren: (value: string | TextToken[]) => Iterable<TNode>;
  flattenText: (value: string | TextToken[]) => string;
  env: TEnv;
}

// ── Strategy ──

export type UnhandledStrategy<TNode, TEnv = unknown> =
  | "throw"
  | "flatten"
  | "drop"
  | ((token: TextToken, helpers: InterpretHelpers<TNode, TEnv>) => ResolvedResult<TNode>);

// ── Ruleset ──

export interface InterpretRuleset<TNode, TEnv = unknown> {
  createText: (text: string) => TNode;
  interpret: (token: TextToken, helpers: InterpretHelpers<TNode, TEnv>) => InterpretResult<TNode>;
  onUnhandled?: UnhandledStrategy<TNode, TEnv>;
}

// ── Companion utility: flattenText ──

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

// ── Internal: resolve & iterate ──

const iterateResolved = function* <TNode, TEnv>(
  result: ResolvedResult<TNode>,
  ruleset: InterpretRuleset<TNode, TEnv>,
  helpers: InterpretHelpers<TNode, TEnv>,
  token: TextToken,
): Generator<TNode> {
  switch (result.type) {
    case "nodes":
      yield* result.nodes;
      return;
    case "text":
      yield ruleset.createText(result.text);
      return;
    case "flatten":
      yield ruleset.createText(helpers.flattenText(token.value));
      return;
    case "drop":
      return;
    default:
      throw new Error("Unexpected interpret result type");
  }
};

const resolveResult = <TNode, TEnv>(
  token: TextToken,
  ruleset: InterpretRuleset<TNode, TEnv>,
  helpers: InterpretHelpers<TNode, TEnv>,
): ResolvedResult<TNode> => {
  const result = ruleset.interpret(token, helpers);
  if (result.type !== "unhandled") return result;

  const strategy = ruleset.onUnhandled ?? "flatten";

  if (typeof strategy === "function") {
    return strategy(token, helpers);
  }

  switch (strategy) {
    case "throw":
      throw new Error(`No handler defined for DSL token type "${token.type}"`);
    case "flatten":
      return { type: "flatten" };
    case "drop":
      return { type: "drop" };
    default:
      throw new Error("Unknown unhandled strategy");
  }
};

// ── Internal: traversal ──

const interpretIterable = function* <TNode, TEnv>(
  tokens: TextToken[],
  ruleset: InterpretRuleset<TNode, TEnv>,
  helpers: InterpretHelpers<TNode, TEnv>,
  activeTokens: WeakSet<object>,
): Generator<TNode> {
  for (const token of tokens) {
    if (token.type === "text") {
      if (typeof token.value !== "string") {
        throw new Error("DSL text token value must be a string");
      }
      yield ruleset.createText(token.value);
      continue;
    }

    if (activeTokens.has(token)) {
      throw new Error(`Recursive DSL token detected for type "${token.type}"`);
    }

    activeTokens.add(token);
    try {
      const result = resolveResult(token, ruleset, helpers);
      yield* iterateResolved(result, ruleset, helpers, token);
    } finally {
      activeTokens.delete(token);
    }
  }
};

// ── Public API ──

export const interpretTokens = function* <TNode, TEnv = unknown>(
  tokens: TextToken[],
  ruleset: InterpretRuleset<TNode, TEnv>,
  env: TEnv,
): Generator<TNode> {
  const activeTokens = new WeakSet<object>();

  const interpretChildren = function* (value: string | TextToken[]): Generator<TNode> {
    if (typeof value === "string") {
      yield ruleset.createText(value);
      return;
    }
    yield* interpretIterable(value, ruleset, helpers, activeTokens);
  };

  const helpers: InterpretHelpers<TNode, TEnv> = {
    interpretChildren,
    flattenText,
    env,
  };

  yield* interpretIterable(tokens, ruleset, helpers, activeTokens);
};
