// Local Part 1 photo library. Photos live only in the user's data folder (never in the repository or installer).
// The browser normalizes every photo to a JPEG ≤ 400 KB and sends a 64-bit difference hash so that
// near-identical scene variants are never placed in the same episode.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";

const MAX_JPEG = 400_000;
const MAX_PHOTOS = 2000;
export const NEAR_DUPLICATE_BITS = 10;

export function decodeJpeg(raw) {
  if (
    typeof raw !== "string" ||
    raw.length > 4 * Math.ceil(MAX_JPEG / 3) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)
  )
    throw Error("사진 데이터 형식이 올바르지 않습니다.");
  const bytes = Buffer.from(raw, "base64");
  if (
    bytes.length < 20 ||
    bytes.length > MAX_JPEG ||
    bytes.toString("base64") !== raw ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw Error("유효한 JPEG 사진만 가져올 수 있습니다.");
  return bytes;
}

export function hamming(a, b) {
  if (!/^[0-9a-f]{16}$/.test(a ?? "") || !/^[0-9a-f]{16}$/.test(b ?? "")) return 64;
  let x = BigInt("0x" + a) ^ BigInt("0x" + b),
    n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

const cleanName = (name) =>
  String(name ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 120) || "사진";

const STOP = new Set(
  "a an the to on at in of into onto from with by for and near under over beside behind next up down out off its his her their is are".split(
    " ",
  ),
);
const stem = (w) => {
  for (const suffix of ["ing", "es", "ed", "s"])
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) return w.slice(0, -suffix.length);
  return w;
};
export const sceneTokens = (name) =>
  new Set(
    (
      String(name)
        .toLowerCase()
        .match(/[a-z0-9]+/g) ?? []
    )
      .filter((w) => !STOP.has(w))
      .map(stem),
  );

/**
 * Two photos count as the same scene when their pixels are nearly identical (dHash) or when their
 * descriptive file names say so ("Adult clipping dog leash" ~ "Adult clips leash to dog").
 * Scene variants with a moved camera defeat a pixel hash, so names carry most of the signal.
 */
export function sameScene(a, b) {
  if (hamming(a.dhash, b.dhash) <= NEAR_DUPLICATE_BITS) return true;
  const x = sceneTokens(a.name),
    y = sceneTokens(b.name);
  const shared = [...x].filter((t) => y.has(t)).length;
  const union = new Set([...x, ...y]).size;
  if (!union) return false;
  const jaccard = shared / union;
  return jaccard >= 0.5 || (shared >= 2 && jaccard >= 0.25);
}

export class PhotoLibrary {
  constructor(root) {
    this.root = root;
    this.queue = Promise.resolve();
  }
  index() {
    return join(this.root, "index.json");
  }
  file(sha) {
    if (!/^[0-9a-f]{64}$/.test(sha)) throw Error("사진 ID 오류");
    return join(this.root, sha + ".jpg");
  }
  locked(fn) {
    const pending = this.queue.then(fn);
    this.queue = pending.catch(() => {});
    return pending;
  }
  async list() {
    try {
      const data = JSON.parse(await readFile(this.index(), "utf8"));
      return Array.isArray(data.photos) ? data.photos : [];
    } catch {
      return [];
    }
  }
  async save(photos) {
    await mkdir(this.root, { recursive: true });
    const temp = this.index() + "." + randomUUID() + ".tmp";
    await writeFile(temp, JSON.stringify({ schema: 1, photos }), { mode: 0o600 });
    await rename(temp, this.index());
  }
  async read(sha) {
    const bytes = await readFile(this.file(sha));
    if (createHash("sha256").update(bytes).digest("hex") !== sha)
      throw Error("보관함 사진이 변경되었습니다.");
    return bytes;
  }

  /** items: [{ name, data: base64 JPEG, dhash: 16 hex chars }] → { added, duplicates } */
  async import(items) {
    if (!Array.isArray(items) || !items.length || items.length > 12)
      throw Error("사진은 한 번에 1~12장씩 보내세요.");
    const decoded = items.map((item) => {
      const bytes = decodeJpeg(item?.data);
      return {
        bytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        name: cleanName(item?.name),
        dhash: /^[0-9a-f]{16}$/.test(item?.dhash ?? "") ? item.dhash : null,
      };
    });
    return this.locked(async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const photos = await this.list();
      const known = new Set(photos.map((p) => p.sha256));
      let added = 0,
        duplicates = 0;
      for (const p of decoded) {
        if (known.has(p.sha256)) {
          duplicates++;
          continue;
        }
        if (photos.length >= MAX_PHOTOS)
          throw Error(`보관함에는 최대 ${MAX_PHOTOS}장까지 저장할 수 있습니다.`);
        await writeFile(this.file(p.sha256), p.bytes, { mode: 0o600 });
        photos.push({
          sha256: p.sha256,
          name: p.name,
          dhash: p.dhash,
          bytes: p.bytes.length,
          addedAt: Date.now(),
        });
        known.add(p.sha256);
        added++;
      }
      await this.save(photos);
      return { added, duplicates, total: photos.length };
    });
  }

  async remove(shas) {
    if (!Array.isArray(shas)) throw Error("삭제할 사진을 고르세요.");
    return this.locked(async () => {
      const drop = new Set(shas);
      const photos = await this.list();
      for (const sha of drop) await rm(this.file(sha), { force: true });
      const kept = photos.filter((p) => !drop.has(p.sha256));
      await this.save(kept);
      return { removed: photos.length - kept.length, total: kept.length };
    });
  }

  /**
   * Picks `count` photos: least-used first (ties shuffled), never two near-identical scene variants together.
   * `usage` maps sha256 → number of episodes that already used the photo; `avoid` lists photos already in the episode.
   */
  async pick(count, usage = new Map(), random = Math.random, avoid = []) {
    const photos = (await this.list())
      .filter((p) => !avoid.some((a) => a.sha256 === p.sha256))
      .map((p) => ({ p, used: usage.get(p.sha256) ?? 0, r: random() }))
      .sort((a, b) => a.used - b.used || a.r - b.r)
      .map((x) => x.p);
    const chosen = [];
    for (const p of photos) {
      if (chosen.length === count) break;
      if ([...avoid, ...chosen].some((c) => sameScene(c, p))) continue;
      chosen.push(p);
    }
    if (chosen.length < count)
      throw Error(
        `Part 1에 필요한 서로 다른 장면의 사진이 부족합니다. (${chosen.length}/${count}장) 사진 보관함에 사진을 더 가져오세요.`,
      );
    return chosen;
  }
}
