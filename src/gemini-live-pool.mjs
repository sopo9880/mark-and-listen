// Reused Gemini Live sessions for producing an episode's narration.
// One WebSocket per (model, voice, key) stays open across segments, so a section is read in a handful of sessions
// instead of one connection per line. A session is closed after an error, an interruption, goAway, a turn limit,
// its age limit or idle time; the next segment then opens a fresh one. Every take is still verified by the caller.
import { createHash } from "node:crypto";
import {
  DEFAULT_GEMINI_LIVE_MODEL,
  GeminiLiveError,
  LIVE_URL,
  SYSTEM_PROMPT,
  decodeAudio,
  defaultWebSocketFactory,
  rateLimitError,
  wavFromPcm,
} from "./gemini-live.mjs";

const MAX_SECONDS = 180;
const MAX_TRANSCRIPT = 16000;
const MAX_MESSAGE_CHARS = 500000;

/** Newer Live models take a user turn; older ones read realtime text (same rule as one-shot takes). */
const prefersTurns = (id) =>
  /^gemini-(?:[4-9]|[1-9][0-9]+)\./.test(id) || /^gemini-3\.(?:[2-9]|[1-9][0-9]+)(?:\.|-)/.test(id);

function scriptText(prompt, first) {
  return (
    (first
      ? ""
      : "New script. Read only this one; do not repeat or refer to earlier scripts and do not add words like 'next'. ") +
    "Read the exact English script between the delimiters aloud now. Do not say the delimiters, ask for a script, or add words. Read every line in order.\nBEGIN SCRIPT\n" +
    prompt.trim() +
    "\nEND SCRIPT"
  );
}

class LiveSession {
  constructor({ modelId, voice, key, webSocketFactory, onClose, limits }) {
    Object.assign(this, { modelId, voice, key, webSocketFactory, onClose, limits });
    this.turns = 0;
    this.openedAt = 0;
    this.closed = false;
    this.mode = prefersTurns(modelId) ? "turn" : "realtime";
    this.modeKnown = false;
    this.queue = Promise.resolve();
    this.take = null; // the in-flight turn's collector
    this.idle = null;
  }

  open() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      let socket;
      try {
        socket = this.webSocketFactory(LIVE_URL, this.key);
        socket.binaryType = "arraybuffer";
      } catch {
        reject(
          new Error("Could not connect to Gemini Live. Check Node WebSocket support and Gemini access."),
        );
        return;
      }
      this.socket = socket;
      const timer = setTimeout(
        () => fail(new GeminiLiveError("GEMINI_LIVE_TIMEOUT", "Gemini Live setup timed out.")),
        30_000,
      );
      const fail = (error) => {
        clearTimeout(timer);
        this.close();
        reject(error);
      };
      socket.addEventListener(
        "open",
        () => {
          try {
            socket.send(
              JSON.stringify({
                setup: {
                  model: `models/${this.modelId}`,
                  generationConfig: {
                    responseModalities: ["AUDIO"],
                    maxOutputTokens: 8192,
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } },
                  },
                  systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                  outputAudioTranscription: {},
                },
              }),
            );
          } catch {
            fail(new Error("Gemini Live could not start the session."));
          }
        },
        { once: true },
      );
      socket.addEventListener("message", (event) => {
        let message;
        try {
          const raw = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
          if (raw.length > MAX_MESSAGE_CHARS) throw new Error();
          message = JSON.parse(raw);
          if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error();
        } catch {
          return this.fault(new Error("Gemini Live returned an unreadable message."));
        }
        if (message.error) return this.fault(errorOf(message.error), fail);
        if (message.setupComplete && !this.openedAt) {
          clearTimeout(timer);
          this.openedAt = Date.now();
          resolve();
          return;
        }
        if (message.goAway) this.retiring = true;
        if (this.take) this.take.onMessage(message);
      });
      socket.addEventListener("error", () =>
        this.fault(
          new Error("Gemini Live connection failed. Check the API key, model access, and network."),
          fail,
        ),
      );
      socket.addEventListener("close", (event) => {
        const error =
          event?.code === 1013
            ? rateLimitError()
            : new Error("Gemini Live closed before delivering a complete take.");
        this.fault(error, fail);
      });
    });
    return this.ready;
  }

  /** A transport problem ends the session; the in-flight take (or the pending setup) fails with it. */
  fault(error, failSetup) {
    if (!this.openedAt && failSetup) failSetup(error);
    if (this.take) this.take.fail(error);
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.idle);
    try {
      this.socket?.close();
    } catch {
      /* already closed */
    }
    this.onClose(this);
  }

  speak(prompt, signal) {
    const run = this.queue.then(() => this.turn(prompt, signal));
    this.queue = run.catch(() => {});
    return run;
  }

  async turn(prompt, signal) {
    clearTimeout(this.idle);
    if (this.closed) throw new Error("Gemini Live session is closed.");
    await this.open();
    if (signal?.aborted) throw new Error("Audition cancelled.");
    const first = this.turns === 0;
    this.turns++;
    return await new Promise((resolve, reject) => {
      let size = 0,
        rate = null,
        transcript = "";
      const chunks = [];
      const done = (error, result) => {
        if (this.take !== take) return;
        this.take = null;
        clearTimeout(deadline);
        signal?.removeEventListener("abort", onAbort);
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
        this.afterTake();
      };
      const take = {
        fail: (error) => done(error),
        onMessage: (message) => {
          const content = message.serverContent;
          if (!content) return;
          if (content.interrupted) {
            done(new Error("Gemini Live interrupted the audition before completion."));
            this.close(); // leftover audio must never reach the next segment
            return;
          }
          if (typeof content.outputTranscription?.text === "string")
            transcript = (transcript + content.outputTranscription.text).slice(0, MAX_TRANSCRIPT);
          try {
            for (const part of content.modelTurn?.parts ?? []) {
              if (!part?.inlineData) continue;
              const audio = decodeAudio(part.inlineData);
              if (!audio.chunk.length) continue;
              if (rate !== null && rate !== audio.rate)
                throw new Error("Gemini Live changed the sample rate mid-take.");
              rate = audio.rate;
              size += audio.chunk.length;
              if (size > rate * 2 * MAX_SECONDS)
                throw new Error("Gemini Live audition exceeded the audio limit.");
              chunks.push(audio.chunk);
            }
            if (content.turnComplete) {
              if (!size) {
                // Some models answer one input style with silence: try the other style on the next take.
                if (!this.modeKnown) this.mode = this.mode === "turn" ? "realtime" : "turn";
                done(new Error("Gemini Live returned no complete PCM audio."));
                return;
              }
              this.modeKnown = true;
              done(null, {
                wav: wavFromPcm(chunks, size, rate),
                transcript: transcript.trim(),
                model: this.modelId,
              });
            }
          } catch (error) {
            done(
              /^Gemini Live /.test(error?.message ?? "")
                ? error
                : new Error("Gemini Live returned unreadable audio."),
            );
            this.close();
          }
        },
      };
      const onAbort = () => {
        done(new Error("Audition cancelled."));
        this.close();
      };
      const deadline = setTimeout(() => {
        done(new GeminiLiveError("GEMINI_LIVE_TIMEOUT", "Gemini Live audition timed out."));
        this.close();
      }, 70_000);
      signal?.addEventListener("abort", onAbort, { once: true });
      this.take = take;
      const text = scriptText(prompt, first);
      try {
        this.socket.send(
          JSON.stringify(
            this.mode === "turn"
              ? { clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } }
              : { realtimeInput: { text } },
          ),
        );
      } catch {
        done(new Error("Gemini Live could not send the audition text."));
        this.close();
      }
    });
  }

  afterTake() {
    const { maxTurns, maxAgeMs, idleMs } = this.limits;
    if (this.retiring || this.turns >= maxTurns || Date.now() - this.openedAt >= maxAgeMs) {
      this.close();
      return;
    }
    this.idle = setTimeout(() => this.close(), idleMs);
    this.idle.unref?.();
  }
}

