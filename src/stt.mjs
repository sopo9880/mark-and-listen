// Independent speech-to-text used to verify narration. The Live session's own transcript describes what the
// model meant to say, not necessarily what ended up in the saved audio, so every saved clip is transcribed
// again from its WAV bytes and compared with the script.
import { narrationTokens } from "./narration.mjs";

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
const INSTRUCTION =
  "Transcribe this English audio verbatim. Output only the words that are actually spoken, in order. No timestamps, speaker labels, notes or corrections. If nothing is spoken, output nothing.";
const geminiModels = new Map();

/** Picks the newest general Gemini Flash model that supports generateContent (audio input). */
export async function geminiSttModel(apiKey, fetcher = fetch) {
  if (geminiModels.has(apiKey)) return geminiModels.get(apiKey);
  let pick = "gemini-2.5-flash";
  try {
    const r = await fetcher(`${GEMINI}?pageSize=1000`, {
      headers: { "x-goog-api-key": apiKey },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (r.ok) {
      const names = ((await r.json()).models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => String(m.name).replace(/^models\//, ""))
        .filter((n) => /^gemini-\d+(?:\.\d+)?-flash(?:-\d+)?$/.test(n));
      const version = (n) => Number(/^gemini-(\d+(?:\.\d+)?)/.exec(n)[1]);
      names.sort((a, b) => version(b) - version(a) || a.length - b.length);
      if (names[0]) pick = names[0];
    }
  } catch {
    // Fall back to the default name.
  }
  geminiModels.set(apiKey, pick);
  return pick;
}

export async function transcribeWav({ provider, apiKey, wav, model, fetcher = fetch, signal }) {
  if (provider === "gemini") {
    const name = model || (await geminiSttModel(apiKey, fetcher));
    const r = await fetcher(`${GEMINI}/${encodeURIComponent(name)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      redirect: "error",
      signal,
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: "audio/wav", data: wav.toString("base64") } },
              { text: INSTRUCTION },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    });
    if (!r.ok)
      throw Object.assign(Error(`전사 검증 요청 실패 (HTTP ${r.status})`), {
        status: r.status === 429 ? 429 : 502,
      });
    const data = await r.json();
    return (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
  }
  if (provider === "openai") {
    const form = new FormData();
    form.append("file", new Blob([wav], { type: "audio/wav" }), "segment.wav");
    form.append("model", model || "gpt-transcribe");
    form.append("response_format", "json");
    const r = await fetcher("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      redirect: "error",
      signal,
      body: form,
    });
    if (!r.ok)
      throw Object.assign(Error(`전사 검증 요청 실패 (HTTP ${r.status})`), {
        status: r.status === 429 ? 429 : 502,
      });
    return String((await r.json()).text ?? "").trim();
  }
  throw Error("전사 검증 공급자 오류");
}

/**
 * Rejects clips whose length cannot hold the script (e.g. a single word for a whole sentence) or that run far
 * too long (extra talk). Bounds: 4.2 words/s at most, 1.1 words/s at least, plus slack for pauses.
 */
export function plausibleDuration(script, seconds) {
  const words = narrationTokens(String(script).replace(/(^|\n)\s*\(?[A-Ea-e][.)]\s+/g, "$1")).length;
  if (!words) return { ok: false, words, reason: "빈 대본" };
  const min = Math.max(0.5, words / 4.2) * 0.8;
  const max = words / 1.1 + 4;
  if (seconds < min)
    return { ok: false, words, reason: `음원이 너무 짧습니다 (${seconds.toFixed(1)}초, 단어 ${words}개)` };
  if (seconds > max)
    return { ok: false, words, reason: `음원이 너무 깁니다 (${seconds.toFixed(1)}초, 단어 ${words}개)` };
  return { ok: true, words };
}
