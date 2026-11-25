import {
  h,
  icon,
  card,
  chip,
  button,
  progress,
  toast,
  confirmDialog,
  promptDialog,
  segmented,
  fmtDate,
  graphicTable,
} from "./dom.mjs";
import { api, loadEpisode, production, onChange, state } from "./api.mjs";
import { isAudioGroup, partLabel, LETTERS, examOf } from "../lib/exams.mjs";
import {
  progressOf,
  examName,
  partsSummary,
  attemptsOf,
  percentOf,
  choiceMark,
  STAGE_LABEL,
  STAGE_KIND,
} from "./model.mjs";

const openGroups = new Map();

// Production studio. Regular builds show progress only: generated questions, answers, scripts and photos stay
// hidden until the exam is over. Test builds add an inspector for checking content and audio.
export async function render(page, { params, go }) {
  const id = params[0];
  const testMode = !!state.testMode;
  let e = await loadEpisode(id);
  let filter = "all";
  const open = openGroups.get(id) ?? new Set();
  openGroups.set(id, open);

  const head = h("div");
  const pipeline = h("div");
  const history = h("div");
  const inspector = h("div", { class: "stack" });

  const reload = async () => {
    e = await loadEpisode(id);
    draw();
  };
  const replaceEpisode = (next) => {
    e = next;
    draw();
  };

  const draw = () => {
    const p = progressOf(e);
    head.replaceChildren(
      h(
        "header",
        { class: "page-head" },
        h(
          "div",
          {},
          h("a", { class: "back", href: "#/library" }, icon("back", 16), "내 회차"),
          h(
            "h1",
            { class: "title-edit" },
            e.title,
            h(
              "button",
              { type: "button", class: "icon-btn", title: "이름 바꾸기", onclick: rename },
              icon("edit", 16),
            ),
          ),
          h(
            "div",
            { class: "chips" },
            chip(examName(e)),
            chip(partsSummary(e)),
            chip(`${p.questions}문항`),
            chip(STAGE_LABEL[p.stage], STAGE_KIND[p.stage]),
            testMode && e.fixed ? chip("고정 대본", "info") : null,
          ),
        ),
        h(
          "div",
          { class: "row" },
          button("", remove, { iconName: "trash", title: "회차 삭제", kind: "ghost" }),
        ),
      ),
    );
    pipeline.replaceChildren(pipelineCard(e, p));
    history.replaceChildren(historyCard(e));
    if (testMode) inspector.replaceChildren(listenCard(e, p), groupsCard(e));
  };

  async function rename() {
    const title = await promptDialog({ title: "회차 이름 바꾸기", value: e.title });
    if (!title) return;
    replaceEpisode(await api("episodes/rename", { id, title }));
  }
  async function remove() {
    const ok = await confirmDialog({
      title: "회차를 삭제할까요?",
      body: "문항, 음원, 응시 기록과 이 회차의 오답 노트가 함께 삭제되며 되돌릴 수 없습니다.",
      confirm: "삭제",
      danger: true,
    });
    if (!ok) return;
    await api("episodes/delete", { id });
    toast("회차를 삭제했습니다.", "ok");
    go("library");
  }

  function pipelineCard(e, p) {
    const mine = production.episodeId === id && production.running;
    const other = production.running && !mine;
    const attempted = e.attempts.length > 0;
    const steps = [
      ["문항 생성 · 자동 검증", `${p.groupsReady} / ${p.groups}`, p.groupsReady === p.groups],
      p.hasAudio
        ? [
            "Live 음원 · 전사 대조",
            p.segments ? `${p.segmentsReady} / ${p.segments}` : "문항 생성 후",
            p.segments > 0 && p.segmentsReady === p.segments,
          ]
        : null,
      ["응시", `${attemptsOf(e).filter((a) => a.phase === "done").length}회 완료`, false],
    ].filter(Boolean);
    const current = steps.findIndex((s) => !s[2]);
    const openAttempt = attemptsOf(e).find((a) => a.phase !== "done");
    const start = (opts) => async () => {
      await production.start(id, opts);
      toast(production.message, "ok");
    };
    let cta;
    if (openAttempt)
      cta = h(
        "a",
        { class: "btn btn-accent btn-lg", href: `#/exam/${id}/${openAttempt.id}` },
        icon("play"),
        h("span", { text: "이어서 응시" }),
      );
    else if (p.ready)
      cta = button(
        attempted ? "다시 응시하기" : "응시 시작",
        async () => {
          const a = await api("attempt/start", { id });
          go(`exam/${id}/${a.id}`);
        },
        { kind: "accent", iconName: "play" },
      );
    else if (mine)
      cta = button(production.stopRequested ? "멈추는 중…" : "제작 중지", () => production.stop(), {
        iconName: "stop",
        disabled: production.stopRequested,
      });
    else if (p.stage === "failed")
      cta = button("실패 항목 다시 시도", start({ retryFailed: true }), {
        kind: "primary",
        iconName: "refresh",
        disabled: other || attempted,
      });
    else
      cta = button(
        p.groupsReady || p.segmentsReady ? "이어서 생성" : "생성 시작",
        start({ fixed: e.fixed }),
        { kind: "primary", iconName: "sparkle", disabled: other || attempted },
      );
    const status = mine
      ? production.message
      : other
        ? "다른 회차를 제작 중입니다. 끝난 뒤 시작할 수 있어요."
        : p.ready
          ? "준비가 끝났습니다. 인터넷 없이 응시할 수 있어요. 문항과 정답은 시험을 마친 뒤 복습에서 공개됩니다."
          : p.stage === "failed"
            ? `${p.failed}개 항목을 만들지 못했습니다. 설정(엔진·키·할당량)을 확인한 뒤 다시 시도하세요.`
            : "문항은 만들어지는 대로 다른 AI 호출이 다시 풀어 정답을 확인하고, 음원은 전사와 대본을 대조합니다. 언제든 멈추고 이어갈 수 있어요.";
    return card(
      { class: "pipeline" },
      h(
        "ol",
        { class: "steps" },
        ...steps.map(([label, sub, done], i) =>
          h(
            "li",
            { class: [done && "done", i === current && "current"] },
            h("span", { class: "step-dot" }, done ? icon("check", 14) : String(i + 1)),
            h("div", {}, h("strong", { text: label }), h("small", { text: sub })),
          ),
        ),
      ),
      h(
        "div",
        { class: "pipeline-foot" },
        h(
          "div",
          { class: "pipeline-status" },
          progress(p.percent, 100, p.ready ? "ok" : ""),
          h("small", { class: "muted", text: status }),
        ),
        cta,
      ),
    );
  }

  function historyCard(e) {
    const list = attemptsOf(e);
    if (!list.length) return h("div");
    return card(
      {},
      h("div", { class: "card-head" }, h("h2", { text: "응시 기록" })),
      h(
        "div",
        { class: "list" },
        ...list.map((a) => {
          const pct = a.phase === "done" ? percentOf(a) : null;
          return h(
            "div",
            { class: "row-item" },
            h(
              "div",
              { class: "row-main" },
              h("strong", { text: fmtDate(a.startedAt) }),
              h("small", {
                class: "muted",
                text:
                  a.phase === "done"
                    ? `${a.summary?.correct ?? 0} / ${a.summary?.total ?? 0} 정답 · 미응답 ${a.summary?.unsolved ?? 0}`
                    : `${examOf(e).sections[a.phase]?.label ?? a.phase} 영역 진행 중`,
              }),
            ),
            h(
              "div",
              { class: "row-side" },
              a.summary?.pass
                ? chip(a.summary.pass.passed ? "합격" : "불합격", a.summary.pass.passed ? "ok" : "danger")
                : null,
              pct !== null ? h("strong", { class: "score", text: pct + "%" }) : null,
              a.phase === "done"
                ? h("a", { class: "btn btn-sm", href: `#/review/${id}/${a.id}`, text: "복습" })
                : h("a", { class: "btn btn-sm btn-primary", href: `#/exam/${id}/${a.id}`, text: "이어서" }),
              a.phase === "done"
                ? button(
                    "",
                    async () => {
                      if (
                        !(await confirmDialog({
                          title: "이 응시 기록을 삭제할까요?",
                          confirm: "삭제",
                          danger: true,
                        }))
                      )
                        return;
                      replaceEpisode(await api("attempt/delete", { id, attemptId: a.id }));
                    },
                    { iconName: "trash", small: true, kind: "ghost", title: "기록 삭제" },
                  )
                : null,
            ),
          );
        }),
      ),
    );
  }

  // ── Test mode only ────────────────────────────────────────────────────
  function listenCard(e, p) {
    if (!p.hasAudio) return h("div");
    const slot = h("div", { class: "stack" });
    const results = h("div", { class: "check-list" });
    const drawResults = (list) =>
      results.replaceChildren(
        ...(list ?? []).map((r) =>
          h(
            "details",
            { class: ["check-item", r.exact ? "ok" : "bad"], open: !r.exact },
            h(
              "summary",
              {},
              chip(r.exact ? "일치" : "불일치", r.exact ? "ok" : "danger"),
              h("strong", { text: r.label }),
              h("small", { class: "muted", text: `${r.seconds}초` }),
            ),
            r.problems?.length
              ? h("ul", { class: "error-text" }, ...r.problems.map((t) => h("li", { text: t })))
              : null,
            diffView({ exact: r.exact, missing: r.missing, added: r.added, ops: r.ops }, r.transcript),
          ),
        ),
      );
    drawResults(e.listeningCheck?.results);
    const directions = !!e.directions;
    return card(
      { class: "test-card" },
      h(
        "div",
        { class: "card-head" },
        h("h2", {}, icon("headphones", 18), " 실전처럼 한 번에 듣기"),
        chip("테스트 모드", "info"),
      ),
      h("p", {
        class: "muted small",
        text: `시험과 같은 타임라인으로 이어 붙입니다: Part 1·2는 문항마다 5초, Part 3·4는 질문마다 8초 답안 시간, 대화 사이 0.35초${directions ? ", 안내 방송과 문항 번호 포함" : " (안내 방송·문항 번호는 전체 LC 회차에만 들어갑니다)"}.`,
      }),
      h(
        "div",
        { class: "row" },
        button(
          p.segmentsReady ? `전체 듣기 (${p.segmentsReady}/${p.segments} 구간)` : "준비된 음원 없음",
          () =>
            slot.replaceChildren(
              h("audio", {
                controls: true,
                autoplay: true,
                preload: "auto",
                src: `/api/listening/${id}.wav?t=${Date.now()}`,
              }),
            ),
          { kind: "primary", iconName: "play", disabled: !p.segmentsReady },
        ),
        button(
          "합친 음원 검증",
          async () => {
            const list = [];
            for (let index = 0; ; index++) {
              const r = await api("listening-check", { id, index });
              if (r.done) break;
              list.push(r.result);
              drawResults(list);
              toast(`검증 ${index + 1}/${r.total}`, "info", 1200);
            }
            const bad = list.filter((r) => !r.exact).length;
            toast(
              bad ? `문제 ${bad}곳을 찾았습니다.` : "합친 음원의 모든 구간이 대본·타임라인과 맞습니다.",
              bad ? "error" : "ok",
              6000,
            );
          },
          { iconName: "check", disabled: !p.segmentsReady || production.running },
        ),
      ),
      slot,
      results,
    );
  }

  function groupsCard(e) {
    return h(
      "div",
      { class: "groups" },
      h(
        "div",
        { class: "groups-head" },
        h("h2", {}, "문항 · 음원 점검 ", chip("테스트 모드", "info")),
        segmented(
          [
            ["all", "전체"],
            ["failed", "실패"],
          ],
          filter,
          (v) => ((filter = v), draw()),
        ),
      ),
      ...e.groups
        .filter(
          (g) =>
            filter === "all" ||
            g.status === "failed" ||
            (g.segments ?? []).some((s) => s.status === "failed"),
        )
        .map((g) => groupCard(g)),
    );
  }

  function groupCard(g) {
    const audio = isAudioGroup(e, g);
    const segs = g.segments ?? [];
    const details = h("details", {
      class: ["group", g.status === "failed" && "is-failed"],
      open: open.has(g.id),
      ontoggle: () => (details.open ? open.add(g.id) : open.delete(g.id)),
    });
    details.append(
      h(
        "summary",
        {},
        h(
          "div",
          { class: "group-title" },
          h("strong", { text: partLabel(e, g.part) }),
          h("small", {
            class: "muted",
            text: `${g.id} · ${g.count}문항${g.tries ? ` · 시도 ${g.tries}` : ""}`,
          }),
        ),
        h(
          "div",
          { class: "chips" },
          chip(
            g.status === "ready"
              ? g.verified
                ? "자동 검증 통과"
                : "준비"
              : g.status === "failed"
                ? "생성 실패"
                : "대기",
            g.status === "ready" ? "ok" : g.status === "failed" ? "danger" : "",
          ),
          audio && segs.length
            ? chip(
                `음원 ${segs.filter((s) => s.status === "ready").length}/${segs.length}`,
                segs.some((s) => s.status === "failed")
                  ? "danger"
                  : segs.every((s) => s.status === "ready")
                    ? "ok"
                    : "",
              )
            : null,
        ),
      ),
    );
    const fill = () => details.childElementCount === 1 && details.append(groupBody(g));
    if (details.open) fill();
    else details.addEventListener("toggle", () => details.open && fill());
    return details;
  }

  function groupBody(g) {
    const audio = isAudioGroup(e, g);
    const body = h("div", { class: "group-body" });
    if (g.error || g.lastError)
      body.append(
        h("p", {
          class: "error-text",
          text: [g.error, g.lastError && `마지막 내부 오류: ${g.lastError}`].filter(Boolean).join(" · "),
        }),
      );
    if (g.table) body.append(graphicTable(g.table));
    if (g.image || g.graphic)
      body.append(
        h("img", { class: "figure", src: g.image || g.graphic, alt: g.imageAlt || g.graphicAlt || "" }),
        g.photoName
          ? h(
              "div",
              { class: "row" },
              h("small", { class: "muted", text: "내장 사진 · " + g.photoName }),
              e.photoPart1 && !e.attempts.length
                ? button(
                    "다른 사진으로 교체",
                    async () => replaceEpisode(await api("episodes/swap-photo", { id, groupId: g.id })),
                    { small: true, iconName: "refresh", kind: "ghost", disabled: production.running },
                  )
                : null,
            )
          : null,
      );
    for (const p of g.passages ?? [])
      body.append(h("div", { class: "passage" }, h("h4", { text: p.title }), h("p", { text: p.body })));
    for (const [i, q] of (g.questions ?? []).entries())
      body.append(
        h(
          "div",
          { class: "q-preview" },
          h("p", { class: "q-text" }, h("b", { text: `Q${i + 1}. ` }), q.question),
          h(
            "ol",
            { class: "choices-preview" },
            ...q.choices.map((c, k) =>
              h(
                "li",
                { class: k === q.answer ? "answer" : "" },
                h("span", { class: "mark", text: choiceMark(e, k) }),
                c,
              ),
            ),
          ),
          h("p", { class: "explain", text: q.explanation }),
        ),
      );
    if (audio && g.segments?.length)
      body.append(h("h4", { text: "Live 음원" }), ...g.segments.map((s) => segmentView(g, s)));
    return body;
  }

  function segmentView(g, s) {
    const box = h("div", { class: ["segment", "seg-" + s.status] });
    box.append(
      h(
        "div",
        { class: "seg-top" },
        chip(s.speaker === "narrator" ? "내레이터" : "화자 " + s.speaker),
        h("small", { class: "muted", text: s.id }),
        s.attempts > 1 ? chip(`${s.attempts}회차 낭독`, "warn") : null,
      ),
      h("p", { class: "script", text: s.text }),
    );
    if (s.status === "ready")
      box.append(
        h("audio", { controls: true, preload: "none", src: s.audio }),
        diffView(s.diff, s.transcript),
      );
    if (s.status === "failed") {
      box.append(h("p", { class: "error-text", text: s.error || "생성 실패" }));
      if (s.lastTake)
        box.append(
          h("small", { class: "muted", text: "마지막 시도 비교" }),
          diffView(s.lastTake.diff, s.lastTake.transcript),
        );
    }
    if (!e.attempts.length && (s.status === "ready" || s.status === "failed"))
      box.append(
        h(
          "div",
          { class: "row" },
          button(
            "이 구간만 다시 낭독",
            async () => {
              await production.start(id, { retrySegment: s.id });
              await reload();
            },
            { small: true, iconName: "refresh", disabled: production.running },
          ),
        ),
      );
    return box;
  }

  let timer;
  const unsubscribe = onChange((what) => {
    if (what !== "production" || production.episodeId !== id) return;
    clearTimeout(timer);
    timer = setTimeout(() => reload().catch(() => {}), 150);
  });
  draw();
  page.append(head, pipeline, history, inspector);
  return () => {
    unsubscribe();
    clearTimeout(timer);
  };
}

