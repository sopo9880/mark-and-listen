// Renders typed test documents (see lib/docs.mjs). The same elements are used on the exam screen, in review and in
// the printable PDF views. Text is always set as text; SVG is built from numbers and escaped labels only.
import { h } from "./dom.mjs";

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const paras = (text) =>
  String(text)
    .split(/\n{2,}|\n/)
    .map((p) => h("p", { text: p }));
const kv = (list, cls = "doc-kv") =>
  h("dl", { class: cls }, ...list.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })]));
const svg = (markup, cls) => {
  const box = h("div", { class: cls });
  box.innerHTML = markup; // built only from numbers and esc()'d strings
  return box;
};

const PALETTE = ["#2f5bd3", "#e07a2f", "#2a9d6f"];

function chart(d) {
  const W = 460,
    H = 240,
    L = 44,
    B = 34,
    T = 16;
  const all = d.series.flatMap((s) => s.values);
  if (d.chart === "pie") {
    const vals = d.series[0].values;
    const sum = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    let a0 = -Math.PI / 2;
    const cx = 120,
      cy = 120,
      r = 95;
    const slices = vals.map((v, i) => {
      const a1 = a0 + (Math.max(0, v) / sum) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = `M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z`;
      const mid = (a0 + a1) / 2;
      a0 = a1;
      const shade = `hsl(${(i * 67) % 360} 55% ${48 + (i % 2) * 10}%)`;
      return `<path d="${p}" fill="${shade}" stroke="#fff" stroke-width="2"/><text x="${cx + r * 0.62 * Math.cos(mid)}" y="${cy + r * 0.62 * Math.sin(mid)}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="#fff" font-weight="700">${Math.round((Math.max(0, v) / sum) * 100)}%</text>`;
    });
    const legend = d.labels
      .map(
        (l, i) =>
          `<rect x="260" y="${30 + i * 24}" width="12" height="12" fill="hsl(${(i * 67) % 360} 55% ${48 + (i % 2) * 10}%)"/><text x="280" y="${40 + i * 24}" font-size="13">${esc(l)}</text>`,
      )
      .join("");
    return svg(
      `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(d.title)}">${slices.join("")}${legend}</svg>`,
      "chart-svg",
    );
  }
  const max = Math.max(...all, 0),
    min = Math.min(...all, 0);
  const span = max - min || 1;
  const step =
    Math.pow(10, Math.floor(Math.log10(span))) *
    (span / Math.pow(10, Math.floor(Math.log10(span))) > 5 ? 2 : 1);
  const top = Math.ceil(max / step) * step,
    bottom = Math.floor(min / step) * step;
  const y = (v) => T + ((top - v) / (top - bottom || 1)) * (H - T - B);
  const n = d.labels.length,
    slot = (W - L - 10) / n;
  let grid = "";
  for (let v = bottom; v <= top + 1e-9; v += step)
    grid += `<line x1="${L}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="#ddd"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#555">${+v.toFixed(2)}</text>`;
  const labels = d.labels
    .map(
      (l, i) =>
        `<text x="${L + slot * (i + 0.5)}" y="${H - 12}" text-anchor="middle" font-size="12">${esc(l)}</text>`,
    )
    .join("");
  let marks = "";
  d.series.forEach((s, k) => {
    const color = PALETTE[k % PALETTE.length];
    if (d.chart === "bar") {
      const bw = (slot * 0.7) / d.series.length;
      s.values.forEach((v, i) => {
        const x = L + slot * i + slot * 0.15 + bw * k;
        marks += `<rect x="${x}" y="${Math.min(y(v), y(0))}" width="${bw}" height="${Math.abs(y(v) - y(0))}" fill="${color}"/>`;
      });
    } else {
      const pts = s.values.map((v, i) => `${L + slot * (i + 0.5)},${y(v)}`).join(" ");
      marks += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5"/>${s.values.map((v, i) => `<circle cx="${L + slot * (i + 0.5)}" cy="${y(v)}" r="3.5" fill="${color}"/>`).join("")}`;
    }
  });
  const legend =
    d.series.length > 1
      ? d.series
          .map(
            (s, k) =>
              `<rect x="${L + k * 120}" y="0" width="10" height="10" fill="${PALETTE[k % PALETTE.length]}"/><text x="${L + 14 + k * 120}" y="9" font-size="11">${esc(s.name)}</text>`,
          )
          .join("")
      : "";
  return svg(
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(d.title)}">${grid}<line x1="${L}" x2="${W - 6}" y1="${y(0)}" y2="${y(0)}" stroke="#333"/>${marks}${labels}${legend}</svg>`,
    "chart-svg",
  );
}

