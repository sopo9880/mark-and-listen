import { h, icon, card, chip, progress, segmented, fmtDate, fmtClock, graphicTable } from "./dom.mjs";
import { api, loadEpisode } from "./api.mjs";
import { examOf, partLabel, isAudioGroup } from "../lib/exams.mjs";
import { advanceAttempt } from "../lib/attempt.mjs";
import { scoreAttempt } from "../lib/scoring.mjs";
import { choiceMark, examName } from "./model.mjs";

export async function render(page, { params }) {
  const [id, attemptId] = params;
  const e = await loadEpisode(id);
  const raw = e.attempts.find((a) => a.id === attemptId);
  if (!raw) throw Error("응시 기록이 없습니다.");
  const a = advanceAttempt(raw);
  if (a.phase !== "done") {
    location.hash = `#/exam/${id}/${attemptId}`;
    return;
  }
  const result = scoreAttempt(e, a.marks);
  const exam = examOf(e);
  const pct = result.percent;
  let filter = result.total - result.correct ? "wrong" : "all";

  const ring = h(
    "div",
    { class: "ring" },
    h("strong", { text: `${result.correct}` }),
    h("small", { text: `/ ${result.total}` }),
  );
  ring.style.setProperty("--p", String(pct));

  const hero = card(
    { class: "result-hero" },
    ring,
    h(
      "div",
      { class: "result-text" },
      h("span", { class: "eyebrow", text: `${examName(e)} · ${fmtDate(a.submittedAt)}` }),
      h("h1", { text: e.title }),
      h(
        "div",
        { class: "chips" },
        chip(`정답률 ${pct}%`, pct >= 80 ? "ok" : pct >= 60 ? "info" : "warn"),
        chip(`미응답 ${result.unsolved}`),
        chip(`소요 ${fmtClock(a.submittedAt - a.startedAt)}`),
        result.pass
          ? chip(result.pass.passed ? "합격 기준 충족" : "불합격", result.pass.passed ? "ok" : "danger")
          : null,
      ),
      result.pass
        ? h("p", {
            class: "muted",
            text: `과목 평균 ${result.pass.average}점 (기준 ${result.pass.rule.averageMin}점)${result.pass.failed.length ? ` · 과락: ${result.pass.failed.map((p) => partLabel(e, p)).join(", ")}` : " · 과락 없음"}`,
          })
        : h("p", { class: "muted", text: "원점수(정답 수) 기준입니다. 공식 환산 점수가 아닙니다." }),
      h(
        "div",
        { class: "row" },
        h("a", { class: "btn", href: "#/episode/" + id }, icon("back", 16), h("span", { text: "회차로" })),
        h(
          "a",
          { class: "btn btn-primary", href: "#/notebook" },
          icon("notebook", 16),
          h("span", { text: "오답 노트" }),
        ),
      ),
    ),
  );

  const sections = Object.entries(result.bySection);
  const breakdown = card(
    {},
    h(
      "div",
      { class: "card-head" },
      h("h2", { text: e.exam === "toeic" ? "영역 · 파트별 정답률" : "과목별 점수" }),
    ),
    sections.length > 1
      ? h(
          "div",
          { class: "section-scores" },
          ...sections.map(([sid, sc]) =>
            h(
              "div",
              { class: "stat" },
              h("small", { text: exam.sections[sid].label }),
              h("strong", {}, `${sc.correct}`, h("span", { text: ` / ${sc.total}` })),
            ),
          ),
        )
      : null,
    h(
      "div",
      { class: "part-bars" },
      ...Object.entries(result.byPart).map(([part, p]) =>
        h(
          "div",
          { class: ["part-bar", result.pass?.failed.includes(Number(part)) && "failed"] },
          h("span", { text: partLabel(e, part) }),
          progress(
            p.correct,
            p.total,
            p.percent >= 80
              ? "ok"
              : p.percent >= (result.pass ? result.pass.rule.subjectMin : 50)
                ? ""
                : "danger",
          ),
          h("strong", {
            text: e.exam === "toeic" ? `${p.correct}/${p.total}` : `${Math.round(p.percent)}점`,
          }),
        ),
      ),
    ),
  );

  const list = h("div", { class: "review-list" });
  const draw = () => {
    list.replaceChildren();
    let shown = 0;
    for (const g of e.groups) {
      const rows = g.questions.map((q) => ({ q, r: result.rows.find((r) => r.id === q.id) }));
      const visible = rows.filter(
        ({ r }) => filter === "all" || (filter === "wrong" ? !r.correct : r.mark === null),
      );
      if (!visible.length) continue;
      shown += visible.length;
      const block = card(
        { class: "review-group" },
        h(
          "div",
          { class: "card-head" },
          h("h3", { text: partLabel(e, g.part) }),
          h("small", { class: "muted", text: g.id }),
        ),
      );
      if (g.image || g.graphic)
        block.append(
          h("img", { class: "figure", src: g.image || g.graphic, alt: g.imageAlt || g.graphicAlt || "" }),
        );
      if (g.table) block.append(graphicTable(g.table));
      for (const p of g.passages ?? [])
        block.append(
          h(
            "details",
            { class: "passage" },
            h("summary", { text: "지문 · " + p.title }),
            h("p", { text: p.body }),
          ),
        );
      if (isAudioGroup(e, g) && g.segments.length)
        block.append(
          h(
            "details",
            { class: "script-box" },
            h("summary", {}, icon("headphones", 16), " 듣기 대본 · 음원"),
            ...g.segments.map((sg) =>
              h(
                "div",
                { class: "script-line" },
                h("small", {
                  class: "muted",
                  text: sg.speaker === "narrator" ? "내레이션" : "화자 " + sg.speaker,
                }),
                h("p", { text: sg.text }),
                sg.audio ? h("audio", { controls: true, preload: "none", src: sg.audio }) : null,
              ),
            ),
          ),
        );
      for (const { q, r } of visible)
        block.append(
          h(
            "div",
            { class: ["review-q", r.correct ? "is-correct" : r.mark === null ? "is-blank" : "is-wrong"] },
            h("p", { class: "q-text" }, h("span", { class: "q-num", text: r.number }), q.question),
            h(
              "ol",
              { class: "choices review" },
              ...q.choices.map((c, i) =>
                h(
                  "li",
                  { class: [i === q.answer && "answer", i === r.mark && i !== q.answer && "mine"] },
                  h("span", { class: "mark", text: choiceMark(e, i) }),
                  h("span", { text: c }),
                  i === q.answer ? chip("정답", "ok") : i === r.mark ? chip("내 답", "danger") : null,
                ),
              ),
            ),
            r.mark === null ? h("p", { class: "muted small", text: "미응답" }) : null,
            h("div", { class: "explain" }, h("strong", { text: "해설 " }), q.explanation),
          ),
        );
      list.append(block);
    }
    if (!shown)
      list.append(
        h(
          "div",
          { class: "empty" },
          icon("check", 28),
          h("h3", { text: filter === "wrong" ? "틀린 문제가 없어요!" : "미응답 문항이 없어요" }),
        ),
      );
  };

  page.append(
    hero,
    breakdown,
    h(
      "div",
      { class: "groups-head" },
      h("h2", { text: "문항 복습" }),
      segmented(
        [
          ["wrong", `틀림·미응답 ${result.total - result.correct}`],
          ["blank", `미응답 ${result.unsolved}`],
          ["all", `전체 ${result.total}`],
        ],
        filter,
        (v) => ((filter = v), draw()),
      ),
    ),
    list,
  );
  draw();
  // Keep the per-question summary cached on the server for list views (older attempts may lack it).
  api("attempt/action", { id, attemptId, action: { type: "sync" } }).catch(() => {});
}
