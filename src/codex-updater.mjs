import { spawn } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

// Behavior reference (independent implementation): Canvas Assistant v0.4.0 engine.rs.
const HISTORICAL_VERSION = "0.170.0";
const REGISTRY = "https://registry.npmjs.org/@openai/codex";
const PLATFORM = "win32-x64";
const FILE = "bin/codex.exe";
const HISTORICAL_SRI =
  "sha512-eNlCGvSTKMegqo1R0PPfAf0jOQp8OGfWH8WX2UyTtRN6E/YOecJnz4n1X9lIb02O8Zda/Lv6/WST7+8mufTVSw==";
const MAX_METADATA = 128 * 1024;
const MAX_DOWNLOAD = 600 * 1024 * 1024;
const MAX_UNPACKED = 900 * 1024 * 1024;

const prefix = "package/vendor/x86_64-pc-windows-msvc/";
const members = new Set([
  FILE,
  "bin/codex-code-mode-host.exe",
  "bin/codex-exec-server.exe",
  "codex-package.json",
  "codex-path/rg.exe",
  "codex-resources/codex-command-runner.exe",
  "codex-resources/codex-windows-sandbox-setup.exe",
]);
const versionOk = (value) =>
  typeof value === "string" && /^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){2}$/.test(value);
function newer(a, b) {
  if (!b) return true;
  const av = a.split(".").map(Number),
    bv = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (av[i] !== bv[i]) return av[i] > bv[i];
  return false;
}

