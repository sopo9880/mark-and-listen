// Turns raw failures into something a learner can act on: a short title and what to do next.
const RULES = [
  [
    /Codex CLI를 찾지 못|ENOENT.*codex/i,
    "Codex가 설치되어 있지 않아요",
    "설정 › Codex에서 설치하거나 업데이트를 눌러 주세요.",
  ],
  [
    /Codex 로그인|not logged in|login required/i,
    "Codex 로그인이 필요해요",
    "설정 › Codex에서 ‘브라우저로 로그인’을 눌러 주세요.",
  ],
  [
    /Codex 사용량|usage limit|rate limit|quota/i,
    "Codex 사용량 한도에 걸렸어요",
    "ChatGPT 요금제 한도가 풀린 뒤 다시 시도하세요. 완료된 항목은 저장되어 있어요.",
  ],
  [
    /Codex 모델|model.*(not found|not supported|does not exist|unsupported)/i,
    "선택한 Codex 모델을 쓸 수 없어요",
    "설정 › 문항 생성 엔진에서 다른 모델이나 ‘Codex 기본 모델’을 골라 주세요.",
  ],
  [/추론 정도/, "이 모델이 고른 추론 정도를 지원하지 않아요", "설정에서 추론 정도를 medium으로 바꿔 보세요."],
  [
    /Live 사용량|GEMINI_LIVE_RATE_LIMIT|RESOURCE_EXHAUSTED|429/,
    "Live 사용량 한도에 걸렸어요",
    "잠시 뒤 다시 시도하세요. 완료된 음원은 저장되어 있어요.",
  ],
  [
    /rejected the API key|API 키/i,
    "API 키를 확인해 주세요",
    "설정 › Live 음성에서 키를 다시 저장하고 모델 목록을 갱신하세요.",
  ],
  [
    /Gemini Live|Live 생성 실패/,
    "Live 음성을 만들지 못했어요",
    "모델·키·할당량을 확인하세요. 자세한 원인은 설정 맨 아래 로그에 있어요.",
  ],
  [
    /다른 제작|진행 중입니다|작업이 끝난/,
    "다른 작업이 진행 중이에요",
    "지금 작업이 끝난 뒤 다시 눌러 주세요.",
  ],
  [
    /Failed to fetch|NetworkError|Load failed/i,
    "앱 내부 연결이 끊겼어요",
    "앱을 닫았다가 다시 열어 주세요. 트레이에 남아 있다면 ‘종료’ 후 다시 실행하세요.",
  ],
  [
    /is not defined|is not a function|Cannot read prop|undefined/i,
    "앱 오류가 발생했어요",
    "버그예요. 이 메시지를 알려 주세요",
  ],
];

export function explain(error) {
  const raw = String(error?.message ?? error ?? "알 수 없는 오류").trim();
  for (const [pattern, title, action] of RULES)
    if (pattern.test(raw))
      return { title, detail: raw === title ? action : `${action} (원문: ${raw.slice(0, 160)})` };
  return { title: raw.slice(0, 120), detail: "" };
}
