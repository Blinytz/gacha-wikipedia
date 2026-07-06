#!/usr/bin/env python3
"""Icônes PWA : carte à collectionner stylisée sur dégradé violet/bleu."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
(ROOT / 'icons').mkdir(exist_ok=True)


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def make(size, maskable=False):
    img = Image.new('RGB', (size, size), '#12121c')
    d = ImageDraw.Draw(img)
    # fond dégradé diagonal
    for y in range(size):
        t = y / size
        r = int(0x12 + t * (0x2a - 0x12))
        g = int(0x12 + t * (0x1b - 0x12))
        b = int(0x1c + t * (0x55 - 0x1c))
        d.line([(0, y), (size, y)], fill=(r, g, b))
    m = size * (0.24 if maskable else 0.16)          # marge (safe zone maskable)
    w = size - 2 * m
    # carte arrière (inclinaison simulée par décalage)
    dx = size * 0.05
    rounded(d, (m + dx, m - dx * 0.4, m + dx + w * 0.62, m - dx * 0.4 + w * 0.88),
            radius=size * 0.06, fill='#46c8ff')
    # carte avant
    x0, y0 = m, m + w * 0.08
    x1, y1 = m + w * 0.62, y0 + w * 0.88
    rounded(d, (x0, y0, x1, y1), radius=size * 0.06, fill='#7c5cff')
    rounded(d, (x0 + w * 0.05, y0 + w * 0.05, x1 - w * 0.05, y0 + w * 0.42),
            radius=size * 0.03, fill='#eceaf6')
    # "W" stylisé sur la zone image de la carte
    cx = (x0 + x1) / 2
    cy = y0 + w * 0.235
    s = w * 0.13
    pts = [(cx - 1.6 * s, cy - s), (cx - 0.8 * s, cy + s), (cx, cy - 0.4 * s),
           (cx + 0.8 * s, cy + s), (cx + 1.6 * s, cy - s)]
    d.line(pts, fill='#12121c', width=max(2, int(size * 0.035)), joint='curve')
    # lignes de texte factices
    for i in range(2):
        yy = y0 + w * (0.55 + i * 0.13)
        rounded(d, (x0 + w * 0.07, yy, x1 - w * (0.12 + i * 0.14), yy + w * 0.055),
                radius=size * 0.015, fill='#eceaf640')
    return img


make(192).save(ROOT / 'icons' / 'icon-192.png')
make(512).save(ROOT / 'icons' / 'icon-512.png')
make(512, maskable=True).save(ROOT / 'icons' / 'icon-maskable-512.png')
print('icons/ : 192, 512, maskable-512 OK')
