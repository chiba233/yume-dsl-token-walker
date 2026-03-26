import type { TextToken } from "yume-dsl-rich-text";
import type {
  InterpretHelpers,
  InterpretResult,
  InterpretRuleset,
  ResolvedResult,
} from "./types.ts";

export type TokenHandler<TNode, TEnv = unknown> = (
  token: TextToken,
  helpers: InterpretHelpers<TNode, TEnv>,
) => ResolvedResult<TNode>;

export type TextResult = { type: "text"; text: string };

// ── Ruleset helper ──

export const createRuleset = <TNode, TEnv = unknown>(
  ruleset: InterpretRuleset<TNode, TEnv>,
): InterpretRuleset<TNode, TEnv> => ruleset;

// ── Handler helpers ──

export const dropToken: <TNode, TEnv = unknown>(
  token: TextToken,
  helpers: InterpretHelpers<TNode, TEnv>,
) => ResolvedResult<TNode> = () => ({ type: "drop" });

export function unwrapChildren<TNode, TEnv = unknown>(
  token: TextToken,
  helpers: InterpretHelpers<TNode, TEnv>,
): ResolvedResult<TNode> {
  return { type: "nodes", nodes: helpers.interpretChildren(token.value) };
}

// ── Handler map helpers ──

export const fromHandlerMap = <TNode, TEnv = unknown>(
  handlers: Record<string, TokenHandler<TNode, TEnv>>,
): ((token: TextToken, helpers: InterpretHelpers<TNode, TEnv>) => InterpretResult<TNode>) => {
  return (token, helpers) => {
    const handler = handlers[token.type];
    if (handler) return handler(token, helpers);
    return { type: "unhandled" };
  };
};

export const wrapHandlers = <TNode, TEnv = unknown>(
  handlers: Record<string, TokenHandler<TNode, TEnv>>,
  wrap: (
    result: ResolvedResult<TNode>,
    token: TextToken,
    helpers: InterpretHelpers<TNode, TEnv>,
  ) => ResolvedResult<TNode>,
): Record<string, TokenHandler<TNode, TEnv>> => {
  const wrapped: Record<string, TokenHandler<TNode, TEnv>> = {};
  for (const [type, handler] of Object.entries(handlers)) {
    wrapped[type] = (token, helpers) => wrap(handler(token, helpers), token, helpers);
  }
  return wrapped;
};

// ── Strategy helpers ──

export function debugUnhandled(
  format: (token: TextToken) => string = (token) => `[unhandled:${token.type}]`,
): (token: TextToken) => TextResult {
  return (token) => ({ type: "text", text: format(token) });
}

export const collectNodes = <TNode>(iterable: Iterable<TNode>): TNode[] => Array.from(iterable);
