import { h, segmented, empty } from "./dom.mjs";
import { loadLibrary } from "./api.mjs";
import { progressOf } from "./model.mjs";
import { episodeRow } from "./home.mjs";

export async function render(page) {
  const episodes = await loadLibrary();
  let filter = "all";
  const list = h("div", { class: "list list-cards" });
  const draw = () => {
    const shown = episodes.filter((e) => {
      const stage = progressOf(e).stage;
      if (filter === "ready") return stage === "ready";
      if (filter === "draft") return stage !== "ready";
      if (filter === "toeic" || filter === "cbt") return e.exam === filter;
      return true;
    });
    list.replaceChildren(
      ...(shown.length
        ? shown.map(episodeRow)
        : [
            empty(
              "해당하는 회차가 없어요",
              "",
              h("a", { class: "btn btn-primary", href: "#/halls", text: "새 회차 만들기" }),
            ),
          ]),
    );
  };
  page.append(
    h(
      "header",
      { class: "page-head" },
      h(
        "div",
        {},
        h("span", { class: "eyebrow", text: "LIBRARY" }),
        h("h1", { text: "내 회차" }),
        h("p", {
          class: "muted",
          text: `저장된 회차 ${episodes.length}개 · 모든 문항과 음원은 이 PC에만 저장됩니다.`,
        }),
      ),
      h("a", { class: "btn btn-primary", href: "#/halls", text: "새 회차" }),
    ),
    segmented(
      [
        ["all", "전체"],
        ["ready", "응시 가능"],
        ["draft", "제작 중"],
      ],
      filter,
      (v) => ((filter = v), draw()),
    ),
    list,
  );
  draw();
}
