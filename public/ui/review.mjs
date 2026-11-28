import { groupMaterial, richText, questionFigure } from "./material.mjs";
import { h, icon, card, chip, progress, segmented, fmtDate, fmtClock, button } from "./dom.mjs";
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
  const ja = e.exam === "jlpt";
  const est = result.jlpt;
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
        est?.complete
          ? chip(
              `추정 ${est.total}/${est.max}점 · ${est.passed ? "합격권" : "불합격권"}`,
              est.passed ? "ok" : "danger",
            )
          : null,
        result.pass
          ? chip(result.pass.passed ? "합격 기준 충족" : "불합격", result.pass.passed ? "ok" : "danger")
          : null,
      ),
      est
        ? h("p", {
            class: "muted",
            text: est.complete
              ? `${est.level} 추정 점수입니다. 공식 JLPT는 문항 난이도로 환산(등화)하므로 실제 점수와 다를 수 있습니다. 합격선 ${est.passMark}점, 영역별 기준점 미달은 불합격입니다.`
              : `${est.level} 일부 問題만 푼 연습입니다. 영역별 추정 점수만 표시하고 합격 여부는 판정하지 않습니다.`,
          })
        : result.pass
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
      h("h2", {
        text:
          e.exam === "toeic" ? "영역 · 파트별 정답률" : ja ? "영역별 추정 점수 · 問題별 정답" : "과목별 점수",
      }),
    ),
    est
      ? h(
          "div",
          { class: "section-scores" },
          ...Object.values(est.sections).map((b) =>
            h(
              "div",
              { class: ["stat", b.score !== null && b.score < b.min && "failed"] },
              h("small", { text: `${b.label} · 기준 ${b.min}` }),
              h("strong", {}, b.score === null ? "—" : `${b.score}`, h("span", { text: ` / ${b.max}` })),
            ),
          ),
        )
      : null,
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
            text: e.exam === "cbt" ? `${Math.round(p.percent)}점` : `${p.correct}/${p.total}`,
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
      block.append(...groupMaterial(g, { open: false, ja }));
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
                  text:
                    sg.speaker === "narrator"
                      ? "내레이션"
                      : /^[FM]2?$/.test(sg.speaker)
                        ? (sg.speaker[0] === "F" ? "여성" : "남성") + (sg.speaker[1] ?? "")
                        : "화자 " + sg.speaker,
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
            h(
              "p",
              { class: "q-text", lang: ja ? "ja" : null },
              h("span", {
                class: ["q-num", ja && isAudioGroup(e, g) && "ja-num"],
                text: ja && isAudioGroup(e, g) ? `${r.number}番` : r.number,
              }),
              ...richText(q.question, ja),
            ),
            ja ? questionFigure(e, q, { small: true }) : null,
            h(
              "ol",
              { class: "choices review" },
              ...q.choices.map((c, i) =>
                h(
                  "li",
                  { class: [i === q.answer && "answer", i === r.mark && i !== q.answer && "mine"] },
                  h("span", { class: "mark", text: choiceMark(e, i) }),
                  h("span", { lang: ja ? "ja" : null }, ...richText(c, ja)),
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
    analysisCard(id, attemptId, a.analysis),
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

/** Codex weakness report: shown when saved, requested automatically once after grading. */
function analysisCard(id, attemptId, saved) {
  const body = h("div", { class: "analysis-body" });
  const head = h(
    "div",
    { class: "card-head" },
    h("h2", {}, icon("sparkle", 18), " 약점 분석"),
    h("small", { class: "muted", text: "Codex가 오답과 파트별 정답률을 보고 작성합니다" }),
  );
  const draw = (r) => {
    body.replaceChildren(
      h("p", { class: "analysis-summary", text: r.summary }),
      r.strengths?.length
        ? h("div", { class: "chips" }, ...r.strengths.map((t) => chip("강점 · " + t, "ok")))
        : null,
      h("h3", { text: "약점" }),
      h(
        "ol",
        { class: "weak-list" },
        ...r.weaknesses.map((w) =>
          h(
            "li",
            {},
            h("strong", { text: w.area }),
            h("p", { class: "muted small", text: w.evidence }),
            h("p", { text: "💡 " + w.tip }),
          ),
        ),
      ),
      h("h3", { text: "추천 학습" }),
      h(
        "ul",
        { class: "plan-list" },
        ...r.plan.map((p) =>
          h(
            "li",
            {},
            h("strong", { text: p.title }),
            p.minutes ? chip(`${p.minutes}분`) : null,
            h("p", { class: "muted small", text: p.detail }),
          ),
        ),
      ),
      h("p", { class: "next-focus" }, h("strong", { text: "다음 회차 집중: " }), r.nextFocus),
      h(
        "div",
        { class: "row end" },
        h("small", { class: "muted", text: `${fmtDate(r.at)} 분석` }),
        button("다시 분석", () => run(true), { small: true, kind: "ghost", iconName: "refresh" }),
      ),
    );
  };
  const run = async (refresh = false) => {
    body.replaceChildren(
      h(
        "p",
        { class: "muted" },
        h("span", { class: "pulse" }),
        " Codex가 응시 결과를 분석하는 중입니다… (최대 몇 분)",
      ),
    );
    try {
      draw(await api("attempt/analysis", { id, attemptId, refresh }));
    } catch (e) {
      body.replaceChildren(
        h("p", { class: "error-text", text: "분석하지 못했습니다: " + e.message }),
        h(
          "div",
          { class: "row" },
          button("다시 시도", () => run(refresh), { iconName: "refresh" }),
        ),
      );
    }
  };
  if (saved) draw(saved);
  else
    body.replaceChildren(
      h("p", {
        class: "muted",
        text: "오답과 파트별 정답률을 Codex가 읽고 약점과 추천 학습을 정리합니다. 누를 때만 Codex를 한 번 사용합니다.",
      }),
      h(
        "div",
        { class: "row" },
        button("약점 분석 받기", () => run(), { kind: "primary", iconName: "sparkle" }),
      ),
    );
  return card({ class: "analysis" }, head, body);
}
