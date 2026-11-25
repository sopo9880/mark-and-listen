// Copies the runtime app (local server + UI) into staging/ for the Tauri bundle.
import { mkdir, cp, readdir, writeFile, stat, rm } from "node:fs/promises";
import { join } from "node:path";

const base = "staging";
await rm(base + "/app", { recursive: true, force: true });
await mkdir(base + "/app", { recursive: true });
await mkdir(base + "/ui", { recursive: true });
await cp("public", base + "/app/public", { recursive: true });
await cp("src", base + "/app/src", { recursive: true });
await cp("assets", base + "/app/assets", { recursive: true });
const release = process.env.MARK_BUILD_CHANNEL === "release";
await writeFile(
  base + "/app/src/build-info.mjs",
  `// Staged ${release ? "release" : "test"} build.\nexport const TEST_MODE = ${!release};\n`,
);
await cp("public/index.html", base + "/ui/index.html");

let size = 0;
async function walk(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const name = join(path, item.name);
    if (item.isDirectory()) await walk(name);
    else {
      const bundledPhoto = /[\\/]assets[\\/]part1-photos[\\/][0-9a-f]{16}\.jpg$/.test(name);
      const bundledDirection = /[\\/]assets[\\/]directions[\\/][a-z0-9-]+\.wav$/.test(name);
      if (
        (/\.(mp3|wav|ogg|jpe?g)$/i.test(name) && !bundledPhoto && !bundledDirection) ||
        /electron|codex\.exe/i.test(name)
      )
        throw Error("Forbidden bundled payload: " + name);
      size += (await stat(name)).size;
    }
  }
}
await walk(base + "/app");
console.log(
  `Staged ${release ? "release" : "test"} app bytes (bundled Part 1 photos and direction clips, no Electron or Codex): ` +
    size,
);

const trust = process.env.MARK_UPDATE_PUBLIC_KEY;
if (trust) {
  if (!/^[A-Za-z0-9+/]{59}=$/.test(trust)) throw Error("Invalid update public key encoding");
  await writeFile(
    base + "/app/src/update-trust.mjs",
    "export const UPDATE_PUBLIC_KEY=" + JSON.stringify(trust) + ";\n",
  );
}
