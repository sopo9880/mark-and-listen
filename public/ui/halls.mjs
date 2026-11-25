import { h, icon, card, button, field, select, segmented, toast } from "./dom.mjs";
import { api, production } from "./api.mjs";
import { EXAMS, CBT_PRESETS, blueprint, cbtConfig, cbtBlueprint, phaseDurations } from "../lib/exams.mjs";
import { fmtMinutes } from "./dom.mjs";

export async function render(page, { params, go }) {
  const which = params[0];
  if (which === "toeic") return toeicForm(page, go);
  if (which === "cbt") return cbtForm(page, go);
  page.append(
    h(
      "header",
      { class: "page-head" },
      h(
        "div",
        {},
        h("span", { class: "eyebrow", text: "EXAM HALLS" }),
        h("h1", { text: "어떤 시험을 준비할까요?" }),
        h("p", {
          class: "muted",
          text: "시험관마다 파트 구성, 출제 단위, 시간과 채점 규칙을 따로 관리합니다.",
        }),
      ),
    ),
    h(
      "div",
      { class: "halls" },
      ...Object.values(EXAMS).map((x) =>
        h(
          "a",
          { class: "hall hall-" + x.id, href: "#/create/" + x.id },
          h("div", { class: "hall-badge" }, icon(x.id === "toeic" ? "headphones" : "book", 26)),
          h("h2", { text: x.hall }),
          h("small", { class: "hall-tag", text: x.tagline }),
          h("p", { text: x.description }),
          h(
            "ul",
            { class: "hall-points" },
            ...(x.id === "toeic"
              ? [
                  "LC 45분 → RC 75분 실전 타이머",
                  "Gemini / GPT Live 낭독 + 전사 자동 대조",
                  "실전 OMR 마킹 · 파트별 정답률",
                ]
              : [
                  "기사 필기 프리셋 · 과목 직접 구성",
                  "과목별 40점 과락 · 평균 60점 판정",
                  "4지·5지선다 · 한국어 해설",
                ]
            ).map((t) => h("li", {}, icon("check", 15), t)),
          ),
          h("span", { class: "btn btn-primary" }, h("span", { text: "입장하기" }), icon("arrow", 16)),
        ),
      ),
      h(
        "div",
        { class: "hall hall-soon" },
        h("div", { class: "hall-badge" }, icon("plus", 26)),
        h("h2", { text: "다음 시험관" }),
        h("p", { class: "muted", text: "토플·텝스·수능 영어 등 새 시험관은 같은 구조로 추가됩니다." }),
      ),
    ),
  );
}

function header(title, sub) {
  return h(
    "header",
    { class: "page-head" },
    h(
      "div",
      {},
      h("a", { class: "back", href: "#/halls" }, icon("back", 16), "시험관"),
      h("h1", { text: title }),
      h("p", { class: "muted", text: sub }),
    ),
  );
}

