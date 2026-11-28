// Typed test documents (Part 3/4 graphics, Part 6/7 texts). Codex returns data, never drawings; the app renders
// each type from a template, so the exam screen and the printed PDF look the same, and the answer checker reads
// the same content as plain text.

const S = (max) => ({ kind: "s", max }); // string
const O = (spec) => ({ ...spec, optional: true });
const L = (item, min, max) => ({ kind: "list", item, min, max }); // array
const PAIRS = L(L(S(120), 2, 2), 1, 12); // [[label, value], …]

export const DOC_TYPES = {
  email: { from: S(120), to: S(200), cc: O(S(200)), date: S(60), subject: S(160), body: S(3000) },
  memo: { to: S(160), from: S(120), date: S(60), subject: S(160), body: S(3000) },
  letter: {
    sender: S(300),
    recipient: S(300),
    date: S(60),
    body: S(3000),
    closing: S(60),
    signature: S(160),
  },
  notice: { title: S(140), body: S(2500), footer: O(S(300)) },
  article: { headline: S(160), byline: O(S(120)), date: O(S(60)), body: S(3500) },
  advertisement: {
    headline: S(140),
    tagline: O(S(200)),
    body: S(1500),
    bullets: O(L(S(160), 1, 8)),
    footer: O(S(300)),
  },
  poster: { title: S(120), subtitle: O(S(200)), details: PAIRS, body: O(S(1000)), footer: O(S(300)) },
  webpage: { url: S(160), site: S(80), nav: O(L(S(30), 1, 6)), title: S(140), body: S(2500) },
  review: {
    reviewer: S(80),
    rating: { kind: "n", min: 1, max: 5 },
    date: O(S(60)),
    product: O(S(120)),
    body: S(1500),
  },
  chat: { messages: L({ kind: "obj", fields: { name: S(60), time: S(20), text: S(600) } }, 2, 14) },
  form: { title: S(140), fields: L(L(S(200), 2, 2), 2, 14), note: O(S(500)) },
  invoice: {
    title: S(120),
    from: O(S(200)),
    to: O(S(200)),
    date: O(S(60)),
    number: O(S(40)),
    items: L(L(S(120), 3, 3), 1, 10),
    total: O(S(40)),
    note: O(S(400)),
  },
  coupon: { title: S(120), offer: S(160), details: O(S(500)), code: O(S(30)), expires: O(S(60)) },
  ticket: { event: S(140), details: PAIRS },
  menu: {
    title: S(120),
    sections: L({ kind: "obj", fields: { name: S(60), items: L(L(S(120), 2, 3), 1, 10) } }, 1, 5),
  },
  table: { title: S(120), rows: L(L(S(80), 2, 5), 2, 10) },
  chart: {
    title: S(120),
    chart: { kind: "enum", values: ["bar", "line", "pie"] },
    labels: L(S(30), 2, 8),
    series: L(
      { kind: "obj", fields: { name: S(40), values: L({ kind: "n", min: -1e7, max: 1e7 }, 2, 8) } },
      1,
      3,
    ),
    unit: O(S(20)),
  },
  weather: {
    title: S(120),
    unit: { kind: "enum", values: ["°F", "°C"] },
    days: L(
      {
        kind: "obj",
        fields: {
          day: S(20),
          condition: {
            kind: "enum",
            values: ["sunny", "partly-cloudy", "cloudy", "rainy", "stormy", "snowy", "windy"],
          },
          high: { kind: "n", min: -60, max: 130 },
          low: { kind: "n", min: -60, max: 130 },
        },
      },
      3,
      7,
    ),
  },
  map: {
    title: S(120),
    rows: { kind: "n", min: 2, max: 5 },
    cols: { kind: "n", min: 2, max: 5 },
    cells: L(
      {
        kind: "obj",
        fields: {
          r: { kind: "n", min: 1, max: 5 },
          c: { kind: "n", min: 1, max: 5 },
          label: S(40),
          kind: O({
            kind: "enum",
            values: ["building", "room", "park", "parking", "water", "entrance", "plaza"],
          }),
        },
      },
      2,
      25,
    ),
    roads: O(L({ kind: "obj", fields: { name: S(40), after: S(8) } }, 1, 6)),
    north: O({ kind: "bool" }),
  },
  label: { title: S(120), lines: PAIRS, note: O(S(400)) },
};

/** Short English names used in prompts ("conversation and <name>"). */
export const DOC_NAMES = {
  email: "e-mail",
  memo: "memo",
  letter: "letter",
  notice: "notice",
  article: "article",
  advertisement: "advertisement",
  poster: "poster",
  webpage: "Web page",
  review: "online review",
  chat: "text-message chain",
  form: "form",
  invoice: "invoice",
  coupon: "coupon",
  ticket: "ticket",
  menu: "menu",
  table: "table",
  chart: "graph",
  weather: "weather forecast",
  map: "map",
  label: "label",
};

