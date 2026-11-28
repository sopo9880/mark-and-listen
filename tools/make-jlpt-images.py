"""Builds assets/jlpt-images from the owner-provided JLPT listening illustrations (PNG, 1376x768).

Two kinds: "grid" (four picture choices in a 2x2 layout; numbers 1-4 are baked into the top-left of each panel,
in reading order) and "scene" (one situation with a black arrow over the speaker, for utterance-expression items).
Usage: python3 -I tools/make-jlpt-images.py <source-folder> [out-folder]
"""
import hashlib, json, re, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np

# Topic names for the 4-panel grids (by the 8-hex suffix of the source file name). Variants of one topic share a
# name so an episode never shows two versions of the same picture set.
GRID_TOPICS = {
    "910cc764": "backpack and desk position",
    "84911299": "backpack and desk position",
    "61720510": "bicycle and fence position",
    "6765bc07": "bicycle and fence position",
    "510ddd58": "cat chair table position",
    "273e4b77": "cat chair table position",
    "4449a432": "clock showing time",
    "5bd3e482": "clock showing time",
    "a76d3a9b": "weather icons",
    "cde36e06": "oranges on tray count",
    "ac9be930": "classroom seat position",
    "2ca08474": "clock showing time",
    "58a1b660": "transport bus bicycle train taxi",
    "9264e501": "keychain shapes",
    "98d8176f": "bags suitcase backpack tote",
    "b1955c13": "shirts and clothes",
    "c53a1ae9": "electric fan direction",
    "d6161703": "tree and bird position",
    "dbf41cf5": "keychain shapes",
    "3a98bb96": "cup and plate position",
    "9926a02a": "shelf and plant position",
    "a31a7f72": "bags suitcase backpack tote",
    "cc848b15": "classroom seat position",
    "fafd0b37": "table and cup position",
    "4bae1db4": "shelf and plant position",
    "60ae781c": "route on street map",
    "3a90d6e6": "cup and plate position",
    "6d010391": "bowl plate spoon chopsticks",
    "b22e4dc4": "room desk window layout",
    "ba92cd8d": "tree and bird position",
    "4fbb8ab1": "clock showing time",
    "19d543c0": "headphones and laptop case",
    "6fbea503": "headphones and laptop case",
    "c8e677bc": "table and cup position",
    "816006ff": "ball and box position",
    "41dff7d3": "shirts and clothes",
    "cdb3d940": "ball and box position",
    "3a4ab148": "bowl plate spoon chopsticks",
    "71a90f02": "kitchen tools pan pot kettle",
    "7b6dc055": "weather icons",
    "3c76ed9d": "oranges on tray count",
    "56db3f3e": "pencil case ruler eraser",
    "61521185": "station platform stairs",
    "94905474": "station escalator exit",
    "9e9d09dc": "umbrella patterns",
    "b68504b8": "food bread rice ball sandwich noodles",
    "b9d476a2": "electric fan direction",
    "c1326ec6": "bookshelf book position",
    "c653b832": "pencil case ruler eraser",
    "d2e99033": "entrance shoes position",
    "f5b22f7e": "entrance shoes position",
    "21bbca9d": "route on street map",
    "3bd69dad": "chair and tote bag position",
    "50af4daa": "umbrella patterns",
    "8730deed": "cardboard box contents",
    "8ef1013e": "transport bus bicycle train taxi",
    "9f26d4f3": "cardboard box contents",
    "aba659b2": "kitchen tools pan pot kettle",
    "d36b29f2": "room desk window layout",
    "e80cab52": "park path bench pond",
    "16c9d727": "park fence path",
    "d5d82546": "tray and lunch box position",
    "5d547d4e": "bench and suitcase position",
    "bfb7c676": "bench and suitcase position",
    "8ddc2378": "chair and tote bag position",
    "aaeb770d": "towel and basket position",
    "3d7184b4": "towel and basket position",
    "54ffb03d": "bench and umbrella position",
    "93acc746": "bench and umbrella position",
    "5d8a7712": "watering can and stool position",
    "991b44db": "watering can and stool position",
    "c5c06539": "bookshelf book position",
    "e1240e84": "food bread rice ball sandwich noodles",
    "f1202cda": "tray and lunch box position",
    "3b5b7920": "boots and mat position",
    "566ccee4": "boots and mat position",
    "035bde5f": "parcel shapes tube envelope box",
    "c062909a": "parcel shapes tube envelope box",
}

