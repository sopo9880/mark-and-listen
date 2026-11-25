import { h, icon, card, button, progress, empty, toast, confirmDialog, segmented } from "./dom.mjs";
import { api } from "./api.mjs";
import { filesToImages, normalize } from "./photo-import.mjs";

const BATCH = 6;

export async function photoCount() {
  return (await api("photos")).photos.length;
}

export async function render(page) {
  let photos = (await api("photos")).photos;
  let filter = "all";
  const selected = new Set();
  const grid = h("div", { class: "photo-grid" });
  const status = h("div", { class: "import-status" });
  const head = h("p", { class: "muted" });
  const input = h("input", {
    type: "file",
    multiple: true,
    accept: ".zip,image/jpeg,image/png,image/webp",
    hidden: true,
    onchange: () => importFiles([...input.files]),
  });
  const removeBtn = button("선택 삭제", removeSelected, { iconName: "trash", kind: "ghost", disabled: true });

  const draw = () => {
    const used = photos.filter((p) => p.used).length;
    head.textContent = `${photos.length}장 · 회차에 쓰인 사진 ${used}장 · 사진은 이 PC의 데이터 폴더에만 저장됩니다.`;
    const shown = photos.filter((p) => (filter === "unused" ? !p.used : filter === "used" ? p.used : true));
    removeBtn.disabled = !selected.size;
    removeBtn.querySelector("span").textContent = selected.size
      ? `선택 삭제 (${selected.size})`
      : "선택 삭제";
    grid.replaceChildren(
      ...(shown.length
        ? shown.map((p) =>
            h(
              "button",
              {
                type: "button",
                class: ["photo-tile", selected.has(p.sha256) && "selected"],
                title: p.name,
                "aria-pressed": String(selected.has(p.sha256)),
                onclick: () => (
                  selected.has(p.sha256) ? selected.delete(p.sha256) : selected.add(p.sha256),
                  draw()
                ),
              },
              h("img", {
                src: `/api/photos/${p.sha256}.jpg`,
                alt: p.name,
                loading: "lazy",
                decoding: "async",
              }),
              h("span", { class: "photo-name", text: p.name }),
              p.used ? h("span", { class: "photo-used", text: `${p.used}회 사용` }) : null,
              h("span", { class: "photo-check" }, icon("check", 14)),
            ),
          )
        : [
            empty(
              photos.length ? "해당하는 사진이 없어요" : "보관함이 비어 있어요",
              "TOEIC Part 1 스타일 사진 ZIP이나 이미지 파일을 가져오세요. 같은 장면의 변형 사진은 한 회차에 함께 배정되지 않습니다.",
            ),
          ]),
    );
  };

  async function importFiles(files) {
    if (!files.length) return;
    let done = 0,
      added = 0,
      duplicates = 0,
      failed = 0;
    const bar = h("div");
    status.replaceChildren(card({}, h("strong", { text: "사진 가져오는 중…" }), bar));
    const paint = (label) =>
      bar.replaceChildren(progress(done, Math.max(done, 1)), h("small", { class: "muted", text: label }));
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const r = await api("photos/import", { items: batch });
      added += r.added;
      duplicates += r.duplicates;
      batch = [];
    };
    try {
      for await (const image of filesToImages(files)) {
        try {
          batch.push(await normalize(image));
        } catch {
          failed++;
        }
        done++;
        paint(`${done}장 처리 · 새 사진 ${added}장`);
        if (batch.length === BATCH) await flush();
      }
      await flush();
      toast(
        `새 사진 ${added}장을 가져왔습니다.${duplicates ? ` 이미 있는 사진 ${duplicates}장은 건너뛰었어요.` : ""}${failed ? ` 읽지 못한 파일 ${failed}개.` : ""}`,
        "ok",
        6000,
      );
    } catch (error) {
      toast(error.message, "error");
    } finally {
      input.value = "";
      status.replaceChildren();
      photos = (await api("photos")).photos;
      draw();
    }
  }

  async function removeSelected() {
    const ok = await confirmDialog({
      title: `사진 ${selected.size}장을 보관함에서 삭제할까요?`,
      body: "이미 만든 회차는 자기 사진 사본을 갖고 있어서 영향을 받지 않습니다.",
      confirm: "삭제",
      danger: true,
    });
    if (!ok) return;
    await api("photos/delete", { shas: [...selected] });
    selected.clear();
    photos = (await api("photos")).photos;
    draw();
  }

  const drop = h(
    "div",
    {
      class: "dropzone",
      ondragover: (e) => (e.preventDefault(), drop.classList.add("over")),
      ondragleave: () => drop.classList.remove("over"),
      ondrop: (e) => {
        e.preventDefault();
        drop.classList.remove("over");
        importFiles([...e.dataTransfer.files]);
      },
    },
    icon("plus", 22),
    h(
      "div",
      {},
      h("strong", { text: "ZIP 또는 사진 파일을 끌어 놓거나 선택하세요" }),
      h("small", {
        class: "muted",
        text: "JPG·PNG·WebP · 1200px로 줄이고 JPEG로 저장 · 같은 사진은 한 번만 저장",
      }),
    ),
    button("파일 선택", () => input.click(), { kind: "primary" }),
    input,
  );

  page.append(
    h(
      "header",
      { class: "page-head" },
      h(
        "div",
        {},
        h("a", { class: "back", href: "#/create/toeic" }, icon("back", 16), "TOEIC관"),
        h("h1", { text: "Part 1 사진 보관함" }),
        head,
      ),
    ),
    drop,
    status,
    h(
      "div",
      { class: "groups-head" },
      segmented(
        [
          ["all", "전체"],
          ["unused", "아직 안 쓴 사진"],
          ["used", "쓴 사진"],
        ],
        filter,
        (v) => ((filter = v), draw()),
      ),
      removeBtn,
    ),
    grid,
  );
  draw();
}
