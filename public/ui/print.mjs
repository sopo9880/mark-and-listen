// Printable views of an episode, saved as PDF with the system print dialog ("Microsoft Print to PDF").
// test book (English, like the real one), answer sheet (OMR), and answer key with explanations and scripts.
import { h, icon } from "./dom.mjs";
import { loadEpisode } from "./api.mjs";
import { examOf, sectionOf, isAudioGroup, PAPER_DIRECTIONS, questionNumbers } from "../lib/exams.mjs";
import { groupMaterial } from "./material.mjs";
import { choiceMark } from "./model.mjs";

const KINDS = { paper: "시험지", omr: "답안지", key: "정답·해설·대본" };

export async function render(page, { params }) {
  const [id, kind] = params;
  const e = await loadEpisode(id);
  const exam = examOf(e);
  const numbers = questionNumbers(e);
  const toeic = e.exam === "toeic";
  document.body.classList.add("print-mode");
  page.classList.add("print-page");

  const bar = h(
    "div",
    { class: "print-bar" },
    h(
      "a",
      { class: "btn btn-ghost", href: "#/episode/" + id },
      icon("back", 16),
      h("span", { text: "회차로" }),
    ),
    h("strong", { text: `${e.title} · ${KINDS[kind]}` }),
    h("span", { class: "grow" }),
    h("small", {
      class: "muted",
      text: "인쇄 창에서 프린터를 ‘PDF로 저장’(또는 Microsoft Print to PDF)으로 고르면 PDF 파일이 됩니다.",
    }),
    h(
      "button",
      { type: "button", class: "btn btn-primary", onclick: () => window.print() },
      icon("book", 16),
      h("span", { text: "PDF로 저장 · 인쇄" }),
    ),
  );
  const sheet = h("article", { class: ["print-sheet", "sheet-" + kind] });
  page.append(bar, sheet);

  const sections = Object.entries(exam.sections).filter(([sid]) =>
    e.groups.some((g) => sectionOf(e, g) === sid),
  );
  const sectionTitle = (sid) =>
    toeic ? (exam.sections[sid].audio ? "LISTENING TEST" : "READING TEST") : exam.sections[sid].label;

  if (kind === "paper") {
    sheet.append(
      h(
        "header",
        { class: "print-cover" },
        h("h1", { text: e.title }),
        h("p", { text: toeic ? "Practice Test · Test Book" : "문제지" }),
      ),
    );
    for (const [sid] of sections) {
      const sec = h(
        "section",
        { class: "print-section" },
        h("h2", { class: "print-section-title", text: sectionTitle(sid) }),
      );
      let lastPart = null;
      for (const g of e.groups.filter((x) => sectionOf(e, x) === sid)) {
        if (g.part !== lastPart) {
          lastPart = g.part;
          sec.append(
            h("h3", {
              class: "part-title",
              text: toeic ? `PART ${g.part}` : (exam.parts?.[g.part]?.label ?? `Part ${g.part}`),
            }),
            toeic ? h("p", { class: "part-directions", text: PAPER_DIRECTIONS[g.part] }) : null,
          );
        }
        const block = h("div", { class: "q-group print-group" }, ...groupMaterial(g));
        for (const q of g.questions) {
          const listenOnly = toeic && q.part <= 2;
          block.append(
            h(
              "div",
              { class: "question" },
              h(
                "p",
                { class: "q-text" },
                h("span", { class: "q-num", text: numbers.get(q.id) }),
                listenOnly ? "Mark your answer on your answer sheet." : q.question,
              ),
              listenOnly
                ? null
                : h(
                    "ol",
                    { class: "choices" },
                    ...q.choices.map((c, i) =>
                      h(
                        "li",
                        {},
                        h("span", { class: "mark", text: `(${choiceMark(e, i)})` }),
                        h("span", { text: c }),
                      ),
                    ),
                  ),
            ),
          );
        }
        sec.append(block);
      }
      sheet.append(sec);
    }
  }

  if (kind === "omr") {
    sheet.append(
      h(
        "header",
        { class: "print-cover" },
        h("h1", { text: e.title }),
        h("p", { text: "ANSWER SHEET · 답안지" }),
      ),
      h(
        "div",
        { class: "omr-fields" },
        h("span", { text: "Name / 이름" }),
        h("span", { text: "Date / 날짜" }),
      ),
    );
    for (const [sid] of sections) {
      const qs = e.groups.filter((g) => sectionOf(e, g) === sid).flatMap((g) => g.questions);
      sheet.append(
        h("h2", { class: "print-section-title", text: sectionTitle(sid) }),
        h(
          "div",
          { class: "print-omr" },
          ...qs.map((q) =>
            h(
              "div",
              { class: "print-omr-row" },
              h("span", { class: "n", text: numbers.get(q.id) }),
              ...q.choices.map((_, i) => h("span", { class: "bubble", text: choiceMark(e, i) })),
            ),
          ),
        ),
      );
    }
  }

  if (kind === "key") {
    const all = e.groups.flatMap((g) => g.questions);
    sheet.append(
      h(
        "header",
        { class: "print-cover" },
        h("h1", { text: e.title }),
        h("p", { text: "정답 · 해설 · 듣기 대본" }),
      ),
      h("h2", { class: "print-section-title", text: "정답" }),
      h(
        "div",
        { class: "print-answers" },
        ...all.map((q) => h("span", {}, h("b", { text: numbers.get(q.id) }), " ", choiceMark(e, q.answer))),
      ),
    );
    for (const g of e.groups) {
      const block = h("section", { class: "print-group key-group" });
      const nums = g.questions.map((q) => numbers.get(q.id));
      block.append(
        h("h3", {
          text: `${toeic ? `Part ${g.part}` : (exam.parts?.[g.part]?.label ?? "")} · ${nums.length > 1 ? `${nums[0]}–${nums.at(-1)}` : nums[0]}`,
        }),
      );
      if (isAudioGroup(e, g) && g.segments?.length)
        block.append(
          h(
            "div",
            { class: "print-script" },
            h("strong", { text: "Script" }),
            ...g.segments.map((s) =>
              h("p", {}, h("b", { text: s.speaker === "narrator" ? "N" : s.speaker }), " ", s.text),
            ),
          ),
        );
      for (const q of g.questions)
        block.append(
          h(
            "div",
            { class: "key-item" },
            h(
              "p",
              {},
              h("b", { text: `${numbers.get(q.id)}. ` }),
              q.question || "",
              " ",
              h("span", {
                class: "key-answer",
                text: `정답 (${choiceMark(e, q.answer)}) ${q.choices[q.answer] ?? ""}`,
              }),
            ),
            q.explanation ? h("p", { class: "muted", text: q.explanation }) : null,
          ),
        );
      sheet.append(block);
    }
  }

  return () => document.body.classList.remove("print-mode");
}
