import assert from "node:assert/strict";
import { createSimpleInlineHandlers, parseStructural } from "yume-dsl-rich-text";
import type { SourceSpan } from "yume-dsl-rich-text";
import {
  applyIncrementalEditBySpan,
  createSliceSession,
  replaceSliceText,
  toSliceEdit,
} from "../src/index.ts";

interface TestCase {
  name: string;
  run: () => void | Promise<void>;
}

// NOTE: This helper is for single-line tests only; line/column are intentionally synthetic.
const makeSpan = (startOffset: number, endOffset: number): SourceSpan => ({
  start: { offset: startOffset, line: 1, column: startOffset + 1 },
  end: { offset: endOffset, line: 1, column: endOffset + 1 },
});

const cases: TestCase[] = [
  {
    name: "toSliceEdit -> should map SourceSpan offsets to incremental edit",
    run: () => {
      const span = makeSpan(3, 7);
      const edit = toSliceEdit(span, "XYZ");
      assert.deepEqual(edit, {
        startOffset: 3,
        oldEndOffset: 7,
        newText: "XYZ",
      });
    },
  },
  {
    name: "replaceSliceText -> should replace text in the specified span",
    run: () => {
      const source = "hello world";
      const span = makeSpan(6, 11);
      const next = replaceSliceText(source, span, "DSL");
      assert.equal(next, "hello DSL");
    },
  },
  {
    name: "applyIncrementalEditBySpan -> should update session source and keep structural parity",
    run: () => {
      const handlers = createSimpleInlineHandlers(["bold"]);
      const source = "head $$bold(world)$$ tail";
      const start = source.indexOf("world");
      const end = start + "world".length;
      const span = makeSpan(start, end);

      const session = createSliceSession(source, { handlers });
      const result = applyIncrementalEditBySpan(session, span, "DSL");

      const expectedSource = "head $$bold(DSL)$$ tail";
      const expectedTree = parseStructural(expectedSource, { handlers, trackPositions: true });

      assert.equal(result.doc.source, expectedSource);
      assert.deepEqual(result.doc.tree, expectedTree);
      assert.equal(session.getDocument().source, expectedSource);
    },
  },
  {
    name: "applyIncrementalEditBySpan -> should pass parse options to session.applyEdit",
    run: () => {
      const handlers = createSimpleInlineHandlers(["bold"]);
      const source = "$$bold(x)$$";
      const span = makeSpan(source.indexOf("x"), source.indexOf("x") + 1);

      const session = createSliceSession(source, { handlers, allowForms: ["inline"] });
      const result = applyIncrementalEditBySpan(
        session,
        span,
        "y",
        { handlers, allowForms: ["inline"] },
      );

      assert.equal(result.doc.source, "$$bold(y)$$");
      assert.ok(result.mode === "incremental" || result.mode === "full-fallback");
    },
  },
];

for (const testCase of cases) {
  await Promise.resolve(testCase.run());
  console.log(`PASS ${testCase.name}`);
}