const ICONS = {
  sunny:
    '<circle cx="24" cy="24" r="9" fill="#f5b400"/><g stroke="#f5b400" stroke-width="3" stroke-linecap="round"><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M10 38l4-4M34 14l4-4"/></g>',
  "partly-cloudy":
    '<circle cx="18" cy="18" r="8" fill="#f5b400"/><path d="M14 36a8 8 0 0 1 1-16 10 10 0 0 1 19 3 7 7 0 0 1 0 13z" fill="#cfd6df" stroke="#9aa5b1"/>',
  cloudy:
    '<path d="M10 36a9 9 0 0 1 2-18 12 12 0 0 1 23 4 8 8 0 0 1 0 14z" fill="#cfd6df" stroke="#9aa5b1"/>',
  rainy:
    '<path d="M10 30a9 9 0 0 1 2-18 12 12 0 0 1 23 4 8 8 0 0 1 0 14z" fill="#cfd6df" stroke="#9aa5b1"/><g stroke="#2f7de1" stroke-width="3" stroke-linecap="round"><path d="M16 36l-3 7M25 36l-3 7M34 36l-3 7"/></g>',
  stormy:
    '<path d="M10 28a9 9 0 0 1 2-18 12 12 0 0 1 23 4 8 8 0 0 1 0 14z" fill="#aab3bf" stroke="#7d8793"/><path d="M24 28l-6 10h6l-4 9 10-13h-6l4-6z" fill="#f5b400"/>',
  snowy:
    '<path d="M10 30a9 9 0 0 1 2-18 12 12 0 0 1 23 4 8 8 0 0 1 0 14z" fill="#e5eaf0" stroke="#9aa5b1"/><g fill="#7fb0e8"><circle cx="16" cy="39" r="2.5"/><circle cx="25" cy="42" r="2.5"/><circle cx="34" cy="39" r="2.5"/></g>',
  windy:
    '<g fill="none" stroke="#6b7785" stroke-width="3" stroke-linecap="round"><path d="M6 18h26a5 5 0 1 0-5-5"/><path d="M6 26h32a5 5 0 1 1-5 5"/><path d="M6 34h18"/></g>',
};

function weather(d) {
  return h(
    "div",
    { class: "wx-row" },
    ...d.days.map((x) =>
      h(
        "div",
        { class: "wx-day" },
        h("strong", { text: x.day }),
        svg(
          `<svg viewBox="0 0 48 48" width="48" height="48" role="img" aria-label="${esc(x.condition)}">${ICONS[x.condition]}</svg>`,
          "wx-icon",
        ),
        h("span", { class: "wx-temp", text: `${x.high}${d.unit} / ${x.low}${d.unit}` }),
      ),
    ),
  );
}

