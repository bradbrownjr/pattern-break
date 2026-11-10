#!/usr/bin/env python3
"""Makes the hangar intro's game art from the generated sources in art/hangar.

The sources are the image service's full-size WebP files (art/hangar/README.md says how
they were made). This scales each to the game's 384x216 pixel grid, snaps every pixel to
the intro's seven greys, and writes PNGs to packages/client/src/game/hangar-art/. It also
prints the anchor points that hangar.ts uses.

Needs Python 3 and Pillow (pip install pillow). Run from the repository root:
    python3 tools/hangar-art.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "hangar"
OUT = ROOT / "packages" / "client" / "src" / "game" / "hangar-art"

# The greys in hangar.ts, darkest first.
GREYS = [0x08, 0x1A, 0x30, 0x4D, 0x7A, 0xB4, 0xE8]
# hangar.ts's greys are slightly blue (0x08090c and so on); the art uses the same values.
GREY_RGB = [(0x08, 0x09, 0x0C), (0x1A, 0x1C, 0x22), (0x30, 0x33, 0x3B), (0x4D, 0x51, 0x5B),
            (0x7A, 0x7F, 0x8A), (0xB4, 0xB8, 0xC0), (0xE8, 0xEA, 0xEE)]

SCREEN = (384, 216)
# The pilot is drawn this many px tall, standing; the glove at this scale of its source.
PILOT_HEIGHT = 28
HAND_SCALE = 0.4


def snap(img: Image.Image) -> Image.Image:
    """Every pixel to the nearest grey; alpha to fully on or off."""
    img = img.convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
                continue
            v = (r * 299 + g * 587 + b * 114) // 1000
            i = min(range(len(GREYS)), key=lambda k: abs(GREYS[k] - v))
            px[x, y] = (*GREY_RGB[i], 255)
    return img


def shrink(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Box-filters to `size`, with alpha premultiplied so edges don't darken."""
    return img.convert("RGBa").resize(size, Image.BOX).convert("RGBA")


def runs(mask: list[bool]) -> list[tuple[int, int]]:
    """The [start, end) runs of True."""
    out, start = [], None
    for i, m in enumerate(mask + [False]):
        if m and start is None:
            start = i
        elif not m and start is not None:
            out.append((start, i))
            start = None
    return out


def opaque_columns(img: Image.Image) -> list[bool]:
    alpha = img.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    w, h = img.size
    data = alpha.load()
    return [any(data[x, y] for y in range(h)) for x in range(w)]


def bbox_rows(img: Image.Image) -> tuple[int, int]:
    box = img.getchannel("A").point(lambda a: 255 if a >= 128 else 0).getbbox()
    assert box
    return box[1], box[3]


# The top edge of the cockpit's glare shield: y 51 from x 60 to 324, sloping to y 65 at
# both sides (measured on cockpit.png). Above it is the view out through the canopy.
SHIELD_Y = 51
SHIELD_SIDE_Y = 65
SHIELD_FLAT = (60, 324)


def shield_edge(x: int) -> float:
    left, right = SHIELD_FLAT
    if x < left:
        return SHIELD_Y + (left - x) * (SHIELD_SIDE_Y - SHIELD_Y) / left
    if x > right:
        return SHIELD_Y + (x - right) * (SHIELD_SIDE_Y - SHIELD_Y) / (SCREEN[0] - 1 - right)
    return SHIELD_Y


def backgrounds() -> None:
    for name in ("hangar", "cockpit"):
        img = snap(shrink(Image.open(SRC / f"{name}.webp"), SCREEN))
        img.convert("RGB").save(OUT / f"{name}.png", optimize=True)
        print(f"{name}.png {img.size}")
    # The panel alone, clear above the glare shield, so the level can show through the
    # window when the canopy closes.
    panel = Image.open(OUT / "cockpit.png").convert("RGBA")
    px = panel.load()
    for x in range(panel.width):
        for y in range(panel.height):
            if y < shield_edge(x):
                px[x, y] = (0, 0, 0, 0)
    panel.save(OUT / "cockpit-panel.png", optimize=True)
    print("cockpit-panel.png")


