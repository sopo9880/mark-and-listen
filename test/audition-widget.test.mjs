import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountAudition, useSavedAudition } from '../public/audition.mjs';

class Element extends EventTarget {
  children = [];
  value = '';
  attributes = {};
  connected = true;
  classList = { toggle() {} };
  constructor(tagName) { super(); this.tagName = tagName; }
  append(...children) {
    this.children.push(...children);
    if (this.tagName === 'select' && this.value === '' && this.children.length) this.value = this.children[0].value;
  }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; delete this[name]; }
  pause() {}
  focus() {}
  remove() { this.connected = false; }
  get isConnected() { return this.connected; }
  find(predicate) { return predicate(this) ? this : this.children.map((n) => n.find(predicate)).find(Boolean); }
  click() { this.dispatchEvent(new Event('click')); }
  input() { this.dispatchEvent(new Event('input')); }
}

function fakeBrowser(t) {
  const clips = new Map();
  const body = new Element('body');
  t.mock.method(body, 'append');
  const globals = {
    document: { createElement: tag => new Element(tag), body },
    MutationObserver: class { observe() {} disconnect() {} },
    indexedDB: {
      open() {
        const opening = {};
        queueMicrotask(() => {
          opening.result = {
            close() {},
            transaction() {
              const txn = {};
              const action = (value) => {
                queueMicrotask(() => txn.oncomplete());
                return { result: value };
              };
              txn.objectStore = () => ({
                get: id => action(clips.get(id)),
                put: (blob, id) => { clips.set(id, blob); return action(id); },
                delete: id => { clips.delete(id); return action(undefined); },
              });
              return txn;
            },
          };
          opening.onsuccess();
        });
        return opening;
      },
    },
  };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, globals);
  t.after(() => { for (const [key, val] of Object.entries(previous)) { if (val === undefined) delete globalThis[key]; else globalThis[key] = val; } });
  return clips;
}

const next = () => new Promise(resolve => setImmediate(resolve));
const key = 'MOCK-LOCAL-CREDENTIAL';
const fixture = () => new Blob([new Uint8Array(46)], { type: 'audio/wav' });

test('widget chooses an LC script, plays explicit response, saves only that question, and restores bundled clip', async (t) => {
  const clips = fakeBrowser(t);
  const root = new Element('div');
  const calls = [];
  const widget = mountAudition(root, { api: async (route, payload) => {
    calls.push({ route, payload });
    return fixture();
  } });
  t.after(() => widget.destroy());
  const byId = id => root.find(ele => ele.id === id);
  const button = label => root.find(ele => ele.tagName === 'button' && ele.textContent === label);
  byId('audition-lc-question').value = 'lc2';
  button('LC 예시 불러오기').click();
  assert.match(byId('audition-script').value, /revised budget/);
  byId('audition-key').value = key;
  button('낭독 음원 만들기').click();
  await next();
  assert.equal(byId('audition-key').value, '');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].route, 'audition');
  assert.equal(calls[0].payload.apiKey, key);
  assert.match(root.find(ele => ele.tagName === 'audio').src, /^blob:/);
  assert.match(root.find(ele => ele.download).href, /^blob:/);
  const save = button('기본 LC 2번 음원으로 저장');
  assert.equal(save.hidden, false);
  save.click();
  await next();
  assert.equal(clips.size, 1);
  assert.equal(clips.get('lc2').type, 'audio/wav');

  const audio = new Element('audio');
  audio.src = '/audio/lc2.mp3';
  assert.equal(await useSavedAudition(audio, 'lc2'), true);
  assert.match(audio.src, /^blob:/);
  audio.dispatchEvent(new Event('error'));
  assert.equal(audio.src, '/audio/lc2.mp3');

  button('선택한 문항의 기본 음원 복원').click();
  await next();
  assert.equal(clips.size, 0);
  assert.equal(await useSavedAudition(audio, 'lc2'), false);
});

test('edited script cannot attach to an exam question, and cancelled output cannot replace a newer result', async (t) => {
  fakeBrowser(t);
  const root = new Element('div');
  let first;
  let calls = 0;
  const widget = mountAudition(root, { api: async () => {
    if (++calls === 1) return new Promise(resolve => { first = resolve; });
    return fixture();
  } });
  t.after(() => widget.destroy());
  const byId = id => root.find(ele => ele.id === id);
  const button = label => root.find(ele => ele.tagName === 'button' && ele.textContent === label);
  button('LC 예시 불러오기').click();
  byId('audition-script').value += ' 추가 지시';
  byId('audition-script').input();
  button('낭독 음원 만들기').click();
  button('취소').click();
  button('낭독 음원 만들기').click();
  await next();
  const player = root.find(ele => ele.tagName === 'audio');
  const result = player.src;
  assert.match(result, /^blob:/);
  first(fixture());
  await next();
  assert.equal(player.src, result);
  assert.equal(root.find(ele => ele.tagName === 'button' && ele.textContent === '이 연습 문항에 음원 저장').hidden, true);
});
