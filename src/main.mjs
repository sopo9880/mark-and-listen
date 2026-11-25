import { buildServer } from "./server.mjs";

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
