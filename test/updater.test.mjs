import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { createCodexUpdater } from "../src/codex-updater.mjs";

const pkg = "https://registry.npmjs.org/@openai/codex";
const first = "0.170.0",
  next = "0.172.0";
const exe = "package/vendor/x86_64-pc-windows-msvc/bin/codex.exe";
const runner = "package/vendor/x86_64-pc-windows-msvc/codex-resources/codex-command-runner.exe";
const sri = (b) => "sha512-" + createHash("sha512").update(b).digest("base64");
const tarUrl = (v) => `${pkg}/-/codex-${v}-win32-x64.tgz`;

function tarGz(entries) {
  const out = [];
  for (const [name, data, type = "0"] of entries) {
    const content = Buffer.from(data);
    const h = Buffer.alloc(512);
    h.write(name, 0, "ascii");
    h.write("0000755\0", 100);
    h.write(content.length.toString(8).padStart(11, "0") + "\0", 124);
    h.fill(32, 148, 156);
    h.write(type, 156);
    h.write("ustar\0", 257);
    h.write(
      h
        .reduce((sum, b) => sum + b, 0)
        .toString(8)
        .padStart(6, "0") + "\0 ",
      148,
    );
    out.push(h, content, Buffer.alloc((512 - (content.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...out, Buffer.alloc(1024)]));
}

async function setup(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "mark-codex-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  const packages = {
    [first]: tarGz([
      [exe, first],
      [runner, "sandbox helper"],
      ["../ignored.exe", "ignored"],
    ]),
    [next]: tarGz([[exe, next]]),
  };
  const changes = { latest: first };
  const calls = [],
    verified = [];
  const metadata = (version) => ({
    name: "@openai/codex",
    version: version + "-win32-x64",
    os: ["win32"],
    cpu: ["x64"],
    dist: { tarball: tarUrl(version), integrity: sri(packages[version]) },
  });
  const fetcher = async (url, init) => {
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    calls.push(url);
    if (url === pkg + "/latest") return Response.json({ name: "@openai/codex", version: changes.latest });
    for (const version of [first, next]) {
      if (url === pkg + "/" + version + "-win32-x64") {
        const meta = metadata(version);
        return Response.json(changes.metadata ? changes.metadata(meta) : meta);
      }
      if (url === tarUrl(version)) {
        if (changes.beforeDownload) await changes.beforeDownload;
        return new Response(changes.corrupt ? "bad bytes" : packages[version]);
      }
    }
    assert.fail(`Unexpected request to ${url}`);
  };
  const verify = async (file, version, home) => {
    verified.push(version);
    assert.equal(await readFile(file, "utf8"), version);
    assert.deepEqual(await readdir(home), []);
    assert.equal(file.includes("stage-"), true);
    if (changes.probeReject) throw new Error("test runtime rejects");
  };
  const updater = createCodexUpdater({
    root,
    platform: "win32",
    arch: "x64",
    fetcher,
    verify,
    pinnedIntegrity: sri(packages[first]),
    ...options,
  });
  return { root, updater, calls, packages, changes, verified };
}

test("latest stable at install time, SHA512 validation, atomic rollback and bad-download retention", async (t) => {
  const { updater, changes, root, calls } = await setup(t);
  assert.equal((await updater.install()).installed, first);
  assert.ok(calls.includes(pkg + "/latest"));
  const active = await updater.executable();
  changes.latest = next;
  changes.corrupt = true;
  await assert.rejects(updater.install(), /SHA-512/);
  assert.equal(await updater.executable(), active);
  changes.corrupt = false;
  changes.probeReject = true;
  await assert.rejects(updater.install(), /runtime rejects/);
  assert.equal(await updater.executable(), active);
  changes.probeReject = false;
  assert.equal((await updater.install()).installed, next);
  assert.equal((await updater.rollback()).installed, first);
  assert.ok((await readdir(root)).includes("integrity"));
});
test("first-seen latest-version digest cannot change after failed runtime verification", async (t) => {
  const { updater, changes, packages } = await setup(t);
  changes.latest = next;
  changes.probeReject = true;
  await assert.rejects(updater.install(), /runtime rejects/);
  packages[next] = tarGz([[exe, "tampered"]]);
  await assert.rejects(updater.install(), /지문이 바뀌/);
  assert.equal(await updater.executable(), null);
});
test("historical anchor and official package metadata reject replacement and arbitrary source", async (t) => {
  const { updater, changes, packages } = await setup(t);
  packages[first] = tarGz([[exe, "tampered"]]);
  await assert.rejects(updater.install(), /지문/);
  changes.latest = next;
  changes.metadata = (m) => ({ ...m, dist: { ...m.dist, tarball: "https://evil.invalid/bin" } });
  await assert.rejects(updater.install(), /배포 정보/);
  changes.latest = "1.0.0-beta";
  await assert.rejects(updater.install(), /안정 버전/);
  await assert.rejects(updater.install("pinned"), /latest/);
});
test("concurrent installs cannot replace active executable or rollback while work is staged", async (t) => {
  const { updater, changes, root } = await setup(t);
  await updater.install();
  changes.latest = next;
  let release;
  changes.beforeDownload = new Promise((r) => {
    release = r;
  });
  const pending = updater.install();
  const contender = createCodexUpdater({ root, platform: "win32", arch: "x64" });
  try {
    for (let i = 0; i < 100 && !(await contender.status()).busy; i++)
      await new Promise((r) => setTimeout(r, 2));
    await assert.rejects(contender.rollback(), /다른 실행/);
    assert.equal((await contender.status()).installed, first);
  } finally {
    release();
  }
  assert.equal((await pending).installed, next);
});
