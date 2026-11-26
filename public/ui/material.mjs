// What a question group shows besides its questions: Part 1 photo, Part 3/4 graphic, Part 6/7 documents.
// Shared by the exam paper, review, notebook, studio and the printable PDF views.
import { h } from "./dom.mjs";
import { docEl } from "./docs-view.mjs";

export function groupMaterial(g, { small = false, open = true } = {}) {
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
      out.push(h("article", { class: "passage" }, h("h4", { text: p.title }), h("p", { text: p.body })));
    else
      out.push(h("details", { class: "passage" }, h("summary", { text: p.title }), h("p", { text: p.body })));
  }
  return out;
}
