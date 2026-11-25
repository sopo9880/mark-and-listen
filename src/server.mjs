import { APP_VERSION, createAppUpdater } from "./app-update.mjs";
import { UPDATE_PUBLIC_KEY } from "./update-trust.mjs";
import {
  attachPhotos,
  attachLibraryPhotos,
  createPhotoQuestion,
  decodePack,
  photoPath,
} from "./photo-pilot.mjs";
import { PhotoLibrary } from "./photo-library.mjs";
import { verifiedNarration, transcriptDiff } from "./narration.mjs";
import { solvePrompt, checkAnswers } from "./verify.mjs";
import { TEST_MODE } from "./build-info.mjs";
import { createSecretStore } from "./secrets.mjs";
import { transcribeWav } from "./stt.mjs";
import { DirectionBundle } from "./directions.mjs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, stat, rename } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, extname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { EpisodeStore, notebookEntries, validateWav } from "./episode-store.mjs";
import { isAudioGroup, audioTimeline, isFullListening } from "../public/lib/exams.mjs";
import { isOpen } from "../public/lib/attempt.mjs";
import { groupPrompt, parseGroup, fixedGroup } from "./episode-content.mjs";
import { createCodexUpdater } from "./codex-updater.mjs";
import { generateWithCodex, codexLoginStatus, codexBrowserLogin } from "./codex-engine.mjs";
import { generateWithProvider } from "./providers.mjs";
import { listLiveModels, listTextModels, credentials } from "./live-models.mjs";
import { wavFromPcm } from "./gemini-live.mjs";
import { createGeminiLivePool } from "./gemini-live-pool.mjs";
import { auditionWithOpenAILive } from "./openai-live.mjs";
export const VERSION = APP_VERSION;
const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const BUNDLED_PHOTOS = fileURLToPath(new URL("../assets/part1-photos/", import.meta.url));
const BUNDLED_DIRECTIONS = fileURLToPath(new URL("../assets/directions/", import.meta.url));
const dataRoot = () =>
  process.env.MARK_LISTEN_DATA ||
  join(
    process.platform === "win32" ? process.env.LOCALAPPDATA || homedir() : join(homedir(), ".local", "share"),
    "mark-and-listen",
  );
const fail = (status, message) => Object.assign(Error(message), { status });
const json = async (req) => {
  if (!req.headers["content-type"]?.startsWith("application/json")) throw fail(415, "JSON 필요");
  let size = 0;
  const parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4_000_000) throw fail(413, "요청 크기 초과");
    parts.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(parts));
  } catch {
    throw fail(400, "JSON 오류");
  }
};
/** Test mode: the whole listening section as one WAV, with the same pauses the exam timeline uses. */
/** Linear resampling of 16-bit mono PCM (used only when a bundled clip and Live audio differ in rate). */
function resample(pcm, from, to) {
  if (from === to) return pcm;
  const n = Math.floor(((pcm.length / 2) * to) / from);
  const out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const x = (i * from) / to,
      k = Math.floor(x),
      f = x - k;
    const a = pcm.readInt16LE(Math.min(k, pcm.length / 2 - 1) * 2),
      b = pcm.readInt16LE(Math.min(k + 1, pcm.length / 2 - 1) * 2);
    out.writeInt16LE(Math.round(a + (b - a) * f), i * 2);
  }
  return out;
}

/** Joins timeline entries into one WAV, keeping each entry at its exam start time (gaps become silence). */
export async function joinTimeline(store, e, entries, directions) {
  if (!entries.length) throw Object.assign(Error("준비된 듣기 음원이 없습니다."), { status: 409 });
  const chunks = [];
  let rate = 0,
    size = 0,
    at = entries[0].start;
  for (const seg of entries) {
    const wav =
      seg.kind === "direction"
        ? await directions.read(seg.key)
        : await readFile(await store.audio(e.id, seg.id));
    const r = validateWav(wav);
    rate ||= r;
    const gap = Math.max(0, Math.round((seg.start - at) * rate)) * 2;
    if (gap) {
      chunks.push(Buffer.alloc(gap));
      size += gap;
    }
    const pcm = resample(wav.subarray(44), r, rate);
    chunks.push(pcm);
    size += pcm.length;
    at = seg.start + pcm.length / 2 / rate;
  }
  return wavFromPcm(chunks, size, rate);
}

/** Test mode: the whole listening section as one WAV, with the same pauses the exam timeline uses. */
export async function listeningWav(store, e, directions) {
  return joinTimeline(
    store,
    e,
    audioTimeline(e).filter((s) => s.status === "ready"),
    directions,
  );
}

/** Consecutive timeline entries of one question group (or one run of directions), for chunked re-transcription. */
export function listeningChunks(e) {
  const out = [];
  for (const entry of audioTimeline(e)) {
    const key = entry.groupId ?? "directions";
    const last = out.at(-1);
    if (last && last.key === key) last.entries.push(entry);
    else out.push({ key, entries: [entry] });
  }
  return out;
}

