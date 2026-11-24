# Generate the application's original simple mark, including Windows icon sizes.
from pathlib import Path
from PIL import Image, ImageDraw

directory = Path(__file__).resolve().parent
scale = 4
image = Image.new("RGBA", (256 * scale, 256 * scale))
draw = ImageDraw.Draw(image)
def box(coords):
    return tuple(v * scale for v in coords)
draw.rounded_rectangle(box((8, 8, 248, 248)), radius=54 * scale, fill="#152A24", outline="#2C5545", width=6 * scale)
draw.arc(box((44, 40, 212, 211)), 180, 360, fill="#D7EBD7", width=17 * scale)
draw.rounded_rectangle(box((42, 118, 76, 190)), radius=12 * scale, fill="#CFE4CD")
draw.rounded_rectangle(box((180, 118, 214, 190)), radius=12 * scale, fill="#CFE4CD")
draw.line([box((97, 147)), box((119, 169)), box((159, 124))], fill="#D5E269", width=15 * scale, joint="curve")
small = image.resize((256, 256), Image.Resampling.LANCZOS)
small.save(directory / "mark-and-listen.png")
small.save(directory / "mark-and-listen.ico", sizes=[(s,s) for s in [16,24,32,48,64,128,256]])
