import { h, icon, card, chip, progress, empty, fmtDate, fmtClock } from "./dom.mjs";
import { api, loadLibrary } from "./api.mjs";
import { EXAMS } from "../lib/exams.mjs";
import {
  progressOf,
  openAttempt,
  finishedAttempts,
  percentOf,
  examName,
  STAGE_LABEL,
  STAGE_KIND,
  partsSummary,
} from "./model.mjs";

export async function render(page, { go }) {
  const [episodes, notebook] = await Promise.all([
    loadLibrary(),
    api("notebook").catch(() => ({ entries: [] })),
  ]);
  const active = episodes.map((e) => [e, openAttempt(e)]).find(([, a]) => a);
  const results = episodes
    .flatMap((e) => finishedAttempts(e).map((a) => ({ e, a, p: percentOf(a) })))
    .filter((r) => r.p !== null)
    .sort((x, y) => x.a.submittedAt - y.a.submittedAt);
  const drafts = episodes.filter((e) => progressOf(e).stage !== "ready");
  const ready = episodes.filter((e) => progressOf(e).stage === "ready");
  const open = notebook.entries.filter((n) => !n.mastered).length;
  const hour = new Date().getHours();
  const greeting =
    hour < 6
      ? "늦은 밤에도 꾸준하네요"
      : hour < 12
        ? "좋은 아침이에요"
        : hour < 18
          ? "오늘도 한 회차 해볼까요"
          : "오늘 하루 마무리 연습";

  const hero = h(
    "section",
    { class: "hero" },
    h(
      "div",
      { class: "hero-text" },
      h("span", { class: "eyebrow", text: "MARK & LISTEN" }),
      h("h1", { text: active ? "진행 중인 시험이 있어요" : greeting }),
      h("p", {
        text: active
          ? `${active[0].title} · ${EXAMS[active[0].exam].sections[active[1].phase]?.label ?? active[1].phase} 영역 · 남은 시간 ${fmtClock(active[1].phaseEndsAt - Date.now())}`
          : "회차를 만들고, 실전처럼 풀고, 틀린 문제만 다시 봅니다. 완성된 회차는 인터넷 없이도 응시할 수 있어요.",
      }),
    ),
    h(
      "div",
      { class: "hero-actions" },
      active
        ? h(
            "a",
            { class: "btn btn-accent btn-lg", href: `#/exam/${active[0].id}/${active[1].id}` },
            icon("play"),
            h("span", { text: "이어서 풀기" }),
          )
        : ready[0]
          ? h(
              "a",
              { class: "btn btn-accent btn-lg", href: `#/episode/${ready[0].id}` },
              icon("play"),
              h("span", { text: "준비된 회차 풀기" }),
            )
          : h(
              "a",
              { class: "btn btn-accent btn-lg", href: "#/halls" },
              icon("plus"),
              h("span", { text: "첫 회차 만들기" }),
            ),
      h(
        "a",
        { class: "btn btn-on-dark", href: "#/halls" },
        icon("halls"),
        h("span", { text: "시험관 둘러보기" }),
      ),
    ),
  );

  const avg = results.length
    ? Math.round(results.slice(-5).reduce((n, r) => n + r.p, 0) / Math.min(5, results.length))
    : null;
  const stats = h(
    "div",
    { class: "stats" },
    stat("응시 가능", ready.length, "회차"),
    stat("제작 중", drafts.length, "회차"),
    stat("최근 5회 평균", avg === null ? "—" : avg, avg === null ? "" : "%"),
    stat("복습할 오답", open, "문항", "#/notebook"),
  );

  const chart = card(
    { class: "trend" },
    h(
      "div",
      { class: "card-head" },
      h("h2", { text: "최근 성적" }),
      h("small", { class: "muted", text: "원점수 정답률 · 공식 환산 점수 아님" }),
    ),
    results.length
      ? h(
          "div",
          { class: "bars" },
          ...results.slice(-10).map((r) => {
            const col = h(
              "a",
              {
                class: "bar-col",
                href: `#/review/${r.e.id}/${r.a.id}`,
                title: `${r.e.title} · ${fmtDate(r.a.submittedAt)}`,
              },
              h("span", { class: "bar-val", text: Math.round(r.p) }),
            );
            const fill = h("i");
            fill.style.height = Math.max(4, r.p) + "%";
            col.append(fill);
            col.append(
              h("small", {
                text: new Date(r.a.submittedAt).toLocaleDateString("ko-KR", {
                  month: "numeric",
                  day: "numeric",
                }),
              }),
            );
            return col;
          }),
        )
      : h("p", {
          class: "muted",
          text: "아직 채점된 응시가 없어요. 첫 회차를 끝내면 추이가 여기에 쌓입니다.",
        }),
  );

  const working = card(
    {},
    h(
      "div",
      { class: "card-head" },
      h("h2", { text: "제작 중인 회차" }),
      h("a", { class: "link", href: "#/library", text: "전체 보기" }),
    ),
    drafts.length
      ? h("div", { class: "list" }, ...drafts.slice(0, 4).map((e) => episodeRow(e)))
      : h("p", { class: "muted", text: "제작 중인 회차가 없어요." }),
  );

  const hallCards = h(
    "div",
    { class: "hall-mini" },
    ...Object.values(EXAMS).map((x) =>
      h(
        "a",
        { class: "hall-chip hall-" + x.id, href: "#/create/" + x.id },
        h("strong", { text: x.hall }),
        h("small", { text: x.tagline }),
        icon("arrow", 16),
      ),
    ),
  );

  page.append(
    hero,
    stats,
    h(
      "div",
      { class: "grid-2" },
      chart,
      h(
        "div",
        { class: "stack" },
        working,
        card({}, h("div", { class: "card-head" }, h("h2", { text: "새 회차 만들기" })), hallCards),
      ),
    ),
  );
  if (!episodes.length)
    page.append(
      empty(
        "아직 회차가 없어요",
        "TOEIC관에서는 LC 음원까지, 객관식 시험관에서는 기사 필기 같은 과목형 시험을 만들 수 있어요.",
        h("a", { class: "btn btn-primary", href: "#/halls", text: "시험관으로" }),
      ),
    );
}

function stat(label, value, unit, href) {
  const body = [
    h("small", { text: label }),
    h("strong", {}, String(value), unit ? h("span", { text: unit }) : null),
  ];
  return href ? h("a", { class: "stat", href }, ...body) : h("div", { class: "stat" }, ...body);
}

export function episodeRow(e) {
  const p = progressOf(e);
  const done = finishedAttempts(e)[0];
  return h(
    "a",
    { class: "row-item", href: "#/episode/" + e.id },
    h(
      "div",
      { class: "row-main" },
      h(
        "div",
        { class: "row-title" },
        h("strong", { text: e.title }),
        chip(STAGE_LABEL[p.stage], STAGE_KIND[p.stage]),
      ),
      h("small", { class: "muted", text: `${examName(e)} · ${partsSummary(e)} · ${p.questions}문항` }),
      p.stage === "ready" ? null : progress(p.percent, 100),
    ),
    h(
      "div",
      { class: "row-side" },
      done
        ? h("strong", { class: "score", text: `${percentOf(done) ?? "—"}%` })
        : h("small", { class: "muted", text: p.stage === "ready" ? "미응시" : p.percent + "%" }),
      icon("arrow", 16),
    ),
  );
}