const VOICES = {
  gemini: { f: ["Kore", "Aoede", "Leda", "Zephyr"], m: ["Puck", "Iapetus", "Orus", "Fenrir"] },
  openai: { f: ["marin", "coral", "sage", "shimmer"], m: ["ash", "echo", "ballad", "verse"] },
};
// One narrator for the whole listening section, as in the real test: the same voice as the bundled directions.
const NARRATOR = { gemini: "Charon", openai: "cedar" };

export function voiceFor(provider, e, g, s) {
  const pool = VOICES[provider] ?? VOICES.gemini;
  const narrator =
    provider === "gemini" && e?.directions?.voice
      ? e.directions.voice
      : (NARRATOR[provider] ?? NARRATOR.gemini);
  if (s.speaker === "narrator") return narrator;
  const n = Math.max(0, e.groups.indexOf(g));
  const first = n % 2 ? "m" : "f",
    other = first === "f" ? "m" : "f";
  const usable = (gender) => pool[gender].filter((v) => v !== narrator);
  const pick = (gender, k) => {
    const list = usable(gender);
    return list[(Math.floor(n / 2) + k) % list.length];
  };
  if (s.speaker === "A") return pick(first, 0);
  if (s.speaker === "B") return pick(other, 0);
  return pick(first, 1); // C
}