WIDTH = 1100


def dhash(im):
    small = np.asarray(im.convert("L").resize((9, 8), Image.LANCZOS), dtype=np.int16)
    bits = (small[:, 1:] > small[:, :-1]).flatten()
    return "%016x" % int("".join("1" if b else "0" for b in bits), 2)


def split_at(white, lo, hi):
    """Index of the whitest line between lo and hi (closest to the middle on ties)."""
    mid = (lo + hi) / 2
    best = max(range(lo, hi), key=lambda i: (round(white[i], 3), -abs(i - mid)))
    return best


def label_grid(im):
    a = np.asarray(im, dtype=np.float32) / 255
    H, W = a.shape
    cols = (a[int(H * .05):int(H * .95), :] > .9).mean(axis=0)
    rows = (a[:, int(W * .05):int(W * .95)] > .9).mean(axis=1)
    cx = split_at(cols, int(W * .42), int(W * .58))
    cy = split_at(rows, int(H * .38), int(H * .62))
    d = ImageDraw.Draw(im)
    font = ImageFont.load_default(size=int(H * .055))
    r = int(H * .042)
    for n, (x0, y0, x1, y1) in enumerate([(0, 0, cx, cy), (cx, 0, W, cy), (0, cy, cx, H), (cx, cy, W, H)], 1):
        # Top-left of the drawn content in this quadrant.
        q = a[y0:y1, x0:x1] < .85
        ys, xs = np.nonzero(q)
        px = x0 + (int(xs.min()) if len(xs) else 0)
        py = y0 + (int(ys.min()) if len(ys) else 0)
        px, py = max(px - r // 2, x0 + r + 2), max(py - r // 2, y0 + r + 2)
        d.ellipse((px - r, py - r, px + r, py + r), fill=255, outline=0, width=max(2, r // 8))
        d.text((px, py), str(n), fill=0, font=font, anchor="mm")
    return im


def main():
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / "assets" / "jlpt-images"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.jpg"):
        old.unlink()
    items = []
    for p in sorted(src.glob("*.png")):
        m = re.search(r"_([0-9a-f]{8})\.png$", p.name)
        if not m:
            continue
        im = Image.open(p).convert("L")
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        topic = GRID_TOPICS.get(m.group(1))
        kind = "grid" if topic else "scene"
        if kind == "grid":
            im = label_grid(im)
            name = topic
        else:
            name = re.sub(r"_[0-9a-f]{8}\.png$", "", p.name).replace("…", "").replace("_", " ").strip()
            name = re.sub(r"\s+\S{1,3}$", "", name) if re.search(r"\s\S{1,3}$", name) else name
        tmp = out / "tmp.jpg"
        im.save(tmp, "JPEG", quality=78, optimize=True, progressive=True)
        data = tmp.read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        tmp.rename(out / (sha[:16] + ".jpg"))
        items.append({"file": sha[:16] + ".jpg", "sha256": sha, "kind": kind, "name": name, "dhash": dhash(im)})
    items.sort(key=lambda x: (x["kind"], x["name"], x["file"]))
    (out / "index.json").write_text(json.dumps({
        "schema": 1,
        "source": "Mark & Listen JLPT listening illustrations (AI-generated, owner-provided)",
        "photos": items,
    }, ensure_ascii=False, indent=1) + "\n")
    print(len(items), "images:", sum(i["kind"] == "grid" for i in items), "grid,", sum(i["kind"] == "scene" for i in items), "scene")


if __name__ == "__main__":
    main()