def pilot() -> None:
    sheet = Image.open(SRC / "pilot.webp").convert("RGBA")
    frames = runs(opaque_columns(sheet))
    assert len(frames) == 7, frames
    # Walk and climb frames share a baseline: the lowest opaque row of the walk frames.
    top, base = bbox_rows(sheet.crop((frames[0][0], 0, frames[0][1], sheet.height)))
    scale = PILOT_HEIGHT / (base - top)
    cells = []
    for i, (x0, x1) in enumerate(frames[:6]):
        crop = sheet.crop((x0, top - 40, x1, base))
        w = max(1, round(crop.width * scale))
        h = max(1, round(crop.height * scale))
        cells.append(snap(shrink(crop, (w, h))))
    cw = max(c.width for c in cells)
    ch = max(c.height for c in cells)
    strip = Image.new("RGBA", (cw * len(cells), ch))
    for i, c in enumerate(cells):
        strip.paste(c, (i * cw + (cw - c.width) // 2, ch - c.height))
    strip.save(OUT / "pilot.png", optimize=True)
    print(f"pilot.png {len(cells)} frames of {cw}x{ch}, feet at the bottom centre")
    # Seated: head and shoulders, cut above the cockpit rim drawn under them in the source.
    x0, x1 = frames[6]
    seat_top, seat_bottom = bbox_rows(sheet.crop((x0, 0, x1, sheet.height)))
    rim = seat_bottom - round((seat_bottom - seat_top) * 0.22)
    crop = sheet.crop((x0, seat_top, x1, rim))
    seat = snap(shrink(crop, (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))))
    seat.save(OUT / "pilot-seated.png", optimize=True)
    print(f"pilot-seated.png {seat.size}")


def hands() -> None:
    sheet = Image.open(SRC / "hand.webp").convert("RGBA")
    parts = runs(opaque_columns(sheet))
    assert len(parts) == 2, parts
    alpha = sheet.getchannel("A").load()
    for name, (x0, x1) in zip(("hand-grip", "hand-point"), parts):
        crop = sheet.crop((x0, 0, x1, sheet.height))
        img = snap(shrink(crop, (round(crop.width * HAND_SCALE), round(crop.height * HAND_SCALE))))
        # Trim the empty rows above the hand; anchors below are in the trimmed image.
        top = img.getbbox()[1]
        img = img.crop((0, top, img.width, img.height))
        img.save(OUT / f"{name}.png", optimize=True)
        if name == "hand-grip":
            # The gap between the fingers and the thumb: where the cassette's end goes.
            x = x0 + 20
            ys = [y for y in range(sheet.height) if alpha[x, y] >= 128]
            gap = [(a, b) for a, b in zip(ys, ys[1:]) if b - a > 1][0]
            mid = (gap[0] + gap[1]) // 2
            inner = next(xx for xx in range(x, x1) if alpha[xx, mid] >= 128)
            ax, ay = (inner - x0) * HAND_SCALE, mid * HAND_SCALE - top
            print(f"{name}.png {img.size}, gap {(gap[1] - gap[0]) * HAND_SCALE:.0f} px, cassette end at ({ax:.0f}, {ay:.0f})")
        else:
            cols = [xx for xx in range(x0, x1) if any(alpha[xx, y] >= 128 for y in range(sheet.height))]
            tip_x = cols[0]
            ys = [y for y in range(sheet.height) if alpha[tip_x, y] >= 128]
            tip_y = (sum(ys) / len(ys)) * HAND_SCALE - top
            print(f"{name}.png {img.size}, fingertip at ({(tip_x - x0) * HAND_SCALE:.0f}, {tip_y:.0f})")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    backgrounds()
    pilot()
    hands()