function errorOf(error) {
  const { code, status } = error ?? {};
  if (code === 429 || code === 8 || status === "RESOURCE_EXHAUSTED") return rateLimitError();
  if ([401, 403, 7, 16].includes(code) || ["UNAUTHENTICATED", "PERMISSION_DENIED"].includes(status))
    return new GeminiLiveError("GEMINI_LIVE_ACCESS", "Gemini Live rejected the API key or model access.");
  return new Error("Gemini Live rejected the audition. Check model access and quota.");
}

export function createGeminiLivePool({
  webSocketFactory = defaultWebSocketFactory,
  maxTurns = 40,
  maxAgeMs = 8 * 60_000, // below the Live API's session limit
  idleMs = 90_000,
} = {}) {
  const sessions = new Map();
  const limits = { maxTurns, maxAgeMs, idleMs };
  return {
    sessions,
    async speak({ model, apiKey, prompt, voice = "Kore", signal } = {}) {
      if (typeof prompt !== "string" || !prompt.trim() || prompt.trim().length > 2400)
        throw new Error("An audition needs 1–2400 characters of text.");
      const modelId = (
        typeof model === "string" && model.trim() ? model.trim() : DEFAULT_GEMINI_LIVE_MODEL
      ).replace(/^models\//, "");
      if (!/^gemini-[A-Za-z0-9.-]{1,100}$/.test(modelId)) throw new Error("Invalid Gemini Live model ID.");
      const key = (typeof apiKey === "string" && apiKey.trim()) || process.env.GEMINI_API_KEY?.trim();
      if (!key || /[^\x21-\x7E]/.test(key))
        throw new Error("Set a valid GEMINI_API_KEY or enter the Gemini API key.");
      if (!/^[A-Za-z]{2,40}$/.test(voice)) throw new Error("Invalid voice.");
      if (signal?.aborted) throw new Error("Audition cancelled.");
      const id = `${modelId}|${voice}|${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
      let session = sessions.get(id);
      if (!session || session.closed) {
        session = new LiveSession({
          modelId,
          voice,
          key,
          webSocketFactory,
          limits,
          onClose: (s) => sessions.get(id) === s && sessions.delete(id),
        });
        sessions.set(id, session);
      }
      return session.speak(prompt, signal);
    },
    closeAll() {
      for (const s of [...sessions.values()]) s.close();
    },
  };
}
