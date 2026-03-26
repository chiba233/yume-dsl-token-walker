import assert from "node:assert/strict";
import { createSimpleInlineHandlers, parseRichText, type TextToken } from "yume-dsl-rich-text";
import { collectRendered, renderTokens, type TokenRenderer } from "../src/index.ts";

interface TestCase {
  name: string;
  run: () => void;
}

const handlers = {
  ...createSimpleInlineHandlers(["bold", "italic"]),
};

const parse = (text: string) => parseRichText(text, { handlers });

const htmlRenderer: TokenRenderer<string, { tone?: string }> = {
  createText: (text) => text,
  render: (token, helpers) => {
    if (token.type === "bold") {
      return {
        type: "tokens",
        tokens: [
          `<strong data-tone="${helpers.env.tone ?? "none"}">`,
          ...helpers.renderChildren(token.value),
          "</strong>",
        ],
      };
    }

    if (token.type === "italic") {
      return {
        type: "tokens",
        tokens: ["<em>", ...helpers.renderChildren(token.value), "</em>"],
      };
    }

    return { type: "defer" };
  },
};

const cases: TestCase[] = [
  {
    name: "renderTokens -> should render nested token tree lazily",
    run: () => {
      const result = collectRendered(
        renderTokens(parse("$$bold(a $$italic(b)$$ c)$$"), htmlRenderer, { tone: "soft" }),
      );
      assert.equal(result.join(""), '<strong data-tone="soft">a <em>b</em> c</strong>');
    },
  },
  {
    name: "non-strict skip -> should fall back to text",
    run: () => {
      const result = collectRendered(
        renderTokens(
          parse("$$bold(hello)$$"),
          {
            createText: (text) => text,
            render: () => ({ type: "defer" }),
          },
          undefined,
        ),
      );
      assert.equal(result.join(""), "hello");
    },
  },
  {
    name: "strict skip -> should throw",
    run: () => {
      assert.throws(
        () =>
          collectRendered(
            renderTokens(
              parse("$$bold(hello)$$"),
              {
                createText: (text) => text,
                render: () => ({ type: "defer" }),
                strict: true,
              },
              undefined,
            ),
          ),
        /No renderer defined for DSL token type "bold"/,
      );
    },
  },
  {
    name: "self recursion -> should throw",
    run: () => {
      assert.throws(
        () =>
          collectRendered(
            renderTokens(
              parse("$$bold(hello)$$"),
              {
                createText: (text) => text,
                render: (token, helpers) => {
                  if (token.type !== "bold") return { type: "text" };
                  return { type: "tokens", tokens: helpers.renderChildren([token]) };
                },
                strict: true,
              },
              undefined,
            ),
          ),
        /Recursive DSL token rendering detected/,
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
          collectRendered(
            renderTokens(
              [loop],
              {
                createText: (text) => text,
                render: () => ({ type: "text" }),
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

console.log(`PASS ${passed} 个 render core case`);
if (failed > 0) {
  console.error(`FAIL ${failed} 个 case`);
  process.exit(1);
}