function toeicForm(page, go) {
  const spec = EXAMS.toeic.parts;
  const counts = Object.fromEntries(Object.entries(spec).map(([p, s]) => [p, s.count]));
  let scope = "full";
  const picked = new Set([2]);
  const title = h("input", {
    class: "input",
    type: "text",
    value: `TOEIC 실전 ${new Date().toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}`,
    maxLength: 100,
  });
  const partArea = h("div");
  const summary = h("div", { class: "summary" });
  const inputs = {};

  const apply = () => {
    for (const p of Object.keys(spec)) {
      const lc = spec[p].section === "LC";
      if (scope === "full") counts[p] = spec[p].count;
      if (scope === "lc") counts[p] = lc ? spec[p].count : 0;
      if (scope === "rc") counts[p] = lc ? 0 : spec[p].count;
      if (scope === "part") counts[p] = picked.has(Number(p)) ? spec[p].count : 0;
    }
    partArea.replaceChildren();
    if (scope === "part")
      partArea.append(
        h(
          "div",
          { class: "part-picker" },
          ...Object.entries(spec).map(([p, s]) =>
            h(
              "button",
              {
                type: "button",
                class: ["part-chip", picked.has(Number(p)) && "active"],
                onclick: () => (
                  picked.has(Number(p)) ? picked.delete(Number(p)) : picked.add(Number(p)),
                  apply()
                ),
              },
              h("strong", { text: "Part " + p }),
              h("small", { text: `${s.label} · ${s.count}문항` }),
            ),
          ),
        ),
      );
    if (scope === "full" || scope === "lc" || scope === "rc")
      partArea.append(
        h(
          "div",
          { class: "part-picker" },
          ...Object.entries(spec).map(([p, s]) =>
            h(
              "div",
              { class: ["part-chip", "static", counts[p] && "active"] },
              h("strong", { text: "Part " + p }),
              h("small", { text: counts[p] ? `${s.label} · ${counts[p]}문항` : `${s.label} · 제외` }),
            ),
          ),
        ),
      );
    if (scope === "custom")
      partArea.append(
        h(
          "div",
          { class: "part-grid" },
          ...Object.entries(spec).map(([p, s]) => {
            const n = h("input", {
              class: "input",
              type: "number",
              min: "0",
              max: String(s.count),
              step: String(p === "7" ? 1 : s.unit),
              value: String(counts[p]),
              oninput: () => ((counts[p] = Number(n.value)), refresh()),
            });
            inputs[p] = n;
            return field(
              `Part ${p} · ${s.label}`,
              n,
              s.unit > 1
                ? `${s.unit}문항 단위 · 최대 ${s.count}`
                : p === "7"
                  ? `2문항 이상 · 최대 ${s.count}`
                  : `최대 ${s.count}`,
            );
          }),
        ),
      );
    refresh();
  };

  const refresh = () => {
    let groups = [],
      error = "";
    try {
      groups = blueprint("toeic", counts);
    } catch (e) {
      error = e.message;
    }
    const lc = groups.filter((g) => g.part <= 4).reduce((n, g) => n + g.count, 0);
    const rc = groups.filter((g) => g.part > 4).reduce((n, g) => n + g.count, 0);
    const durations = groups.length
      ? phaseDurations({ exam: "toeic", groups, config: {} })
      : { LC: 0, RC: 0 };
    const segments = groups.reduce((n, g) => n + (g.part <= 2 ? g.count : g.part <= 4 ? g.count + 5 : 0), 0);
    summary.replaceChildren(
      h("h3", { text: "회차 요약" }),
      line("총 문항", `${lc + rc}문항`),
      line("Listening", lc ? `${lc}문항 · ${fmtMinutes(durations.LC)}` : "없음"),
      line("Reading", rc ? `${rc}문항 · ${fmtMinutes(durations.RC)}` : "없음"),
      line("AI 출제 요청", `${groups.length}회`),
      line("Live 낭독 구간", lc ? `약 ${segments}개` : "없음"),
      error ? h("p", { class: "error-text", text: error }) : null,
      h("p", {
        class: "muted small",
        text: "연습용 창작 문항이며 공식 TOEIC과 무관합니다. 점수는 원점수(정답 수)로만 표시합니다.",
      }),
      button(
        "회차 만들기",
        async () => {
          const e = await api("episodes", { exam: "toeic", counts, title: title.value });
          toast("회차를 만들었어요. 제작 스튜디오에서 생성을 시작하세요.", "ok");
          go("episode/" + e.id);
        },
        { kind: "primary", iconName: "plus", disabled: !!error },
      ),
    );
  };

  page.append(
    header(
      "TOEIC관",
      "Listening & Reading 회차를 구성합니다. Part 3·4는 3문항, Part 6은 4문항 단위로 지문이 잘리지 않게 묶입니다.",
    ),
    h(
      "div",
      { class: "form-layout" },
      h(
        "div",
        { class: "stack" },
        card(
          {},
          field("회차 이름", title),
          field(
            "출제 범위",
            segmented(
              [
                ["full", "전체 200"],
                ["lc", "LC 100"],
                ["rc", "RC 100"],
                ["part", "파트 선택"],
                ["custom", "세부 조정"],
              ],
              scope,
              (v) => ((scope = v), apply()),
            ),
          ),
          partArea,
        ),
        labs(go),
      ),
      h("aside", { class: "card sticky" }, summary),
    ),
  );
  apply();
}

const line = (k, v) => h("div", { class: "kv" }, h("span", { text: k }), h("strong", { text: v }));

function labs(go) {
  const fixed = async (counts, label) => {
    const e = await api("episodes", { exam: "toeic", counts, title: label, fixed: true });
    go("episode/" + e.id);
    production.start(e.id, { fixed: true }).catch((err) => toast(err.message, "error"));
  };
  return h(
    "details",
    { class: "card labs" },
    h("summary", {}, icon("wand", 17), h("strong", { text: "실험실 · 낭독 검증과 사진 파일럿" })),
    h("p", {
      class: "muted",
      text: "고정 대본 세트로 Live 낭독 → 전사 대조 → 검수 → 오프라인 응시 흐름을 먼저 확인하세요. 문항 생성 없이 음원만 만듭니다.",
    }),
    h(
      "div",
      { class: "row" },
      button("Part 2 · 5문항", () => fixed({ 2: 5 }, "고정 대본 · Part 2 5문항")),
      button("Part 3 · 화자 전환", () => fixed({ 3: 3 }, "고정 대본 · Part 3 화자 전환")),
      button("전체 LC 100문항", () => fixed({ 1: 6, 2: 25, 3: 39, 4: 30 }, "고정 대본 · 전체 LC")),
    ),
    h("hr"),
    photoPilot(go),
  );
}

