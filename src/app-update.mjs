import { createHash, createPublicKey, verify } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

export const APP_VERSION = "0.2.0.0";
export const REPOSITORY = "sopo9880/mark-and-listen";
export const installerName = (version) => `Mark-and-Listen-${version}-Windows-x64-Setup.exe`;
const tagPattern = /^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){3}$/;
const base = (version) => `https://github.com/${REPOSITORY}/releases/download/v${version}/`;
const cap = 250 * 1024 * 1024;

export function compareVersions(a, b) {
  if (!tagPattern.test(a) || !tagPattern.test(b)) throw Error("Invalid four-part version");
  const left = a.split(".").map(Number),
    right = b.split(".").map(Number);
  for (let i = 0; i < 4; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  return 0;
}
export function verifyManifest(raw, signature, publicKey, expectedVersion) {
  const key = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
  const bytes = Buffer.from(signature.trim(), "base64");
  if (key.asymmetricKeyType !== "ed25519" || bytes.length !== 64 || !verify(null, raw, key, bytes))
    throw Error("업데이트 서명이 일치하지 않습니다.");
  const m = JSON.parse(raw);
  if (
    m.schema !== 1 ||
    m.repository !== REPOSITORY ||
    m.platform !== "windows-x64" ||
    !tagPattern.test(m.version) ||
    m.version !== expectedVersion ||
    m.file !== installerName(m.version) ||
    !Number.isSafeInteger(m.size) ||
    m.size <= 0 ||
    m.size > cap ||
    !/^[a-f0-9]{64}$/.test(m.sha256)
  )
    throw Error("업데이트 서명 정보가 이 앱과 일치하지 않습니다.");
  return m;
}
function allowedLocation(url, source) {
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  if (source === "api")
    return url.href === `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`;
  if (url.hostname === "github.com") return url.href === source;
  return ["release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(url.hostname);
}
async function get(fetcher, source, { max, timeout = 15000 } = {}) {
  const origin =
    source === "api" ? `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100` : source;
  let url = new URL(origin);
  const signal = AbortSignal.timeout(timeout);
  for (let hop = 0; hop < 4; hop++) {
    if (!allowedLocation(url, source)) throw Error("허용되지 않은 업데이트 출처입니다.");
    const response = await fetcher(url, {
      signal,
      redirect: "manual",
      headers: { "User-Agent": "Mark-and-Listen-Updater" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw Error("업데이트 이동 주소가 없습니다.");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw Error(`업데이트 서버 응답 오류 (${response.status})`);
    }
    if (max === undefined) return { stream: response.body, signal };
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > max) throw Error("업데이트 목록 또는 서명이 너무 큽니다.");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, length);
  }
  throw Error("업데이트 이동 횟수 초과");
}
export function createAppUpdater({
  publicKey,
  fetcher = fetch,
  currentVersion = APP_VERSION,
  launch = launchWindowsInstaller,
}) {
  let candidate = null;
  return {
    enabled: !!publicKey,
    async check() {
      candidate = null;
      if (!publicKey) throw Error("이 빌드에는 업데이트 서명 공개키가 없습니다.");
      const releases = JSON.parse(await get(fetcher, "api", { max: 3_000_000 }));
      const matches = releases.filter(
        (r) =>
          !r.draft &&
          r.prerelease &&
          typeof r.tag_name === "string" &&
          r.tag_name.startsWith("v") &&
          tagPattern.test(r.tag_name.slice(1)) &&
          compareVersions(r.tag_name.slice(1), currentVersion) > 0 &&
          ["update.json", "update.json.sig", installerName(r.tag_name.slice(1))].every((name) =>
            r.assets?.some((a) => a.name === name && a.state === "uploaded"),
          ),
      );
      matches.sort((a, b) => compareVersions(b.tag_name.slice(1), a.tag_name.slice(1)));
      if (!matches.length) return null;
      const version = matches[0].tag_name.slice(1);
      const [raw, sig] = await Promise.all([
        get(fetcher, base(version) + "update.json", { max: 16384 }),
        get(fetcher, base(version) + "update.json.sig", { max: 512 }),
      ]);
      candidate = verifyManifest(raw, sig.toString("ascii"), publicKey, version);
      return { version: candidate.version, size: candidate.size };
    },
    async install(confirmedVersion) {
      const m = candidate;
      candidate = null;
      if (!m || m.version !== confirmedVersion) throw Error("업데이트를 다시 확인하고 설치를 승인하세요.");
      const dir = await mkdtemp(join(tmpdir(), "mark-listen-update-"));
      const file = join(dir, m.file),
        hash = createHash("sha256");
      let size = 0;
      try {
        const { stream, signal } = await get(fetcher, base(m.version) + m.file, { timeout: 240000 });
        await pipeline(
          Readable.fromWeb(stream),
          new Transform({
            transform(chunk, _encoding, callback) {
              size += chunk.length;
              if (size > m.size) {
                callback(Error("설치 파일 크기가 서명과 다릅니다."));
                return;
              }
              hash.update(chunk);
              callback(null, chunk);
            },
          }),
          createWriteStream(file, { flags: "wx", mode: 0o600 }),
          { signal },
        );
        if (size !== m.size || hash.digest("hex") !== m.sha256)
          throw Error("설치 파일 해시가 서명과 다릅니다.");
        await launch(file, m.sha256);
      } catch (error) {
        await rm(dir, { recursive: true, force: true });
        throw error;
      }
    },
  };
}
async function launchWindowsInstaller(file, sha256) {
  if (process.platform !== "win32" || process.env.MARK_LISTEN_PARENT_PIPE !== "1" || !process.env.SystemRoot)
    throw Error("Windows 데스크톱 앱에서만 설치할 수 있습니다.");
  const data = Buffer.from(JSON.stringify({ file, sha256, pids: [process.pid, process.ppid] })).toString(
    "base64",
  );
  const script = `
    $ErrorActionPreference='Stop'
    $spec=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')) | ConvertFrom-Json
    foreach ($waitId in $spec.pids) {
      $p=Get-Process -Id $waitId -ErrorAction SilentlyContinue
      if ($p -and !$p.WaitForExit(60000)) { exit 1 }
    }
    if ((Get-FileHash -LiteralPath $spec.file -Algorithm SHA256).Hash -ne $spec.sha256) { exit 1 }
    $installer=Start-Process -FilePath $spec.file -ArgumentList @('/P','/UPDATE','/R') -PassThru -Wait
    if ($installer.ExitCode -eq 0) {
      Remove-Item -LiteralPath $spec.file -Force
      Remove-Item -LiteralPath ([IO.Path]::GetDirectoryName($spec.file)) -Force
    }
    exit $installer.ExitCode
  `;
  const helper = spawn(
    join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
    { detached: true, windowsHide: true, stdio: "ignore", shell: false },
  );
  await new Promise((resolve, reject) => {
    helper.once("spawn", resolve);
    helper.once("error", reject);
  });
  helper.unref();
}
