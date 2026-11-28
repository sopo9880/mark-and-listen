import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PROVIDER_MODELS, generateWithProvider } from "../src/providers.mjs";

const mockKey = "MOCK-NOT-A-REAL-KEY";
const success = (value) => Response.json(value);
const openAIResponse = {
  status: "completed",
  output: [
    { type: "reasoning", summary: [{ text: "do not surface internal notes" }] },
    {
      type: "message",
      content: [
        { type: "output_text", text: "사운드: 반짝이는 신스" },
        { type: "output_text", text: "가사: 작은 별" },
      ],
    },
  ],
};
const input = { apiKey: mockKey, prompt: "한글 노래 초안" };

test("OpenAI default text generation uses the Responses endpoint and only returns public text", async () => {
  const result = await generateWithProvider({
    ...input,
    provider: "openai",
    fetchImpl: async (url, request) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(request.method, "POST");
      assert.equal(request.redirect, "error");
      assert.equal(request.headers.Authorization, `Bearer ${mockKey}`);
      assert.ok(request.signal instanceof AbortSignal);
      const body = JSON.parse(request.body);
      assert.equal(body.input, input.prompt);
      assert.equal(body.model, DEFAULT_PROVIDER_MODELS.openai);
      assert.equal(body.store, false);
      assert.equal(request.body.includes(mockKey), false);
      return success(openAIResponse);
    },
  });
  assert.equal(result, "사운드: 반짝이는 신스\n가사: 작은 별");
});

test("Gemini uses private header, normalized model override, and excludes thought parts", async () => {
  const result = await generateWithProvider({
    ...input,
    provider: "gemini",
    model: "models/gemini-3.8-flash",
    fetchImpl: async (url, request) => {
      assert.equal(
        url,
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      );
      assert.equal(request.headers["x-goog-api-key"], mockKey);
      assert.equal(request.redirect, "error");
      assert.deepEqual(JSON.parse(request.body).contents[0], {
        role: "user",
        parts: [{ text: input.prompt }],
      });
      return success({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ thought: true, text: "internal thought" }, { text: "다시 출발" }] },
          },
        ],
      });
    },
  });
  assert.equal(result, "다시 출발");
});

test("a malformed model ID, bad header key and cancelled signal make no external request", async () => {
  const base = {
    ...input,
    provider: "gemini",
    fetchImpl: () => assert.fail("must not fetch"),
  };
  await assert.rejects(generateWithProvider({ ...base, model: "../other" }), /Invalid model ID/);
  await assert.rejects(generateWithProvider({ ...base, apiKey: "broken\nheader" }), /valid GEMINI_API_KEY/);
  const controller = new AbortController();
  controller.abort(new Error(mockKey));
  await assert.rejects(
    generateWithProvider({ ...base, signal: controller.signal }),
    /^Error: Request cancelled\.$/,
  );
});

test("authentication failures and provider exceptions never echo potentially sensitive text", async () => {
  for (const provider of ["gemini", "openai"]) {
    await assert.rejects(
      generateWithProvider({
        ...input,
        provider,
        fetchImpl: () => Response.json({ error: { message: `Invalid: ${mockKey}` } }, { status: 401 }),
      }),
      (error) => error.message.includes("HTTP 401") && !error.message.includes(mockKey),
    );
    await assert.rejects(
      generateWithProvider({
        ...input,
        provider,
        fetchImpl: () => {
          throw new Error(mockKey);
        },
      }),
      (error) => error.message.includes("could not be reached") && !error.message.includes(mockKey),
    );
  }
});

test("output available after cancellation and provider-truncated or refused text are not accepted", async () => {
  const controller = new AbortController();
  await assert.rejects(
    generateWithProvider({
      ...input,
      provider: "openai",
      signal: controller.signal,
      fetchImpl: () => {
        controller.abort();
        return success(openAIResponse);
      },
    }),
    /Request cancelled/,
  );
  await assert.rejects(
    generateWithProvider({
      ...input,
      provider: "openai",
      fetchImpl: () => success({ ...openAIResponse, status: "incomplete" }),
    }),
    /completed response/,
  );
  await assert.rejects(
    generateWithProvider({
      ...input,
      provider: "openai",
      fetchImpl: () =>
        success({
          output: [{ type: "message", content: [{ type: "refusal", refusal: "not a draft" }] }],
        }),
    }),
    /declined/,
  );
  await assert.rejects(
    generateWithProvider({
      ...input,
      provider: "gemini",
      fetchImpl: () =>
        success({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "partial" }] } }] }),
    }),
    /completed response/,
  );
});
