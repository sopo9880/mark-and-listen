export function credentials(provider, key) {
  if (
    !["gemini", "openai"].includes(provider) ||
    typeof key !== "string" ||
    !/^[\x21-\x7e]{8,1024}$/.test(key)
  )
    throw Error("공급자와 API 키를 확인하세요.");
}
export async function listLiveModels({ provider, apiKey, fetcher = fetch }) {
  credentials(provider, apiKey);
  const models = [];
  let page = "";
  const visited = new Set();
  do {
    if (visited.has(page) || visited.size >= 100) throw Error("모델 목록 페이지 오류");
    visited.add(page);
    const base =
      provider === "gemini"
        ? "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"
        : "https://api.openai.com/v1/models";
    const url =
      base + (page ? (provider === "gemini" ? "&pageToken=" : "?after=") + encodeURIComponent(page) : "");
    let r;
    try {
      r = await fetcher(url, {
        headers: provider === "gemini" ? { "x-goog-api-key": apiKey } : { Authorization: `Bearer ${apiKey}` },
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw Error("모델 목록 연결 실패");
    }
    if (!r.ok) throw Error(`모델 목록 요청 실패 (HTTP ${r.status}). 키·권한·할당량을 확인하세요.`);
    const data = await r.json();
    for (const m of provider === "gemini" ? (data.models ?? []) : (data.data ?? [])) {
      const id = provider === "gemini" ? m.name?.replace(/^models\//, "") : m.id;
      if (!id || !/^[a-zA-Z0-9_.-]+$/.test(id)) continue;
      const capable =
        provider === "gemini"
          ? m.supportedGenerationMethods?.some((v) => /^bidiGenerateContent$/i.test(v))
          : /^(gpt-live(?:-|$)|gpt-realtime(?:-|$)|gpt-4o(?:-mini)?-realtime(?:-|$))/.test(id);
      if (capable && !/(?:transcrib|transcript|translate)/i.test(id))
        models.push({ id, label: m.displayName || id, verification: "목록 확인 · 실제 낭독 테스트 필요" });
    }
    page = provider === "gemini" ? data.nextPageToken : data.has_more ? data.last_id : null;
  } while (page);
  return [...new Map(models.map((m) => [m.id, m])).values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Models usable for question generation (text) or photo questions (vision) with the given key. */
export async function listTextModels({ provider, apiKey, fetcher = fetch }) {
  credentials(provider, apiKey);
  const url =
    provider === "gemini"
      ? "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"
      : "https://api.openai.com/v1/models";
  let r;
  try {
    r = await fetcher(url, {
      headers: provider === "gemini" ? { "x-goog-api-key": apiKey } : { Authorization: `Bearer ${apiKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw Error("모델 목록 연결 실패");
  }
  if (!r.ok) throw Error(`모델 목록 요청 실패 (HTTP ${r.status}). 키·권한·할당량을 확인하세요.`);
  const data = await r.json();
  const skip =
    /(?:tts|live|realtime|audio|transcri|embed|image|imagen|veo|search|moderation|whisper|dall-e|babbage|davinci|computer-use|codex-mini|aqa|learnlm|gemma|robotics)/i;
  const out = [];
  for (const m of provider === "gemini" ? (data.models ?? []) : (data.data ?? [])) {
    const id = provider === "gemini" ? String(m.name ?? "").replace(/^models\//, "") : m.id;
    if (!id || !/^[a-zA-Z0-9_.:-]+$/.test(id) || skip.test(id)) continue;
    const ok =
      provider === "gemini"
        ? /^gemini-/.test(id) && m.supportedGenerationMethods?.includes("generateContent")
        : /^(?:gpt-\d|o\d)/.test(id);
    if (ok) out.push({ id, label: m.displayName || id });
  }
  const version = (id) => Number(/(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0);
  return [...new Map(out.map((m) => [m.id, m])).values()].sort(
    (a, b) => version(b.id) - version(a.id) || a.id.localeCompare(b.id),
  );
}
