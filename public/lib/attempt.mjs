// Wall-clock exam state machine. Deadlines are absolute, so sleep, reloads or closing the app never pause time.
import { readyToTake, phaseDurations, audioTimeline, sectionIds, examOf, questionsOf } from "./exams.mjs";

const orderOf = (s) => Object.keys(s.durations).filter((k) => s.durations[k] > 0);

export function startAttempt(e, now = Date.now()) {
  if (!readyToTake(e)) throw Error("모든 문항과 필수 음원의 준비(및 검수)를 완료하세요.");
  const durations = phaseDurations(e);
  const audioSection = Object.entries(examOf(e).sections).find(([, s]) => s.audio)?.[0];
  const timeline = audioTimeline(e);
  // Like the real test, the listening section lasts at least as long as its audio and answer time.
  if (audioSection && timeline.length) {
    const needed = Math.ceil(timeline.at(-1).end + 8) * 1000;
    if (needed > durations[audioSection]) durations[audioSection] = needed;
  }
  const order = sectionIds(e).filter((id) => durations[id] > 0);
  const phase = order[0];
  return {
    id: globalThis.crypto.randomUUID(),
    episodeId: e.id,
    phase,
    startedAt: now,
    phaseStartedAt: now,
    phaseEndsAt: now + durations[phase],
    durations,
    marks: {},
    submittedAt: null,
  };
}

export function advanceAttempt(s, now = Date.now()) {
  while (s.phase !== "done" && now >= s.phaseEndsAt) {
    const order = orderOf(s);
    const next = order[order.indexOf(s.phase) + 1];
    s = next
      ? { ...s, phase: next, phaseStartedAt: s.phaseEndsAt, phaseEndsAt: s.phaseEndsAt + s.durations[next] }
      : { ...s, phase: "done", phaseStartedAt: s.phaseEndsAt };
  }
  return s.phase === "done" ? { ...s, submittedAt: s.submittedAt ?? s.phaseEndsAt } : s;
}

export const isOpen = (s, now = Date.now()) => advanceAttempt(s, now).phase !== "done";
export const remainingSections = (s) => orderOf(s).slice(orderOf(s).indexOf(s.phase));

export function markAttempt(s, e, id, index, now = Date.now()) {
  const next = advanceAttempt(s, now),
    q = questionsOf(e).find((q) => q.id === id);
  if (
    next.phase !== s.phase ||
    next.phase === "done" ||
    !q ||
    q.section !== next.phase ||
    (index !== null && (!Number.isInteger(index) || index < 0 || index >= q.choices.length))
  )
    return next;
  const marks = { ...next.marks };
  if (index === null) delete marks[id];
  else marks[id] = index;
  return { ...next, marks };
}

export function finishPhase(s, now = Date.now()) {
  const next = advanceAttempt(s, now);
  if (next.phase !== s.phase || next.phase === "done") return next;
  return advanceAttempt({ ...next, phaseEndsAt: now }, now);
}
