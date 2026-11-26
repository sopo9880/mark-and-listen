import { dirname, join } from "node:path";
import { homedir } from "node:os";

// Apps started from the macOS Dock get a minimal PATH. Codex installed with Homebrew or npm (and the `node` its
// launcher needs) live in these folders; the bundled Node runtime is added too.
if (process.platform === "darwin") {
  const extra = [
    dirname(process.execPath),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(homedir(), ".local", "bin"),
    join(homedir(), ".npm-global", "bin"),
    join(homedir(), ".volta", "bin"),
  ];
  const parts = (process.env.PATH ?? "").split(":").filter(Boolean);
  process.env.PATH = [...parts, ...extra.filter((p) => !parts.includes(p))].join(":");
}

const { buildServer } = await import("./server.mjs");

const smoke = process.env.MARK_LISTEN_SMOKE === "1";
const preferred = Number(process.env.PORT ?? 4173);

try {
  const { server } = await buildServer({ autoUpdate: !smoke, smoke });
  let fallback = false;
  server.on("error", (error) => {
    // The preferred port is busy (another app or a second copy): let the OS pick a free one instead.
    if (error.code === "EADDRINUSE" && !fallback && !smoke) {
      fallback = true;
      server.listen(0, "127.0.0.1");
      return;
    }
    console.error("Mark & Listen backend failed to bind:", error.message);
    process.exit(1);
  });
  server.on("listening", () => {
    console.log("MARK_READY:" + server.address().port);
  });
  server.listen(preferred, "127.0.0.1");
  if (process.env.MARK_LISTEN_PARENT_PIPE === "1") {
    process.stdin.once("end", () => {
      server.closeAllConnections();
      server.close();
    });
    process.stdin.resume();
  }
} catch (error) {
  console.error("Mark & Listen backend failed to start:", error.message);
  process.exitCode = 1;
}
