// Local API client, shared state and the background production loop.
let token = "";

export async function api(path, body) {
  const response = await fetch(
    "/api/" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Mark-Session": token },
          body: JSON.stringify(body),
        },
  );
  let data = {};
  try {
    data = await response.json();
  } catch {
    // Non-JSON error bodies are reported generically below.
  }
  if (!response.ok) {
    const error = Error(data.error || "요청을 처리하지 못했습니다.");
    error.status = response.status;
    error.detail = data.detail;
    throw error;
  }
  return data;
}

export async function connect() {
  const session = await api("session");
  token = session.token;
  state.testMode = !!session.testMode;
  return session;
}

const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (what) => listeners.forEach((fn) => fn(what));

export const state = { episodes: [], settings: null, connections: null, testMode: false };

export async function loadLibrary() {
  state.episodes = (await api("library")).episodes;
  return state.episodes;
}
export async function loadEpisode(id) {
  await loadLibrary();
  const e = state.episodes.find((x) => x.id === id);
  if (!e) throw Error("회차를 찾을 수 없습니다.");
  return e;
}
export async function loadConnections() {
  state.connections = await api("connections");
  emit("connections");
  return state.connections;
}

/** One production job at a time (the server enforces it too). Runs independently of the current view. */
export const production = {
  episodeId: null,
  running: false,
  stopRequested: false,
  message: "",
  lastError: null,
  async start(id, { fixed = false, retrySegment, retryFailed = false } = {}) {
    if (this.running) throw Error("이미 다른 회차를 제작하고 있습니다.");
    Object.assign(this, {
      episodeId: id,
      running: true,
      stopRequested: false,
      message: "준비 중",
      lastError: null,
    });
    emit("production");
    try {
      if (retrySegment) {
        this.message = "실패 구간 다시 낭독 중";
        emit("production");
        await api("produce", { id, retrySegment });
      } else {
        let first = true;
        for (;;) {
          if (this.stopRequested) break;
          const r = await api("produce", {
            id,
            fixed,
            ...(first && retryFailed ? { retryFailed: true } : {}),
          });
          first = false;
          this.message = describe(r.episode);
          emit("production");
          if (!r.more) break;
        }
      }
      this.message = this.stopRequested
        ? "제작을 멈췄습니다. 완료된 구간은 저장되어 있습니다."
        : "생성이 끝났습니다.";
    } catch (error) {
      this.lastError = error;
      this.message = error.message;
      if (error.status === 429) this.message += " 잠시 후 다시 시작하세요.";
      throw error;
    } finally {
      this.running = false;
      emit("production");
    }
  },
  stop() {
    this.stopRequested = true;
    this.message = "현재 요청이 끝나면 멈춥니다.";
    emit("production");
  },
};

function describe(e) {
  if (!e) return "";
  const groups = e.groups.length,
    ready = e.groups.filter((g) => g.status === "ready").length;
  const segments = e.groups.flatMap((g) => g.segments ?? []);
  if (ready < groups) return `문항 생성 ${ready}/${groups}`;
  return `음원 생성 ${segments.filter((s) => s.status === "ready").length}/${segments.length}`;
}
