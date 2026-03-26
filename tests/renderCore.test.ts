import assert from "node:assert/strict";
import { createSimpleInlineHandlers, parseRichText, type TextToken } from "yume-dsl-rich-text";
import { type InterpretRuleset, interpretTokens } from "../src/index.ts";

interface TestCase {
  name: string;
  run: () => void;
}

const handlers = {
  ...createSimpleInlineHandlers(["bold", "italic"]),
};

const parse = (text: string) => parseRichText(text, { handlers });

const htmlRuleset: InterpretRuleset<string, { tone?: string }> = {
  createText: (text) => text,
  interpret: (token, helpers) => {
    if (token.type === "bold") {
      return {
        type: "nodes",
        nodes: [
          `<strong data-tone="${helpers.env.tone ?? "none"}">`,
          ...helpers.interpretChildren(token.value),
          "</strong>",
        ],
      };
    }

    if (token.type === "italic") {
      return {
        type: "nodes",
        nodes: ["<em>", ...helpers.interpretChildren(token.value), "</em>"],
      };
    }

    return { type: "unhandled" };
  },
};

const cases: TestCase[] = [
  {
    name: "interpretTokens -> should interpret nested token tree lazily",
    run: () => {
      const result = Array.from(
        interpretTokens(parse("$$bold(a $$italic(b)$$ c)$$"), htmlRuleset, { tone: "soft" }),
      );
      assert.equal(result.join(""), '<strong data-tone="soft">a <em>b</em> c</strong>');
    },
  },
  {
    name: "unhandled default -> should fall back to flatten",
    run: () => {
      const result = Array.from(
        interpretTokens(
          parse("$$bold(hello)$$"),
          {
            createText: (text) => text,
            interpret: () => ({ type: "unhandled" }),
          },
          undefined,
        ),
      );
      assert.equal(result.join(""), "hello");
    },
  },
  {
    name: "onUnhandled throw -> should throw",
    run: () => {
      assert.throws(
        () =>
          Array.from(
            interpretTokens(
              parse("$$bold(hello)$$"),
              {
                createText: (text) => text,
                interpret: () => ({ type: "unhandled" }),
                onUnhandled: "throw",
              },
              undefined,
            ),
          ),
        /No handler defined for DSL token type "bold"/,
      );
    },
  },
  {
    name: "onUnhandled drop -> should emit nothing",
    run: () => {
      const result = Array.from(
        interpretTokens(
          parse("$$bold(hello)$$"),
          {
            createText: (text) => text,
            interpret: () => ({ type: "unhandled" }),
            onUnhandled: "drop",
          },
          undefined,
        ),
      );
      assert.equal(result.join(""), "");
    },
  },
  {
    name: "onUnhandled function -> should use custom strategy",
    run: () => {
      const result = Array.from(
        interpretTokens(
          parse("$$bold(hello)$$"),
          {
            createText: (text) => text,
            interpret: () => ({ type: "unhandled" }),
            onUnhandled: (token) => ({ type: "text", text: `[${token.type}]` }),
          },
          undefined,
        ),
      );
      assert.equal(result.join(""), "[bold]");
    },
  },
  {
    name: "self recursion -> should throw",
    run: () => {
      assert.throws(
        () =>
          Array.from(
            interpretTokens(
              parse("$$bold(hello)$$"),
              {
                createText: (text) => text,
                interpret: (token, helpers) => {
                  if (token.type !== "bold") return { type: "flatten" };
                  return { type: "nodes", nodes: helpers.interpretChildren([token]) };
                },
                onUnhandled: "throw",
              },
              undefined,
            ),
          ),
        /Recursive DSL token detected/,
      );
    },
  },
  {
    name: "circular value -> should throw",
    run: () => {
      const loop: TextToken = { type: "loop", id: "x", value: [] };
      const value = loop.value as TextToken[];
      value.push(loop);

      assert.throws(
        () =>
          Array.from(
            interpretTokens(
              [loop],
              {
                createText: (text) => text,
                interpret: () => ({ type: "flatten" }),
              },
              undefined,
            ),
          ),
        /Circular DSL token/,
      );
    },
  },
];

let passed = 0;
let failed = 0;

for (const testCase of cases) {
  try {
    testCase.run();
    console.log(`PASS ${testCase.name}`);
    passed++;
  } catch (error) {
    console.error(`FAIL ${testCase.name}`);
    console.error(error);
    failed++;
  }
}

console.log(`PASS ${passed} 个 interpret core case`);
if (failed > 0) {
  console.error(`FAIL ${failed} 个 case`);
  process.exit(1);
}
