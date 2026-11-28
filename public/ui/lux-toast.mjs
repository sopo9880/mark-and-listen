/* Lucian UX/UI Prompt #070 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#070 */
// 겹쳐 쌓이는 토스트 — the app's notifications. Ported from the element's script: stacking, hover/focus
// expansion that pauses the timer, swipe-to-dismiss, the close button and the timer bar are unchanged.
// Adaptations: a single fixed host for the whole app, real messages instead of the demo buttons, and the
// timer loop runs only while toasts are visible.

const ICON = {
  ok: '<svg viewBox="0 0 18 18"><path d="M4 9.4l3.2 3.2L14 5.6"/></svg>',
  error: '<svg viewBox="0 0 18 18"><path d="M9 5v5M9 13h.01"/></svg>',
  info: '<svg viewBox="0 0 18 18"><path d="M3.5 4.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>',
};
const COLOR = { ok: "var(--ux-mint)", error: "var(--ux-danger)", info: "var(--ux-accent)" };
const SUB = { ok: "방금", error: "확인이 필요해요", info: "알림" };

let root, zone, live;
let list = [],
  open = false,
  running = false,
  last = 0;
const rm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function host() {
  if (root?.isConnected) return;
  root = document.createElement("div");
  root.className = "ux u070 u070-host";
  zone = document.createElement("div");
  zone.className = "u070-zone";
  zone.setAttribute("role", "region");
  zone.setAttribute("aria-label", "알림");
  zone.tabIndex = -1;
  live = document.createElement("div");
  live.className = "u070-live";
  live.setAttribute("aria-live", "polite");
  zone.append(live);
  root.append(zone);
  document.body.append(root);
  zone.addEventListener("focusin", () => setOpen(true));
  zone.addEventListener("focusout", (e) => {
    if (!zone.contains(e.relatedTarget)) setOpen(false);
  });
}

// 접혀 있을 때는 뒤 알림을 작게 겹치고, 펼치면 높이만큼 위로 쌓아 목록처럼 보여 줍니다
function layout() {
  let acc = 0;
  list.forEach((t, i) => {
    const el = t.el;
    el.classList.toggle("back", !open && i > 0);
    if (open) {
      el.style.setProperty("--y", -acc + "px");
      el.style.setProperty("--s", 1);
      el.style.setProperty("--o", 1);
      acc += el.offsetHeight + 8;
    } else {
      el.style.setProperty("--y", -(i * 14) + "px");
      el.style.setProperty("--s", (1 - i * 0.06).toFixed(2));
      el.style.setProperty("--o", i > 2 ? 0 : 1);
    }
    el.style.zIndex = 50 - i;
    el.inert = !open && i > 0;
  });
}

function remove(t, dir) {
  const i = list.indexOf(t);
  if (i < 0) return;
  list.splice(i, 1);
  t.el.classList.add("leave");
  if (dir) {
    t.el.style.setProperty("--dir", dir);
    t.el.classList.add("side");
  }
  setTimeout(() => t.el.remove(), 450);
  if (!list.length) open = false;
  layout();
}

function setOpen(v) {
  if (open === v) return;
  open = v;
  layout();
}

// 펼쳐 둔 동안은 남은 시간이 줄지 않습니다
function loop(now) {
  const dt = now - last;
  last = now;
  if (!open)
    list.slice().forEach((t, i) => {
      if (i > 0 || t.left === Infinity) return;
      t.left -= dt;
      t.el.style.setProperty("--left", Math.max(0, t.left / t.dur).toFixed(3));
      if (t.left <= 0) remove(t);
    });
  if (list.length) requestAnimationFrame(loop);
  else running = false;
}

export function toast(message, kind = "info", ms = 4200, sub) {
  if (!message) return;
  host();
  const k = ICON[kind] ? kind : "info";
  const el = document.createElement("div");
  el.className = "u070-t enter";
  el.style.setProperty("--c", COLOR[k]);
  el.setAttribute("role", k === "error" ? "alert" : "status");
  el.innerHTML =
    '<span class="u070-ic" aria-hidden="true">' +
    ICON[k] +
    '</span><span class="u070-tx"><b></b><small></small></span><button class="u070-x" type="button" aria-label="알림 닫기"><svg viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/></svg></button><span class="u070-bar" aria-hidden="true"></span>';
  el.querySelector("b").textContent = message;
  el.querySelector("small").textContent = sub ?? SUB[k];
  const t = { el, left: ms, dur: ms };
  zone.append(el);
  list.unshift(t);
  void el.offsetWidth;
  el.classList.remove("enter");
  layout();
  live.textContent = message;
  el.querySelector(".u070-x").addEventListener("click", () => remove(t));
  // 커서를 올리면 겹친 알림이 목록으로 펼쳐지고 자동 사라짐이 멈춥니다 (호스트는 클릭을 통과시키므로 알림마다 감지)
  el.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse") setOpen(true);
  });
  el.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "mouse") return;
    setTimeout(() => {
      if (!zone.matches(":hover") && !zone.contains(document.activeElement)) setOpen(false);
    }, 60);
  });
  el.addEventListener("click", (e) => {
    if (!e.target.closest("button") && list.length > 1) setOpen(!open);
  });
  // 옆으로 밀어 닫기
  let sx = 0,
    dx = 0,
    down = false;
  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    down = true;
    sx = e.clientX;
    dx = 0;
    el.setPointerCapture(e.pointerId);
    el.classList.add("drag");
  });
  el.addEventListener("pointermove", (e) => {
    if (!down) return;
    dx = e.clientX - sx;
    el.style.setProperty("--dx", dx + "px");
    el.style.setProperty("--o", Math.max(0.2, 1 - Math.abs(dx) / 260));
  });
  const end = () => {
    if (!down) return;
    down = false;
    el.classList.remove("drag");
    if (Math.abs(dx) > 90) remove(t, dx > 0 ? 1 : -1);
    else {
      el.style.setProperty("--dx", "0px");
      layout();
    }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  if (rm()) el.classList.remove("enter");
  if (!running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }
}