function map(d) {
  const roadsAfterRow = new Map(
    (d.roads ?? []).filter((r) => r.after.startsWith("row")).map((r) => [Number(r.after.slice(4)), r.name]),
  );
  const roadsAfterCol = new Map(
    (d.roads ?? []).filter((r) => r.after.startsWith("col")).map((r) => [Number(r.after.slice(4)), r.name]),
  );
  // Grid tracks: cells, with thin road tracks between them where roads run.
  const cols = [],
    rows = [];
  const colTrack = new Map(),
    rowTrack = new Map();
  if (roadsAfterCol.has(0)) cols.push("road");
  for (let c = 1; c <= d.cols; c++) {
    colTrack.set(c, cols.length + 1);
    cols.push("cell");
    if (roadsAfterCol.has(c)) cols.push("road");
  }
  if (roadsAfterRow.has(0)) rows.push("road");
  for (let r = 1; r <= d.rows; r++) {
    rowTrack.set(r, rows.length + 1);
    rows.push("cell");
    if (roadsAfterRow.has(r)) rows.push("road");
  }
  const grid = h("div", { class: "map-grid" });
  grid.style.gridTemplateColumns = cols.map((t) => (t === "road" ? "28px" : "1fr")).join(" ");
  grid.style.gridTemplateRows = rows.map((t) => (t === "road" ? "28px" : "64px")).join(" ");
  for (const cell of d.cells) {
    const el = h("div", { class: ["map-cell", "map-" + (cell.kind ?? "building")], text: cell.label });
    el.style.gridColumn = String(colTrack.get(cell.c));
    el.style.gridRow = String(rowTrack.get(cell.r));
    grid.append(el);
  }
  rows.forEach((t, i) => {
    if (t !== "road") return;
    const after = [...rowTrack].filter(([, idx]) => idx < i + 1).length;
    const el = h("div", { class: "map-road", text: roadsAfterRow.get(after) });
    el.style.gridRow = String(i + 1);
    el.style.gridColumn = "1 / -1";
    grid.append(el);
  });
  cols.forEach((t, i) => {
    if (t !== "road") return;
    const after = [...colTrack].filter(([, idx]) => idx < i + 1).length;
    const el = h("div", { class: "map-road vertical" }, h("span", { text: roadsAfterCol.get(after) }));
    el.style.gridColumn = String(i + 1);
    el.style.gridRow = "1 / -1";
    grid.append(el);
  });
  return h(
    "div",
    { class: "doc-map-wrap" },
    d.north ? h("div", { class: "map-north", text: "N ↑" }) : null,
    grid,
  );
}

const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

