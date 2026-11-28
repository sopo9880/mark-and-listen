/* Lucian UX/UI Prompt #095 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#095 */
// 모양이 바뀌는 막대 차트 — recent scores on the home screen. Ported from the element's script: 12 reusable bars
// that morph between data sets, the rolling headline number, the average line, hover/pin/keyboard inspection
// and the tooltip are unchanged. Adaptations: real attempt data in percent (axis fixed at 0–100), changes
// shown in percentage points, and the card follows its container width.

/**
 * sets: [{ button, title, prefix, labels: [], full: [], values: [percent] }] — up to 3 sets, up to 12 values each.
 * onOpen(setIndex, barIndex) is called on double-click or Enter, e.g. to open that attempt's review.
 */
export function scoreBars(sets, { onOpen } = {}) {
  const root = document.createElement("div");
  root.className = "ux u095 u095-fluid";
  root.innerHTML =
    '<div class="u095-h"><div><div class="u095-top"><small class="u095-lab"></small><span class="u095-dl"></span></div><div class="u095-v"><b>0%</b></div></div>' +
    '<div class="u095-seg" role="group" aria-label="시험관"></div></div>' +
    '<div class="u095-ch"><div class="u095-grid" aria-hidden="true"></div><div class="u095-bars" role="group" aria-label="회차별 정답률"></div>' +
    '<div class="u095-avg" aria-hidden="true"><span></span></div><div class="u095-tip" aria-hidden="true"><span></span><small></small></div></div>';
  const lab = root.querySelector(".u095-lab"),
    big = root.querySelector(".u095-v b"),
    dl = root.querySelector(".u095-dl"),
    seg = root.querySelector(".u095-seg");
  const grid = root.querySelector(".u095-grid"),
    bars = root.querySelector(".u095-bars"),
    avg = root.querySelector(".u095-avg"),
    tip = root.querySelector(".u095-tip"),
    ch = root.querySelector(".u095-ch");
  const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const segs = sets.map((d, k) => {
    const s = document.createElement("button");
    s.type = "button";
    s.textContent = d.button;
    s.setAttribute("aria-pressed", "false");
    s.disabled = !d.values.length;
    s.addEventListener("click", () => {
      if (k !== set) draw(k);
    });
    seg.append(s);
    return s;
  });
  const B = [];
  for (let i = 0; i < 12; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "u095-b off";
    b.tabIndex = -1;
    b.innerHTML = "<i></i><em></em>";
    bars.appendChild(b);
    B.push(b);
  }
  const G = [0, 1, 2, 3].map((k) => {
    const g = document.createElement("div");
    g.className = "u095-gl";
    g.style.bottom = ((k / 3) * 100).toFixed(3) + "%";
    g.innerHTML = "<span></span>";
    grid.appendChild(g);
    return g;
  });
  let set = 0,
    act = -1,
    pin = -1,
    shown = 0,
    tw = 0;
  const fmt = (v) => Math.round(v) + "%";
  const axis = (v) => Math.round(v) + "";
  // 큰 숫자는 이전 값에서 새 값으로 굴러가듯 이어집니다
  function roll(to) {
    cancelAnimationFrame(tw);
    const from = shown,
      t0 = performance.now(),
      dur = rm ? 1 : 420;
    (function f(n) {
      const k = Math.min(1, (n - t0) / dur),
        e = 1 - Math.pow(1 - k, 3);
      shown = from + (to - from) * e;
      big.textContent = fmt(shown);
      if (k < 1) tw = requestAnimationFrame(f);
    })(t0);
  }
  const pts = (a, b) => (a - b >= 0 ? "+" : "−") + Math.abs(Math.round(a - b)) + "%p";
  function header() {
    const d = sets[set],
      idx = act >= 0 ? act : pin;
    if (idx >= 0) {
      lab.textContent = d.full[idx];
      roll(d.values[idx]);
      dl.textContent = idx ? "이전보다 " + pts(d.values[idx], d.values[idx - 1]) : "";
      dl.classList.toggle("dn", idx > 0 && d.values[idx] < d.values[idx - 1]);
    } else {
      const n = d.values.length;
      const mean = n ? d.values.reduce((a, b) => a + b, 0) / n : 0;
      lab.textContent = d.title;
      roll(mean);
      dl.textContent = n > 1 ? d.prefix + " " + pts(d.values[n - 1], d.values[0]) : "";
      dl.classList.toggle("dn", n > 1 && d.values[n - 1] < d.values[0]);
    }
  }
  // 막대 개수가 달라도 같은 12칸을 재사용해서 폭·높이가 이어서 바뀌게 합니다
  function draw(k, first) {
    set = k;
    act = -1;
    pin = -1;
    const d = sets[k],
      n = d.values.length,
      max = 100,
      mean = n ? d.values.reduce((a, b) => a + b, 0) / n : 0;
    segs.forEach((s, j) => s.setAttribute("aria-pressed", String(j === k)));
    seg.style.setProperty("--k", k);
    B.forEach((b, j) => {
      const on = j < n;
      b.classList.toggle("off", !on);
      b.classList.remove("on", "pin");
      b.classList.toggle("last", j === n - 1);
      b.style.setProperty("--d", j);
      b.style.setProperty("--pad", n > 8 ? "2.5px" : "5px");
      if (on) {
        b.querySelector("em").textContent = d.labels[j];
        b.setAttribute("aria-label", d.full[j] + " " + fmt(d.values[j]));
        b.style.setProperty("--h", first ? 0 : (d.values[j] / max).toFixed(3));
      } else b.style.setProperty("--h", 0);
      b.tabIndex = on && j === n - 1 ? 0 : -1;
    });
    if (first)
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          B.forEach((b, j) => {
            if (j < n) b.style.setProperty("--h", (d.values[j] / max).toFixed(3));
          }),
        ),
      );
    G.forEach((g, j) => {
      g.firstChild.textContent = axis((max * j) / 3);
      g.firstChild.style.opacity = Math.abs(j / 3 - mean / max) < 0.07 ? 0 : 1;
    });
    avg.style.setProperty("--a", (mean / max).toFixed(3));
    avg.firstChild.textContent = "평균";
    root.classList.remove("has");
    header();
  }
  function show(j) {
    act = j;
    B.forEach((b, k) => b.classList.toggle("on", k === j || (j < 0 && k === pin)));
    const idx = j >= 0 ? j : pin;
    root.classList.toggle("has", idx >= 0);
    if (idx >= 0) {
      const d = sets[set],
        b = B[idx];
      tip.firstChild.textContent = fmt(d.values[idx]);
      const sm = tip.querySelector("small");
      sm.textContent = idx ? pts(d.values[idx], d.values[idx - 1]) : "";
      sm.classList.toggle("dn", idx > 0 && d.values[idx] < d.values[idx - 1]);
      const cw = ch.clientWidth,
        tw2 = tip.offsetWidth,
        cx = b.offsetLeft + b.offsetWidth / 2;
      const hh = parseFloat(b.style.getPropertyValue("--h")) * (ch.clientHeight - 26);
      tip.style.setProperty("--tx", Math.max(0, Math.min(cw - tw2, cx - tw2 / 2)).toFixed(1) + "px");
      tip.style.setProperty("--ty", Math.max(-6, ch.clientHeight - 26 - hh - 36).toFixed(1) + "px");
    }
    header();
  }
  function idxAt(x) {
    const n = sets[set].values.length;
    let best = 0;
    for (let j = 0; j < n; j++) if (x >= B[j].getBoundingClientRect().left) best = j;
    return best;
  }
  bars.addEventListener("pointermove", (e) => show(idxAt(e.clientX)));
  bars.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") {
      bars.setPointerCapture(e.pointerId);
      show(idxAt(e.clientX));
    }
  });
  bars.addEventListener("pointerleave", () => show(-1));
  bars.addEventListener("click", (e) => {
    const b = e.target.closest(".u095-b");
    if (!b) return;
    const j = B.indexOf(b);
    pin = pin === j ? -1 : j;
    B.forEach((x, k) => x.classList.toggle("pin", k === pin));
    show(j);
  });
  bars.addEventListener("dblclick", (e) => {
    const j = B.indexOf(e.target.closest(".u095-b"));
    if (j >= 0) onOpen?.(set, j);
  });
  bars.addEventListener("keydown", (e) => {
    const n = sets[set].values.length,
      j = B.indexOf(document.activeElement);
    if (e.key === "Enter" && j >= 0) {
      e.preventDefault();
      onOpen?.(set, j);
      return;
    }
    let to =
      e.key === "ArrowRight"
        ? j + 1
        : e.key === "ArrowLeft"
          ? j - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    to = Math.max(0, Math.min(n - 1, to));
    B.forEach((b, k) => (b.tabIndex = k === to ? 0 : -1));
    B[to].focus();
    show(to);
  });
  bars.addEventListener("focusin", (e) => {
    const j = B.indexOf(e.target);
    if (j >= 0) show(j);
  });
  bars.addEventListener("focusout", (e) => {
    if (!bars.contains(e.relatedTarget)) show(-1);
  });
  draw(
    Math.max(
      0,
      sets.findIndex((d) => d.values.length),
    ),
    !rm,
  );
  return root;
}
