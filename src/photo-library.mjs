// Part 1 photos bundled with the app, and scene-aware assignment of photos to episodes.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const NEAR_DUPLICATE_BITS = 10;

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

/**
 * The Part 1 photo set that ships inside the app (assets/part1-photos). It is read-only: users never browse or
 * import photos; a photo is only shown as part of a question while taking an exam.
 */
export class PhotoLibrary {
  constructor(root) {
    this.root = root;
    this.cache = null;
  }
  async list() {
    if (!this.cache) {
      try {
        const data = JSON.parse(await readFile(join(this.root, "index.json"), "utf8"));
        this.cache = Array.isArray(data.photos)
          ? data.photos.filter((p) => /^[0-9a-f]{64}$/.test(p.sha256) && /^[0-9a-f]{16}\.jpg$/.test(p.file))
          : [];
      } catch {
        this.cache = [];
      }
    }
    return this.cache;
  }
  async read(sha) {
    const p = (await this.list()).find((x) => x.sha256 === sha);
    if (!p) throw Error("내장 사진을 찾을 수 없습니다.");
    const bytes = await readFile(join(this.root, p.file));
    if (createHash("sha256").update(bytes).digest("hex") !== sha)
      throw Error("내장 사진이 손상되었습니다. 앱을 다시 설치하세요.");
    return bytes;
  }

  /**
   * Picks `count` photos: least-used first (ties shuffled), never two variants of one scene together.
   * `usage` maps sha256 → number of episodes that already used the photo; `avoid` lists photos already in the episode.
   */
  async pick(count, usage = new Map(), random = Math.random, avoid = [], kind = null) {
    const photos = (await this.list())
      .filter((p) => !kind || p.kind === kind)
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
        kind
          ? `서로 다른 그림이 부족합니다. (${chosen.length}/${count}장)`
          : `Part 1에 쓸 수 있는 서로 다른 장면의 사진이 부족합니다. (${chosen.length}/${count}장)`,
      );
    return chosen;
  }
}
