import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(executable, args, { cwd, stdin, signal } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const key of [
      "OPENAI_API_KEY",
      "CODEX_API_KEY",
      "OPENAI_BASE_URL",
      "OPENAI_API_BASE",
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
    ])
      delete env[key];
    const child = spawn(executable, args, {
      cwd,
      env,
      signal,
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.setEncoding("utf8").on("data", (s) => {
      stdout += s;
      if (stdout.length > 400000) {
        child.kill();
        reject(Error("Codex 응답이 너무 깁니다."));
      }
    });
    child.stderr.setEncoding("utf8").on("data", (s) => {
      stderr = (stderr + s).slice(-16000);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

export async function generateWithCodex({
  executable,
  prompt,
  model,
  effort,
  images = [],
  signal,
  runCommand = run,
}) {
  let scratch;
  try {
    scratch = await mkdtemp(join(tmpdir(), "mark-listen-codex-"));
    const auth = await runCommand(executable, ["login", "status"], { cwd: scratch, signal });
    if (auth.code !== 0 || !/logged in (?:with|using) ChatGPT/i.test(auth.stdout + " " + auth.stderr)) {
      throw Error(
        "Codex에 ChatGPT 계정으로 로그인한 뒤 다시 시도해 주세요. API 키 모드로는 자동 전환하지 않습니다.",
      );
    }
    const args = [
      "exec",
      "--ignore-user-config",
      "--ignore-rules",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "-c",
      'approval_policy="never"',
      "-c",
      'model_provider="openai"',
      "--json",
    ];
    if (model) {
      if (!/^[a-zA-Z0-9_.:-]{1,80}$/.test(model)) throw Error("Codex 모델 이름을 확인하세요.");
      args.push("--model", model);
    }
    // --ignore-user-config also ignores config.toml's reasoning effort, so the app passes it explicitly.
    if (effort) {
      if (!["minimal", "low", "medium", "high", "xhigh"].includes(effort))
        throw Error("추론 정도를 확인하세요.");
      args.push("-c", `model_reasoning_effort="${effort}"`);
    }
    // Photos are attached as files in the private scratch folder (codex exec --image).
    for (const [i, bytes] of images.entries()) {
      const file = join(scratch, `photo-${i + 1}.jpg`);
      await writeFile(file, bytes, { mode: 0o600 });
      args.push("--image", file);
    }
    args.push("-");
    const result = await runCommand(executable, args, { cwd: scratch, stdin: prompt, signal });
    if (result.code !== 0) throw codexFailure(result, model, effort);
    let text;
    let completed = false;
    for (const line of result.stdout.split(/\r?\n/)) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === "item.completed" && event.item?.type === "agent_message") text = event.item.text;
      if (event.type === "turn.completed") completed = true;
    }
    if (!text || !completed) throw Error("Codex가 완료된 문항을 반환하지 않았어요.");
    return text;
  } catch (e) {
    if (e.code === "ENOENT")
      throw Error("Codex CLI를 찾지 못했어요. 엔진 설정에서 설치하거나 PATH에 추가한 뒤 로그인해 주세요.");
    if (e.name === "AbortError") throw Error("Codex 요청이 취소됐거나 시간이 초과됐어요.");
    throw e;
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}

/** What Codex said when it failed: its JSON error events first, then the last stderr lines. */
export function codexReason(result) {
  const said = [];
  for (const line of String(result.stdout ?? "").split(/\r?\n/)) {
    try {
      const e = JSON.parse(line);
      const m = e.type === "error" ? e.message : e.type === "turn.failed" ? e.error?.message : null;
      if (typeof m === "string") said.push(m);
    } catch {
      // not an event line
    }
  }
  const stderr = String(result.stderr ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && /error|fail|limit|denied|unauthor|not found|unsupported|invalid/i.test(l));
  // Never pass long or token-looking text through.
  return [...said, ...stderr.slice(-3)]
    .map((l) => l.replace(/[A-Za-z0-9_-]{32,}/g, "…").slice(0, 240))
    .join(" · ");
}

function codexFailure(result, model, effort) {
  const reason = codexReason(result);
  const fail = (message, status) => Object.assign(Error(message), { status, reason });
  if (/usage limit|rate.?limit|quota|429|too many requests/i.test(reason))
    return fail("Codex 사용량 한도에 도달했어요. 한도가 풀린 뒤 다시 시도하세요.", 429);
  if (/not logged in|unauthori[sz]ed|401|login|authenticat/i.test(reason))
    return fail("Codex 로그인이 필요해요. 설정 › Codex에서 로그인해 주세요.", 400);
  if (/reasoning|effort/i.test(reason) && effort)
    return fail(`이 Codex 모델이 추론 정도 '${effort}'를 지원하지 않아요. 설정에서 바꿔 주세요.`, 400);
  if (
    /model/i.test(reason) &&
    /not found|not supported|does not exist|unsupported|unknown|access/i.test(reason)
  )
    return fail(
      `Codex 모델${model ? ` '${model}'` : ""}을(를) 이 계정에서 쓸 수 없어요. 설정에서 다른 모델을 골라 주세요.`,
      400,
    );
  if (/network|ENOTFOUND|ECONN|timed? ?out|stream disconnected|connection/i.test(reason))
    return fail("Codex가 OpenAI 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도하세요.");
  return fail(
    `Codex가 생성을 완료하지 못했어요${reason ? `: ${reason}` : ". 로그인과 사용량, 설치 버전을 확인해 주세요."}`,
  );
}

export async function codexLoginStatus(executable) {
  const result = await run(executable, ["login", "status"], { signal: AbortSignal.timeout(5000) });
  if (result.code === 0 && /logged in (?:with|using) ChatGPT/i.test(result.stdout + " " + result.stderr))
    return "connected";
  return "unverified";
}

// The CLI manages OAuth and opens the system browser. Never return its output,
// which can contain one-time authentication data.
export async function codexBrowserLogin(executable, signal = AbortSignal.timeout(300000)) {
  const result = await run(executable, ["login"], { signal });
  if (result.code !== 0) throw Error("Codex 브라우저 로그인이 완료되지 않았습니다.");
  return codexLoginStatus(executable);
}
