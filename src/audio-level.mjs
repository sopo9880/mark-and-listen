// Evens out narration loudness so fixed direction clips and generated segments play at the same level.
// Live models deliver hot audio (peaks at full scale); every take is trimmed at its silent edges and brought to
// the same active-speech level as the bundled directions (-20 dBFS RMS, peaks at most -1 dBFS).
const TARGET_RMS_DB = -20;
const CEILING_DB = -1;
const SILENCE = 32768 * 10 ** (-42 / 20);

export function levelWav(wav) {
  const rate = wav.readUInt32LE(24);
  const n = (wav.length - 44) >> 1;
  const at = (i) => wav.readInt16LE(44 + i * 2);
  const win = Math.max(1, Math.round(rate * 0.01));
  const loud = (i) => {
    for (let k = i; k < Math.min(n, i + win); k++) if (Math.abs(at(k)) > SILENCE) return true;
    return false;
  };
  let lead = 0;
  while (lead < n && !loud(lead)) lead += win;
  if (lead >= n) return wav; // silence or test tone below the speech threshold: leave untouched
  let tail = n;
  while (tail > lead && !loud(Math.max(0, tail - win))) tail -= win;
  const start = Math.max(0, lead - Math.round(rate * 0.12));
  const end = Math.min(n, tail + Math.round(rate * 0.25));
  // Active-speech RMS over 20 ms windows above -45 dBFS.
  const w = Math.max(1, Math.round(rate * 0.02));
  let energy = 0,
    windows = 0,
    peak = 0;
  for (let i = start; i < end; i += w) {
    let e = 0;
    const m = Math.min(end, i + w);
    for (let k = i; k < m; k++) {
      const v = at(k) / 32768;
      e += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    e /= m - i;
    if (e > 10 ** (-45 / 10)) {
      energy += e;
      windows++;
    }
  }
  if (!windows || !peak) return wav;
  const rmsDb = 10 * Math.log10(energy / windows);
  const gainDb = Math.min(TARGET_RMS_DB - rmsDb, CEILING_DB - 20 * Math.log10(peak));
  const gain = 10 ** (gainDb / 20);
  const len = end - start;
  const out = Buffer.alloc(44 + len * 2);
  wav.copy(out, 0, 0, 44);
  out.writeUInt32LE(36 + len * 2, 4);
  out.writeUInt32LE(len * 2, 40);
  const fade = Math.min(len >> 2, Math.round(rate * 0.01));
  for (let i = 0; i < len; i++) {
    let v = (at(start + i) / 32768) * gain;
    if (i < fade) v *= i / fade;
    if (len - 1 - i < fade) v *= (len - 1 - i) / fade;
    out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
  }
  return out;
}
