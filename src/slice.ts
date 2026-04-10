import type { PositionTracker, SourceSpan, StructuralNode, TextToken } from "yume-dsl-rich-text";
import type { ParserLike } from "./types.ts";
import { nodePathAtOffset } from "./query.ts";

type TagNode = Extract<StructuralNode, { type: "inline" | "raw" | "block" }>;

const isTextEcho = (tokens: TextToken[], source: string): boolean => {
  if (tokens.length !== 1) return false;
  const token = tokens[0];
  return token.type === "text" && token.value === source;
};

const isTagNode = (node: StructuralNode): node is TagNode =>
  node.type === "inline" || node.type === "raw" || node.type === "block";

const isImplicitInlineShorthandNode = (node: StructuralNode): boolean =>
  node.type === "inline" &&
  (node as Record<string, unknown>).implicitInlineShorthand === true;

const parseSpan = (
  fullText: string,
  span: SourceSpan,
  parser: ParserLike,
  tracker?: PositionTracker,
): TextToken[] =>
  parser.parse(fullText.slice(span.start.offset, span.end.offset), {
    trackPositions: true,
    baseOffset: span.start.offset,
    tracker,
  });

const pickEnclosingTagSpanFromTree = (
  nodes: StructuralNode[],
  span: SourceSpan,
): SourceSpan | undefined => {
  const path = nodePathAtOffset(nodes, span.start.offset);
  if (path.length === 0) return undefined;
  let matchedIndex = -1;
  for (let i = path.length - 1; i >= 0; i--) {
    const pos = path[i].position;
    if (!pos) continue;
    if (pos.start.offset === span.start.offset && pos.end.offset === span.end.offset) {
      matchedIndex = i;
      break;
    }
  }
  if (matchedIndex <= 0) return undefined;
  const matched = path[matchedIndex];
  const isImplicitInline = isImplicitInlineShorthandNode(matched);
  if (!isImplicitInline) return undefined;

  for (let i = matchedIndex - 1; i >= 0; i--) {
    const node = path[i];
    if (!isTagNode(node) || !node.position) continue;
    const pos = node.position;
    if (pos.start.offset <= span.start.offset && pos.end.offset >= span.end.offset) {
      return pos;
    }
  }
  return undefined;
};

/**
 * Parse a substring of a larger document identified by a `SourceSpan`.
 *
 * Slices `fullText` using `span.start.offset` / `span.end.offset`, then calls
 * `parser.parse` with `baseOffset` and optional `tracker` so that positions in
 * the resulting `TextToken[]` point back into the original document.
 *
 * @param fullText  The complete source text.
 * @param span      The region to parse — typically from a `StructuralNode.position`.
 * @param parser    A parser with `parse(input, overrides?)`.
 * @param tracker   Optional pre-built tracker from the full document
 *                  (`buildPositionTracker(fullText)`). When provided, `line`/`column`
 *                  are also correct; without it, only `offset` is shifted.
 * @param fullTree  Optional precomputed structural tree for `fullText`.
 *                  When provided, shorthand fallback reuses it instead of calling
 *                  `parser.structural(...)`.
 */
export const parseSlice = (
  fullText: string,
  span: SourceSpan,
  parser: ParserLike,
  tracker?: PositionTracker,
  fullTree?: StructuralNode[],
): TextToken[] => {
  const direct = parseSpan(fullText, span, parser, tracker);
  if (!isTextEcho(direct, fullText.slice(span.start.offset, span.end.offset))) return direct;

  const parentFromProvidedTree = fullTree ? pickEnclosingTagSpanFromTree(fullTree, span) : undefined;
  if (parentFromProvidedTree) return parseSpan(fullText, parentFromProvidedTree, parser, tracker);

  if (!parser.structural) return direct;

  const parsedTree = parser.structural(fullText, { trackPositions: true });
  const parentSpan = pickEnclosingTagSpanFromTree(parsedTree, span);
  if (!parentSpan) return direct;
  return parseSpan(fullText, parentSpan, parser, tracker);
};
