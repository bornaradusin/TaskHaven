#!/usr/bin/env python3
"""Google Play wants screenshots and the feature graphic as PNGs without transparency (24-bit):
this makes store/*.png and store/screenshots/*.png so, and drops the helper shots."""
from pathlib import Path
from PIL import Image

store = Path(__file__).resolve().parent.parent / 'store'
for helper in store.glob('screenshots/_*.png'):
    helper.unlink()
for png in [store / 'feature-graphic.png', *sorted(store.glob('screenshots/*.png'))]:
    im = Image.open(png)
    if im.mode != 'RGB':
        flat = Image.new('RGB', im.size, (255, 255, 255))
        flat.paste(im, mask=im.getchannel('A') if 'A' in im.mode else None)
        flat.save(png, optimize=True)
    print(png.relative_to(store.parent), Image.open(png).size, Image.open(png).mode)
