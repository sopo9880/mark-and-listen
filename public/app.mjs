import { h, icon, toast } from "./ui/dom.mjs";
import { connect, onChange, production, loadConnections, state } from "./ui/api.mjs";
import * as home from "./ui/home.mjs";
import * as halls from "./ui/halls.mjs";
import * as library from "./ui/library.mjs";
import * as studio from "./ui/studio.mjs";
import * as exam from "./ui/exam.mjs";
import * as review from "./ui/review.mjs";
import * as notebook from "./ui/notebook.mjs";
import * as settings from "./ui/settings.mjs";

const NAV = [
  ["home", "홈", "home"],
  ["halls", "시험관", "halls"],
  ["library", "내 회차", "library"],
  ["notebook", "오답 노트", "notebook"],
  ["settings", "설정", "settings"],
];
const ROUTES = [
  [/^home$/, home, "home"],
  [/^halls$/, halls, "halls"],
  [/^create\/(toeic|cbt)$/, halls, "halls"],
  [/^library$/, library, "library"],
  [/^episode\/([\w-]+)$/, studio, "library"],
  [/^exam\/([\w-]+)\/([\w-]+)$/, exam, null],
  [/^review\/([\w-]+)\/([\w-]+)$/, review, "library"],
  [/^notebook$/, notebook, "notebook"],
  [/^settings$/, settings, "settings"],
];

const main = document.getElementById("main");
let dispose = () => {};
let generation = 0;

export const go = (path) => {
  if (location.hash === "#/" + path) route();
  else location.hash = "#/" + path;
};

async function route() {
  const path = location.hash.replace(/^#\/?/, "") || "home";
  const match = ROUTES.map(([re, view, nav]) => [re.exec(path), view, nav]).find(([m]) => m);
  const [m, view, nav] = match ?? [["home"], home, "home"];
  const mine = ++generation;
  try {
    dispose();
  } catch {
    // A view's cleanup failing must not block navigation.
  }
  dispose = () => {};
  document.body.classList.toggle("focus-mode", view === exam);
  for (const a of document.querySelectorAll("#nav a")) a.classList.toggle("active", a.dataset.nav === nav);
  main.replaceChildren(h("div", { class: "loading" }, h("span", { class: "spinner" })));
  try {
    const page = h("div", { class: "page" });
    const cleanup = await view.render(page, { params: m.slice(1), path, go });
    if (mine !== generation) return cleanup?.();
    main.replaceChildren(page);
    main.scrollTop = 0;
    dispose = cleanup ?? (() => {});
  } catch (error) {
    if (mine !== generation) return;
    main.replaceChildren(
      h(
        "div",
        { class: "page" },
        h(
          "div",
          { class: "empty" },
          icon("x", 28),
          h("h3", { text: "화면을 열지 못했습니다" }),
          h("p", { class: "muted", text: error.message }),
          h("a", { class: "btn", href: "#/home", text: "홈으로" }),
        ),
      ),
    );
  }
}

function renderNav() {
  document
    .getElementById("nav")
    .replaceChildren(
      ...NAV.map(([id, label, ic]) =>
        h("a", { href: "#/" + id, dataset: { nav: id } }, icon(ic), h("span", { text: label })),
      ),
    );
}

function renderJob() {
  const box = document.getElementById("job");
  box.hidden = !production.running && !production.message;
  if (box.hidden) return;
  const ep = state.episodes.find((e) => e.id === production.episodeId);
  box.replaceChildren(
    h(
      "div",
      { class: "job-head" },
      production.running ? h("span", { class: "pulse" }) : icon(production.lastError ? "x" : "check", 15),
      h("strong", {
        text: production.running ? "제작 중" : production.lastError ? "제작 중단" : "제작 완료",
      }),
    ),
    h("a", { href: "#/episode/" + production.episodeId, class: "job-title", text: ep?.title ?? "회차 열기" }),
    h("small", { text: production.message }),
    production.running
      ? h("button", {
          type: "button",
          class: "btn btn-sm",
          text: production.stopRequested ? "멈추는 중…" : "중지",
          disabled: production.stopRequested,
          onclick: () => production.stop(),
        })
      : h("button", {
          type: "button",
          class: "btn btn-sm btn-ghost",
          text: "닫기",
          onclick: () => ((production.message = ""), renderJob()),
        }),
  );
}

const CONNECTION = { unset: "미설정", unverified: "확인 전", connected: "연결됨", error: "오류" };
function renderConnections() {
  const c = state.connections;
  if (!c) return;
  document.getElementById("connections").replaceChildren(
    h("small", { class: "eyebrow", text: "연결 상태" }),
    ...[
      ["codex", "Codex"],
      ["gemini", "Gemini"],
      ["openai", "GPT API"],
    ].map(([id, label]) =>
      h(
        "a",
        { href: "#/settings", class: "conn", title: CONNECTION[c[id]] },
        h("span", { class: "dot dot-" + c[id] }),
        h("span", { text: label }),
        h("small", { text: c.loginPending && id === "codex" ? "로그인 중" : CONNECTION[c[id]] }),
      ),
    ),
  );
}

onChange((what) => {
  if (what === "production") renderJob();
  if (what === "connections") renderConnections();
});
window.addEventListener("hashchange", route);
window.addEventListener("unhandledrejection", (e) => toast(e.reason?.message ?? String(e.reason), "error"));

renderNav();
try {
  const session = await connect();
  document.getElementById("build").textContent =
    "v" + session.build + (session.testMode ? " · 테스트 모드" : " · Beta");
  document.body.classList.toggle("test-mode", !!session.testMode);
  await route();
  // The server checks connections by itself (start-up, key changes, every 10 minutes); keep the sidebar current.
  loadConnections().catch(() => {});
  setInterval(() => loadConnections().catch(() => {}), 15000);
  if (session.smoke)
    await (await import("./ui/api.mjs")).api("smoke", { uiReady: !!main.querySelector(".hero h1") });
} catch (error) {
  main.replaceChildren(
    h(
      "div",
      { class: "page" },
      h(
        "div",
        { class: "empty" },
        h("h3", { text: "앱 서버에 연결하지 못했습니다" }),
        h("p", { class: "muted", text: error.message }),
      ),
    ),
  );
}
