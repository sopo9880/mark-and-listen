import { h, icon, card, chip, button, segmented, empty, fmtDate } from "./dom.mjs";
import { api, loadLibrary } from "./api.mjs";
import { partLabel, isAudioGroup } from "../lib/exams.mjs";
import { choiceMark, examName } from "./model.mjs";

export async function render(page) {
  const [episodes, { entries }] = await Promise.all([loadLibrary(), api("notebook")]);
  const byId = new Map(episodes.map((e) => [e.id, e]));
  const items = entries
    .map((n) => {
      const e = byId.get(n.episodeId);
      const g = e?.groups.find((g) => g.questions?.some((q) => q.id === n.questionId));
      const q = g?.questions.find((q) => q.id === n.questionId);
      return q ? { ...n, e, g, q } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.at - a.at);
  let scope = "open",
    exam = "all";
  const list = h("div", { class: "stack" });
  const counter = h("p", { class: "muted" });

  const draw = () => {
    const shown = items.filter(
      (x) =>
        (scope === "open" ? !x.mastered : scope === "mastered" ? x.mastered : true) &&
        (exam === "all" || x.e.exam === exam),
    );
    counter.textContent = `복습할 문항 ${items.filter((x) => !x.mastered).length}개 · 익힌 문항 ${items.filter((x) => x.mastered).length}개`;
    list.replaceChildren(
      ...(shown.length
        ? shown.map(practiceCard)
        : [
            empty(
              scope === "open" ? "복습할 오답이 없어요" : "표시할 문항이 없어요",
              "응시를 마치면 틀리거나 비운 문항이 여기에 모입니다. 다시 풀어 보고 ‘익혔어요’로 정리하세요.",
            ),
          ]),
    );
  };

  function practiceCard(x) {
    const { e, g, q } = x;
    let picked = null;
    const choices = h("ol", { class: "choices clickable" });
    const feedback = h("div");
    const drawChoices = () => {
      choices.replaceChildren(
        ...q.choices.map((c, i) =>
          h(
            "li",
            {},
            h(
              "button",
              {
                type: "button",
                class: [
                  "choice",
                  picked !== null && i === q.answer && "correct",
                  picked === i && i !== q.answer && "wrong",
                ],
                disabled: picked !== null,
                onclick: () => {
                  picked = i;
                  drawChoices();
                  feedback.replaceChildren(
                    h(
                      "p",
                      { class: i === q.answer ? "ok-text" : "error-text" },
                      i === q.answer ? "정답이에요!" : `오답 · 정답은 ${choiceMark(e, q.answer)}`,
                    ),
                    h("div", { class: "explain" }, h("strong", { text: "해설 " }), q.explanation),
                  );
                },
              },
              h("span", { class: "mark", text: choiceMark(e, i) }),
              h("span", { text: c }),
            ),
          ),
        ),
      );
    };
    drawChoices();
    const box = card(
      { class: ["note", x.mastered && "is-mastered"] },
      h(
        "div",
        { class: "note-head" },
        h(
          "div",
          {},
          h("strong", { text: partLabel(e, g.part) }),
          h("small", { class: "muted", text: ` · ${e.title} · ${fmtDate(x.at)}` }),
        ),
        h(
          "div",
          { class: "chips" },
          chip(examName(e)),
          chip(
            x.mark === null ? "미응답" : `내 답 ${choiceMark(e, x.mark)}`,
            x.mark === null ? "" : "danger",
          ),
        ),
      ),
      g.image || g.graphic
        ? h("img", {
            class: "figure small",
            src: g.image || g.graphic,
            alt: g.imageAlt || g.graphicAlt || "",
          })
        : null,
      ...(g.passages ?? []).map((p) =>
        h(
          "details",
          { class: "passage" },
          h("summary", { text: "지문 · " + p.title }),
          h("p", { text: p.body }),
        ),
      ),
      isAudioGroup(e, g) && g.segments.length
        ? h(
            "details",
            { class: "script-box" },
            h("summary", {}, icon("headphones", 16), " 듣기 대본 · 음원"),
            ...g.segments.map((s) =>
              h(
                "div",
                { class: "script-line" },
                h("p", { text: s.text }),
                s.audio ? h("audio", { controls: true, preload: "none", src: s.audio }) : null,
              ),
            ),
          )
        : null,
      h("p", { class: "q-text" }, q.question),
      choices,
      feedback,
      h(
        "div",
        { class: "row end" },
        h("a", { class: "btn btn-ghost btn-sm", href: "#/episode/" + e.id, text: "회차 열기" }),
        button(
          x.mastered ? "다시 복습 목록으로" : "익혔어요",
          async () => {
            await api("notebook", { key: x.key, mastered: !x.mastered });
            x.mastered = !x.mastered;
            draw();
          },
          { small: true, kind: x.mastered ? "" : "primary", iconName: x.mastered ? "refresh" : "check" },
        ),
      ),
    );
    return box;
  }

  page.append(
    h(
      "header",
      { class: "page-head" },
      h(
        "div",
        {},
        h("span", { class: "eyebrow", text: "WRONG ANSWER NOTE" }),
        h("h1", { text: "오답 노트" }),
        counter,
      ),
    ),
    h(
      "div",
      { class: "row wrap" },
      segmented(
        [
          ["open", "복습할 문항"],
          ["mastered", "익힌 문항"],
          ["all", "전체"],
        ],
        scope,
        (v) => ((scope = v), draw()),
      ),
      segmented(
        [
          ["all", "모든 시험관"],
          ["toeic", "TOEIC"],
          ["cbt", "객관식"],
        ],
        exam,
        (v) => ((exam = v), draw()),
      ),
    ),
    list,
  );
  draw();
}
