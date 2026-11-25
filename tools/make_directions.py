#!/usr/bin/env python3
"""
Mark & Listen — one-time generator for the fixed-voice listening directions.

Creates every clip a full 100-question listening section needs and that never changes between episodes:
  lc-intro, p1..p4-directions, lc-end            (section and part directions)
  num-1 … num-100                                 ("Number thirty-two.")
  intro-32-34 … intro-98-100                      ("Questions … refer to the following conversation/talk.")

Each clip is spoken with ONE fixed Gemini TTS voice, then checked before it is kept:
  1) its length must fit the script, 2) an independent Gemini transcription must match the script.
A clip that fails is regenerated (up to --tries times). Re-running the script skips clips that already passed.

The wording below is Mark & Listen's own; it is not the official ETS direction text.

Usage (Windows PowerShell):
  py -m pip install google-genai
  $env:GEMINI_API_KEY = "…"
  py tools\\make_directions.py --out directions
Then zip the output folder (WAV files + index.json) and send it; it goes to assets/directions in the app.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import wave
from pathlib import Path

UNITS = "zero one two three four five six seven eight nine".split()
TEENS = "ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "twenty thirty forty fifty sixty seventy eighty ninety".split()


def words(n: int) -> str:
    if n < 10:
        return UNITS[n]
    if n < 20:
        return TEENS[n - 10]
    if n < 100:
        t, u = divmod(n, 10)
        return TENS[t - 2] + ("-" + UNITS[u] if u else "")
    if n == 100:
        return "one hundred"
    raise ValueError(n)


def clips() -> dict[str, str]:
    c = {
        "lc-intro": (
            "Listening Test. In this part of the test, you will listen to statements, questions, conversations, "
            "and short talks in English, and then answer questions about what you heard. The Listening Test has "
            "four parts and takes about forty-five minutes. Each part begins with its own directions. "
            "Mark all of your answers on the answer sheet."
        ),
        "p1-directions": (
            "Part One. Directions. For each question in this part, you will see a photograph in your test book "
            "and hear four statements about it. Choose the one statement that best describes the photograph, "
            "and mark your answer on the answer sheet. The statements are not printed in your test book, "
            "and you will hear them only one time."
        ),
        "p2-directions": (
            "Part Two. Directions. In this part, you will hear a question or a statement, followed by three "
            "responses. Choose the best response and mark your answer on the answer sheet. The question and the "
            "responses are not printed in your test book, and you will hear them only one time."
        ),
        "p3-directions": (
            "Part Three. Directions. In this part, you will hear short conversations between two or more people. "
            "After each conversation, you will hear three questions about it. Choose the best answer to each "
            "question and mark it on the answer sheet. Some questions refer to a graphic in your test book. "
            "You will hear each conversation only one time."
        ),
        "p4-directions": (
            "Part Four. Directions. In this part, you will hear short talks given by one speaker. After each talk, "
            "you will hear three questions about it. Choose the best answer to each question and mark it on the "
            "answer sheet. Some questions refer to a graphic in your test book. You will hear each talk only one time."
        ),
        "lc-end": "This is the end of the Listening Test. Please turn to the Reading Test.",
    }
    for n in range(1, 101):
        c[f"num-{n}"] = f"Number {words(n)}."
    for first in range(32, 101, 3):
        kind = "conversation" if first < 71 else "talk"
        c[f"intro-{first}-{first + 2}"] = (
            f"Questions {words(first)} through {words(first + 2)} refer to the following {kind}."
        )
    return c


# ── comparison (mirrors the app: case, punctuation, hyphens and digits vs. words do not matter) ──
def tokens(text: str) -> list[str]:
    text = text.lower().replace("-", " ")
    out = []
    for w in re.findall(r"[a-z]+|\d+", text):
        if w.isdigit() and int(w) <= 100:
            out.extend(words(int(w)).replace("-", " ").split())
        else:
            out.append(w)
    return out


def matches(script: str, heard: str) -> bool:
    return tokens(script) == tokens(heard)


def plausible(script: str, seconds: float) -> bool:
    n = len(tokens(script))
    return max(0.5, n / 4.2) * 0.8 <= seconds <= n / 1.1 + 4


# ── Gemini calls ──
def candidates(client, kind: str) -> list[str]:
    names = []
    for m in client.models.list():
        name = (m.name or "").removeprefix("models/")
        actions = set(getattr(m, "supported_actions", None) or getattr(m, "supported_generation_methods", None) or [])
        if kind == "tts" and "tts" in name:
            names.append(name)
        if kind == "stt" and re.fullmatch(r"gemini-\d+(\.\d+)?-flash(-\d+)?", name) and (not actions or "generateContent" in actions):
            names.append(name)
    version = lambda n: float(re.search(r"gemini-(\d+(?:\.\d+)?)", n).group(1)) if re.search(r"gemini-(\d+(?:\.\d+)?)", n) else 0
    names.sort(key=lambda n: (-version(n), "preview" in n, len(n)))
    return names or (["gemini-2.5-flash-preview-tts"] if kind == "tts" else ["gemini-2.5-flash"])


TRANSIENT = re.compile(r"\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE|overloaded|high demand|timed? ?out|Connection", re.I)


def is_transient(error: Exception) -> bool:
    return bool(TRANSIENT.search(f"{type(error).__name__} {error}"))


def with_backoff(call, label: str, max_wait: float):
    """Retries temporary API errors (busy model, quota, network) with growing pauses, up to max_wait seconds."""
    waited, delay = 0.0, 10.0
    while True:
        try:
            return call()
        except Exception as error:
            if not is_transient(error) or waited >= max_wait:
                raise
            pause = min(delay, max_wait - waited) if max_wait > waited else delay
            print(f"    {label}: server busy ({str(error)[:60]}…) — waiting {pause:.0f}s")
            time.sleep(pause)
            waited += pause
            delay = min(delay * 2, 120)


def speak(client, types, model: str, voice: str, text: str) -> tuple[bytes, int]:
    response = client.models.generate_content(
        model=model,
        contents=f"Say in a calm, clear, neutral exam announcer voice at a steady pace: {text}",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice))
            ),
        ),
    )
    part = response.candidates[0].content.parts[0].inline_data
    rate = 24000
    found = re.search(r"rate=(\d+)", part.mime_type or "")
    if found:
        rate = int(found.group(1))
    return part.data, rate


def transcribe(client, types, model: str, wav_bytes: bytes) -> str:
    response = client.models.generate_content(
        model=model,
        contents=[
            types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
            "Transcribe this English audio verbatim. Output only the words actually spoken, in order. "
            "No timestamps, labels or notes.",
        ],
        config=types.GenerateContentConfig(temperature=0),
    )
    return (response.text or "").strip()


def write_wav(path: Path, pcm: bytes, rate: int) -> None:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default="directions", help="output folder (default: ./directions)")
    parser.add_argument("--voice", default="Charon", help="fixed Gemini voice for every clip (default: Charon)")
    parser.add_argument("--model", help="TTS model (default: newest model with 'tts' in its name)")
    parser.add_argument("--stt-model", help="model used to check each clip (default: newest Gemini Flash)")
    parser.add_argument("--key", help="Gemini API key (default: GEMINI_API_KEY environment variable)")
    parser.add_argument("--only", help="regular expression: generate only matching clip keys")
    parser.add_argument("--tries", type=int, default=3, help="regenerations per clip when the audio does not match (default 3)")
    parser.add_argument("--max-wait", type=float, default=900, help="seconds to keep retrying a busy/overloaded API per call (default 900)")
    parser.add_argument("--list-models", action="store_true", help="print the TTS and transcription models your key can use")
    parser.add_argument("--dry-run", action="store_true", help="print the scripts without calling the API")
    args = parser.parse_args()

    scripts = clips()
    if args.only:
        scripts = {k: v for k, v in scripts.items() if re.search(args.only, k)}
    if args.dry_run:
        for k, v in scripts.items():
            print(f"{k:16} {v}")
        print(f"{len(scripts)} clips")
        return 0

    key = args.key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        print("Set GEMINI_API_KEY or pass --key.", file=sys.stderr)
        return 2
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("Install the SDK first:  py -m pip install google-genai", file=sys.stderr)
        return 2

    client = genai.Client(api_key=key)
    tts_all, stt_all = candidates(client, "tts"), candidates(client, "stt")
    if args.list_models:
        print("TTS models:  " + ", ".join(tts_all))
        print("Check models: " + ", ".join(stt_all))
        return 0
    tts_model = args.model or tts_all[0]
    stt_models = [args.stt_model] if args.stt_model else stt_all
    print(f"TTS {tts_model} · voice {args.voice} · check {stt_models[0]}")
    print(f"(other TTS models for --model: {', '.join(m for m in tts_all if m != tts_model) or 'none'})")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    index_file = out / "index.json"
    index = json.loads(index_file.read_text("utf-8")) if index_file.exists() else {}
    if index.get("voice") not in (None, args.voice) or index.get("model") not in (None, tts_model):
        print(
            f"Existing clips use voice {index.get('voice')} / model {index.get('model')}. Every clip must share one voice: "
            "pass the same --voice/--model, or use a new --out folder.",
            file=sys.stderr,
        )
        return 2
    index.update({"schema": 1, "voice": args.voice, "model": tts_model, "clips": index.get("clips", {})})

    failed = []
    for n, (name, text) in enumerate(scripts.items(), 1):
        done = index["clips"].get(name)
        if done and done.get("text") == text and (out / done["file"]).exists():
            continue
        for attempt in range(1, args.tries + 1):
            try:
                # The TTS model never changes during a run, so every clip keeps the same voice.
                pcm, rate = with_backoff(lambda: speak(client, types, tts_model, args.voice, text), "TTS", args.max_wait)
                seconds = len(pcm) / 2 / rate
                path = out / f"{name}.wav"
                write_wav(path, pcm, rate)
                if not plausible(text, seconds):
                    reason = f"length {seconds:.1f}s does not fit"
                else:
                    heard, last_error = None, None
                    for check_model in stt_models:  # checking may switch models; it does not affect the voice
                        try:
                            heard = with_backoff(
                                lambda: transcribe(client, types, check_model, path.read_bytes()), "check", args.max_wait / 3
                            )
                            break
                        except Exception as error:
                            last_error = error
                    if heard is None:
                        raise last_error
                    reason = None if matches(text, heard) else f"heard: {heard!r}"
            except Exception as error:  # still busy after waiting, or a malformed response
                reason = f"error: {str(error)[:200]}"
            if reason is None:
                data = path.read_bytes()
                index["clips"][name] = {
                    "file": path.name,
                    "text": text,
                    "duration": round(seconds, 3),
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
                index_file.write_text(json.dumps(index, ensure_ascii=False, indent=1), "utf-8")
                print(f"[{n}/{len(scripts)}] ok   {name} ({seconds:.1f}s)")
                break
            print(f"[{n}/{len(scripts)}] retry {name} ({attempt}/{args.tries}) — {reason}")
        else:
            failed.append(name)
            (out / f"{name}.wav").unlink(missing_ok=True)

    print(f"\nDone: {len(index['clips'])}/{len(clips())} clips in {out.resolve()}")
    if failed:
        print("Failed (run again to retry): " + ", ".join(failed))
        return 1
    print("Zip this folder and send it — it becomes assets/directions in the app.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
