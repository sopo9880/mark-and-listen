// Isolated, browser-native Gemini Live audition widget.
import { BANK } from './bank.mjs';

const MAX_LENGTH = 1200;
const DEFAULT_MODEL = 'gemini-3.8-live';

const LC_BANK = BANK.filter(item => item.section === 'LC' && item.audio);
const lcById = id => LC_BANK.find(item => item.id === id);
export function makeBankAuditionScript(item) {
  return [item.question, ...item.choices.map((option, i) => `${'ABC'[i]}. ${option}`)].join('\n\n');
}

function clipTransaction(mode, action) {
  return new Promise((resolve, reject) => {
    const opening = globalThis.indexedDB.open('mark-and-listen-auditions-v1', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('practiceClips');
    opening.onerror = () => reject(new Error('이 브라우저의 음원 보관함에 접근할 수 없어요.'));
    opening.onsuccess = () => {
      const db = opening.result;
      let txn, request;
      try {
        txn = db.transaction('practiceClips', mode);
        request = action(txn.objectStore('practiceClips'));
      } catch (error) { db.close(); reject(error); return; }
      txn.oncomplete = () => { db.close(); resolve(request.result); };
      txn.onabort = txn.onerror = () => { db.close(); reject(new Error('이 기기에서 음원을 저장하거나 읽지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요.')); };
    };
  });
}

function replacePracticeClip(id, blob) {
  if (!lcById(id) || !(blob instanceof Blob) || blob.type !== 'audio/wav' || blob.size < 46 || blob.size > 4_500_000) {
    throw new Error('이 문항에 연결할 수 있는 WAV가 아니에요.');
  }
  return clipTransaction('readwrite', store => store.put(blob, id));
}

const playbackUrls = new Map();
let urlCleanup = null;
function releasePlayback(audio) {
  if (!playbackUrls.has(audio)) return;
  URL.revokeObjectURL(playbackUrls.get(audio));
  playbackUrls.delete(audio);
  if (!playbackUrls.size && urlCleanup) {
    urlCleanup.disconnect();
    urlCleanup = null;
  }
}

/** Use only on the small individual-question practice bank, never exam groups. */
export async function useSavedAudition(audio, questionId) {
  const item = lcById(questionId);
  if (!item || typeof globalThis.indexedDB === 'undefined') return false;
  try {
    const blob = await clipTransaction('readonly', store => store.get(item.id));
    if (!audio.isConnected || !(blob instanceof Blob) || blob.type !== 'audio/wav' || blob.size < 46) return false;
    releasePlayback(audio);
    const url = URL.createObjectURL(blob);
    playbackUrls.set(audio, url);
    if (!urlCleanup) {
      urlCleanup = new MutationObserver(() => {
        for (const player of playbackUrls.keys()) if (!player.isConnected) releasePlayback(player);
      });
      urlCleanup.observe(document.body, { childList: true, subtree: true });
    }
    audio.addEventListener('error', () => {
      if (playbackUrls.get(audio) === url) {
        releasePlayback(audio);
        audio.src = item.audio;
      }
    }, { once: true });
    audio.src = url;
    return true;
  } catch {
    return false;
  }
}


function el(tag, options = {}) {
  const n = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) n[key] = value;
  return n;
}

async function callAudition(path, data, { signal } = {}) {
  const session = await fetch('/api/session', { signal });
  if (!session.ok) throw new Error('로컬 앱에 연결할 수 없어요.');
  const { token } = await session.json();
  if (typeof token !== 'string') throw new Error('로컬 보안 세션을 열지 못했어요. 페이지를 새로고침해 주세요.');
  return fetch('/api/' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mark-session': token },
    body: JSON.stringify(data),
    signal,
  });
}

export async function readAuditionResponse(response) {
  if (response instanceof Blob && response.type.split(';')[0] === 'audio/wav') return response;
  if (!(response instanceof Response)) throw new Error('재생할 WAV 파일을 받지 못했어요.');
  if (!response.ok) {
    const error = new Error((await response.json().catch(() => null))?.error || 'Gemini Live 요청을 완료하지 못했어요.');
    error.status = response.status;
    const retry = Number(response.headers.get('retry-after'));
    error.retryAfter = Number.isInteger(retry) && retry > 0 ? Math.min(retry, 600) : 0;
    throw error;
  }
  if (response.headers.get('content-type')?.split(';')[0] !== 'audio/wav') throw new Error('재생할 WAV 파일을 받지 못했어요.');
  return response.blob();
}

