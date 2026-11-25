import { h, icon, button, confirmDialog, toast, fmtClock, graphicTable } from "./dom.mjs";
import { api, loadEpisode } from "./api.mjs";
import { examOf, partLabel, audioTimeline, sectionOf, PAPER_DIRECTIONS } from "../lib/exams.mjs";
import { advanceAttempt, remainingSections, audioPosition } from "../lib/attempt.mjs";
import { choiceMark } from "./model.mjs";

export async function render(page, { params, go }) {
  const [id, attemptId] = params;
  const e = await loadEpisode(id);
  const exam = examOf(e);
  let s = await api("attempt/action", { id, attemptId, action: { type: "sync" } });
  if (s.phase === "done") {
    go(`review/${id}/${attemptId}`);
    return;
  }
  let stopped = false,
    chain = Promise.resolve(),
    played = null,
    armed = false,
    syncing = false,
    paintedPhase = null;
  const clickToMark = e.exam !== "toeic";
  const timeline = audioTimeline(e);
  const audio = h("audio", { hidden: true, preload: "auto" });
  const numbers = new Map();
  let n = 0;
  for (const g of e.groups) for (const q of g.questions) numbers.set(q.id, ++n);

  const sectionLabel = h("span", { class: "section-pill" });
  const clock = h("strong", { class: "clock" });
  const clockBar = h("i");
  const status = h("div", { class: "audio-status" });
  const listen = button(
    "듣기 시작",
    async () => {
      // The exam clock starts here, not when the attempt was opened.
      if (s.waiting) await act({ type: "begin" });
      armed = true;
      played = null;
      tick();
    },
    { kind: "accent", iconName: "headphones" },
  );
  const skip = button(
    "안내 건너뛰기",
    () => {
      const pos = audioPosition(s);
      const seg = timeline.find((t) => pos >= t.start && pos < t.end);
      if (!seg || seg.kind !== "direction") return;
      const next = timeline.find((t) => t.start >= seg.end);
      const target = (next ? next.start : seg.end) - 0.2;
      if (target > pos) {
        audio.pause();
        played = null;
        void act({ type: "skip", seconds: target - pos });
      }
    },
    { iconName: "arrow", kind: "ghost" },
  );
  skip.hidden = true;
  const finish = button(
    "",
    async () => {
      const left = sectionQuestions().filter((q) => !Object.hasOwn(s.marks, q.id)).length;
      const last = remainingSections(s).length <= 1;
      const ok = await confirmDialog({
        title: last ? "답안을 제출할까요?" : `${exam.sections[s.phase].label} 영역을 끝낼까요?`,
        body: `${left ? `미응답 ${left}문항이 있습니다. ` : ""}${last ? "제출하면 바로 채점됩니다." : "이 영역의 답안은 더 이상 고칠 수 없습니다."}`,
        confirm: last ? "제출" : "다음 영역으로",
        danger: !!left,
      });
      if (ok) await act({ type: "next" });
    },
    { kind: "primary" },
  );
  const leave = h(
    "a",
    { class: "btn btn-ghost", href: "#/episode/" + id, title: "시험 시간은 계속 흐릅니다" },
    icon("back", 16),
    h("span", { text: "나가기" }),
  );

  const paper = h("section", { class: "paper", "aria-label": "문제지" });
  const omr = h("section", { class: "omr", "aria-label": "답안지" });
  page.classList.add("exam-page");
  page.append(
    h(
      "header",
      { class: "exam-bar" },
      h("div", { class: "exam-title" }, h("strong", { text: e.title }), sectionLabel),
      h(
        "div",
        { class: "exam-clock" },
        icon("clock", 18),
        clock,
        h("span", { class: "clock-bar" }, clockBar),
      ),
      h("div", { class: "row" }, skip, listen, finish, leave),
    ),
    status,
    h("div", { class: "exam-body" }, paper, omr),
    audio,
  );

  const sectionQuestions = () =>
    e.groups.filter((g) => sectionOf(e, g) === s.phase).flatMap((g) => g.questions);

  function paint() {
    if (stopped) return;
    if (s.phase === "done") {
      stopAudio();
      go(`review/${id}/${attemptId}`);
      return;
    }
    const section = exam.sections[s.phase];
    sectionLabel.textContent = `${section.label}${Object.keys(s.durations).filter((k) => s.durations[k] > 0).length > 1 ? ` · ${remainingSections(s).length > 1 ? "다음 영역 있음" : "마지막 영역"}` : ""}`;
    finish.replaceChildren(
      icon(remainingSections(s).length <= 1 ? "flag" : "arrow", 17),
      h("span", { text: remainingSections(s).length <= 1 ? "제출" : "영역 종료" }),
    );
    // Sections without audio start with the same button.
    listen.hidden = !section.audio && !s.waiting;
    listen.querySelector("span:last-child").textContent = s.waiting
      ? section.audio
        ? "듣기 시작"
        : "시험 시작"
      : "이어 듣기";
    finish.disabled = !!s.waiting;
    if (paintedPhase !== s.phase) {
      paintedPhase = s.phase;
      drawPaper();
      paper.scrollTop = 0;
    }
    drawOmr();
  }

  function drawPaper() {
    paper.replaceChildren();
    let lastPart = null;
    for (const g of e.groups) {
      if (sectionOf(e, g) !== s.phase) continue;
      if (g.part !== lastPart) {
        lastPart = g.part;
        // The test book is English only, like the real one.
        if (e.exam === "toeic")
          paper.append(
            h("h2", { class: "part-title", text: `PART ${g.part}` }),
            h("p", { class: "part-directions", text: PAPER_DIRECTIONS[g.part] }),
          );
        else paper.append(h("h2", { class: "part-title", text: partLabel(e, g.part) }));
      }
      const block = h("div", { class: "q-group", dataset: { group: g.id } });
      if (g.image || g.graphic)
        block.append(
          h("img", { class: "figure", src: g.image || g.graphic, alt: g.imageAlt || g.graphicAlt || "" }),
        );
      if (g.table) block.append(graphicTable(g.table));
      for (const p of g.passages ?? [])
        block.append(
          h("article", { class: "passage" }, h("h4", { text: p.title }), h("p", { text: p.body })),
        );
      for (const q of g.questions) {
        const num = numbers.get(q.id);
        const listenOnly = e.exam === "toeic" && q.part <= 2;
        const qv = h(
          "div",
          { class: "question", id: "q-" + q.id },
          h(
            "p",
            { class: "q-text" },
            h("span", { class: "q-num", text: num }),
            listenOnly
              ? h("span", { class: "muted", text: "Mark your answer on your answer sheet." })
              : q.question,
          ),
        );
        if (!listenOnly)
          qv.append(
            h(
              "ol",
              { class: ["choices", clickToMark && "clickable"] },
              ...q.choices.map((c, i) =>
                clickToMark
                  ? h(
                      "li",
                      {},
                      h(
                        "button",
                        {
                          type: "button",
                          class: ["choice", s.marks[q.id] === i && "picked"],
                          dataset: { q: q.id, i },
                          onclick: () => mark(q, i),
                        },
                        h("span", { class: "mark", text: choiceMark(e, i) }),
                        h("span", { text: c }),
                      ),
                    )
                  : h("li", {}, h("span", { class: "mark", text: choiceMark(e, i) }), h("span", { text: c })),
              ),
            ),
          );
        block.append(qv);
      }
      paper.append(block);
    }
  }

  function drawOmr() {
    const qs = sectionQuestions();
    const answered = qs.filter((q) => Object.hasOwn(s.marks, q.id)).length;
    omr.replaceChildren(
      h(
        "div",
        { class: "omr-head" },
        h("strong", { text: "답안지" }),
        h("small", { text: `${answered} / ${qs.length}` }),
      ),
      h(
        "div",
        { class: "omr-grid" },
        ...qs.map((q) => {
          const num = numbers.get(q.id);
          return h(
            "div",
            { class: ["omr-row", Object.hasOwn(s.marks, q.id) && "answered"] },
            h("button", {
              type: "button",
              class: "omr-num",
              text: num,
              title: "문제로 이동",
              onclick: () =>
                document.getElementById("q-" + q.id)?.scrollIntoView({ behavior: "smooth", block: "center" }),
            }),
            ...q.choices.map((_, i) =>
              h("button", {
                type: "button",
                class: ["bubble", s.marks[q.id] === i && "filled"],
                "aria-label": `${num}번 ${choiceMark(e, i)}`,
                "aria-pressed": String(s.marks[q.id] === i),
                text: choiceMark(e, i),
                onclick: () => mark(q, i),
              }),
            ),
          );
        }),
      ),
    );
    if (clickToMark)
      for (const b of paper.querySelectorAll("button.choice"))
        b.classList.toggle("picked", s.marks[b.dataset.q] === Number(b.dataset.i));
  }

  function mark(q, i) {
    const next = s.marks[q.id] === i ? null : i;
    const marks = { ...s.marks };
    if (next === null) delete marks[q.id];
    else marks[q.id] = next;
    s = { ...s, marks };
    drawOmr();
    return act({ type: "mark", questionId: q.id, index: next });
  }

  function act(action) {
    const a = { ...action, phase: s.phase };
    chain = chain
      .then(async () => {
        s = await api("attempt/action", { id, attemptId, action: a });
        paint();
      })
      .catch((err) => toast(err.message, "error"));
    return chain;
  }

  function stopAudio() {
    audio.pause();
    audio.removeAttribute("src");
    played = null;
  }

  function tick() {
    if (stopped || s.phase === "done") return;
    const now = Date.now();
    if (s.waiting) {
      clock.textContent = fmtClock(s.durations[s.phase]);
      clockBar.style.width = "100%";
      status.hidden = false;
      skip.hidden = true;
      status.replaceChildren(
        icon("headphones", 16),
        h("span", {
          text: exam.sections[s.phase]?.audio
            ? "‘듣기 시작’을 누르면 시험 시간이 시작되고 파트 안내부터 재생됩니다."
            : "‘시험 시작’을 누르면 시험 시간이 시작됩니다.",
        }),
      );
      status.className = "audio-status";
      return;
    }
    const current = advanceAttempt(s, now);
    const left = Math.max(0, current.phaseEndsAt - now);
    clock.textContent = fmtClock(left);
    clock.classList.toggle("urgent", left < 5 * 60000);
    clockBar.style.width = `${(left / current.durations[current.phase] || 0) * 100}%`;
    if (current.phase !== s.phase && !syncing) {
      syncing = true;
      act({ type: "sync" }).finally(() => (syncing = false));
      return;
    }
    if (!exam.sections[s.phase]?.audio) {
      stopAudio();
      status.hidden = true;
      skip.hidden = true;
      return;
    }
    status.hidden = false;
    const elapsed = audioPosition(s, now);
    const seg = timeline.find((t) => elapsed >= t.start && elapsed < t.end);
    skip.hidden = !armed || seg?.kind !== "direction";
    listen.hidden = armed;
    if (!armed) {
      status.replaceChildren(
        icon("headphones", 16),
        h("span", { text: "재생이 멈췄습니다. ‘이어 듣기’를 누르면 지금 시험 위치부터 이어서 재생됩니다." }),
      );
      status.className = "audio-status warn";
      return;
    }
    if (!seg) {
      audio.pause();
      status.replaceChildren(
        icon("edit", 16),
        h("span", {
          text:
            elapsed > (timeline.at(-1)?.end ?? 0)
              ? "듣기 음원이 끝났습니다. 남은 시간 동안 답안을 확인하세요."
              : "답안 작성 시간",
        }),
      );
      status.className = "audio-status";
      return;
    }
    if (played !== seg.id) {
      played = seg.id;
      audio.src = seg.audio;
      audio.onloadedmetadata = () => {
        audio.currentTime = Math.min(
          Math.max(0, audioPosition(s) - seg.start),
          Math.max(0, audio.duration - 0.05),
        );
      };
      audio.play().catch(() => {
        armed = false;
        status.replaceChildren(h("span", { text: "재생이 차단되었습니다. ‘듣기 시작’을 눌러 주세요." }));
      });
    }
    status.replaceChildren(
      h("span", { class: "pulse" }),
      h("span", {
        text:
          seg.kind === "direction"
            ? "재생 중 · 안내 방송"
            : `재생 중 · ${partLabel(e, e.groups.find((g) => g.id === seg.groupId)?.part)} · ${seg.speaker === "narrator" ? "내레이션" : "화자 " + seg.speaker}`,
      }),
    );
    status.className = "audio-status live";
  }

  paint();
  const timer = setInterval(tick, 250);
  tick();
  return () => {
    stopped = true;
    clearInterval(timer);
    stopAudio();
  };
}
