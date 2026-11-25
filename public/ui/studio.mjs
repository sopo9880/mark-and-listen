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
} from "./dom.mjs";
import { api, loadEpisode, production, onChange } from "./api.mjs";
import { isAudioGroup, partLabel, requiresReview, LETTERS, examOf } from "../lib/exams.mjs";
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

export async function render(page, { params, go }) {
  const id = params[0];
  let e = await loadEpisode(id);
  let filter = "all";
  const open = openGroups.get(id) ?? new Set();
  openGroups.set(id, open);

  const head = h("div");
  const pipeline = h("div");
  const history = h("div");
  const groupsBox = h("div", { class: "groups" });

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
            e.fixed ? chip("고정 대본", "info") : null,
            e.photoPilot ? chip("사진 파일럿", "info") : null,
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
    groupsBox.replaceChildren(
      h(
        "div",
        { class: "groups-head" },
        h("h2", { text: "문항 · 음원" }),
        segmented(
          [
            ["all", "전체"],
            ["todo", "검수 필요"],
            ["failed", "실패"],
          ],
          filter,
          (v) => ((filter = v), draw()),
        ),
      ),
      ...e.groups
        .filter((g) => {
          if (filter === "failed")
            return g.status === "failed" || (g.segments ?? []).some((s) => s.status === "failed");
          if (filter === "todo")
            return (
              g.status === "ready" &&
              ((requiresReview(e) && !g.reviewed) ||
                (isAudioGroup(e, g) && g.segments.some((s) => s.status === "ready" && !s.reviewed)))
            );
          return true;
        })
        .map((g) => groupCard(g)),
    );
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
      ["문항 생성", p.groupsReady, p.groups, p.groupsReady === p.groups],
      p.hasAudio
        ? ["Live 음원", p.segmentsReady, p.segments, p.segments > 0 && p.segmentsReady === p.segments]
        : null,
      p.reviewRequired || p.hasAudio
        ? [
            "검수",
            p.groupsReviewed * (p.reviewRequired ? 1 : 0) + p.segmentsReviewed,
            (p.reviewRequired ? p.groups : 0) + p.segments,
            p.ready,
          ]
        : null,
      ["응시", attemptsOf(e).filter((a) => a.phase === "done").length, null, false],
    ].filter(Boolean);
    const open = attemptsOf(e).find((a) => a.phase !== "done");
    let cta;
    if (open)
      cta = h(
        "a",
        { class: "btn btn-accent btn-lg", href: `#/exam/${id}/${open.id}` },
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
    else if (p.stage === "generate" || p.stage === "audio")
      cta = button(
        p.groupsReady || p.segmentsReady ? "이어서 생성" : "생성 시작",
        async () => {
          await production.start(id, { fixed: e.fixed });
          toast(production.message, "ok");
        },
        { kind: "primary", iconName: "sparkle", disabled: other || attempted },
      );
    else
      cta = button(
        "검수할 항목 보기",
        () => {
          filter = "todo";
          draw();
          groupsBox.scrollIntoView({ behavior: "smooth" });
        },
        { kind: "primary", iconName: "eye" },
      );
    return card(
      { class: "pipeline" },
      h(
        "ol",
        { class: "steps" },
        ...steps.map(([label, done, total, complete], i) =>
          h(
            "li",
            { class: [complete && "done", !complete && i === steps.findIndex((s) => !s[3]) && "current"] },
            h("span", { class: "step-dot" }, complete ? icon("check", 14) : String(i + 1)),
            h(
              "div",
              {},
              h("strong", { text: label }),
              h("small", { text: total === null ? `${done}회 완료` : `${done} / ${total}` }),
            ),
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
          h("small", {
            class: "muted",
            text: mine
              ? production.message
              : other
                ? "다른 회차를 제작 중입니다. 끝난 뒤 시작할 수 있어요."
                : attempted && !p.ready
                  ? "응시한 회차는 변경할 수 없습니다."
                  : p.ready
                    ? requiresReview(e) || p.hasAudio
                      ? "검수가 끝났습니다. 인터넷 없이 응시할 수 있어요."
                      : "AI 생성 문항입니다. 응시 후 복습에서 해설을 확인하세요."
                    : p.groupsFailed || p.segmentsFailed
                      ? `실패 ${p.groupsFailed + p.segmentsFailed}건 · '이어서 생성'으로 실패한 항목만 다시 시도합니다.`
                      : p.stage === "review"
                        ? "문항과 음원을 확인하고 승인하면 응시할 수 있어요."
                        : "생성은 언제든 멈추고 이어갈 수 있어요. 완료된 항목은 저장됩니다.",
          }),
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

  function groupCard(g) {
    const audio = isAudioGroup(e, g);
    const segs = g.segments ?? [];
    const details = h("details", {
      class: ["group", g.status === "failed" && "is-failed"],
      open: open.has(g.id),
      ontoggle: () => (details.open ? open.add(g.id) : open.delete(g.id)),
    });
    const reviewed = segs.filter((s) => s.reviewed).length;
    details.append(
      h(
        "summary",
        {},
        h(
          "div",
          { class: "group-title" },
          h("strong", { text: partLabel(e, g.part) }),
          h("small", { class: "muted", text: `${g.id} · ${g.count}문항` }),
        ),
        h(
          "div",
          { class: "chips" },
          chip(
            g.status === "ready" ? "문항 준비" : g.status === "failed" ? "생성 실패" : "대기",
            g.status === "ready" ? "ok" : g.status === "failed" ? "danger" : "",
          ),
          g.status === "ready" && requiresReview(e)
            ? chip(g.reviewed ? "문항 검수 ✓" : "문항 검수 전", g.reviewed ? "ok" : "warn")
            : null,
          audio && segs.length
            ? chip(
                `음원 ${segs.filter((s) => s.status === "ready").length}/${segs.length} · 검수 ${reviewed}`,
                reviewed === segs.length ? "ok" : segs.some((s) => s.status === "failed") ? "danger" : "",
              )
            : null,
        ),
      ),
    );
    if (!details.open) {
      details.addEventListener(
        "toggle",
        () => details.open && details.childElementCount === 1 && details.append(groupBody(g)),
        { once: false },
      );
      return details;
    }
    details.append(groupBody(g));
    return details;
  }

  function groupBody(g) {
    const audio = isAudioGroup(e, g);
    const body = h("div", { class: "group-body" });
    if (g.error) body.append(h("p", { class: "error-text", text: g.error }));
    if (g.image || g.graphic)
      body.append(
        h("img", { class: "figure", src: g.image || g.graphic, alt: g.imageAlt || g.graphicAlt || "" }),
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
    const attempted = e.attempts.length > 0;
    if (g.status === "ready" && requiresReview(e))
      body.append(
        h(
          "div",
          { class: "row" },
          button(
            g.reviewed ? "문항 검수 취소" : "문항·정답·지문 확인 완료",
            async () => replaceEpisode(await api("review", { id, groupId: g.id, approved: !g.reviewed })),
            { kind: g.reviewed ? "" : "primary", iconName: "check", small: true, disabled: attempted },
          ),
        ),
      );
    if (audio && g.segments?.length) {
      const verified = g.segments.filter((s) => s.status === "ready" && s.diff?.exact && !s.reviewed).length;
      body.append(
        h(
          "div",
          { class: "seg-head" },
          h("h4", { text: "Live 음원" }),
          verified
            ? button(
                `전사 일치 ${verified}개 일괄 승인`,
                async () =>
                  replaceEpisode(
                    await api("review", { id, groupId: g.id, segments: "verified", approved: true }),
                  ),
                { small: true, iconName: "check", disabled: attempted },
              )
            : null,
        ),
        ...g.segments.map((s) => segmentView(g, s, attempted)),
      );
    }
    return body;
  }

  function segmentView(g, s, attempted) {
    const box = h("div", { class: ["segment", "seg-" + s.status, s.reviewed && "is-reviewed"] });
    box.append(
      h(
        "div",
        { class: "seg-top" },
        chip(s.speaker === "narrator" ? "내레이터" : "화자 " + s.speaker),
        h("small", { class: "muted", text: s.id }),
        s.attempts > 1 ? chip(`${s.attempts}회차 낭독`, "warn") : null,
        s.reviewed ? chip("검수 ✓", "ok") : null,
      ),
      h("p", { class: "script", text: s.text }),
    );
    if (s.status === "ready") {
      box.append(h("audio", { controls: true, preload: "none", src: s.audio }));
      box.append(diffView(s.diff, s.transcript));
    }
    if (s.status === "failed") {
      box.append(h("p", { class: "error-text", text: s.error || "생성 실패" }));
      if (s.lastTake)
        box.append(
          h("small", { class: "muted", text: "마지막 시도 비교" }),
          diffView(s.lastTake.diff, s.lastTake.transcript),
        );
    }
    const actions = h("div", { class: "row" });
    if (s.status === "ready")
      actions.append(
        button(
          s.reviewed ? "승인 취소" : "직접 듣고 승인",
          async () =>
            replaceEpisode(
              await api("review", { id, groupId: g.id, segmentId: s.id, approved: !s.reviewed }),
            ),
          { small: true, kind: s.reviewed ? "" : "primary", iconName: "check", disabled: attempted },
        ),
      );
    if (s.status === "ready" || s.status === "failed")
      actions.append(
        button(
          "이 구간만 다시 낭독",
          async () => {
            await production.start(id, { retrySegment: s.id });
            await reload();
          },
          { small: true, iconName: "refresh", disabled: attempted || production.running },
        ),
      );
    box.append(actions);
    return box;
  }

  const unsubscribe = onChange((what) => {
    if (what !== "production" || production.episodeId !== id) return;
    clearTimeout(timer);
    timer = setTimeout(() => reload().catch(() => {}), 150);
  });
  let timer;
  draw();
  page.append(head, pipeline, history, groupsBox);
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

export { LETTERS };
