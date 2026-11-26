import { h, icon, card, button, field, select, segmented, toast, toastError, confirmDialog } from "./dom.mjs";
import { api, loadConnections, state } from "./api.mjs";
import { diffView } from "./studio.mjs";
import { themeSwitch } from "./lux-theme.mjs";

export async function render(page, { go }) {
  const settings = await api("settings");
  state.settings = settings;
  let disposeUrl = () => {};

  // ── Question generation & photo questions ───────────────────────────
  const generation = engineCard(settings, {
    iconName: "sparkle",
    title: "문항 생성 엔진",
    desc: "모든 시험관의 AI 출제와 내부 정답 검증은 Codex가 합니다.",
    modelKey: "textModel",
    effortKey: "textEffort",
    saved: "문항 생성 설정을 저장했습니다.",
  });
  const vision = engineCard(settings, {
    iconName: "eye",
    title: "사진 문항 엔진",
    desc: "앱에 내장된 Part 1 사진을 Codex가 직접 보고 문항을 만든 뒤, 별도 호출로 정답 유일성·모호함·장면 중복을 검사합니다.",
    modelKey: "visionModel",
    effortKey: "visionEffort",
    saved: "사진 문항 엔진을 저장했습니다.",
  });

  // ── Codex ──────────────────────────────────────────────────────────────
  const auto = h("input", {
    type: "checkbox",
    checked: settings.autoUpdate,
    onchange: () => api("settings", { autoUpdate: auto.checked }).catch((e) => toastError(e)),
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
  const sttModel = h("input", {
    class: "input",
    type: "text",
    value: settings.sttModel ?? "",
    maxLength: 160,
    placeholder: "자동",
  });
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
    (liveKey.placeholder = settings.keys[liveProvider]
      ? "저장된 키 사용 중 · 바꾸려면 새 키 입력"
      : "API 키");
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
      field("API 키 · 이 PC에 암호화해 저장", liveKey),
      h(
        "div",
        { class: "field" },
        h("span", { class: "field-label", text: " " }),
        button("키 연결 · 모델 목록 갱신", refreshModels, { iconName: "refresh" }),
      ),
    ),
    h("div", { class: "grid-2" }, field("Live 오디오 모델", model), field("낭독 테스트 대본", script)),
    field(
      "전사 검증 모델 · OpenAI 전용 · 비우면 gpt-transcribe",
      sttModel,
      "Gemini는 Live만 사용합니다: Live 자막과 음원 길이 검사로 확인하고(한 단어만 든 음원 차단) Flash 등 다른 모델은 부르지 않습니다.",
    ),
    h(
      "div",
      { class: "row" },
      button(
        "선택 저장",
        async () => {
          if (!model.value) throw Error("모델을 선택하세요.");
          await api("settings", {
            liveProvider,
            liveModel: model.value,
            sttModel: sttModel.value.trim(),
          });
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
              h("small", {
                class: "muted",
                text: "위 전사는 저장된 음원을 별도 모델로 다시 받아쓴 결과입니다.",
              }),
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
      text: "무료 제공 여부는 계정 할당량에 따르며 유료 공급자로 자동 전환하지 않습니다. 낭독마다 길이가 대본에 맞는지 확인하고, 저장된 음원을 별도 모델로 받아써 대본과 단어 단위로 비교합니다. 숫자·가격·시각의 표기 차이와 선택지 기호(A–D)의 동음어는 같은 것으로 봅니다. 목소리는 문항·대화마다 바뀝니다.",
    }),
  );

  // ── Connections, updates, info ─────────────────────────────────────────
  const checks = card(
    {},
    head(
      "refresh",
      "연결 상태 확인",
      "앱을 켤 때, 키를 저장할 때, 그리고 10분마다 자동으로 확인합니다. 지금 바로 확인하려면 누르세요.",
    ),
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

  const appearance = card(
    {},
    head("eye", "화면 테마", ""),
    h(
      "div",
      { class: "theme-row" },
      h(
        "div",
        {},
        h("strong", { text: "다크 모드" }),
        h("small", {
          class: "muted",
          text: "처음에는 시스템 설정을 따르고, 바꾸면 다음 실행에도 유지됩니다.",
        }),
      ),
      themeSwitch(),
    ),
  );

  const about = card(
    {},
    head("book", "데이터와 개인정보", ""),
    h("p", {
      class: "muted small",
      text: "회차·음원·사진·응시 기록은 이 PC의 사용자 데이터 폴더에만 저장됩니다. API 키는 이 PC 사용자 계정으로 암호화해 저장하며, AI 호출은 생성·낭독 버튼을 눌렀을 때만 일어납니다. 완성된 회차의 응시와 채점은 인터넷 없이 동작합니다.",
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
      h("div", { class: "stack" }, generation.card, vision.card, codex, checks),
      h("div", { class: "stack" }, appearance, live, update, about),
    ),
  );
  let disposeLog = () => {};
  if (state.testMode) {
    const devLog = logPanel();
    page.append(devLog.el);
    disposeLog = devLog.dispose;
  }
  return () => {
    disposeUrl();
    disposeLog();
  };
}

/** Test builds only: every server event (generation, Live sessions, errors) without a line limit. */
function logPanel() {
  let seen = 0,
    busy = false,
    alive = true;
  const out = h("pre", { class: "dev-log-out" });
  const follow = h("input", { type: "checkbox", checked: true });
  const status = h("span", { class: "muted small", text: "연결 중…" });
  const time = (t) => {
    const d = new Date(t);
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
  };
  const pull = async () => {
    if (busy || !alive) return;
    busy = true;
    try {
      for (;;) {
        const r = await api(`logs?since=${seen}`);
        if (r.count < seen) {
          seen = 0;
          out.replaceChildren();
          continue;
        }
        if (r.lines.length) {
          const frag = document.createDocumentFragment();
          for (const l of r.lines)
            frag.append(
              h("span", {
                class: "lv-" + l.level,
                text: `${time(l.t)}  ${l.level.padEnd(5)}  ${l.text.replace(/\n/g, " ⏎ ")}\n`,
              }),
            );
          out.append(frag);
          seen = r.from + r.lines.length;
          if (follow.checked) out.scrollTop = out.scrollHeight;
        }
        status.textContent = `${r.count}줄`;
        if (seen >= r.count) break;
      }
    } catch (e) {
      status.textContent = "로그를 읽지 못했습니다: " + e.message;
    } finally {
      busy = false;
    }
  };
  out.addEventListener("scroll", () => {
    follow.checked = out.scrollTop + out.clientHeight >= out.scrollHeight - 8;
  });
  const timer = setInterval(pull, 1000);
  void pull();
  const el = card(
    { class: "dev-log" },
    h(
      "div",
      { class: "card-head" },
      h("h2", {}, icon("terminal", 18), " 개발 로그"),
      h("span", { class: "grow" }),
      status,
      h("label", { class: "row small" }, follow, " 자동 스크롤"),
      button(
        "복사",
        () => navigator.clipboard?.writeText(out.textContent).then(() => toast("로그를 복사했습니다.")),
        {
          small: true,
        },
      ),
      button("화면 지우기", () => out.replaceChildren(), { small: true }),
    ),
    h("p", {
      class: "muted small",
      text: "테스트 빌드에서만 보입니다. 문항 생성, Live 세션 열림·닫힘, 음원별 결과와 오류 원문이 줄 수 제한 없이 쌓입니다. API 키는 ***로 가려집니다.",
    }),
    out,
  );
  return {
    el,
    dispose: () => {
      alive = false;
      clearInterval(timer);
    },
  };
}

function head(ic, title, sub) {
  return h(
    "div",
    { class: "card-head stacked" },
    h("h2", {}, icon(ic, 18), " ", title),
    sub ? h("small", { class: "muted", text: sub }) : null,
  );
}

/** Codex engine card shared by question generation and photo questions: model dropdown or free entry. */
function engineCard(settings, { iconName, title, desc, modelKey, effortKey, saved }) {
  let current = settings[modelKey] ?? "";
  const effort = select(
    [
      ["low", "low · 빠름"],
      ["medium", "medium · 기본"],
      ["high", "high · 꼼꼼함"],
      ["xhigh", "xhigh · 가장 깊게 (느림)"],
    ],
    settings[effortKey] ?? "medium",
  );
  let models = [];
  const manual = h("input", {
    class: "input",
    type: "text",
    value: current,
    maxLength: 160,
    placeholder: "모델 ID",
  });
  const manualField = field("모델 ID 직접 입력", manual);
  const box = h("div", { class: "stack" });
  let list;
  const draw = () => {
    const known = models.some((m) => m.id === current);
    list = select(
      [
        ["", "Codex 기본 모델"],
        ...models.map((m) => [m.id, m.label === m.id ? m.id : `${m.label} · ${m.id}`]),
        ["__manual", "직접 입력…"],
      ],
      known ? current : current ? "__manual" : "",
      { onchange: () => (manualField.hidden = list.value !== "__manual") },
    );
    manualField.hidden = list.value !== "__manual";
    box.replaceChildren(
      h(
        "div",
        { class: "model-row" },
        field(models.length ? `Codex 모델 (${models.length}개)` : "Codex 모델", list),
        button("목록 새로고침", load, { iconName: "refresh" }),
      ),
      manualField,
      field("추론 정도", effort, "Codex에 직접 전달합니다. 높을수록 문항 품질 검토가 꼼꼼하지만 느려집니다."),
      h("p", {
        class: "muted small",
        text: models.length
          ? "이 PC의 Codex가 로그인한 계정으로 받아 둔 모델 목록입니다. 선택한 값은 Codex CLI의 --model로 전달됩니다."
          : "Codex 모델 목록을 찾지 못했습니다. Codex에 로그인해 한 번 실행하면 목록이 생깁니다. 그 전에는 직접 입력하세요.",
      }),
    );
  };
  async function load() {
    try {
      ({ models } = await api("codex-models", {}));
    } catch {
      models = [];
    }
    draw();
  }
  const cardEl = card(
    {},
    head(iconName, title, desc),
    h("div", { class: "row" }, h("span", { class: "chip chip-info", text: "Codex · ChatGPT 로그인" })),
    box,
    h(
      "div",
      { class: "row end" },
      button(
        "저장",
        async () => {
          const model = list.value === "__manual" ? manual.value.trim() : list.value;
          await api("settings", { [modelKey]: model, [effortKey]: effort.value });
          settings[effortKey] = effort.value;
          settings[modelKey] = current = model;
          draw();
          toast(saved, "ok");
        },
        { kind: "primary" },
      ),
    ),
  );
  draw();
  void load();
  return { card: cardEl };
}
