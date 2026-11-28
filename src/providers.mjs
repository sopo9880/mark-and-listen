/**
 * Server-side adapters for the public, supported provider APIs. No external
 * request is made at import and errors deliberately do not echo provider bodies.
 */
export const DEFAULT_PROVIDER_MODELS = Object.freeze({
  openai: "gpt-5.4-mini",
  gemini: "gemini-3.6-flash",
});

const LABELS = { openai: "OpenAI", gemini: "Gemini" };
const KEY_ENV = { openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };
const MAX_OUTPUT_TOKENS = 6144;

function checkedModel(provider, rawModel) {
  if (rawModel != null && typeof rawModel !== "string") throw new Error("Model ID must be text.");
  let model = rawModel?.trim() || DEFAULT_PROVIDER_MODELS[provider];
  if (provider === "gemini") model = model.replace(/^models\//, "");
  // Keep selection to a single path component on the fixed provider hostname.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(model) || (provider === "gemini" && model.includes(":"))) {
    throw new Error("Invalid model ID.");
  }
  return model;
}

function getRequest(provider, model, key, prompt, images) {
  const contentJson = { "Content-Type": "application/json" };
  const encoded = images?.map((bytes) => bytes.toString("base64")) ?? [];
  if (provider === "openai") {
    return [
      "https://api.openai.com/v1/responses",
      { ...contentJson, Authorization: `Bearer ${key}` },
      {
        model,
        input: encoded.length
          ? [
              {
                role: "user",
                content: [
                  { type: "input_text", text: prompt },
                  ...encoded.map((data) => ({
                    type: "input_image",
                    image_url: "data:image/jpeg;base64," + data,
                    detail: "high",
                  })),
                ],
              },
            ]
          : prompt,
        store: false,
        max_output_tokens: MAX_OUTPUT_TOKENS,
      },
    ];
  }
  return [
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { ...contentJson, "x-goog-api-key": key },
    {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            ...encoded.map((data) => ({ inlineData: { mimeType: "image/jpeg", data } })),
          ],
        },
      ],
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
    },
  ];
}

function safeHttpError(provider, status) {
  const label = LABELS[provider];
  const detail =
    {
      400: "Check the model ID and input.",
      401: "Check the API key.",
      403: "Check the API key and model access.",
      404: "Check model availability and permissions.",
      429: "Check rate limits, billing, or API quota.",
    }[status] ||
    (status >= 500 ? "The provider is temporarily unavailable." : "The provider did not accept the request.");
  return new Error(`${label} request failed (HTTP ${status}). ${detail}`);
}

function readOpenAI(data) {
  if (data?.status && data.status !== "completed") {
    throw new Error("OpenAI did not return a completed response. Try a shorter prompt or another model.");
  }
  if (Array.isArray(data?.output)) {
    const blocks = data.output
      .filter((item) => item?.type === "message")
      .flatMap((item) => (Array.isArray(item.content) ? item.content : []));
    if (blocks.some((item) => item?.type === "refusal")) throw new Error("OpenAI declined the request.");
    return blocks
      .filter((item) => item?.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n")
      .trim();
  }
  return typeof data?.output_text === "string" ? data.output_text.trim() : "";
}

function readGemini(data) {
  const first = data?.candidates?.[0];
  if (!first || data?.promptFeedback?.blockReason) return "";
  if (first.finishReason && first.finishReason !== "STOP") {
    throw new Error("Gemini did not return a completed response. Try a shorter prompt or another model.");
  }
  return (Array.isArray(first.content?.parts) ? first.content.parts : [])
    .filter((part) => !part?.thought && typeof part?.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

/**
 * @returns {Promise<string>} completed provider answer; partial or hidden
 * reasoning is intentionally not passed to the caller as a valid song draft.
 */
export async function generateWithProvider({
  provider,
  model,
  apiKey,
  prompt,
  images,
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (provider !== "openai" && provider !== "gemini") throw new Error("Unsupported text provider.");
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("A non-empty text prompt is required.");
  if (prompt.length > 100_000) throw new Error("The prompt is too long.");
  if (apiKey != null && typeof apiKey !== "string") throw new Error("API key must be text.");
  const key = apiKey?.trim() || process.env[KEY_ENV[provider]]?.trim();
  if (!key || /[^\x21-\x7E]/.test(key)) {
    throw new Error(`Set a valid ${KEY_ENV[provider]} or enter the provider API key.`);
  }
  const normalizedModel = checkedModel(provider, model);
  if (signal?.aborted) throw new Error("Request cancelled.");
  const deadline = AbortSignal.timeout(90_000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const [url, headers, payload] = getRequest(provider, normalizedModel, key, prompt, images);

  let data;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      redirect: "error",
      signal: requestSignal,
    });
    // An HTTP error body may include an echoed API key or other input.
    if (!response.ok) {
      const cancelBody = response.body?.cancel();
      cancelBody?.catch(() => {});
      return Promise.reject(safeHttpError(provider, response.status));
    }
    data = await response.json();
  } catch {
    if (signal?.aborted) throw new Error("Request cancelled.");
    if (deadline.aborted) throw new Error(`${LABELS[provider]} request timed out.`);
    throw new Error(`${LABELS[provider]} could not be reached or returned an unreadable response.`);
  }

  if (signal?.aborted) throw new Error("Request cancelled.");
  const result = provider === "openai" ? readOpenAI(data) : readGemini(data);
  if (!result) throw new Error(`${LABELS[provider]} returned no usable text.`);
  return result;
}