export function mountAudition(node, { api = callAudition } = {}) {
  if (!node) return null;
  const panel = el('section', { className: 'surface dash-card engine-card' });
  panel.setAttribute('aria-labelledby', 'audition-heading');
  const label = el('p', { className: 'eyebrow', textContent: 'AUDIO STUDIO / GEMINI LIVE' });
  const heading = el('h2', { id: 'audition-heading', textContent: '듣기 대본 낭독' });
  const hint = el('p', { className: 'hint', textContent: '짧은 영어 듣기 대본을 Gemini Live로 낭독해요. 실행하면 대본이 Google로 전송되고 해당 프로젝트의 API 사용량이 적용돼요. 다른 엔진으로 자동 전환하지 않아요.' });
  const input = el('textarea', { id: 'audition-script', rows: 6, maxLength: MAX_LENGTH, placeholder: '예: When will the replacement badges arrive?' });
  input.setAttribute('spellcheck', 'false');
  const key = el('input', { id: 'audition-key', type: 'password', maxLength: 1024, autocomplete: 'off', placeholder: '키 입력 또는 서버 환경변수 GEMINI_API_KEY' });
  const model = el('input', { id: 'audition-model', maxLength: 100, autocomplete: 'off', placeholder: DEFAULT_MODEL });
  const fields = el('div', { className: 'audition-fields' });
  const choices = el('select', { id: 'audition-lc-question' });
  LC_BANK.forEach((item, index) => choices.append(el('option', {
    value: item.id, textContent: `기본 LC ${index + 1}번 · ${item.question}`,
  })));
  fields.append(el('label', { htmlFor: choices.id, textContent: '기본 LC 예제 (선택)' }), choices);
  fields.append(
    el('label', { htmlFor: input.id, textContent: '듣기 대본 (최대 1,200자 / 약 45초 이내)' }), input,
    el('label', { htmlFor: key.id, textContent: 'Gemini API 키 (이번 요청에만 사용)' }), key,
    el('label', { htmlFor: model.id, textContent: 'Live 모델 ID (선택)' }), model,
  );
  const buttons = el('div', { className: 'dashboard-actions' });
  const sample = el('button', { className: 'button light', type: 'button', textContent: 'LC 예시 불러오기' });
  const go = el('button', { className: 'button primary', type: 'button', textContent: '낭독 음원 만들기' });
  const stop = el('button', { className: 'button light', type: 'button', textContent: '취소', hidden: true });
  buttons.append(sample, go, stop);
  const status = el('p', { className: 'hint', textContent: '' });
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const output = el('div', { className: 'audio-box', hidden: true });
  const audio = el('audio', { controls: true, preload: 'metadata' });
  audio.setAttribute('aria-label', 'Gemini Live 듣기 낭독 미리보기');
  const download = el('a', { className: 'button light', textContent: 'WAV 다운로드', download: 'mark-and-listen-gemini-live.wav' });
  const attach = el('button', { className: 'button light', type: 'button', textContent: '이 연습 문항에 음원 저장', hidden: true });
  const remove = el('button', { className: 'button light', type: 'button', textContent: '선택한 문항의 기본 음원 복원' });
  buttons.append(remove);
  const clipActions = el('div', { className: 'dashboard-actions' });
  clipActions.append(download, attach);
  output.append(audio, clipActions);
  panel.append(label, heading, hint, fields, buttons, status, output);
  node.replaceChildren(panel);

  let request = null;
  let objectUrl = null;
  let cooldown = null;
  let destroyed = false;
  let loadedQuestion = null;
  let attachable = null;
  let storing = false;

  function clearOutput() {
    audio.pause();
    audio.removeAttribute('src');
    download.removeAttribute('href');
    output.hidden = true;
    attachable = null;
    attach.hidden = true;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  function showStatus(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }
  function lock(active) {
    go.disabled = active || cooldown !== null;
    input.disabled = active;
    sample.disabled = active;
    choices.disabled = active;
    key.disabled = active;
    model.disabled = active;
    stop.hidden = !active;
    panel.setAttribute('aria-busy', active ? 'true' : 'false');
  }
  function setScript(text, { questionId } = {}) {
    if (request || destroyed || typeof text !== 'string') return false;
    if (!text.trim() || text.length > MAX_LENGTH) return false;
    input.value = text;
    const item = lcById(questionId);
    loadedQuestion = item && makeBankAuditionScript(item) === text ? item.id : null;
    clearOutput();
    return true;
  }
  sample.addEventListener('click', () => {
    const item = lcById(choices.value);
    if (!item) return;
    setScript(makeBankAuditionScript(item), { questionId: item.id });
    showStatus('LC Part 2 대본을 불러왔어요. 변경하지 않은 대본만 이 문항에 연결할 수 있어요.');
  });
  choices.addEventListener('change', () => {
    loadedQuestion = null;
    attachable = null;
    attach.hidden = true;
  });
  input.addEventListener('input', () => {
    loadedQuestion = null;
    clearOutput();
  });
  attach.addEventListener('click', async () => {
    if (!attachable || storing || request || destroyed) return;
    const ready = attachable;
    storing = true;
    attach.disabled = remove.disabled = true;
    try {
      await replacePracticeClip(ready.questionId, ready.blob);
      if (!destroyed && attachable === ready) showStatus('이 브라우저에 저장했어요. 기본 LC 연습에서 이 음원을 재생해요. 전체 모의고사 음원은 바뀌지 않아요.');
    } catch (error) {
      if (!destroyed && attachable === ready) showStatus(error?.message || '이 기기에 음원을 저장하지 못했어요.', true);
    } finally { storing = false; attach.disabled = remove.disabled = false; }
  });
  remove.addEventListener('click', async () => {
    const item = lcById(choices.value);
    if (!item || storing || request || destroyed) return;
    storing = true;
    attach.disabled = remove.disabled = true;
    try {
      await clipTransaction('readwrite', store => store.delete(item.id));
      if (!destroyed) showStatus('선택한 연습 문항의 기본 음원을 다시 사용해요.');
    } catch (error) {
      if (!destroyed) showStatus(error?.message || '기본 음원으로 복원하지 못했어요.', true);
    } finally { storing = false; attach.disabled = remove.disabled = false; }
  });
  stop.addEventListener('click', () => {
    if (!request) return;
    const previous = request;
    request = null;
    previous.abort();
    lock(false);
    showStatus('낭독 요청을 취소했어요.');
  });
  go.addEventListener('click', async () => {
    if (request || cooldown !== null || storing || destroyed) return;
    const script = input.value.trim();
    if (!script || script.length > MAX_LENGTH) {
      showStatus('듣기 대본을 1~1,200자로 입력해 주세요.', true);
      input.focus();
      return;
    }
    const picked = model.value.trim();
    if (picked && !/^gemini-[A-Za-z0-9.-]{1,100}$/.test(picked)) {
      showStatus('Gemini Live 모델 ID를 확인해 주세요.', true);
      model.focus();
      return;
    }
    const entered = key.value.trim();
    if (entered && !/^[\x21-\x7E]{8,1024}$/.test(entered)) {
      showStatus('Gemini API 키를 확인해 주세요.', true);
      key.focus();
      return;
    }
    const targetQuestion = lcById(loadedQuestion);
    const targetId = targetQuestion && makeBankAuditionScript(targetQuestion).trim() === script ? targetQuestion.id : null;
    const thisRequest = new AbortController();
    request = thisRequest;
    key.value = '';
    clearOutput();
    lock(true);
    showStatus('Gemini Live가 대본을 읽는 중이에요.');
    try {
      const response = await api('audition', { prompt: script, apiKey: entered || undefined, model: picked || undefined }, { signal: thisRequest.signal });
      const clip = await readAuditionResponse(response);
      if (request !== thisRequest || destroyed || thisRequest.signal.aborted) return;
      if (clip.size < 46) throw new Error('재생할 WAV 파일을 받지 못했어요.');
      objectUrl = URL.createObjectURL(clip);
      audio.src = objectUrl;
      download.href = objectUrl;
      output.hidden = false;
      if (targetId && typeof globalThis.indexedDB !== 'undefined') {
        attachable = { questionId: targetId, blob: clip };
        attach.textContent = `기본 LC ${LC_BANK.findIndex(item => item.id === targetId) + 1}번 음원으로 저장`;
        attach.hidden = false;
      }
      showStatus('낭독 음원이 준비됐어요. 원문과 일치하는지 들어보고 사용해 주세요.');
    } catch (error) {
      if (request !== thisRequest || destroyed || thisRequest.signal.aborted) return;
      if (error?.status === 429 && error.retryAfter > 0) {
        const until = Date.now() + error.retryAfter * 1000;
        const tick = () => {
          const seconds = Math.ceil((until - Date.now()) / 1000);
          if (seconds <= 0) {
            clearInterval(cooldown);
            cooldown = null;
            lock(false);
            showStatus('다시 요청할 수 있어요. 제한이 계속되면 Google AI Studio에서 할당량을 확인해 주세요.');
          } else {
            showStatus(`Gemini Live 사용량 한도에 도달했어요. 약 ${seconds}초 뒤 다시 시도해 주세요.`, true);
          }
        };
        cooldown = setInterval(tick, 1000);
        tick();
      } else {
        showStatus(error?.message === 'Failed to fetch' ? '로컬 앱과 연결이 끊겼어요. 실행 상태를 확인해 주세요.' : error?.message || '낭독을 만들지 못했어요.', true);
      }
    } finally {
      if (request === thisRequest) {
        request = null;
        lock(false);
      }
    }
  });

  return {
    setScript,
    destroy() {
      destroyed = true;
      request?.abort();
      request = null;
      key.value = '';
      if (cooldown !== null) clearInterval(cooldown);
      cooldown = null;
      clearOutput();
      panel.remove();
    },
  };
}
