/* Lucian UX/UI Prompt #151 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#151 */
// 기여가 쌓이는 주간 격자 — study activity for the last 84 days on the home screen. The grid, the date slider,
// clicking a cell and the date/count readout are the element's own. Adaptations: real daily counts (questions
// answered in finished attempts), month labels from the actual range, today selected first, and cell levels
// set through the CSS object model instead of inline style attributes (the app's CSP forbids those).

const DAYS = 84;

/** days: Map of "YYYY-MM-DD" → number of questions answered that day. */
export function studyHeatmap(days, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DAYS - 1));
  const dates = Array.from(
    { length: DAYS },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
  const key = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const counts = dates.map((d) => days.get(key(d)) ?? 0);
  // 0–5 단계: 문항 수가 많을수록 진해집니다
  const level = (n) => (n <= 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : n < 100 ? 4 : 5);

  const root = document.createElement("div");
  root.className = "ux u151 u151-fluid";
  const month = document.createElement("div");
  month.className = "month";
  for (const m of [...new Set(dates.map((d) => d.getMonth() + 1))]) {
    const s = document.createElement("span");
    s.textContent = m + "월";
    month.append(s);
  }
  const heat = document.createElement("div");
  heat.className = "heat";
  heat.setAttribute("aria-hidden", "true");
  const cells = counts.map((n, i) => {
    const c = document.createElement("i");
    c.dataset.i = String(i);
    c.style.setProperty("--v", level(n));
    heat.append(c);
    return c;
  });
  const range = document.createElement("input");
  range.className = "range";
  range.type = "range";
  range.min = "0";
  range.max = String(DAYS - 1);
  range.step = "1";
  range.value = String(DAYS - 1);
  range.setAttribute("aria-label", "학습 기록 날짜");
  const inline = document.createElement("div");
  inline.className = "inline";
  const date = document.createElement("time");
  date.className = "date";
  const count = document.createElement("output");
  count.className = "count";
  count.setAttribute("aria-live", "polite");
  inline.append(date, count);
  root.append(month, heat, range, inline);

  function draw() {
    const i = +range.value;
    cells.forEach((t, n) => t.classList.toggle("chosen", n === i));
    const d = dates[i];
    const label = `${d.getMonth() + 1}월 ${d.getDate()}일${i === DAYS - 1 ? " · 오늘" : ""}`;
    date.textContent = label;
    count.textContent = counts[i] + "문항";
    range.setAttribute("aria-valuetext", label + ", " + counts[i] + "문항");
    root.dataset.state = String(i);
  }
  range.oninput = draw;
  heat.onpointerdown = (e) => {
    const t = e.target.closest("[data-i]");
    if (t) {
      range.value = t.dataset.i;
      draw();
    }
  };
  draw();
  return root;
}
