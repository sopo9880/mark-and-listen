// Fixed-voice listening directions and question-number cues, generated once with tools/make_directions.py
// and bundled in assets/directions. They are inserted only into full 100-question listening sections.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const KEY =
  /^(?:lc-intro|lc-end|p1-begin|next-page|p[1-4]-directions|num-(?:[1-9]|[1-9]\d|100)|intro-\d{2,3}-\d{2,3})$/;

export class DirectionBundle {
  constructor(root) {
    this.root = root;
    this.cache = null;
  }
  async index() {
    if (!this.cache) {
      try {
        const data = JSON.parse(await readFile(join(this.root, "index.json"), "utf8"));
        const clips = {};
        for (const [key, c] of Object.entries(data.clips ?? {}))
          if (
            KEY.test(key) &&
            /^[a-z0-9-]+\.wav$/.test(c.file) &&
            c.duration > 0 &&
            /^[0-9a-f]{64}$/.test(c.sha256)
          )
            clips[key] = {
              file: c.file,
              text: String(c.text ?? ""),
              duration: Number(c.duration),
              sha256: c.sha256,
            };
        this.cache = { voice: data.voice ?? null, clips };
      } catch {
        this.cache = { voice: null, clips: {} };
      }
    }
    return this.cache;
  }
  /** What an episode stores: durations and texts only (audio stays in the bundle). */
  async snapshot() {
    const { clips, voice } = await this.index();
    if (!clips["lc-intro"]) return null;
    return {
      voice,
      clips: Object.fromEntries(
        Object.entries(clips).map(([k, c]) => [k, { text: c.text, duration: c.duration }]),
      ),
    };
  }
  async read(key) {
    const c = (await this.index()).clips[key];
    if (!c) throw Object.assign(Error("안내 음원이 없습니다."), { code: "ENOENT" });
    const bytes = await readFile(join(this.root, c.file));
    if (createHash("sha256").update(bytes).digest("hex") !== c.sha256)
      throw Error("안내 음원이 손상되었습니다.");
    return bytes;
  }
}
