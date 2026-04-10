import { createIncrementalSession } from "yume-dsl-rich-text";
import type {
  IncrementalDocument,
  IncrementalEdit,
  IncrementalParseOptions,
  IncrementalSessionOptions,
  SourceSpan,
} from "yume-dsl-rich-text";

export interface SliceSessionApplyResult {
  doc: IncrementalDocument;
  mode: "incremental" | "full-fallback";
  fallbackReason?: string;
}

export interface SliceSession {
  getDocument: () => IncrementalDocument;
  applyEdit: (
    edit: IncrementalEdit,
    newSource: string,
    options?: IncrementalParseOptions,
  ) => SliceSessionApplyResult;
  rebuild: (newSource: string, options?: IncrementalParseOptions) => IncrementalDocument;
}

/**
 * Convert a `SourceSpan` + replacement text to an incremental edit payload.
 */
export const toSliceEdit = (span: SourceSpan, newText: string): IncrementalEdit => ({
  startOffset: span.start.offset,
  oldEndOffset: span.end.offset,
  newText,
});

/**
 * Apply a replacement to source text using `SourceSpan` offsets.
 */
export const replaceSliceText = (source: string, span: SourceSpan, newText: string): string =>
  source.slice(0, span.start.offset) + newText + source.slice(span.end.offset);

/**
 * Create an incremental session (thin alias for clarity near `parseSlice` workflows).
 */
export const createSliceSession = (
  source: string,
  options?: IncrementalParseOptions,
  sessionOptions?: IncrementalSessionOptions,
): SliceSession => createIncrementalSession(source, options, sessionOptions);

/**
 * Apply a span-based edit directly to an incremental session.
 * Uses current document source from the session, builds next source internally,
 * then delegates to `session.applyEdit(...)`.
 */
export const applyIncrementalEditBySpan = (
  session: SliceSession,
  span: SourceSpan,
  newText: string,
  options?: IncrementalParseOptions,
): SliceSessionApplyResult => {
  const currentSource = session.getDocument().source;
  const nextSource = replaceSliceText(currentSource, span, newText);
  return session.applyEdit(toSliceEdit(span, newText), nextSource, options);
};

// Backward-compatible aliases
export const spanToIncrementalEdit = toSliceEdit;
export const applyTextEditBySpan = replaceSliceText;
export const createIncrementalSliceSession = createSliceSession;
