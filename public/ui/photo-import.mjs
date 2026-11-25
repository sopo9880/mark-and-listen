// Reads photo ZIPs or image files in the browser, normalizes each photo to a JPEG ≤ 400 KB and
// computes a 64-bit difference hash (dHash) used to keep near-identical scene variants apart.
const IMAGE = /\.(jpe?g|png|webp)$/i;
const MAX_BASE64 = 533_000;

/** Minimal ZIP reader (stored + deflate, no ZIP64) using the built-in DecompressionStream. */
export async function* zipImages(file) {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw Error("ZIP 파일을 읽지 못했습니다.");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const utf8 = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw Error("ZIP 목차가 손상되었습니다.");
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const skip = nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = utf8.decode(new Uint8Array(buf, at + 46, nameLength));
    at += 46 + skip;
    const base = name.split("/").pop();
    if (!IMAGE.test(base) || base.startsWith(".") || name.includes("__MACOSX")) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = new Blob([new Uint8Array(buf, start, size)]);
    let blob;
    if (method === 0) blob = raw;
    else if (method === 8)
      blob = await new Response(raw.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
    else continue;
    yield { name: base, blob };
  }
}

export async function* filesToImages(files) {
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) yield* zipImages(file);
    else if (IMAGE.test(file.name) || file.type.startsWith("image/")) yield { name: file.name, blob: file };
  }
}

export const prettyName = (name) =>
  name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/#U([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/_[0-9a-f]{8}$/i, "")
    .replace(/_+/g, " ")
    .trim();

function dhash(bitmap) {
  const canvas = new OffscreenCanvas(9, 8);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, 9, 8);
  const px = ctx.getImageData(0, 0, 9, 8).data;
  const gray = (x, y) => {
    const i = (y * 9 + x) * 4;
    return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
  };
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray(x, y) < gray(x + 1, y) ? "1" : "0";
  return BigInt("0b" + bits)
    .toString(16)
    .padStart(16, "0");
}

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function normalize({ name, blob }) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    canvas.getContext("2d", { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.78, 0.68, 0.58]) {
      const data = await toBase64(await canvas.convertToBlob({ type: "image/jpeg", quality }));
      if (data.length <= MAX_BASE64) return { name: prettyName(name), data, dhash: dhash(bitmap) };
    }
    throw Error(`${name}: 사진 용량을 줄이지 못했습니다.`);
  } finally {
    bitmap.close();
  }
}