function check(value, spec, path) {
  if (spec.optional && (value === undefined || value === null || value === "")) return undefined;
  switch (spec.kind) {
    case "s":
      if (typeof value !== "string" || !value.trim() || value.length > spec.max)
        throw Error(`문서 형식 오류: ${path}`);
      return value.trim();
    case "n": {
      const n = Number(value);
      if (!Number.isFinite(n) || n < spec.min || n > spec.max) throw Error(`문서 숫자 오류: ${path}`);
      return n;
    }
    case "bool":
      return value === true;
    case "enum":
      if (!spec.values.includes(value)) throw Error(`문서 값 오류: ${path}`);
      return value;
    case "list":
      if (!Array.isArray(value) || value.length < spec.min || value.length > spec.max)
        throw Error(`문서 목록 오류: ${path}`);
      return value.map((v, i) => check(v, spec.item, `${path}[${i}]`));
    case "obj": {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(`문서 형식 오류: ${path}`);
      const out = {};
      for (const [k, f] of Object.entries(spec.fields)) {
        const v = check(value[k], f, `${path}.${k}`);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    default:
      throw Error("문서 스키마 오류");
  }
}

/** Validates and normalizes a document spec from Codex. Throws a Korean message on any mismatch. */
export function validateDoc(doc) {
  const fields = DOC_TYPES[doc?.type];
  if (!fields) throw Error(`지원하지 않는 문서 종류: ${String(doc?.type).slice(0, 30)}`);
  const out = { type: doc.type, ...check(doc, { kind: "obj", fields }, doc.type) };
  if (out.type === "table" && out.rows.some((r) => r.length !== out.rows[0].length))
    throw Error("표의 열 수가 다릅니다.");
  if (out.type === "chart" && out.series.some((s) => s.values.length !== out.labels.length))
    throw Error("그래프 값 개수가 항목 수와 다릅니다.");
  if (out.type === "map") {
    if (out.cells.some((c) => c.r > out.rows || c.c > out.cols))
      throw Error("지도 칸이 범위를 벗어났습니다.");
    for (const road of out.roads ?? [])
      if (!/^(?:row|col)-[0-5]$/.test(road.after)) throw Error("지도 도로 위치 오류");
  }
  return out;
}

const pairs = (list) => list.map(([k, v]) => `${k}: ${v}`).join("\n");

/** Plain-text form of a document: what the answer checker and the analysis read, and the Part 6 blank check. */
export function docText(d) {
  switch (d.type) {
    case "email":
      return `E-mail\nFrom: ${d.from}\nTo: ${d.to}${d.cc ? `\nCc: ${d.cc}` : ""}\nDate: ${d.date}\nSubject: ${d.subject}\n\n${d.body}`;
    case "memo":
      return `MEMO\nTo: ${d.to}\nFrom: ${d.from}\nDate: ${d.date}\nSubject: ${d.subject}\n\n${d.body}`;
    case "letter":
      return `${d.sender}\n${d.date}\n${d.recipient}\n\n${d.body}\n\n${d.closing}\n${d.signature}`;
    case "notice":
      return `${d.title}\n${d.body}${d.footer ? `\n${d.footer}` : ""}`;
    case "article":
      return `${d.headline}${d.byline ? `\n${d.byline}` : ""}${d.date ? `\n${d.date}` : ""}\n${d.body}`;
    case "advertisement":
      return [d.headline, d.tagline, d.body, ...(d.bullets ?? []).map((b) => `- ${b}`), d.footer]
        .filter(Boolean)
        .join("\n");
    case "poster":
      return [d.title, d.subtitle, pairs(d.details), d.body, d.footer].filter(Boolean).join("\n");
    case "webpage":
      return `${d.site} (${d.url})${d.nav ? `\n[${d.nav.join(" | ")}]` : ""}\n${d.title}\n${d.body}`;
    case "review":
      return `Review by ${d.reviewer}${d.product ? ` of ${d.product}` : ""} — ${d.rating}/5 stars${d.date ? `, ${d.date}` : ""}\n${d.body}`;
    case "chat":
      return d.messages.map((m) => `${m.name} [${m.time}]: ${m.text}`).join("\n");
    case "form":
      return `${d.title}\n${pairs(d.fields)}${d.note ? `\n${d.note}` : ""}`;
    case "invoice":
      return [
        d.title,
        d.number && `No. ${d.number}`,
        d.date,
        d.from && `From: ${d.from}`,
        d.to && `To: ${d.to}`,
        ...d.items.map((it) => it.join(" | ")),
        d.total && `Total: ${d.total}`,
        d.note,
      ]
        .filter(Boolean)
        .join("\n");
    case "coupon":
      return [d.title, d.offer, d.details, d.code && `Code: ${d.code}`, d.expires && `Expires: ${d.expires}`]
        .filter(Boolean)
        .join("\n");
    case "ticket":
      return `${d.event}\n${pairs(d.details)}`;
    case "menu":
      return `${d.title}\n${d.sections.map((s) => `${s.name}\n${s.items.map((i) => i.join(" — ")).join("\n")}`).join("\n")}`;
    case "table":
      return `${d.title}\n${d.rows.map((r) => r.join(" | ")).join("\n")}`;
    case "chart":
      return `${d.title} (${d.chart} graph${d.unit ? `, ${d.unit}` : ""})\n${d.series
        .map((s) => `${s.name}: ${d.labels.map((l, i) => `${l} ${s.values[i]}`).join(", ")}`)
        .join("\n")}`;
    case "weather":
      return `${d.title}\n${d.days.map((x) => `${x.day}: ${x.condition}, high ${x.high}${d.unit}, low ${x.low}${d.unit}`).join("\n")}`;
    case "map": {
      const grid = [];
      for (let r = 1; r <= d.rows; r++)
        grid.push(
          Array.from(
            { length: d.cols },
            (_, c) => d.cells.find((x) => x.r === r && x.c === c + 1)?.label ?? "—",
          ).join(" | "),
        );
      const roads = (d.roads ?? []).map((x) => `${x.name} runs after ${x.after.replace("-", " ")}`);
      return `${d.title} (grid, top = north)\n${grid.join("\n")}${roads.length ? `\n${roads.join("\n")}` : ""}`;
    }
    case "label":
      return `${d.title}\n${pairs(d.lines)}${d.note ? `\n${d.note}` : ""}`;
    default:
      return "";
  }
}

/** The prompt description Codex follows for each type (shape only; Codex writes original content). */
export function docSchemaHint(types) {
  const shapes = {
    email: '{"type":"email","from":"…","to":"…","date":"…","subject":"…","body":"…"}',
    memo: '{"type":"memo","to":"…","from":"…","date":"…","subject":"…","body":"…"}',
    letter:
      '{"type":"letter","sender":"name and address","recipient":"name and address","date":"…","body":"…","closing":"Sincerely,","signature":"…"}',
    notice: '{"type":"notice","title":"…","body":"…","footer":"optional"}',
    article: '{"type":"article","headline":"…","byline":"optional","date":"optional","body":"…"}',
    advertisement:
      '{"type":"advertisement","headline":"…","tagline":"optional","body":"…","bullets":["optional"],"footer":"optional"}',
    poster:
      '{"type":"poster","title":"…","subtitle":"optional","details":[["Date","…"],["Place","…"]],"body":"optional","footer":"optional"}',
    webpage: '{"type":"webpage","url":"www.…","site":"…","nav":["Home","…"],"title":"…","body":"…"}',
    review: '{"type":"review","reviewer":"…","rating":4,"date":"optional","product":"optional","body":"…"}',
    chat: '{"type":"chat","messages":[{"name":"…","time":"9:42 A.M.","text":"…"}]}',
    form: '{"type":"form","title":"…","fields":[["Name","…"],["Date","…"]],"note":"optional"}',
    invoice:
      '{"type":"invoice","title":"…","number":"optional","date":"optional","from":"optional","to":"optional","items":[["item","qty","price"]],"total":"optional","note":"optional"}',
    coupon:
      '{"type":"coupon","title":"…","offer":"…","details":"optional","code":"optional","expires":"optional"}',
    ticket: '{"type":"ticket","event":"…","details":[["Seat","…"],["Time","…"]]}',
    menu: '{"type":"menu","title":"…","sections":[{"name":"…","items":[["dish","$12","optional note"]]}]}',
    table: '{"type":"table","title":"…","rows":[["header","header"],["cell","cell"]]}',
    chart:
      '{"type":"chart","title":"…","chart":"bar|line|pie","labels":["…"],"series":[{"name":"…","values":[1,2]}],"unit":"optional"}',
    weather:
      '{"type":"weather","title":"…","unit":"°F","days":[{"day":"Monday","condition":"sunny|partly-cloudy|cloudy|rainy|stormy|snowy|windy","high":75,"low":60}]}',
    map: '{"type":"map","title":"…","rows":3,"cols":3,"cells":[{"r":1,"c":1,"label":"…","kind":"building|room|park|parking|water|entrance|plaza"}],"roads":[{"name":"Elm Street","after":"row-1"}],"north":true}',
    label: '{"type":"label","title":"…","lines":[["Ingredient","…"]],"note":"optional"}',
  };
  return types.map((t) => shapes[t]).join(" or ");
}