export async function buildServer({
  root = dataRoot(),
  photoRoot = BUNDLED_PHOTOS,
  directionsRoot = BUNDLED_DIRECTIONS,
  testMode = TEST_MODE,
  stt,
  secretCodec,
  updater,
  generate = generateWithProvider,
  codex = generateWithCodex,
  live,
  models = listLiveModels,
  textModels = listTextModels,
  autoUpdate = true,
  autoConnect = autoUpdate,
  smoke = false,
} = {}) {
  const appUpdate = createAppUpdater({ publicKey: UPDATE_PUBLIC_KEY });
  let appUpdating = false;
  const store = await new EpisodeStore(join(root, "episodes")).init();
  const photos = new PhotoLibrary(photoRoot);
  const photoUsage = async () => {
    const usage = new Map();
    for (const e of await store.list())
      for (const g of e.groups) if (g.photoHash) usage.set(g.photoHash, (usage.get(g.photoHash) ?? 0) + 1);
    return usage;
  };
  updater ??= createCodexUpdater({ root: join(root, "codex") });
  let settings = {
    autoUpdate: true,
    liveProvider: "gemini",
    liveModel: "",
    textProvider: "codex",
    textModel: "",
    visionProvider: "codex",
    visionModel: "",
    sttModel: "",
  };
  try {
    settings = { ...settings, ...JSON.parse(await readFile(join(root, "settings.json"), "utf8")) };
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const secretStore = createSecretStore(join(root, "keys.json"), secretCodec);
  const keys = await secretStore.load();
  let keySaveError = false;
  const directions = new DirectionBundle(directionsRoot);
  const audioChecks = !live || !!stt;
  const sttCall = (provider, wav, signal) =>
    (stt ?? transcribeWav)({
      provider,
      apiKey: getKey(provider),
      wav,
      model: settings.sttModel || undefined,
      signal,
    });
  const narrationChecks = (provider, signal) =>
    audioChecks ? { duration: true, transcribe: (wav) => sttCall(provider, wav, signal) } : {};
  const connections = {};
  let loginTask = null;
  let uiReady = false,
    busy = false,
    updateBusy = false,
    lastUpdate = 0,
    updateError = "",
    cooldown = 0;
  const modelCache = new Map();
  const notebookFile = join(root, "notebook.json");
  const readNotebook = async () => {
    try {
      const data = JSON.parse(await readFile(notebookFile, "utf8"));
      return data && typeof data.mastered === "object" ? data : { mastered: {} };
    } catch {
      return { mastered: {} };
    }
  };
  const token = randomBytes(32).toString("hex");
  const persist = async () => {
    await writeFile(join(root, "settings.tmp"), JSON.stringify(settings), { mode: 0o600 });
    await rename(join(root, "settings.tmp"), join(root, "settings.json"));
  };
  const performUpdate = async () => {
    if (busy || updateBusy || loginTask) return;
    updateBusy = true;
    try {
      if ((await store.list()).some((e) => e.attempts.some((a) => isOpen(a)))) return;
      lastUpdate = Date.now();
      if ((await updater.status()).supported) await updater.install("latest");
      updateError = "";
    } catch {
      updateError = "업데이트 실패 · 기존 엔진을 유지합니다.";
    } finally {
      updateBusy = false;
    }
  };
  // Developer log (shown under Settings in test builds). Keys are masked; unlimited in test mode.
  const logs = [];
  const log = (level, message) => {
    let text = String(message ?? "");
    for (const k of Object.values(keys))
      if (typeof k === "string" && k.length >= 8) text = text.split(k).join("***");
    logs.push({ t: Date.now(), level, text: text.slice(0, 4000) });
    if (!testMode && logs.length > 500) logs.splice(0, logs.length - 500);
  };
  const errText = (err) =>
    [err?.status && `HTTP ${err.status}`, err?.code, err?.message ?? String(err)].filter(Boolean).join(" · ");
  // Gemini narration reuses open Live sessions (one per model and voice) across segments.
  const geminiPool = live ? null : createGeminiLivePool({ onEvent: (m) => log("live", m) });
  let lastVoice = null; // narration is produced voice by voice: stay with this voice while it has lines left
  const speak =
    live ?? ((args) => (args.provider === "gemini" ? geminiPool.speak(args) : auditionWithOpenAILive(args)));
  const getKey = (p) => keys[p] || process.env[p === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"];
  async function connectionStates() {
    const installed = await updater.executable();
    return {
      codex: installed ? (connections.codex ?? "unverified") : "unset",
      gemini: getKey("gemini") ? (connections.gemini ?? "unverified") : "unset",
      openai: getKey("openai") ? (connections.openai ?? "unverified") : "unset",
      loginPending: !!loginTask,
    };
  }
  async function checkedModels(provider) {
    if (!["gemini", "openai"].includes(provider)) throw fail(400, "API 공급자를 선택하세요.");
    if (!getKey(provider)) throw fail(400, "설정에서 API 키를 연결하세요.");
    try {
      const apiKey = getKey(provider);
      const list = await models({ provider, apiKey });
      if (getKey(provider) !== apiKey) throw Error("API 키가 변경되었습니다.");
      modelCache.set(provider, list);
      connections[provider] = "connected";
      return list;
    } catch {
      connections[provider] = "error";
      throw fail(502, "API 연결을 확인하지 못했습니다. 키, 권한과 네트워크를 확인하세요.");
    }
  }

  // Connection states are checked on start-up, after a key changes and every 10 minutes, without user action.
  let refreshing = null;
  function refreshConnections() {
    refreshing ??= (async () => {
      const exe = await updater.executable().catch(() => null);
      if (exe && !loginTask) {
        try {
          connections.codex = await codexLoginStatus(exe);
        } catch {
          connections.codex = "error";
        }
      }
      for (const p of ["gemini", "openai"]) if (getKey(p)) await checkedModels(p).catch(() => {});
    })().finally(() => (refreshing = null));
    return refreshing;
  }

  async function liveArgs() {
    const provider = settings.liveProvider,
      apiKey = getKey(provider),
      model = settings.liveModel;
    credentials(provider, apiKey);
    const cached = modelCache.get(provider);
    if (!model || !cached?.some((m) => m.id === model))
      throw fail(400, "설정에서 모델 목록을 갱신하고 Live 모델을 선택하세요.");
    return { provider, apiKey, model };
  }
  const send = (res, data, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  async function stream(req, res, file, type) {
    const { size } = await stat(file);
    let start = 0,
      end = size - 1;
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m || (!m[1] && !m[2])) throw fail(416, "범위 오류");
      start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
      if (!Number.isSafeInteger(start) || start < 0 || start >= size || end < start)
        throw fail(416, "범위 오류");
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    res.writeHead(range ? 206 : 200, {
      "Content-Type": type,
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
    });
    if (req.method === "HEAD") res.end();
    else
      createReadStream(file, { start, end })
        .on("error", () => res.destroy())
        .pipe(res);
  }
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    try {
      const port = server.address()?.port;
      if (
        req.headers.host !== `127.0.0.1:${port}` ||
        (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        throw fail(403, "다른 사이트의 요청은 허용하지 않습니다.");
      const path = new URL(req.url, "http://localhost").pathname;
      if (req.method === "GET" && path === "/api/session") {
        send(res, { token, build: VERSION, testMode, ...(smoke ? { smoke: true } : {}) });
        return;
      }
      if (testMode && req.method === "GET" && path === "/api/logs") {
        const since = Math.max(
          0,
          Number(new URL(req.url, "http://localhost").searchParams.get("since")) || 0,
        );
        send(res, { from: since, count: logs.length, lines: logs.slice(since, since + 5000) });
        return;
      }
      if (smoke && req.method === "GET" && path === "/api/smoke") {
        send(res, { uiReady });
        return;
      }
      const direction = /^\/api\/directions\/([a-z0-9-]+)\.wav$/.exec(path);
      if (direction && ["GET", "HEAD"].includes(req.method)) {
        const wav = await directions.read(direction[1]);
        res.writeHead(200, {
          "Content-Type": "audio/wav",
          "Content-Length": wav.length,
          "Cache-Control": "private, max-age=86400",
        });
        res.end(req.method === "HEAD" ? undefined : wav);
        return;
      }
      const listening = /^\/api\/listening\/([a-zA-Z0-9-]+)\.wav$/.exec(path);
      if (listening && testMode && ["GET", "HEAD"].includes(req.method)) {
        const wav = await listeningWav(store, await store.read(listening[1]), directions);
        res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wav.length });
        res.end(req.method === "HEAD" ? undefined : wav);
        return;
      }
      if (req.method === "GET" && path === "/api/notebook") {
        const { mastered } = await readNotebook();
        send(res, { entries: notebookEntries(await store.list(), mastered) });
        return;
      }
      if (req.method === "GET" && path === "/api/library") {
        send(res, { episodes: await store.list() });
        return;
      }
      if (req.method === "GET" && path === "/api/app-update") {
        send(res, {
          enabled:
            appUpdate.enabled && process.platform === "win32" && process.env.MARK_LISTEN_PARENT_PIPE === "1",
          version: VERSION,
        });
        return;
      }
      if (req.method === "GET" && path === "/api/connections") {
        send(res, await connectionStates());
        return;
      }
      if (req.method === "GET" && path === "/api/settings") {
        send(res, {
          ...settings,
          keys: { gemini: !!getKey("gemini"), openai: !!getKey("openai") },
          codex: await updater.status(),
          updateBusy,
          updateError,
          dataRoot: root,
          keySaveError,
        });
        return;
      }
      const photo = /^\/api\/photo\/([0-9a-f-]{36})\/(p1-[1-6])$/.exec(path);
      if (photo && ["GET", "HEAD"].includes(req.method)) {
        await stream(req, res, photoPath(store.root, photo[1], photo[2]), "image/jpeg");
        return;
      }
      const media = /^\/api\/media\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-]+)$/.exec(path);
      if (media && ["GET", "HEAD"].includes(req.method)) {
        await stream(req, res, await store.audio(media[1], media[2]), "audio/wav");
        return;
      }
      if (req.method === "POST" && path.startsWith("/api/")) {
        if (req.headers["x-mark-session"] !== token) throw fail(403, "앱을 새로고침하세요.");
        const b = await json(req);
        if (smoke && path === "/api/smoke") {
          uiReady = b.uiReady === true;
          send(res, { uiReady });
          return;
        }
        if (path === "/api/settings") {
          if (busy || updateBusy) throw fail(409, "현재 작업이 끝난 후 설정을 바꾸세요.");
          if (b.keyProvider) {
            if (b.apiKey === "" && ["gemini", "openai"].includes(b.keyProvider)) delete keys[b.keyProvider];
            else {
              credentials(b.keyProvider, b.apiKey);
              keys[b.keyProvider] = b.apiKey;
            }
            try {
              await secretStore.save(keys);
            } catch {
              // The key still works for this session; it just could not be written to disk.
              keySaveError = true;
            }
            if (autoConnect) void refreshConnections();
            connections[b.keyProvider] = "unverified";
            modelCache.delete(b.keyProvider);
          }
          for (const k of ["liveProvider", "textProvider", "visionProvider"])
            if (b[k] !== undefined) {
              const allowed = k === "liveProvider" ? ["gemini", "openai"] : ["codex", "gemini", "openai"];
              if (!allowed.includes(b[k])) throw fail(400, "공급자 오류");
              settings[k] = b[k];
            }
          for (const k of ["liveModel", "textModel", "visionModel", "sttModel"])
            if (b[k] !== undefined) {
              if (typeof b[k] !== "string" || b[k].length > 160 || !/^[a-zA-Z0-9_.:-]*$/.test(b[k]))
                throw fail(400, "모델 ID 오류");
              settings[k] = b[k];
            }
          if (typeof b.autoUpdate === "boolean") settings.autoUpdate = b.autoUpdate;
          await persist();
          send(res, { ok: true });
          return;
        }

        if (path === "/api/app-update/check") {
          if (appUpdating) throw fail(409, "앱 업데이트가 진행 중입니다.");
          try {
            send(res, { update: await appUpdate.check() });
          } catch (e) {
            throw fail(502, e.message);
          }
          return;
        }
        if (path === "/api/app-update/install") {
          if (busy || updateBusy || loginTask || appUpdating)
            throw fail(409, "진행 중인 작업을 마친 뒤 설치하세요.");
          if (process.platform !== "win32" || process.env.MARK_LISTEN_PARENT_PIPE !== "1")
            throw fail(400, "Windows 데스크톱 앱에서 설치하세요.");
          appUpdating = true;
          busy = true;
          try {
            if ((await store.list()).some((e) => e.attempts.some((a) => isOpen(a))))
              throw fail(409, "진행 중인 시험을 마친 뒤 설치하세요.");
            await appUpdate.install(b.version);
            res.once("finish", () => setTimeout(() => console.log("MARK_INSTALL_READY"), 300));
            send(res, { installing: true });
          } catch (e) {
            appUpdating = false;
            busy = false;
            throw fail(e.status || 502, e.message);
          }
          return;
        }
        if (path === "/api/text-models") {
          if (!["gemini", "openai"].includes(b.provider)) throw fail(400, "API 공급자를 선택하세요.");
          if (!getKey(b.provider)) throw fail(400, "먼저 API 키를 연결하세요.");
          try {
            send(res, { models: await textModels({ provider: b.provider, apiKey: getKey(b.provider) }) });
          } catch (err) {
            throw fail(502, err.message);
          }
          return;
        }
        if (path === "/api/models") {
          send(res, { models: await checkedModels(b.provider) });
          return;
        }
        if (path === "/api/connection/check") {
          if (b.provider === "codex") {
            const exe = await updater.executable();
            if (exe && !loginTask) {
              try {
                connections.codex = await codexLoginStatus(exe);
              } catch {
                connections.codex = "error";
              }
            }
          } else await checkedModels(b.provider);
          send(res, await connectionStates());
          return;
        }
        if (path === "/api/codex/update") {
          if (busy || updateBusy || loginTask) throw fail(409, "작업 중에는 교체하지 않습니다.");
          await performUpdate();
          send(res, { status: await updater.status(), error: updateError });
          return;
        }
        if (path === "/api/codex/browser-login") {
          if (busy || updateBusy || loginTask) throw fail(409, "진행 중인 작업이 있습니다.");
          const exe = await updater.executable();
          if (!exe) throw fail(400, "Codex 엔진을 먼저 설치하세요.");
          connections.codex = "unverified";
          const controller = new AbortController();
          const abortLogin = () => controller.abort();
          server.once("close", abortLogin);
          loginTask = codexBrowserLogin(
            exe,
            AbortSignal.any([controller.signal, AbortSignal.timeout(300000)]),
          )
            .then(
              (status) => {
                connections.codex = status;
              },
              () => {
                connections.codex = "error";
              },
            )
            .finally(() => {
              server.removeListener("close", abortLogin);
              loginTask = null;
            });
          send(res, await connectionStates());
          return;
        }
        if (path === "/api/photo-pilot") {
          if (!testMode) throw fail(404, "API 없음");
          const { provider, model } = b;
          if (
            !["gemini", "openai"].includes(provider) ||
            typeof model !== "string" ||
            !/^[a-z0-9][a-z0-9_.-]{0,100}$/i.test(model)
          )
            throw fail(400, "이미지 입력을 지원하는 공급자와 모델 ID를 지정하세요.");
          if (!getKey(provider)) throw fail(400, "설정에서 선택한 이미지 공급자의 API 키를 연결하세요.");
          let photos;
          try {
            photos = decodePack(b.images);
          } catch (e) {
            throw fail(400, e.message);
          }
          const episode = await store.create({ counts: { 1: 6 }, title: "Part 1 · 사진 6장 파일럿" });
          episode.photoPilot = { provider, model };
          send(res, await attachPhotos(store, episode, photos));
          return;
        }
        if (path === "/api/listening-check") {
          if (!testMode) throw fail(404, "API 없음");
          if (busy) throw fail(409, "제작 작업이 끝난 뒤 검사하세요.");
          const e = await store.read(b.id);
          const chunks = listeningChunks(e).filter((c) => c.entries.every((x) => x.status === "ready"));
          const index = Number(b.index) || 0;
          if (index >= chunks.length) {
            send(res, { total: chunks.length, done: true, check: e.listeningCheck ?? null });
            return;
          }
          const provider = settings.liveProvider;
          if (!getKey(provider)) throw fail(400, "설정에서 Live 공급자의 API 키를 연결하세요.");
          busy = true;
          try {
            const c = chunks[index];
            const wav = await joinTimeline(store, e, c.entries, directions);
            const transcript = await sttCall(provider, wav, AbortSignal.timeout(180000));
            const diff = transcriptDiff(c.entries.map((x) => x.text).join("\n"), transcript);
            const g = e.groups.find((x) => x.id === c.key);
            const result = {
              key: c.key,
              label: g ? `${g.id} · Part ${g.part}` : "안내 방송",
              seconds: Math.round(((wav.length - 44) / 2 / wav.readUInt32LE(24)) * 10) / 10,
              exact: diff.exact,
              missing: diff.missing,
              added: diff.added,
              ops: diff.ops,
              transcript: transcript.slice(0, 6000),
            };
            if (index === 0 || !e.listeningCheck) e.listeningCheck = { at: Date.now(), results: [] };
            e.listeningCheck.results = e.listeningCheck.results.filter((r) => r.key !== c.key).concat(result);
            await store.write(e);
            send(res, { total: chunks.length, index, result });
          } catch (err) {
            throw fail(err.status === 429 ? 429 : 502, err.message || "전사 검사 실패");
          } finally {
            busy = false;
          }
          return;
        }
        if (path === "/api/episodes/swap-photo") {
          if (!testMode) throw fail(404, "API 없음");
          if (busy) throw fail(409, "제작 작업이 끝난 뒤 교체하세요.");
          const e = await store.read(b.id);
          if (e.attempts.length) throw fail(409, "응시한 회차는 변경할 수 없습니다.");
          const g = e.groups.find((x) => x.id === b.groupId && x.photoHash);
          if (!g || !e.photoPart1) throw fail(400, "보관함 사진을 쓰는 Part 1 문항이 아닙니다.");
          const library = await photos.list();
          const avoid = e.groups
            .filter((x) => x.photoHash)
            .map(
              (x) =>
                library.find((p) => p.sha256 === x.photoHash) ?? {
                  sha256: x.photoHash,
                  name: x.photoName ?? "",
                },
            );
          let next;
          try {
            [next] = await photos.pick(1, await photoUsage(), Math.random, avoid);
          } catch (err) {
            throw fail(400, err.message);
          }
          const bytes = await photos.read(next.sha256);
          await writeFile(photoPath(store.root, e.id, g.id), bytes, { mode: 0o600 });
          Object.assign(g, {
            photoHash: next.sha256,
            photoName: next.name,
            status: "pending",
            reviewed: false,
            questions: [],
            segments: [],
            error: null,
          });
          send(res, await store.write(e));
          return;
        }
        if (path === "/api/episodes") {
          let picks = null;
          const wantsPhotos = (b.exam ?? "toeic") === "toeic" && Number(b.counts?.[1]) > 0;
          try {
            if (wantsPhotos && b.fixed !== true) {
              const chosen = await photos.pick(Number(b.counts[1]), await photoUsage());
              picks = await Promise.all(
                chosen.map(async (p) => ({ name: p.name, bytes: await photos.read(p.sha256) })),
              );
            }
            const e = await store.create(b);
            if (isFullListening(e)) {
              const snapshot = await directions.snapshot();
              if (snapshot) {
                e.directions = snapshot;
                await store.write(e);
              }
            }
            send(res, picks ? await attachLibraryPhotos(store, e, picks) : e);
          } catch (e) {
            throw fail(400, e.message);
          }
          return;
        }
        if (path === "/api/episodes/rename") {
          send(res, await store.rename(b.id, b.title));
          return;
        }
        if (path === "/api/episodes/delete") {
          if (busy) throw fail(409, "제작 작업이 끝난 뒤 삭제하세요.");
          const e = await store.read(b.id);
          if (e.attempts.some((a) => isOpen(a)))
            throw fail(409, "진행 중인 응시가 있는 회차는 삭제할 수 없습니다.");
          await store.remove(b.id);
          const notebook = await readNotebook();
          for (const key of Object.keys(notebook.mastered))
            if (key.startsWith(b.id + ":")) delete notebook.mastered[key];
          await writeFile(notebookFile, JSON.stringify(notebook), { mode: 0o600 });
          send(res, { ok: true });
          return;
        }
        if (path === "/api/attempt/delete") {
          try {
            send(res, await store.removeAttempt(b.id, b.attemptId));
          } catch (e) {
            throw fail(409, e.message);
          }
          return;
        }
        if (path === "/api/notebook") {
          if (typeof b.key !== "string" || !/^[a-zA-Z0-9-]{1,90}:[a-zA-Z0-9-]{1,90}$/.test(b.key))
            throw fail(400, "오답 노트 항목 오류");
          const notebook = await readNotebook();
          if (b.mastered === true) notebook.mastered[b.key] = Date.now();
          else delete notebook.mastered[b.key];
          await writeFile(notebookFile + ".tmp", JSON.stringify(notebook), { mode: 0o600 });
          await rename(notebookFile + ".tmp", notebookFile);
          send(res, { ok: true });
          return;
        }
        if (path === "/api/attempt/start") {
          if (busy) throw fail(409, "제작 작업 종료 후 응시하세요.");
          busy = true;
          try {
            send(res, await store.begin(b.id));
          } catch (e) {
            throw fail(409, e.code === "ENOENT" ? "저장된 음원이 없습니다." : e.message);
          } finally {
            busy = false;
          }
          return;
        }
        if (path === "/api/attempt/action") {
          send(res, await store.attempt(b.id, b.attemptId, b.action));
          return;
        }
        if (["/api/produce", "/api/test-live"].includes(path)) {
          if (busy || updateBusy) throw fail(409, "다른 제작 또는 업데이트가 진행 중입니다.");
          if (Date.now() < cooldown) throw fail(429, "사용량 한도 이후 잠시 기다려 주세요.");
          busy = true;
          const abort = new AbortController();
          const close = () => abort.abort();
          res.once("close", close);
          try {
            const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(300000)]);
            if (path === "/api/test-live") {
              const args = await liveArgs();
              const r = await verifiedNarration(
                speak,
                {
                  ...args,
                  prompt:
                    b.script === "choices"
                      ? "A. The woman is arranging books.\nB. The window is closed.\nC. Three chairs are by the door.\nD. The table is not empty."
                      : b.script === "single"
                        ? "The meeting starts at ten fifteen."
                        : "The meeting starts at ten fifteen. Please bring three copies.",
                  voice: args.provider === "gemini" ? "Kore" : "marin",
                  signal,
                },
                narrationChecks(args.provider, signal),
              ).catch((e) => {
                if (e.code === "NARRATION_MISMATCH")
                  throw Object.assign(fail(422, e.message), { detail: e.last });
                throw e;
              });
              send(res, { wav: r.wav.toString("base64"), transcript: r.transcript });
              return;
            }
            const e = await store.read(b.id);
            if (e.attempts.length) throw fail(409, "응시한 회차는 변경할 수 없습니다. 새 회차를 만드세요.");
            const MAX_TRIES = 3;
            if (b.retryFailed === true) {
              for (const x of e.groups)
                if (x.status === "failed") Object.assign(x, { status: "pending", tries: 0, error: null });
              for (const x of e.groups)
                for (const seg of x.segments ?? [])
                  if (seg.status === "failed") Object.assign(seg, { status: "pending", error: null });
              await store.write(e);
            }
            const textCall = async (prompt) => {
              const provider = settings.textProvider;
              if (provider !== "codex" && !getKey(provider))
                throw fail(400, "설정에서 문항 생성 엔진의 API 키를 연결하세요.");
              return provider === "codex"
                ? codex({
                    executable: (await updater.executable()) ?? "codex",
                    prompt,
                    model: settings.textModel || undefined,
                    signal,
                  })
                : generate({
                    provider,
                    apiKey: getKey(provider),
                    model: settings.textModel || undefined,
                    prompt,
                    signal,
                  });
            };
            let g = e.groups.find((x) => x.status !== "ready" && x.status !== "failed");
            if (g) {
              g.tries = (g.tries ?? 0) + 1;
              try {
                if (g.photoHash) {
                  // Photo questions never fall back to the bundled illustrations.
                  const vision = e.photoPilot ?? {
                    provider: settings.visionProvider,
                    model: settings.visionModel,
                  };
                  if (vision.provider !== "codex" && !getKey(vision.provider))
                    throw fail(400, "설정에서 사진 문항 엔진(이미지 입력)의 API 키를 연결하세요.");
                  const executable =
                    vision.provider === "codex" ? ((await updater.executable()) ?? "codex") : null;
                  Object.assign(
                    g,
                    await createPhotoQuestion({
                      store,
                      episode: e,
                      group: g,
                      modelCall: ({ images, prompt }) =>
                        vision.provider === "codex"
                          ? codex({ executable, prompt, images, model: vision.model || undefined, signal })
                          : generate({
                              provider: vision.provider,
                              model: vision.model || undefined,
                              images,
                              prompt,
                              apiKey: getKey(vision.provider),
                              signal,
                            }),
                    }),
                  );
                } else if (e.fixed || b.fixed === true) {
                  Object.assign(g, fixedGroup(g));
                } else {
                  log("info", `문항 생성 ${g.id} (시도 ${g.tries})`);
                  const parsed = parseGroup(await textCall(groupPrompt(e, g)), g, e);
                  const check = checkAnswers(await textCall(solvePrompt(e, parsed)), parsed);
                  if (!check.ok) throw Object.assign(Error(check.reason), { verify: true });
                  Object.assign(g, parsed);
                }
                Object.assign(g, { verified: true, error: null });
                log("ok", `문항 ${g.id} 검증 통과`);
                await store.write(e);
              } catch (err) {
                log("error", `문항 ${g.id} 실패: ${errText(err)}`);
                if (err.status === 400 || err.status === 429) {
                  g.tries -= 1;
                  g.error = err.message;
                  await store.write(e);
                  throw err;
                }
                g.lastError = String(err.message ?? "").slice(0, 300);
                if (g.tries < MAX_TRIES) {
                  // Internal retry: regenerate (and for photos, try another bundled photo of a new scene).
                  if (g.photoHash && e.photoPart1) {
                    try {
                      const library = await photos.list();
                      const avoid = e.groups
                        .filter((x) => x.photoHash)
                        .map(
                          (x) =>
                            library.find((p) => p.sha256 === x.photoHash) ?? {
                              sha256: x.photoHash,
                              name: x.photoName ?? "",
                            },
                        );
                      const [next] = await photos.pick(1, await photoUsage(), Math.random, avoid);
                      await writeFile(photoPath(store.root, e.id, g.id), await photos.read(next.sha256), {
                        mode: 0o600,
                      });
                      Object.assign(g, { photoHash: next.sha256, photoName: next.name });
                    } catch {
                      // Keep the current photo and try again.
                    }
                  }
                  g.status = "pending";
                } else {
                  g.status = "failed";
                  g.error = "문항을 만들지 못했습니다. 잠시 뒤 ‘실패 항목 다시 시도’를 눌러 주세요.";
                }
                await store.write(e);
              }
              send(res, { episode: e, more: true });
              return;
            }
            let s;
            // Voice by voice: every line of one voice is read before the next voice starts, so each voice
            // needs about one Live session. The episode is still assembled in question order.
            const provider = settings.liveProvider || "gemini";
            const todo = [];
            for (const group of e.groups.filter((x) => isAudioGroup(e, x) && x.status === "ready"))
              for (const x of group.segments)
                if (b.retrySegment ? x.id === b.retrySegment : x.status !== "ready" && x.status !== "failed")
                  todo.push({ group, x, voice: voiceFor(provider, e, group, x) });
            const pickNext = todo.find((t) => t.voice === lastVoice) ?? todo[0];
            if (pickNext) {
              g = pickNext.group;
              s = pickNext.x;
            }
            if (!s) {
              send(res, { episode: e, more: false });
              return;
            }
            try {
              const args = await liveArgs();
              const voice = voiceFor(args.provider, e, g, s);
              if (voice !== lastVoice)
                log("info", `목소리 ${voice} 차례 (${todo.filter((t) => t.voice === voice).length}개 문장)`);
              lastVoice = voice;
              log("info", `음원 ${s.id} · ${voice} · ${args.model} · "${s.text.slice(0, 80)}"`);
              const result = await verifiedNarration(
                speak,
                { ...args, prompt: s.text, voice, signal },
                narrationChecks(args.provider, signal),
              );
              await store.saveAudio(e, s, result);
              Object.assign(s, {
                provider: args.provider,
                model: args.model,
                voice,
                diff: result.diff,
                attempts: result.attempts,
                liveTranscript: result.liveTranscript,
                sttChecked: result.sttChecked,
                reviewed: true,
              });
              delete s.lastTake;
              await store.write(e);
              log("ok", `음원 ${s.id} 완료 (${result.attempts}회, ${s.duration?.toFixed?.(2)}s)`);
            } catch (err) {
              log(
                "error",
                `음원 ${s.id} 실패: ${errText(err)}` +
                  (err.last ? ` · 들린 말: "${String(err.last.transcript ?? "").slice(0, 200)}"` : ""),
              );
              if (err.status === 400) throw err;
              const limited = err.status === 429 || err.code === "GEMINI_LIVE_RATE_LIMIT";
              // A quota stop is not the segment's fault: it stays pending and is picked up on the next run.
              if (s.status !== "ready") s.status = limited ? "pending" : "failed";
              if (err.last)
                s.lastTake = {
                  transcript: String(err.last.transcript ?? "").slice(0, 4000),
                  diff: err.last.diff,
                };
              s.error =
                err.code === "NARRATION_MISMATCH"
                  ? "낭독과 대본이 세 번 모두 일치하지 않았습니다."
                  : "Live 생성 실패. 키·모델·할당량을 확인하세요. 다른 공급자로 전환하지 않았습니다.";
              await store.write(e);
              if (err.status === 429 || err.code === "GEMINI_LIVE_RATE_LIMIT") {
                cooldown = Date.now() + 15000;
                throw fail(429, "Live 사용량 한도에 도달했습니다. 완료된 구간은 저장되어 있습니다.");
              }
              if (b.retrySegment) throw fail(502, s.error);
            }
            send(res, { episode: e, more: !b.retrySegment });
            return;
          } finally {
            busy = false;
            res.removeListener("close", close);
          }
        }
        throw fail(404, "API 없음");
      }
      if (!["GET", "HEAD"].includes(req.method)) throw fail(404, "파일 없음");
      const name = path === "/" ? "index.html" : path.slice(1);
      if (
        !/^(?:(?:ui|lib)\/[a-z0-9-]+\.mjs|full-lc-images\/[a-z0-9-]+\.svg|[a-z0-9-]+\.(?:html|mjs|css|png))$/.test(
          name,
        )
      )
        throw fail(404, "파일 없음");
      const type = {
        ".html": "text/html; charset=utf-8",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      }[extname(name)];
      await stream(req, res, join(PUBLIC, name), type);
    } catch (e) {
      if (!e.status || e.status >= 500) log("error", `${req.method} ${req.url}: ${errText(e)}`);
      if (!res.destroyed && !res.headersSent)
        send(
          res,
          {
            ...(e.detail ? { detail: e.detail } : {}),
            error: e.status
              ? e.message
              : e.code === "ENOENT"
                ? "저장된 파일을 찾을 수 없습니다."
                : "작업을 완료하지 못했습니다. 설정과 저장 공간을 확인하세요.",
          },
          e.status || 500,
        );
    }
  });
  const interval = setInterval(() => {
    if (autoUpdate && settings.autoUpdate && Date.now() - lastUpdate > 24 * 3600000) void performUpdate();
  }, 60000);
  interval.unref();
  server.once("close", () => clearInterval(interval));
  if (autoConnect) {
    const connectTimer = setInterval(() => void refreshConnections(), 10 * 60000);
    connectTimer.unref();
    server.once("close", () => clearInterval(connectTimer));
  }
  server.once("listening", () => {
    if (autoConnect) void refreshConnections();
    if (autoUpdate && settings.autoUpdate) void performUpdate();
  });
  server.requestTimeout = 310000;
  server.on("close", () => geminiPool?.closeAll());
  return { server, store };
}
