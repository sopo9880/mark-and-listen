/* Lucian UX/UI Prompt #039 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#039 */
// 미끄러지는 알약 탭 — used as the app-wide segmented control. Ported from the element's script:
// the sliding ink pill, the selected-tab colors and ←/→ keyboard movement are unchanged; the demo
// list panel is dropped because each screen renders its own content through `onChange`.

/** options: [[id, label], …]; returns the `.ux.u039` root. */
export function segmented(options, value, onChange, label = "보기 선택") {
  const root = document.createElement("div");
  root.className = "ux u039 u039-inline";
  const tabsEl = document.createElement("div");
  tabsEl.className = "u039-tabs";
  tabsEl.setAttribute("role", "tablist");
  tabsEl.setAttribute("aria-label", label);
  const pill = document.createElement("span");
  pill.className = "u039-pill";
  pill.setAttribute("aria-hidden", "true");
  tabsEl.append(pill);
  let cur = Math.max(
    0,
    options.findIndex(([id]) => id === value),
  );
  const tabs = options.map(([, text], i) => {
    const t = document.createElement("button");
    t.className = "u039-tab";
    t.type = "button";
    t.setAttribute("role", "tab");
    t.textContent = text;
    t.addEventListener("click", () => select(i));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) {
        e.preventDefault();
        select((i + d + tabs.length) % tabs.length, true);
      }
    });
    tabsEl.append(t);
    return t;
  });
  root.append(tabsEl);

  function movePill(animate) {
    const t = tabs[cur];
    if (!t) return;
    if (!animate) pill.style.transition = "none";
    pill.style.setProperty("--x", t.offsetLeft + "px");
    pill.style.setProperty("--w", t.offsetWidth + "px");
    if (!animate) {
      void pill.offsetWidth;
      pill.style.transition = "";
    }
  }
  function mark() {
    tabs.forEach((t, k) => {
      t.setAttribute("aria-selected", String(k === cur));
      t.tabIndex = k === cur ? 0 : -1;
    });
  }
  function select(i, focus) {
    if (i === cur) return;
    cur = i;
    mark();
    if (focus) tabs[i].focus();
    movePill(true);
    onChange(options[i][0]);
  }
  mark();
  // The pill is measured once the bar is in the document, and again whenever its size changes (fonts, resize).
  const ro = new ResizeObserver(() => {
    if (!root.isConnected) return;
    movePill(false);
  });
  ro.observe(tabsEl);
  return root;
}