const showToken = (t) =>
  t.startsWith("§") ? `(${t[1].toUpperCase()})` : t.endsWith("#") ? t.slice(0, -1) + "번째" : t;

export function diffView(diff, transcript) {
  const wrap = h("div", { class: "diff" });
  if (!diff) {
    wrap.append(h("small", { class: "muted", text: "전사 비교 정보 없음 — 직접 들어 확인하세요." }));
    return wrap;
  }
  wrap.append(
    h(
      "div",
      { class: "diff-head" },
      diff.exact ? chip("전사 일치", "ok") : chip("전사 불일치", "danger"),
      diff.labels?.unconfirmed
        ? chip(`선택지 기호 ${diff.labels.unconfirmed}개 전사 안 됨 · 직접 확인`, "warn")
        : null,
    ),
  );
  if (diff.ops) {
    const line = h("p", { class: "diff-line" });
    for (const op of diff.ops) {
      if (op.type === "equal") line.append(h("span", { text: op.tokens.map(showToken).join(" ") + " " }));
      if (op.missing?.length)
        line.append(
          h("del", { title: "대본에 있지만 들리지 않음", text: op.missing.map(showToken).join(" ") }),
          " ",
        );
      if (op.added?.length)
        line.append(h("ins", { title: "대본에 없는데 들림", text: op.added.join(" ") }), " ");
    }
    wrap.append(line);
  } else if (!diff.exact) {
    wrap.append(
      h(
        "p",
        { class: "diff-line" },
        diff.missing?.length ? h("del", { text: diff.missing.join(" ") }) : null,
        " ",
        diff.added?.length ? h("ins", { text: diff.added.join(" ") }) : null,
      ),
    );
  }
  wrap.append(h("small", { class: "muted transcript", text: "전사: " + (transcript || "없음") }));
  return wrap;
}
