// API keys persisted in the user's data folder so they survive restarts, updates and reinstalls.
// On Windows the file is encrypted with DPAPI (CurrentUser scope) through PowerShell, so it can only be
// read by the same Windows account on the same machine. Elsewhere (development) it is a 0600 file.
import { spawn } from "node:child_process";
import { readFile, writeFile, rename, rm } from "node:fs/promises";

function powershell(script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let out = "";
    child.stdout.setEncoding("utf8").on("data", (s) => (out += s));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(Error("DPAPI 처리 실패"))));
    child.stdin.end(input);
  });
}

const PROTECT =
  "Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser'))";
const UNPROTECT =
  "Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'))";

export const dpapi = {
  scheme: "dpapi",
  protect: (buf) => powershell(PROTECT, buf.toString("base64")).then((b) => Buffer.from(b, "base64")),
  unprotect: (buf) => powershell(UNPROTECT, buf.toString("base64")).then((b) => Buffer.from(b, "base64")),
};
export const plain = { scheme: "plain", protect: async (b) => b, unprotect: async (b) => b };

export function createSecretStore(file, codec = process.platform === "win32" ? dpapi : plain) {
  return {
    async load() {
      try {
        const data = JSON.parse(await readFile(file, "utf8"));
        if (data.scheme !== codec.scheme) return {};
        const keys = JSON.parse(
          (await codec.unprotect(Buffer.from(data.payload, "base64"))).toString("utf8"),
        );
        return Object.fromEntries(
          Object.entries(keys).filter(([p, k]) => ["gemini", "openai"].includes(p) && typeof k === "string"),
        );
      } catch {
        return {};
      }
    },
    async save(keys) {
      const clean = Object.fromEntries(Object.entries(keys).filter(([, k]) => typeof k === "string" && k));
      if (!Object.keys(clean).length) {
        await rm(file, { force: true });
        return;
      }
      const payload = (await codec.protect(Buffer.from(JSON.stringify(clean), "utf8"))).toString("base64");
      const temp = file + ".tmp";
      await writeFile(temp, JSON.stringify({ schema: 1, scheme: codec.scheme, payload }), { mode: 0o600 });
      await rename(temp, file);
    },
  };
}
