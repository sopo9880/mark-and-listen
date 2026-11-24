// The wall-clock timestamps are the source of truth: timers are only UI refreshes.
export const FULL_LC_MS = 45 * 60 * 1000;
export const FULL_RC_MS = 75 * 60 * 1000;

function timestamp(now) {
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - FULL_LC_MS - FULL_RC_MS) {
    throw new RangeError('Expected a nonnegative integer wall-clock timestamp');
  }
  return now;
}

export function createFullSession(now = Date.now()) {
  now = timestamp(now);
  return {
    version: 1,
    phase: 'LC',
    startedAt: now,
    phaseStartedAt: now,
    phaseEndsAt: now + FULL_LC_MS,
    submittedAt: null,
    answers: {},
  };
}

function enterRC(s, at) {
  return { ...s, phase: 'RC', phaseStartedAt: at, phaseEndsAt: at + FULL_RC_MS };
}

function submit(s, at) {
  return { ...s, phase: 'done', phaseStartedAt: at, phaseEndsAt: at, submittedAt: at };
}

export function advanceFullSession(s, now = Date.now()) {
  now = timestamp(now);
  if (s.phase === 'LC' && now >= s.phaseEndsAt) s = enterRC(s, s.phaseEndsAt);
  if (s.phase === 'RC' && now >= s.phaseEndsAt) s = submit(s, s.phaseEndsAt);
  return s;
}

export function markFullSession(s, { id, index, phase, now = Date.now() } = {}) {
  const current = advanceFullSession(s, now);
  if (current.phase === 'done' || phase !== current.phase || now < current.phaseStartedAt || typeof id !== 'string') return current;
  const match = /^(lc|rc)-full-([0-9]{3})$/.exec(id);
  const number = match ? Number(match[2]) : 0;
  if (!match || (phase === 'LC'
    ? (match[1] !== 'lc' || number < 1 || number > 100)
    : (match[1] !== 'rc' || number < 101 || number > 200))) return current;
  const lastChoice = phase === 'LC' && number >= 7 && number <= 31 ? 2 : 3;
  if (index !== null && (!Number.isInteger(index) || index < 0 || index > lastChoice)) return current;
  const has = Object.hasOwn(current.answers, id);
  if ((index === null && !has) || (index !== null && has && current.answers[id] === index)) return current;
  const answers = { ...current.answers };
  if (index === null) delete answers[id];
  else answers[id] = index;
  return { ...current, answers };
}

export function transitionFullSession(s, { to, now = Date.now() } = {}) {
  const current = advanceFullSession(s, now);
  // If advancing crossed a boundary, that click targeted an expired view.
  // In particular, a late LC click must not accidentally submit the RC phase.
  if (current.phase !== s.phase || now < current.phaseStartedAt) return current;
  if (current.phase === 'LC' && to === 'RC') return enterRC(current, now);
  if (current.phase === 'RC' && to === 'done') return submit(current, now);
  return current;
}
