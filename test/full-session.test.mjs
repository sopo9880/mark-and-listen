import test from 'node:test';
import assert from 'node:assert/strict';
import { FULL_LC_MS, FULL_RC_MS, createFullSession, advanceFullSession,
  markFullSession, transitionFullSession } from '../public/full-session.mjs';

const start = 1700000000000;
const lastLC = start + FULL_LC_MS;
const lastRC = lastLC + FULL_RC_MS;
const resume = state => JSON.parse(JSON.stringify(state));
const mark = (state, id, index, phase, now) => markFullSession(state, { id, index, phase, now });

test('a suspended/resumed full exam uses exact deadlines, not wake time', () => {
  const s = createFullSession(start);
  assert.equal(s.phase, 'LC');
  assert.equal(s.phaseEndsAt - s.phaseStartedAt, 45 * 60 * 1000);
  assert.equal(advanceFullSession(s, lastLC - 1), s);
  assert.equal(advanceFullSession(s, lastLC).phase, 'RC');
  const rc = advanceFullSession(resume(s), lastLC + 20 * 60 * 1000);
  assert.equal(rc.phaseStartedAt, lastLC);
  assert.equal(rc.phaseEndsAt, lastRC);
  assert.equal(rc.phaseEndsAt - rc.phaseStartedAt, 75 * 60 * 1000);
  const done = advanceFullSession(resume(s), lastRC + 8000);
  assert.equal(done.phase, 'done');
  assert.equal(done.submittedAt, lastRC);
  assert.equal(advanceFullSession(done, lastRC + 10000), done);
});

test('a click at either deadline cannot alter the expired phase or auto-submit the next phase', () => {
  const original = createFullSession(start);
  const s = mark(original, 'lc-full-001', 0, 'LC', lastLC - 1);
  assert.deepEqual(original.answers, {});
  const rc = mark(resume(s), 'lc-full-001', 2, 'LC', lastLC);
  assert.equal(rc.phase, 'RC');
  assert.equal(rc.answers['lc-full-001'], 0);
  assert.equal(mark(rc, 'lc-full-001', 2, 'RC', lastLC + 1), rc);
  assert.equal(transitionFullSession(s, { to: 'done', now: lastLC }).phase, 'RC');
  const withRc = mark(rc, 'rc-full-101', 3, 'RC', lastRC - 1);
  const done = mark(resume(withRc), 'rc-full-101', null, 'RC', lastRC);
  assert.deepEqual(done.answers, { 'lc-full-001': 0, 'rc-full-101': 3 });
  assert.equal(done.submittedAt, lastRC);
});

test('allows valid P1/P2 boundaries, rejects invalid IDs/options, clears without changing the old state', () => {
  const s = createFullSession(start);
  const now = start + 5;
  for (const id of ['lc-full-000', 'lc-full-101', 'rc-full-101', 'not-a-question', '__proto__']) {
    assert.equal(mark(s, id, 0, 'LC', now), s);
  }
  for (const id of ['lc-full-007', 'lc-full-031']) {
    assert.equal(mark(s, id, 3, 'LC', now), s);
    assert.equal(mark(s, id, 2, 'LC', now).answers[id], 2);
  }
  for (const id of ['lc-full-006', 'lc-full-032', 'lc-full-100']) {
    assert.equal(mark(s, id, 3, 'LC', now).answers[id], 3);
  }
  const marked = mark(s, 'lc-full-001', 0, 'LC', now);
  assert.equal(mark(marked, 'lc-full-001', 0, 'LC', now), marked);
  assert.deepEqual(mark(marked, 'lc-full-001', null, 'LC', now).answers, {});
  assert.deepEqual(marked.answers, { 'lc-full-001': 0 });
});

test('explicit early actions only progress one phase and retain all marks', () => {
  const s = mark(createFullSession(start), 'lc-full-001', 2, 'LC', start + 1000);
  assert.equal(transitionFullSession(s, { to: 'done', now: start + 1000 }), s);
  const rc = transitionFullSession(s, { to: 'RC', now: start + 1000 });
  assert.equal(rc.phaseStartedAt, start + 1000);
  assert.equal(rc.phaseEndsAt, start + 1000 + FULL_RC_MS);
  assert.equal(mark(rc, 'rc-full-101', 0, 'RC', start + 999), rc);
  const marked = mark(rc, 'rc-full-200', 1, 'RC', start + 1000);
  const done = transitionFullSession(marked, { to: 'done', now: start + 3000 });
  assert.equal(done.submittedAt, start + 3000);
  assert.deepEqual(done.answers, { 'lc-full-001': 2, 'rc-full-200': 1 });
  assert.equal(transitionFullSession(done, { to: 'RC', now: start + 4000 }), done);
  assert.throws(() => createFullSession(0.5), /integer/);
});
