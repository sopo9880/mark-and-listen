// View-model helpers shared by several screens.
import { EXAMS, isAudioGroup, readyToTake, requiresReview, questionsOf, partLabel } from "../lib/exams.mjs";
import { advanceAttempt } from "../lib/attempt.mjs";

export function progressOf(e) {
  const audioGroups = e.groups.filter((g) => isAudioGroup(e, g));
  const segments = audioGroups.flatMap((g) => g.segments ?? []);
  const review = requiresReview(e);
  const p = {
    questions: e.groups.reduce((n, g) => n + g.count, 0),
    groups: e.groups.length,
    groupsReady: e.groups.filter((g) => g.status === "ready").length,
    groupsFailed: e.groups.filter((g) => g.status === "failed").length,
    groupsReviewed: e.groups.filter((g) => g.reviewed).length,
    reviewRequired: review,
    hasAudio: audioGroups.length > 0,
    segments: segments.length,
    segmentsReady: segments.filter((s) => s.status === "ready").length,
    segmentsFailed: segments.filter((s) => s.status === "failed").length,
    segmentsReviewed: segments.filter((s) => s.status === "ready" && s.reviewed).length,
    ready: readyToTake(e),
  };
  p.stage =
    p.groupsReady < p.groups
      ? "generate"
      : p.hasAudio && (p.segmentsReady < p.segments || p.segments === 0)
        ? "audio"
        : !p.ready
          ? "review"
          : "ready";
  const units = p.groups + p.segments + (review ? p.groups : 0) + p.segments;
  const done = p.groupsReady + p.segmentsReady + (review ? p.groupsReviewed : 0) + p.segmentsReviewed;
  p.percent = units ? Math.round((done / units) * 100) : 0;
  return p;
}

export const STAGE_LABEL = {
  generate: "문항 생성 중",
  audio: "음원 제작 중",
  review: "검수 대기",
  ready: "응시 가능",
};
export const STAGE_KIND = { generate: "warn", audio: "warn", review: "info", ready: "ok" };

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
