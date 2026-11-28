// What a question group shows besides its questions: Part 1 photo, Part 3/4 graphic, Part 6/7 documents.
// Shared by the exam paper, review, notebook, studio and the printable PDF views.
import { h } from "./dom.mjs";
import { docEl } from "./docs-view.mjs";
import { rubyParts } from "../lib/jlpt.mjs";

/** Japanese text with {漢字|かな} readings as <ruby> and __target__ underlined; other exams get plain text. */
export function richText(text, ja = false) {
  if (!ja) return [String(text ?? "")];
  // One inline run, so flex containers (question line) do not space the pieces apart.
  return [h("span", { class: "ja-run" }, ...jaPieces(text))];
}

function jaPieces(text) {
  return rubyParts(text).map((p) =>
    p.text !== undefined
      ? p.text
      : p.under !== undefined
        ? h("u", { class: "ja-target" }, ...jaPieces(p.under))
        : h("ruby", {}, p.base, h("rt", { text: p.ruby })),
  );
}

/** A JLPT listening item's printed picture (4 numbered choices or a scene with an arrow). */
export function questionFigure(e, q, { small = false } = {}) {
  if (!q.image?.sha256) return null;
  return h("img", {
    class: ["figure", "ja-figure", small && "small"],
    src: `/api/jlpt-image/${e.id}/${q.id}`,
    alt: q.image.kind === "grid" ? "1〜4の絵" : "場面の絵",
    loading: "lazy",
  });
}

export function groupMaterial(g, { small = false, open = true, ja = false } = {}) {
  const out = [];
  if (g.image || g.graphic)
    out.push(
      h("img", {
        class: ["figure", small && "small"],
        src: g.image || g.graphic,
        alt: g.imageAlt || g.graphicAlt || "",
      }),
    );
  if (g.doc) out.push(docEl(g.doc, { small }));
  else if (g.table) out.push(docEl({ type: "table", title: g.table.title, rows: g.table.rows }, { small }));
  for (const p of g.passages ?? []) {
    if (p.doc) out.push(docEl(p.doc, { small }));
    else if (open)
      out.push(
        h(
          "article",
          { class: ["passage", ja && "ja-passage"] },
          h("h4", { text: p.title }),
          h("p", {}, ...richText(p.body, ja)),
        ),
      );
    else
      out.push(
        h(
          "details",
          { class: ["passage", ja && "ja-passage"] },
          h("summary", { text: p.title }),
          h("p", {}, ...richText(p.body, ja)),
        ),
      );
  }
  return out;
}
