// View-model helpers shared by several screens.
import { EXAMS, isAudioGroup, readyToTake, questionsOf, partLabel } from "../lib/exams.mjs";
import { advanceAttempt } from "../lib/attempt.mjs";

export function progressOf(e) {
  const audioGroups = e.groups.filter((g) => isAudioGroup(e, g));
  const segments = audioGroups.flatMap((g) => g.segments ?? []);
  const p = {
    questions: e.groups.reduce((n, g) => n + g.count, 0),
    groups: e.groups.length,
    groupsReady: e.groups.filter((g) => g.status === "ready").length,
    groupsFailed: e.groups.filter((g) => g.status === "failed").length,
    hasAudio: audioGroups.length > 0,
    segments: segments.length,
    segmentsReady: segments.filter((s) => s.status === "ready").length,
    segmentsFailed: segments.filter((s) => s.status === "failed").length,
    ready: readyToTake(e),
  };
  p.failed = p.groupsFailed + p.segmentsFailed;
  const pendingGroups = p.groupsReady + p.groupsFailed < p.groups;
  const pendingAudio = p.hasAudio && (p.segments === 0 || p.segmentsReady + p.segmentsFailed < p.segments);
  p.stage = p.ready ? "ready" : pendingGroups ? "generate" : pendingAudio ? "audio" : "failed";
  // Listening groups need roughly as many audio steps as questions; count both so the bar moves steadily.
  const audioUnits = p.hasAudio
    ? Math.max(
        p.segments,
        audioGroups.reduce((n, g) => n + g.count, 0),
      )
    : 0;
  const units = p.groups + audioUnits;
  p.percent = units ? Math.round(((p.groupsReady + p.segmentsReady) / units) * 100) : 0;
  return p;
}

export const STAGE_LABEL = {
  generate: "문항 생성 중",
  audio: "음원 제작 중",
  failed: "일부 실패",
  ready: "응시 가능",
};
export const STAGE_KIND = { generate: "warn", audio: "warn", failed: "danger", ready: "ok" };

export const attemptsOf = (e) => e.attempts.map((a) => advanceAttempt(a));
export const openAttempt = (e) => attemptsOf(e).find((a) => a.phase !== "done") ?? null;
export const finishedAttempts = (e) =>
  attemptsOf(e)
    .filter((a) => a.phase === "done")
    .sort((a, b) => b.submittedAt - a.submittedAt);

export function percentOf(a) {
  const s = a.summary;
  if (!s?.total) return null;
  return Math.round((s.correct / s.total) * 1000) / 10;
}

export const examName = (e) => EXAMS[e.exam]?.hall ?? e.exam;
export const choiceMark = (e, i) => (e.exam === "toeic" ? "ABCDE"[i] : String(i + 1));
export { questionsOf, partLabel };

export function partsSummary(e) {
  const seen = [...new Set(e.groups.map((g) => g.part))];
  if (e.exam === "toeic") return seen.length === 7 ? "Part 1–7 전체" : "Part " + seen.join(", ");
  return seen.map((p) => partLabel(e, p)).join(" · ");
}