async function fsItem(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

async function request(fetcher, url, timeout) {
  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Codex 공식 저장소 요청 실패 (HTTP ${response.status})`);
  }
  return response.body;
}

async function metadata(fetcher, selector) {
  const stream = await request(fetcher, `${REGISTRY}/${selector}`, 20_000);
  let n = 0;
  const parts = [];
  for await (const part of stream) {
    n += part.length;
    if (n > MAX_METADATA) throw new Error("Codex 배포 정보가 너무 큽니다.");
    parts.push(part);
  }
  const data = JSON.parse(Buffer.concat(parts, n).toString("utf8"));
  if (data?.name !== "@openai/codex") throw new Error("공식 Codex 패키지 이름이 일치하지 않습니다.");
  return data;
}

async function latest(fetcher) {
  const data = await metadata(fetcher, "latest");
  if (!versionOk(data.version)) throw new Error("Codex 안정 버전 정보를 확인하지 못했습니다.");
  return data.version;
}

async function download(fetcher, version, destination, pinnedIntegrity, integrityRoot) {
  const variant = `${version}-${PLATFORM}`;
  const data = await metadata(fetcher, variant);
  const url = `${REGISTRY}/-/codex-${variant}.tgz`;
  const integrity = data?.dist?.integrity;
  if (
    data.version !== variant ||
    data.dist?.tarball !== url ||
    data.os?.[0] !== "win32" ||
    data.cpu?.[0] !== "x64" ||
    typeof integrity !== "string" ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity)
  ) {
    throw new Error("Codex 배포 정보가 예상한 Windows x64 패키지와 일치하지 않습니다.");
  }
  if (version === HISTORICAL_VERSION && integrity !== pinnedIntegrity)
    throw new Error("고정 Codex 버전의 SHA-512 지문이 일치하지 않습니다.");
  // Retain authenticated first-seen SRI per version, in addition to the historical anchor.
  // Metadata and archive remain restricted to the official HTTPS registry.
  await mkdir(integrityRoot, { recursive: true, mode: 0o700 });
  const pinFile = path.join(integrityRoot, version + ".sri");
  try {
    const saved = await readFile(pinFile, "utf8");
    if (saved !== integrity) throw new Error("이미 확인한 Codex 버전의 SHA-512 지문이 바뀌었습니다.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const pin = await open(pinFile, "wx", 0o600);
    try {
      await pin.writeFile(integrity);
      await pin.sync();
    } finally {
      await pin.close();
    }
  }
  const expected = Buffer.from(integrity.slice(7), "base64");
  if (expected.toString("base64") !== integrity.slice(7))
    throw new Error("Codex 무결성 정보 형식이 잘못되었습니다.");
  const stream = await request(fetcher, url, 8 * 60_000);
  const out = await open(destination, "wx", 0o600);
  let size = 0;
  const hash = createHash("sha512");
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > MAX_DOWNLOAD) throw new Error("Codex 패키지 다운로드 크기 한도를 넘었습니다.");
      hash.update(chunk);
      await out.writeFile(chunk);
    }
    if (!timingSafeEqual(hash.digest(), expected)) throw new Error("Codex SHA-512 검증에 실패했습니다.");
  } finally {
    await out.close();
  }
}

function field(header, first, end) {
  const bytes = header.subarray(first, end);
  const zero = bytes.indexOf(0);
  return bytes.subarray(0, zero < 0 ? bytes.length : zero).toString("latin1");
}
function octal(header, first, end) {
  const value = field(header, first, end).trim();
  if (!/^[0-7]+$/.test(value)) throw new Error("잘못된 Codex 압축 파일 헤더입니다.");
  return Number.parseInt(value, 8);
}

/** Read regular members only. The archive cannot supply the output directory or filename. */
async function extract(archive, destination) {
  const gzip = createGunzip();
  const coupled = pipeline(createReadStream(archive), gzip);
  // The iterator below is the consumer; source/gzip defects still surface even on early exit.
  coupled.catch(() => {});
  const input = gzip[Symbol.asyncIterator]();
  let buffer = Buffer.alloc(0),
    total = 0;
  const nextChunk = async () => {
    const result = await input.next();
    if (result.done) return false;
    buffer = result.value;
    total += buffer.length;
    if (total > MAX_UNPACKED) throw new Error("Codex 압축 해제 크기 한도를 넘었습니다.");
    return true;
  };
  const consume = async (n, visit) => {
    while (n > 0) {
      if (!buffer.length && !(await nextChunk())) throw new Error("Codex 압축 파일이 중간에 끊겼습니다.");
      const count = Math.min(n, buffer.length);
      const part = buffer.subarray(0, count);
      buffer = buffer.subarray(count);
      if (visit) await visit(part);
      n -= count;
    }
  };
  const block = async () => {
    const parts = [];
    await consume(512, (part) => parts.push(part));
    return Buffer.concat(parts, 512);
  };
  const seen = new Set();
  let localMeta = false,
    globalMeta = false,
    entries = 0;
  try {
    for (;;) {
      const header = await block();
      if (header.every((b) => b === 0)) {
        if (!(await block()).every((b) => b === 0))
          throw new Error("Codex 압축 종료 표시가 올바르지 않습니다.");
        do {
          if (!buffer.every((b) => b === 0))
            throw new Error("Codex 압축 종료 뒤에 예상치 못한 데이터가 있습니다.");
        } while (await nextChunk());
        break;
      }
      if (++entries > 2048) throw new Error("Codex 압축 파일 항목이 너무 많습니다.");
      let checksum = 0;
      for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
      if (checksum !== octal(header, 148, 156))
        throw new Error("Codex 압축 헤더 체크섬이 일치하지 않습니다.");
      const n = octal(header, 124, 136);
      if (n > MAX_UNPACKED) throw new Error("Codex 압축 파일 항목이 너무 큽니다.");
      const start = field(header, 345, 500);
      const name = (start ? start + "/" : "") + field(header, 0, 100);
      const relative = name.startsWith(prefix) ? name.slice(prefix.length) : "";
      const target = members.has(relative) ? relative : null;
      const type = header[156];
      if (target) {
        if (![0, 48].includes(type) || !n || seen.has(target) || localMeta || globalMeta) {
          throw new Error("Codex 실행 파일의 압축 항목 형식이 올바르지 않습니다.");
        }
        const outPath = path.join(destination, target);
        await mkdir(path.dirname(outPath), { recursive: true });
        const out = await open(outPath, "wx", 0o700);
        try {
          await consume(n, (chunk) => out.writeFile(chunk));
        } finally {
          await out.close();
        }
        seen.add(target);
      } else {
        await consume(n);
      }
      await consume((512 - (n % 512)) % 512);
      if (type === 103)
        globalMeta = true; // PAX global member
      else if ([120, 76, 75].includes(type))
        localMeta = true; // PAX/GNU overrides
      else localMeta = false;
    }
    if (!seen.has(FILE)) throw new Error("공식 패키지에 Windows용 Codex 실행 파일이 없습니다.");
    await coupled;
  } finally {
    await input.return?.().catch(() => {});
    gzip.destroy();
    await coupled.catch(() => {});
  }
}

function probe(executable, version, home) {
  // Never invoke an unverified download. No shell, account configuration, or arbitrary argv.
  const env = {
    CODEX_HOME: home,
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    TEMP: home,
    TMP: home,
  };
  for (const key of ["SystemRoot", "WINDIR", "SystemDrive"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  if (process.platform === "win32" && env.SystemRoot) {
    env.Path = [path.join(env.SystemRoot, "System32"), env.SystemRoot].join(path.delimiter);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["--version"], {
      cwd: home,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "",
      failed = false;
    const timer = setTimeout(() => {
      failed = true;
      child.kill();
    }, 12_000);
    child.stdout.on("data", (part) => {
      if (output.length + part.length > 8192) {
        failed = true;
        child.kill();
      } else output += part.toString("utf8");
    });
    child.stdout.on("error", () => {
      failed = true;
      child.kill();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (!failed && code === 0 && output.trim() === `codex-cli ${version}`) resolve();
      else reject(new Error("새 Codex 실행 파일에서 예상 버전을 확인하지 못했습니다."));
    });
  });
}

const refOk = (value) =>
  value === null ||
  (value && versionOk(value.version) && typeof value.id === "string" && /^[a-f0-9-]{36}$/.test(value.id));

export function createCodexUpdater({
  root,
  platform = process.platform,
  arch = process.arch,
  fetcher = globalThis.fetch,
  verify = probe,
  pinnedIntegrity = HISTORICAL_SRI,
} = {}) {
  if (!path.isAbsolute(root ?? "")) throw new TypeError("updater root must be an absolute app-private path");
  const supported = platform === "win32" && arch === "x64";
  const versions = path.join(root, "versions");
  const pointer = path.join(root, "active.json");
  const lockPath = path.join(root, "update.lock");
  let busy = false;
  function requireSupport() {
    if (!supported) throw new Error("앱 관리형 Codex 설치·업데이트는 Windows x64에서만 지원됩니다.");
  }
  async function readState() {
    const stat = await fsItem(pointer);
    if (!stat) return { current: null, previous: null };
    if (!stat.isFile() || stat.size > 4096) throw new Error("Codex 버전 기록을 읽을 수 없습니다.");
    const state = JSON.parse(await readFile(pointer, "utf8"));
    if (!state || !refOk(state.current) || !refOk(state.previous) || !state.current) {
      throw new Error("Codex 버전 기록이 손상되었습니다.");
    }
    return state;
  }
  function versionDir(ref) {
    return path.join(versions, `${ref.version}-${ref.id}`);
  }
  async function findFile(ref) {
    if (!ref) return null;
    const dir = versionDir(ref);
    if (!(await fsItem(dir))?.isDirectory()) return null;
    const file = path.join(dir, FILE);
    return (await fsItem(file))?.isFile() ? file : null;
  }
  async function executable() {
    if (!supported) return null;
    return findFile((await readState()).current);
  }
  async function status() {
    const state = supported ? await readState() : { current: null, previous: null };
    return {
      supported,
      platform: `${platform}-${arch}`,
      installed: (await findFile(state.current)) ? state.current.version : null,
      previous: (await findFile(state.previous)) ? state.previous.version : null,
      busy: busy || (supported && !!(await fsItem(lockPath))),
    };
  }
  async function check() {
    requireSupport();
    const { installed } = await status();
    const stable = await latest(fetcher);
    return { latest: stable, installed, newer: newer(stable, installed) };
  }
  async function writeState(state) {
    const next = path.join(root, `.state-${randomUUID()}.tmp`);
    try {
      const handle = await open(next, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(state) + "\n");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(next, pointer);
    } finally {
      await rm(next, { force: true }).catch(() => {});
    }
  }
  async function locked(operation) {
    requireSupport();
    if (busy) throw new Error("Codex 설치 또는 롤백이 이미 진행 중입니다.");
    busy = true;
    let file;
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      try {
        file = await open(lockPath, "wx", 0o600);
      } catch (error) {
        if (error.code === "EEXIST")
          throw new Error(
            "다른 실행에서 Codex 설치가 진행 중입니다. 강제 종료한 경우 모든 앱 창을 닫은 뒤 런타임 폴더의 update.lock을 삭제해 주세요.",
          );
        throw error;
      }
      await file.writeFile(JSON.stringify({ pid: process.pid, started: Date.now() }));
      await operation();
    } finally {
      try {
        if (file) {
          try {
            await file.close();
          } finally {
            await rm(lockPath, { force: true }).catch(() => {});
          }
        }
      } finally {
        busy = false;
      }
    }
    return status();
  }
  async function install(target = "latest") {
    if (target !== "latest") throw new Error("설치 대상은 latest만 가능합니다.");
    return locked(async () => {
      const state = await readState();
      const usableCurrent = await findFile(state.current);
      const usablePrevious = await findFile(state.previous);
      const version = await latest(fetcher);
      // Never downgrade by fetching an older version, including if the latest tag moves backward.
      // A previously verified install can be restored with explicit rollback instead.
      if (usableCurrent && !newer(version, state.current.version)) return;
      const retained = usableCurrent ? state.current : usablePrevious ? state.previous : null;
      const stage = await mkdtemp(path.join(root, "stage-"));
      const archive = path.join(stage, "codex.tgz"),
        extracted = path.join(stage, "engine");
      const home = path.join(stage, "probe-home");
      const ref = { version, id: randomUUID() };
      const final = versionDir(ref);
      let moved = false,
        committed = false;
      try {
        await mkdir(extracted, { mode: 0o700 });
        await mkdir(home, { mode: 0o700 });
        await download(fetcher, version, archive, pinnedIntegrity, path.join(root, "integrity"));
        await extract(archive, extracted);
        await verify(path.join(extracted, FILE), version, home);
        await mkdir(versions, { recursive: true, mode: 0o700 });
        await rename(extracted, final);
        moved = true;
        await writeState({ current: ref, previous: retained });
        committed = true;
      } finally {
        if (moved && !committed) await rm(final, { recursive: true, force: true }).catch(() => {});
        await rm(stage, { recursive: true, force: true }).catch(() => {});
      }
    });
  }
  async function rollback() {
    return locked(async () => {
      const state = await readState();
      if (!(await findFile(state.previous))) throw new Error("복구할 이전 Codex 버전이 없습니다.");
      await writeState({
        current: state.previous,
        previous: (await findFile(state.current)) ? state.current : null,
      });
    });
  }
  return { status, check, install, rollback, executable };
}
