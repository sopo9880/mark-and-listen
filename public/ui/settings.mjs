import { h, icon, card, button, field, select, segmented, toast, confirmDialog } from "./dom.mjs";
import { api, loadConnections, state } from "./api.mjs";
import { diffView } from "./studio.mjs";

export async function render(page, { go }) {
  const settings = await api("settings");
  state.settings = settings;
  let disposeUrl = () => {};

  // ── Question generation ────────────────────────────────────────────────
  let textProvider = settings.textProvider;
  const textModel = h("input", {
    class: "input",
    type: "text",
    value: settings.textModel,
    placeholder: "비우면 공급자 기본 모델",
  });
  const textKey = h("input", {
    class: "input",
    type: "password",
    autocomplete: "off",
    spellcheck: false,
    placeholder: settings.keys[textProvider] ? "연결됨 · 바꾸려면 새 키 입력" : "API 키",
  });
  const textKeyField = field("API 키 · 앱 실행 중 메모리에만 보관", textKey);
  const syncText = () => {
    textKeyField.hidden = textProvider === "codex";
    textModel.closest(".field").hidden = textProvider === "codex";
    textKey.placeholder = settings.keys[textProvider] ? "연결됨 · 바꾸려면 새 키 입력" : "API 키";
  };
  const generation = card(
    {},
    head(
      "sparkle",
      "문항 생성 엔진",
      "모든 시험관의 AI 출제에 사용합니다. 다른 엔진으로 자동 전환하지 않습니다.",
    ),
    field(
      "기본 엔진",
      segmented(
        [
          ["codex", "Codex · ChatGPT 로그인"],
          ["openai", "GPT API"],
          ["gemini", "Gemini API"],
        ],
        textProvider,
        (v) => ((textProvider = v), syncText()),
      ),
    ),
    field("모델 ID", textModel),
    textKeyField,
    h(
      "div",
      { class: "row end" },
      button(
        "저장",
        async () => {
          if (textProvider !== "codex" && textKey.value) {
            await api("settings", { keyProvider: textProvider, apiKey: textKey.value });
            settings.keys[textProvider] = true;
            textKey.value = "";
          }
          await api("settings", {
            textProvider,
            textModel: textProvider === "codex" ? "" : textModel.value.trim(),
          });
          await loadConnections();
          syncText();
          toast("문항 생성 설정을 저장했습니다.", "ok");
        },
        { kind: "primary" },
      ),
    ),
  );

  // ── Codex ──────────────────────────────────────────────────────────────
  const auto = h("input", {
    type: "checkbox",
    checked: settings.autoUpdate,
    onchange: () => api("settings", { autoUpdate: auto.checked }).catch((e) => toast(e.message, "error")),
  });
  const loginNote = h("p", { class: "muted small" });
  const codex = card(
    {},
    head("wand", "Codex 엔진", "ChatGPT 계정으로 로그인해 API 키 없이 문항을 만듭니다."),
    h(
      "div",
      { class: "kv" },
      h("span", { text: "설치 버전" }),
      h("strong", { text: settings.codex.installed || "미설치" }),
    ),
    h(
      "div",
      { class: "kv" },
      h("span", { text: "상태" }),
      h("strong", {
        text: settings.updateBusy
          ? "업데이트 중"
          : settings.codex.supported
            ? "Windows x64 관리형"
            : "이 환경에서는 PATH의 Codex CLI 사용",
      }),
    ),
    settings.updateError ? h("p", { class: "error-text", text: settings.updateError }) : null,
    h(
      "label",
      { class: "check" },
      auto,
      h(
        "span",
        {},
        h("strong", { text: "최신 안정판 자동 업데이트" }),
        h("small", {
          class: "muted",
          text: "제작·로그인·응시 중에는 교체하지 않고, 실패하면 기존 버전을 유지합니다.",
        }),
      ),
    ),
    h(
      "div",
      { class: "row" },
      button(
        "설치 / 업데이트 확인",
        async () => {
          const r = await api("codex/update", {});
          if (r.error) throw Error(r.error);
          toast("Codex 엔진 상태를 확인했습니다.", "ok");
          go("settings");
        },
        { iconName: "refresh" },
      ),
      button(
        "브라우저에서 ChatGPT 로그인",
        async () => {
          await api("codex/browser-login", {});
          await loadConnections();
          loginNote.textContent = "기본 브라우저에서 로그인을 마치면 자동으로 확인합니다.";
          for (let i = 0; i < 150; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const c = await loadConnections();
            if (!c.loginPending) {
              loginNote.textContent =
                c.codex === "connected" ? "Codex 연결됨" : "로그인이 완료되지 않았습니다.";
              break;
            }
          }
        },
        { kind: "primary" },
      ),
    ),
    loginNote,
  );

  // ── Live narration ────────────────────────────────────────────────────
  let liveProvider = settings.liveProvider;
  const liveKey = h("input", { class: "input", type: "password", autocomplete: "off", spellcheck: false });
  const model = select(
    [[settings.liveModel || "", settings.liveModel || "모델 목록을 새로고침하세요"]],
    settings.liveModel || "",
  );
  const script = select(
    [
      ["single", "한 문장"],
      ["multi", "연속 문장"],
      ["choices", "A–D 선택지 전체"],
    ],
    "choices",
  );
  const sample = h("div", { class: "stack" });
  const keyHint = () =>
    (liveKey.placeholder = settings.keys[liveProvider] ? "연결됨 · 바꾸려면 새 키 입력" : "API 키");
  keyHint();
  const refreshModels = async () => {
    if (liveKey.value) {
      await api("settings", { keyProvider: liveProvider, apiKey: liveKey.value });
      settings.keys[liveProvider] = true;
      liveKey.value = "";
      keyHint();
    }
    try {
      await api("settings", { liveProvider });
      const { models } = await api("models", { provider: liveProvider });
      model.replaceChildren(...models.map((m) => h("option", { value: m.id, text: m.label || m.id })));
      model.value = models.some((m) => m.id === settings.liveModel)
        ? settings.liveModel
        : (models[0]?.id ?? "");
      if (!models.length) throw Error("이 키로 조회된 Live 오디오 모델이 없습니다.");
      toast(`모델 ${models.length}개를 불러왔습니다.`, "ok");
    } finally {
      await loadConnections();
    }
  };
  const live = card(
    {},
    head(
      "mic",
      "듣기 음원 · Live 낭독",
      "TOEIC LC 대본을 실시간 음성 모델로 낭독하고, 전사와 대본을 단어 단위로 대조해 저장합니다.",
    ),
    field(
      "공급자",
      segmented(
        [
          ["gemini", "Gemini Live"],
          ["openai", "OpenAI Live"],
        ],
        liveProvider,
        (v) => ((liveProvider = v), model.replaceChildren(), keyHint()),
      ),
    ),
    h(
      "div",
      { class: "grid-2" },
      field("API 키 · 메모리에만 보관", liveKey),
      h(
        "div",
        { class: "field" },
        h("span", { class: "field-label", text: " " }),
        button("키 연결 · 모델 목록 갱신", refreshModels, { iconName: "refresh" }),
      ),
    ),
    h("div", { class: "grid-2" }, field("Live 오디오 모델", model), field("낭독 테스트 대본", script)),
    h(
      "div",
      { class: "row" },
      button(
        "선택 저장",
        async () => {
          if (!model.value) throw Error("모델을 선택하세요.");
          await api("settings", { liveProvider, liveModel: model.value });
          settings.liveModel = model.value;
          toast("Live 모델을 저장했습니다. 기존 음원은 유지됩니다.", "ok");
        },
        { kind: "primary" },
      ),
      button(
        "실제 낭독 테스트",
        async () => {
          if (!model.value) throw Error("모델을 선택하세요.");
          await api("settings", { liveProvider, liveModel: model.value });
          sample.replaceChildren(h("p", { class: "muted", text: "낭독 중… (최대 3회 시도)" }));
          try {
            const r = await api("test-live", { script: script.value });
            const bytes = Uint8Array.from(atob(r.wav), (c) => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
            disposeUrl();
            disposeUrl = () => URL.revokeObjectURL(url);
            sample.replaceChildren(
              h("audio", { controls: true, src: url }),
              diffView({ exact: true, ops: null, labels: null }, r.transcript),
            );
          } catch (error) {
            sample.replaceChildren(
              h("p", { class: "error-text", text: error.message }),
              error.detail ? diffView(error.detail.diff, error.detail.transcript) : null,
            );
          }
        },
        { iconName: "play" },
      ),
    ),
    sample,
    h("p", {
      class: "muted small",
      text: "무료 제공 여부는 계정 할당량에 따르며 유료 공급자로 자동 전환하지 않습니다. 숫자·가격·시각은 단어 표기와 숫자 표기를 같은 것으로 비교하고, 선택지 기호(A–D)는 전사가 빠지거나 ‘see’처럼 적혀도 통과로 봅니다.",
    }),
  );

  // ── Connections, updates, info ─────────────────────────────────────────
  const checks = card(
    {},
    head("refresh", "연결 상태 확인", "키와 로그인이 실제로 동작하는지 확인합니다."),
    h(
      "div",
      { class: "row" },
      ...[
        ["codex", "Codex"],
        ["gemini", "Gemini"],
        ["openai", "GPT API"],
      ].map(([id, label]) =>
        button(label + " 확인", async () => {
          try {
            await api("connection/check", { provider: id });
          } finally {
            await loadConnections();
          }
        }),
      ),
    ),
  );

  const info = await api("app-update");
  const updateNote = h("p", {
    class: "muted",
    text: `설치 버전 ${info.version}${info.enabled ? "" : " · 이 빌드는 앱 내 업데이트가 구성되지 않았습니다."}`,
  });
  const update = card(
    {},
    head(
      "refresh",
      "앱 업데이트",
      "GitHub 릴리스의 서명된 매니페스트와 설치 파일 해시를 검증한 뒤 설치합니다.",
    ),
    updateNote,
    button(
      "새 버전 확인",
      async () => {
        updateNote.textContent = "GitHub에서 확인 중…";
        const { update } = await api("app-update/check", {});
        if (!update) {
          updateNote.textContent = "최신 버전입니다 · " + info.version;
          return;
        }
        updateNote.textContent = "서명이 확인된 새 버전 " + update.version;
        if (
          !(await confirmDialog({
            title: `${update.version}을 설치할까요?`,
            body: "설치가 끝나면 앱이 다시 열립니다. 회차와 기록은 그대로 유지됩니다.",
            confirm: "설치",
          }))
        )
          return;
        updateNote.textContent = "설치 파일을 내려받아 검증하고 있습니다.";
        await api("app-update/install", { version: update.version });
        updateNote.textContent = "앱을 닫고 설치를 시작합니다.";
      },
      { disabled: !info.enabled },
    ),
  );

  const about = card(
    {},
    head("book", "데이터와 개인정보", ""),
    h("p", {
      class: "muted small",
      text: "회차·음원·사진·응시 기록은 이 PC의 사용자 데이터 폴더에만 저장됩니다. API 키는 파일에 저장하지 않으며, AI 호출은 생성·낭독 버튼을 눌렀을 때만 일어납니다. 완성된 회차의 응시와 채점은 인터넷 없이 동작합니다.",
    }),
    settings.dataRoot
      ? h("div", { class: "kv" }, h("span", { text: "저장 위치" }), h("code", { text: settings.dataRoot }))
      : null,
  );

  page.append(
    h(
      "header",
      { class: "page-head" },
      h("div", {}, h("span", { class: "eyebrow", text: "SETTINGS" }), h("h1", { text: "설정" })),
    ),
    h(
      "div",
      { class: "settings-grid" },
      h("div", { class: "stack" }, generation, codex, checks),
      h("div", { class: "stack" }, live, update, about),
    ),
  );
  syncText();
  return () => disposeUrl();
}

function head(ic, title, sub) {
  return h(
    "div",
    { class: "card-head stacked" },
    h("h2", {}, icon(ic, 18), " ", title),
    sub ? h("small", { class: "muted", text: sub }) : null,
  );
}
