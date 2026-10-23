#!/usr/bin/env python3
"""TaskHaven's icon (the "Listo" mark: a ticked box on orange), in every size and form needed:
the Android launcher icons (adaptive, themed, and the old square and round ones), the splash,
the notification icon, and the web/README icons. Run from the project: python3 tools/make-icons.py"""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android/app/src/main/res'
ORANGE = (242, 104, 58, 255)
WHITE = (255, 255, 255, 255)

# The mark, in the 220×220 box of the original drawing
BOX = (52, 66, 150, 164)       # the box: x0, y0, x1, y1, corner 24, line 12
TICK = [(77, 112), (100, 135), (170, 58)]  # the tick: line 17, round ends

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220">
<rect width="220" height="220" rx="52" fill="#f2683a"/>
<rect x="52" y="66" width="98" height="98" rx="24" fill="none" stroke="#fff" stroke-width="12"/>
<path d="M77 112 L100 135 L170 58" fill="none" stroke="#fff" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
"""


def draw_mark(d: ImageDraw.ImageDraw, k: float, ox: float = 0, oy: float = 0, color=WHITE):
    x0, y0, x1, y1 = BOX
    # an outlined rounded square: the outer one, less the inner one
    half = 6
    d.rounded_rectangle([ox + (x0 - half) * k, oy + (y0 - half) * k, ox + (x1 + half) * k, oy + (y1 + half) * k], radius=(24 + half) * k, fill=color)
    d.rounded_rectangle([ox + (x0 + half) * k, oy + (y0 + half) * k, ox + (x1 - half) * k, oy + (y1 - half) * k], radius=(24 - half) * k, fill=(0, 0, 0, 0))
    pts = [(ox + x * k, oy + y * k) for x, y in TICK]
    w = 17 * k
    d.line(pts, fill=color, width=round(w), joint='curve')
    for x, y in pts:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=color)


def icon(size: int, shape: str = 'square') -> Image.Image:
    """The whole icon at size×size: 'square' (rounded), 'round', or 'full' (no corners, for adaptive previews)."""
    s = 8  # drawn 8× larger, then made smaller (smooth edges)
    big = Image.new('RGBA', (size * s, size * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    k = size * s / 220
    if shape == 'round':
        d.ellipse([0, 0, size * s - 1, size * s - 1], fill=ORANGE)
        # a touch smaller inside the circle
        inner = 0.86
        ko = k * inner
        off = size * s * (1 - inner) / 2
        mark = Image.new('RGBA', big.size, (0, 0, 0, 0))
        draw_mark(ImageDraw.Draw(mark), ko, off, off)
        big.alpha_composite(mark)
    else:
        d.rounded_rectangle([0, 0, size * s - 1, size * s - 1], radius=0 if shape == 'full' else 52 * k, fill=ORANGE)
        mark = Image.new('RGBA', big.size, (0, 0, 0, 0))
        draw_mark(ImageDraw.Draw(mark), k)
        big.alpha_composite(mark)
    return big.resize((size, size), Image.LANCZOS)


def rounded_rect_path(x0, y0, x1, y1, r):
    return (f'M{x0 + r},{y0} H{x1 - r} A{r},{r} 0 0 1 {x1},{y0 + r} V{y1 - r} A{r},{r} 0 0 1 {x1 - r},{y1} '
            f'H{x0 + r} A{r},{r} 0 0 1 {x0},{y1 - r} V{y0 + r} A{r},{r} 0 0 1 {x0 + r},{y0} Z')


def mark_paths(color: str) -> str:
    box = rounded_rect_path(*BOX, 24)
    tick = 'M{},{} L{},{} L{},{}'.format(*[c for p in TICK for c in p])
    return (f'        <path android:pathData="{box}" android:strokeColor="{color}" android:strokeWidth="12" android:fillColor="#00000000"/>\n'
            f'        <path android:pathData="{tick}" android:strokeColor="{color}" android:strokeWidth="17" android:fillColor="#00000000"\n'
            f'            android:strokeLineCap="round" android:strokeLineJoin="round"/>\n')


def vector(size_dp: float, viewport: float, scale: float, tx: float, ty: float, body: str) -> str:
    return (f'<?xml version="1.0" encoding="utf-8"?>\n'
            f'<!-- Made by tools/make-icons.py: the TaskHaven mark. -->\n'
            f'<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            f'    android:width="{size_dp}dp" android:height="{size_dp}dp"\n'
            f'    android:viewportWidth="{viewport}" android:viewportHeight="{viewport}">\n'
            f'    <group android:scaleX="{scale}" android:scaleY="{scale}" android:translateX="{tx:.3f}" android:translateY="{ty:.3f}">\n'
            f'{body}'
            f'    </group>\n'
            f'</vector>\n')


def centred(viewport: float, scale: float) -> tuple[float, float]:
    # the mark's middle (the box and the tick together) goes to the middle
    cx, cy = (46 + 178.5) / 2, (49.5 + 170) / 2
    return viewport / 2 - cx * scale, viewport / 2 - cy * scale


def write(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def main():
    # ---- Android ----
    # adaptive icon: orange behind, the white mark in the middle (inside the 66 dp safe circle)
    tx, ty = centred(108, 0.34)
    write(RES / 'drawable/ic_launcher_foreground.xml', vector(108, 108, 0.34, tx, ty, mark_paths('#FFFFFF')))
    old = RES / 'drawable-v24/ic_launcher_foreground.xml'
    if old.exists():
        old.unlink()
    write(RES / 'values/ic_launcher_background.xml',
          '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#F2683A</color>\n</resources>\n')
    (RES / 'drawable/ic_launcher_background.xml').unlink(missing_ok=True)
    adaptive = ('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                '    <background android:drawable="@color/ic_launcher_background"/>\n'
                '    <foreground android:drawable="@drawable/ic_launcher_foreground"/>\n'
                '    <monochrome android:drawable="@drawable/ic_launcher_foreground"/>\n'
                '</adaptive-icon>\n')
    write(RES / 'mipmap-anydpi-v26/ic_launcher.xml', adaptive)
    write(RES / 'mipmap-anydpi-v26/ic_launcher_round.xml', adaptive)
    # older phones: the square and round pictures
    for folder, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        d = RES / f'mipmap-{folder}'
        d.mkdir(parents=True, exist_ok=True)
        # a little margin, as launcher icons have
        sq = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        inner = round(px * 0.88)
        sq.alpha_composite(icon(inner, 'square'), ((px - inner) // 2, (px - inner) // 2))
        sq.save(d / 'ic_launcher.png')
        icon(px, 'round').save(d / 'ic_launcher_round.png')
        (d / 'ic_launcher_foreground.png').unlink(missing_ok=True)

    # notifications: the mark alone, white (Android tints it)
    s = 20 / 132.5
    tx, ty = centred(24, s)
    write(RES / 'drawable/ic_stat_taskhaven.xml', vector(24, 24, round(s, 4), tx, ty, mark_paths('#FFFFFF')))

    # the splash: the icon in the middle of the page colour (no stretched pictures)
    for folder in ['drawable', *[f'drawable-{o}-{d}' for o in ('port', 'land') for d in ('mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi')]]:
        (RES / folder / 'splash.png').unlink(missing_ok=True)
        try:
            (RES / folder).rmdir()
        except OSError:
            pass
    whole = (f'        <path android:pathData="{rounded_rect_path(0, 0, 220, 220, 52)}" android:fillColor="#F2683A"/>\n' + mark_paths('#FFFFFF'))
    write(RES / 'drawable/splash_icon.xml', vector(96, 220, 1, 0, 0, whole))
    write(RES / 'drawable/splash.xml',
          '<?xml version="1.0" encoding="utf-8"?>\n<!-- The splash: TaskHaven\'s icon on the page colour. -->\n'
          '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n'
          '    <item android:drawable="@color/splash_background"/>\n'
          '    <item android:width="96dp" android:height="96dp" android:gravity="center" android:drawable="@drawable/splash_icon"/>\n'
          '</layer-list>\n')
    write(RES / 'values/colors.xml',
          '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="splash_background">#F4F4F2</color>\n    <color name="brand">#F2683A</color>\n</resources>\n')
    write(RES / 'values-night/colors.xml',
          '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="splash_background">#121315</color>\n</resources>\n')

    # ---- web and README ----
    write(ROOT / 'public/icon.svg', SVG)
    for px in (192, 512):
        icon(px).save(ROOT / f'public/icon-{px}.png')
    icon(1024).save(ROOT / 'art/icon.png')
    # Google Play's icon: 512×512, square (Play rounds the corners itself)
    (ROOT / 'store').mkdir(exist_ok=True)
    icon(512, 'full').save(ROOT / 'store/icon-512.png')
    write(ROOT / 'art/icon.svg', SVG)
    print('icons made')


if __name__ == '__main__':
    main()