export function docEl(d, { small = false } = {}) {
  const box = (cls, ...kids) =>
    h("figure", { class: ["doc", "doc-" + d.type, small && "small", cls] }, ...kids);
  switch (d.type) {
    case "email":
      return box(
        null,
        h(
          "div",
          { class: "doc-mailhead" },
          kv([
            ["From", d.from],
            ["To", d.to],
            ...(d.cc ? [["Cc", d.cc]] : []),
            ["Date", d.date],
            ["Subject", d.subject],
          ]),
        ),
        h("div", { class: "doc-body" }, ...paras(d.body)),
      );
    case "memo":
      return box(
        null,
        h("div", { class: "doc-title", text: "MEMO" }),
        kv([
          ["To", d.to],
          ["From", d.from],
          ["Date", d.date],
          ["Subject", d.subject],
        ]),
        h("div", { class: "doc-body" }, ...paras(d.body)),
      );
    case "letter":
      return box(
        null,
        h("div", { class: "doc-address", text: d.sender }),
        h("div", { class: "doc-date", text: d.date }),
        h("div", { class: "doc-address", text: d.recipient }),
        h("div", { class: "doc-body" }, ...paras(d.body)),
        h("p", { text: d.closing }),
        h("p", { class: "doc-sign", text: d.signature }),
      );
    case "notice":
      return box(
        null,
        h("div", { class: "doc-title", text: d.title }),
        h("div", { class: "doc-body" }, ...paras(d.body)),
        d.footer ? h("p", { class: "doc-foot", text: d.footer }) : null,
      );
    case "article":
      return box(
        null,
        h("div", { class: "doc-headline", text: d.headline }),
        d.byline || d.date
          ? h("p", { class: "doc-byline", text: [d.byline, d.date].filter(Boolean).join(" · ") })
          : null,
        h("div", { class: "doc-body columns" }, ...paras(d.body)),
      );
    case "advertisement":
      return box(
        null,
        h("div", { class: "doc-headline", text: d.headline }),
        d.tagline ? h("p", { class: "doc-tagline", text: d.tagline }) : null,
        h("div", { class: "doc-body" }, ...paras(d.body)),
        d.bullets ? h("ul", {}, ...d.bullets.map((b) => h("li", { text: b }))) : null,
        d.footer ? h("p", { class: "doc-foot", text: d.footer }) : null,
      );
    case "poster":
      return box(
        null,
        h("div", { class: "poster-title", text: d.title }),
        d.subtitle ? h("p", { class: "doc-tagline", text: d.subtitle }) : null,
        kv(d.details, "doc-kv poster-kv"),
        d.body ? h("div", { class: "doc-body" }, ...paras(d.body)) : null,
        d.footer ? h("p", { class: "doc-foot", text: d.footer }) : null,
      );
    case "webpage":
      return box(
        null,
        h(
          "div",
          { class: "web-bar" },
          h("span", { class: "web-dots", text: "● ● ●" }),
          h("span", { class: "web-url", text: d.url }),
        ),
        h("div", { class: "web-site", text: d.site }),
        d.nav ? h("div", { class: "web-nav" }, ...d.nav.map((n) => h("span", { text: n }))) : null,
        h("div", { class: "doc-title", text: d.title }),
        h("div", { class: "doc-body" }, ...paras(d.body)),
      );
    case "review":
      return box(
        null,
        h(
          "div",
          { class: "review-head" },
          h("strong", { text: d.reviewer }),
          h("span", { class: "stars", text: stars(d.rating) }),
          d.date ? h("small", { text: d.date }) : null,
        ),
        d.product ? h("p", { class: "doc-byline", text: d.product }) : null,
        h("div", { class: "doc-body" }, ...paras(d.body)),
      );
    case "chat":
      return box(
        null,
        ...d.messages.map((m) =>
          h(
            "div",
            { class: "chat-msg" },
            h("div", { class: "chat-meta" }, h("strong", { text: m.name }), h("small", { text: m.time })),
            h("div", { class: "chat-bubble", text: m.text }),
          ),
        ),
      );
    case "form":
      return box(
        null,
        h("div", { class: "doc-title", text: d.title }),
        kv(d.fields, "doc-kv form-kv"),
        d.note ? h("p", { class: "doc-foot", text: d.note }) : null,
      );
    case "invoice":
      return box(
        null,
        h("div", { class: "doc-title", text: d.title }),
        kv([
          ...(d.number ? [["No.", d.number]] : []),
          ...(d.date ? [["Date", d.date]] : []),
          ...(d.from ? [["From", d.from]] : []),
          ...(d.to ? [["To", d.to]] : []),
        ]),
        h(
          "table",
          {},
          h("tbody", {}, ...d.items.map((r) => h("tr", {}, ...r.map((c) => h("td", { text: c }))))),
        ),
        d.total ? h("p", { class: "invoice-total", text: `Total: ${d.total}` }) : null,
        d.note ? h("p", { class: "doc-foot", text: d.note }) : null,
      );
    case "coupon":
      return box(
        null,
        h("div", { class: "coupon-offer", text: d.offer }),
        h("div", { class: "doc-title", text: d.title }),
        d.details ? h("p", { text: d.details }) : null,
        h(
          "div",
          { class: "coupon-foot" },
          d.code ? h("span", { text: `Code: ${d.code}` }) : null,
          d.expires ? h("span", { text: `Expires: ${d.expires}` }) : null,
        ),
      );
    case "ticket":
      return box(null, h("div", { class: "doc-title", text: d.event }), kv(d.details, "doc-kv ticket-kv"));
    case "menu":
      return box(
        null,
        h("div", { class: "poster-title", text: d.title }),
        ...d.sections.map((s) =>
          h(
            "div",
            { class: "menu-section" },
            h("h5", { text: s.name }),
            ...s.items.map(([name, price, note]) =>
              h(
                "div",
                { class: "menu-item" },
                h("span", { text: name }),
                h("span", { class: "dots" }),
                h("span", { text: price }),
                note ? h("small", { text: note }) : null,
              ),
            ),
          ),
        ),
      );
    case "table": {
      const [head, ...rows] = d.rows;
      return box(
        null,
        h("figcaption", { text: d.title }),
        h(
          "table",
          {},
          h("thead", {}, h("tr", {}, ...head.map((c) => h("th", { text: c })))),
          h("tbody", {}, ...rows.map((r) => h("tr", {}, ...r.map((c) => h("td", { text: c }))))),
        ),
      );
    }
    case "chart":
      return box(null, h("figcaption", { text: d.title + (d.unit ? ` (${d.unit})` : "") }), chart(d));
    case "weather":
      return box(null, h("figcaption", { text: d.title }), weather(d));
    case "map":
      return box(null, h("figcaption", { text: d.title }), map(d));
    case "label":
      return box(
        null,
        h("div", { class: "doc-title", text: d.title }),
        kv(d.lines, "doc-kv label-kv"),
        d.note ? h("p", { class: "doc-foot", text: d.note }) : null,
      );
    default:
      return box(null, h("p", { text: "(표시할 수 없는 문서)" }));
  }
}