async function jpegForPilot(file) {
  const picture = await createImageBitmap(file);
  try {
    const factor = Math.min(1, 1200 / Math.max(picture.width, picture.height));
    const canvas = h("canvas", {
      width: Math.max(1, Math.round(picture.width * factor)),
      height: Math.max(1, Math.round(picture.height * factor)),
    });
    canvas.getContext("2d", { alpha: false }).drawImage(picture, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const data = canvas.toDataURL("image/jpeg", quality).slice("data:image/jpeg;base64,".length);
      if (data.length <= 533336) return data;
    }
    throw Error("사진 크기가 너무 큽니다.");
  } finally {
    picture.close();
  }
}

function photoPilot(go) {
  const photos = h("input", { type: "file", multiple: true, accept: "image/jpeg", class: "input" });
  const provider = select(
    [
      ["gemini", "Gemini API"],
      ["openai", "GPT API"],
    ],
    "gemini",
  );
  const model = h("input", { class: "input", type: "text", placeholder: "예: gemini-2.5-flash" });
  return h(
    "div",
    { class: "stack" },
    h("h3", { text: "Part 1 · 사진 6장 파일럿" }),
    h("p", {
      class: "muted",
      text: "JPEG 6장을 고르면 선택한 이미지 입력 모델이 사진을 보고 문항을 만들고, 별도 호출로 정답 유일성·모호함·중복을 검사합니다. 사진은 이 PC에만 저장됩니다.",
    }),
    h(
      "div",
      { class: "grid-3" },
      field("JPEG 6장", photos),
      field("이미지 공급자", provider),
      field("모델 ID", model),
    ),
    button("사진으로 회차 만들기", async () => {
      if (photos.files.length !== 6) throw Error("사진을 정확히 6장 선택하세요.");
      if (!model.value.trim()) throw Error("이미지 입력 모델 ID를 입력하세요.");
      const images = await Promise.all(Array.from(photos.files, jpegForPilot));
      const e = await api("photo-pilot", { provider: provider.value, model: model.value.trim(), images });
      go("episode/" + e.id);
    }),
  );
}

