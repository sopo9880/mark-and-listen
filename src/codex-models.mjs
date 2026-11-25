// Models the local Codex CLI knows about, for the model dropdown. Codex keeps the list it fetched for the signed-in
// account in its home folder; the configured default model is read from config.toml. Nothing is sent anywhere.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const ID = /^(?:gpt|o\d|codex)[a-z0-9._:-]{0,60}$/i;

function collect(value, out, depth = 0) {
  if (depth > 6 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out, depth + 1);
    return;
  }
  const id = [value.slug, value.id, value.model].find((v) => typeof v === "string" && ID.test(v));
  if (id && !out.has(id)) {
    const label = [value.display_name, value.displayName, value.name].find(
      (v) => typeof v === "string" && v.length < 80,
    );
    const hidden = value.visibility === "hide" || value.hidden === true;
    if (!hidden) out.set(id, label && label !== id ? label : id);
  }
  for (const v of Object.values(value)) if (v && typeof v === "object") collect(v, out, depth + 1);
}

export async function codexModels(home = process.env.CODEX_HOME || join(homedir(), ".codex")) {
  const out = new Map();
  let defaultModel = null;
  for (const file of ["models_cache.json", "models.json"]) {
    try {
      collect(JSON.parse(await readFile(join(home, file), "utf8")), out);
    } catch {
      // Not there for this Codex version or not signed in yet.
    }
  }
  try {
    const m = /^\s*model\s*=\s*"([^"]+)"/m.exec(await readFile(join(home, "config.toml"), "utf8"));
    if (m && ID.test(m[1])) {
      defaultModel = m[1];
      if (!out.has(m[1])) out.set(m[1], m[1]);
    }
  } catch {
    // No config.
  }
  return { defaultModel, models: [...out].map(([id, label]) => ({ id, label })) };
}
