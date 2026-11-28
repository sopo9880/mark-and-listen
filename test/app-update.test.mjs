import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { dirname } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { compareVersions, createAppUpdater, installerName, REPOSITORY } from "../src/app-update.mjs";

function fixture({ badSignature = false, badFile = false, redirect = false } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const version = "0.1.1.12",
    file = installerName(version),
    installer = Buffer.from("signed installer fixture");
  const sha256 = createHash("sha256").update(installer).digest("hex");
  const raw = Buffer.from(
    JSON.stringify({
      schema: 1,
      version,
      file,
      sha256,
      size: installer.length,
      platform: "windows-x64",
      repository: REPOSITORY,
    }),
  );
  const signature = sign(null, raw, privateKey).toString("base64");
  const urls = [];
  const fetcher = async (url) => {
    urls.push(url.href);
    if (url.hostname === "api.github.com") {
      const release = (v, options = {}) => ({
        draft: false,
        prerelease: true,
        tag_name: "v" + v,
        assets: ["update.json", "update.json.sig", installerName(v)].map((name) => ({
          name,
          state: "uploaded",
        })),
        ...options,
      });
      return Response.json([
        release("0.1.1.1"),
        release("0.1.1.20", { draft: true }),
        release(version),
        release("0.1.0.9"),
      ]);
    }
    if (url.pathname.endsWith("update.json"))
      return new Response(badSignature ? Buffer.concat([raw, Buffer.from(" ")]) : raw);
    if (url.pathname.endsWith(".sig")) return new Response(signature);
    if (redirect)
      return new Response(null, { status: 302, headers: { location: "https://example.invalid/installer" } });
    return new Response(badFile ? Buffer.alloc(installer.length, 1) : installer);
  };
  const calls = [];
  const service = createAppUpdater({
    currentVersion: "0.1.1.0",
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    fetcher,
    launch: async (path, hash) => {
      assert.deepEqual(await readFile(path), installer);
      assert.equal(hash, sha256);
      calls.push(path);
      await rm(dirname(path), { recursive: true, force: true });
    },
  });
  return { service, version, calls, urls };
}
test("four-part ordering and explicit approval before signed download and launch", async () => {
  assert.equal(compareVersions("0.1.1.12", "0.1.1.2"), 1);
  assert.throws(() => compareVersions("0.1.1", "0.1.1.2"));
  const { service, version, calls, urls } = fixture();
  await assert.rejects(service.install(version), /승인/);
  assert.equal((await service.check()).version, version);
  assert.equal(urls.length, 3);
  assert.equal(calls.length, 0);
  await service.install(version);
  assert.equal(calls.length, 1);
  await assert.rejects(service.install(version), /승인/);
});
test("signature, hash and external redirects fail closed and cannot launch", async () => {
  const tampered = fixture({ badSignature: true });
  await assert.rejects(tampered.service.check(), /서명/);
  for (const options of [{ badFile: true }, { redirect: true }]) {
    const { service, version, calls, urls } = fixture(options);
    await service.check();
    await assert.rejects(service.install(version), /해시|출처/);
    assert.equal(calls.length, 0);
    assert.equal(
      urls.some((url) => url.includes("example.invalid")),
      false,
    );
  }
});