function cbtForm(page, go) {
  let preset = CBT_PRESETS[0];
  let subjects = preset.subjects.map((name) => ({ name, count: 20, topics: "" }));
  let choices = 4,
    level = "실전",
    passRule = true;
  const title = h("input", {
    class: "input",
    type: "text",
    value: preset.name + " 모의고사",
    maxLength: 100,
  });
  const minutes = h("input", {
    class: "input",
    type: "number",
    min: "1",
    max: "300",
    value: String(preset.minutes),
    oninput: () => refresh(),
  });
  const list = h("div", { class: "subjects" });
  const summary = h("div", { class: "summary" });
  const presetSelect = select(
    CBT_PRESETS.map((p) => [p.id, p.name]),
    preset.id,
    {
      onchange: () => {
        preset = CBT_PRESETS.find((p) => p.id === presetSelect.value);
        subjects = preset.subjects.map((name) => ({
          name,
          count: preset.id === "custom" ? 10 : 20,
          topics: "",
        }));
        title.value = preset.id === "custom" ? "나의 객관식 회차" : preset.name + " 모의고사";
        minutes.value = String(preset.id === "custom" ? 15 : preset.minutes);
        renderSubjects();
      },
    },
  );
  const pass = h("input", {
    type: "checkbox",
    checked: true,
    onchange: () => ((passRule = pass.checked), refresh()),
  });

  const renderSubjects = () => {
    list.replaceChildren(
      h(
        "div",
        { class: "subject-head" },
        h("span", { text: "과목" }),
        h("span", { text: "문항" }),
        h("span", { text: "중점 범위 (선택)" }),
        h("span"),
      ),
      ...subjects.map((s, i) =>
        h(
          "div",
          { class: "subject-row" },
          h("input", {
            class: "input",
            type: "text",
            value: s.name,
            maxLength: 40,
            "aria-label": "과목 이름",
            oninput: (e) => ((s.name = e.target.value), refresh()),
          }),
          h("input", {
            class: "input",
            type: "number",
            min: "1",
            max: "60",
            value: String(s.count),
            "aria-label": "문항 수",
            oninput: (e) => ((s.count = Number(e.target.value)), refresh()),
          }),
          h("input", {
            class: "input",
            type: "text",
            value: s.topics,
            maxLength: 300,
            placeholder: "예: 보의 처짐, 비틀림",
            "aria-label": "중점 범위",
            oninput: (e) => (s.topics = e.target.value),
          }),
          h(
            "button",
            {
              type: "button",
              class: "icon-btn",
              title: "과목 삭제",
              disabled: subjects.length === 1,
              onclick: () => (subjects.splice(i, 1), renderSubjects()),
            },
            icon("x", 16),
          ),
        ),
      ),
      subjects.length < 8
        ? h(
            "button",
            {
              type: "button",
              class: "btn btn-ghost btn-sm",
              onclick: () => (
                subjects.push({ name: `과목 ${subjects.length + 1}`, count: 10, topics: "" }),
                renderSubjects()
              ),
            },
            icon("plus", 15),
            h("span", { text: "과목 추가" }),
          )
        : null,
    );
    refresh();
  };

  const refresh = () => {
    let cfg = null,
      error = "";
    try {
      cfg = cbtConfig({
        subjects,
        choices,
        minutes: Number(minutes.value),
        level,
        passRule: passRule ? "kts" : "none",
      });
    } catch (e) {
      error = e.message;
    }
    const total = subjects.reduce((n, s) => n + (Number(s.count) || 0), 0);
    summary.replaceChildren(
      h("h3", { text: "회차 요약" }),
      line("과목", `${subjects.length}과목`),
      line("총 문항", `${total}문항 · ${choices}지선다`),
      line("시험 시간", `${minutes.value || 0}분`),
      line("AI 출제 요청", cfg ? `${cbtBlueprint(cfg).length}회 (5문항씩)` : "—"),
      line("합격 판정", passRule ? "과목 40점 · 평균 60점" : "표시 안 함"),
      error ? h("p", { class: "error-text", text: error }) : null,
      h("p", {
        class: "muted small",
        text: "AI가 만든 문항은 정답·해설에 오류가 있을 수 있어요. 응시 후 복습에서 확인하고, 공식 출제기준은 Q-Net 등에서 확인하세요.",
      }),
      button(
        "회차 만들기",
        async () => {
          const e = await api("episodes", {
            exam: "cbt",
            title: title.value,
            config: {
              subjects,
              choices,
              minutes: Number(minutes.value),
              level,
              passRule: passRule ? "kts" : "none",
            },
          });
          toast("회차를 만들었어요. 바로 문항 생성을 시작합니다.", "ok");
          go("episode/" + e.id);
          production.start(e.id).catch((err) => toast(err.message, "error"));
        },
        { kind: "primary", iconName: "sparkle", disabled: !!error },
      ),
    );
  };

  page.append(
    header(
      "객관식 시험관",
      "기사·자격증 필기처럼 과목으로 구성된 객관식 시험을 만듭니다. 설정의 문항 생성 엔진(Codex·GPT·Gemini)을 사용합니다.",
    ),
    h(
      "div",
      { class: "form-layout" },
      h(
        "div",
        { class: "stack" },
        card(
          {},
          h(
            "div",
            { class: "grid-2" },
            field("프리셋", presetSelect, "과목 구성을 불러온 뒤 자유롭게 바꿀 수 있어요."),
            field("회차 이름", title),
          ),
          list,
        ),
        card(
          {},
          h(
            "div",
            { class: "grid-2" },
            field(
              "선택지",
              segmented(
                [
                  [4, "4지선다"],
                  [5, "5지선다"],
                ],
                choices,
                (v) => ((choices = v), refresh()),
              ),
            ),
            field(
              "난이도",
              segmented(
                [
                  ["기초", "기초"],
                  ["실전", "실전"],
                  ["심화", "심화"],
                ],
                level,
                (v) => (level = v),
              ),
            ),
          ),
          h(
            "div",
            { class: "grid-2" },
            field("시험 시간 (분)", minutes),
            h(
              "label",
              { class: "check" },
              pass,
              h(
                "span",
                {},
                h("strong", { text: "국가기술자격 필기 합격 기준 적용" }),
                h("small", { class: "muted", text: "과목별 40점 미만 과락, 전 과목 평균 60점 이상 합격" }),
              ),
            ),
          ),
        ),
      ),
      h("aside", { class: "card sticky" }, summary),
    ),
  );
  renderSubjects();
}
