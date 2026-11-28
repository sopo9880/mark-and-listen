// Tiny DOM toolkit: no innerHTML for content, so generated questions and transcripts are always text.

// Views pass optional children as `cond ? node : null`; native append/replaceChildren would print "null".
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const method of ["append", "prepend", "replaceChildren"]) {
    const native = proto[method];
    proto[method] = function (...nodes) {
      return native.apply(
        this,
        nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false),
      );
    };
  }
}

export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  if (attrs === null || typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs)) {
    children.unshift(attrs);
    attrs = {};
  }
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style") Object.assign(node.style, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key in node && !key.startsWith("aria") && key !== "role" && key !== "for") node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  halls: "M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6",
  library: "M4 4h6v16H4zM14 4l5 1-3 15-5-1z",
  notebook: "M6 3h11a2 2 0 0 1 2 2v16l-4-2-4 2-4-2-3 2V5a2 2 0 0 1 2-2zM9 8h6M9 12h6",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.3 7.3 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1c.6.5 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.6-.8 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z",
  play: "M7 4v16l13-8z",
  pause: "M7 4h4v16H7zM13 4h4v16h-4z",
  stop: "M6 6h12v12H6z",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5 10 17 19 7",
  x: "M6 6l12 12M18 6 6 18",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 6l-6 6 6 6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  headphones: "M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v6H5a1 1 0 0 1-1-1zM20 15h-3v6h2a1 1 0 0 0 1-1z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  book: "M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 5v16",
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  wand: "M4 20 16 8M14 4v3M19 9h-3M18 5l-2 2M12 6l2 2",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  terminal: "M4 5h16v14H4zM7 9l3 3-3 3M12 15h5",
};

export function icon(name, size = 18) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icon");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", ICONS[name] ?? ICONS.more);
  svg.append(path);
  return svg;
}

/** Button that reports thrown errors as a toast and disables itself while its handler runs. */
export function button(label, onClick, { kind = "", iconName, title, disabled, small } = {}) {
  const b = h("button", {
    type: "button",
    class: ["btn", kind && "btn-" + kind, small && "btn-sm"],
    title,
    disabled,
  });
  if (iconName) b.append(icon(iconName, small ? 15 : 17));
  if (label) b.append(h("span", { text: label }));
  b.addEventListener("click", async (event) => {
    if (b.dataset.busy) return;
    b.dataset.busy = "1";
    b.classList.add("is-busy");
    try {
      await onClick?.(event);
    } catch (error) {
      toastError(error);
    } finally {
      delete b.dataset.busy;
      b.classList.remove("is-busy");
    }
  });
  return b;
}

import { toast } from "./lux-toast.mjs";
import { explain } from "./errors.mjs";
export { toast };

/** Shows an error with a plain-language title and what to do next. */
export function toastError(error) {
  const { title, detail } = explain(error);
  toast(title, "error", 8000, detail || undefined);
}

/** Promise-based modal dialog. Resolves with true (confirm) or false. */
export function confirmDialog({ title, body, confirm = "확인", cancel = "취소", danger = false }) {
  return new Promise((resolve) => {
    const dialog = h("dialog", { class: "dialog" });
    const done = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.append(
      h("h2", { text: title }),
      body ? h("p", { class: "muted", text: body }) : null,
      h(
        "div",
        { class: "dialog-actions" },
        cancel
          ? h("button", { type: "button", class: "btn", text: cancel, onclick: () => done(false) })
          : null,
        h("button", {
          type: "button",
          class: ["btn", danger ? "btn-danger" : "btn-primary"],
          text: confirm,
          onclick: () => done(true),
        }),
      ),
    );
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      done(false);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function promptDialog({ title, value = "", confirm = "저장", maxLength = 100 }) {
  return new Promise((resolve) => {
    const input = h("input", { type: "text", value, maxLength, class: "input" });
    const dialog = h("dialog", { class: "dialog" });
    const done = (result) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    const form = h(
      "form",
      { method: "dialog", onsubmit: (e) => (e.preventDefault(), done(input.value.trim() || null)) },
      h("h2", { text: title }),
      input,
      h(
        "div",
        { class: "dialog-actions" },
        h("button", { type: "button", class: "btn", text: "취소", onclick: () => done(null) }),
        h("button", { type: "submit", class: "btn btn-primary", text: confirm }),
      ),
    );
    dialog.append(form);
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      done(null);
    });
    document.body.append(dialog);
    dialog.showModal();
    input.select();
  });
}

export const field = (label, control, hint) =>
  h(
    "label",
    { class: "field" },
    h("span", { class: "field-label", text: label }),
    control,
    hint ? h("small", { class: "muted", text: hint }) : null,
  );

export function select(options, value, attrs = {}) {
  const s = h("select", { class: "input", ...attrs });
  for (const [id, name] of options) s.append(h("option", { value: id, text: name }));
  s.value = value;
  return s;
}

export { segmented } from "./lux-tabs.mjs";

/** A generated Part 3/4 graphic (schedule, price list, …) as a small table: first row is the header. */
export function graphicTable(t, small = false) {
  if (!t?.rows?.length) return null;
  const [head, ...rows] = t.rows;
  return h(
    "figure",
    { class: ["graphic", small && "small"] },
    h("figcaption", { text: t.title }),
    h(
      "table",
      {},
      h("thead", {}, h("tr", {}, ...head.map((c) => h("th", { text: c })))),
      h("tbody", {}, ...rows.map((r) => h("tr", {}, ...r.map((c) => h("td", { text: c }))))),
    ),
  );
}

export const chip = (text, kind = "") => h("span", { class: ["chip", kind && "chip-" + kind], text });

export function progress(value, max, kind = "") {
  const bar = h("div", { class: ["bar", kind && "bar-" + kind], role: "progressbar" });
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(max));
  bar.setAttribute("aria-valuenow", String(value));
  const fill = h("span");
  fill.style.width = `${max ? Math.min(100, (value / max) * 100) : 0}%`;
  bar.append(fill);
  return bar;
}

export const card = (attrs, ...children) =>
  h("section", { ...attrs, class: ["card", attrs?.class] }, ...children);
export const empty = (title, body, action) =>
  h(
    "div",
    { class: "empty" },
    icon("sparkle", 28),
    h("h3", { text: title }),
    body ? h("p", { class: "muted", text: body }) : null,
    action,
  );

export const fmtDate = (ms) =>
  new Date(ms).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export const fmtClock = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(total / 3600),
    mm = Math.floor((total % 3600) / 60),
    ss = total % 60;
  const two = (n) => String(n).padStart(2, "0");
  return hh ? `${hh}:${two(mm)}:${two(ss)}` : `${two(mm)}:${two(ss)}`;
};
export const fmtMinutes = (ms) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60 ? (m % 60) + "분" : ""}`.trim() : `${m}분`;
};
