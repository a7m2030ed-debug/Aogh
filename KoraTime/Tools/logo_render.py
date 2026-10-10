#!/usr/bin/env python3
"""هندسة شعار «كورة تايم» ورسمه — مصدر واحد تستعمله أدوات آيفون وأندرويد.

الشعار: كرة قدم بيضاء برقع داكنة، وفي منتصفها عقربا ساعة بلون التطبيق.
كل المقاسات مشتقّة من نصف قطر الكرة، فيكبر الشعار ويصغر بلا تشويه.
"""

import math
import struct
import zlib

BALL = (247, 249, 248)
BALL_SHADE = (206, 216, 212)
PATCH = (8, 26, 20)
ACCENT = (0, 214, 143)

PATCH_DISTANCE = 0.70
PATCH_SIZE = 0.27
HOUR_ANGLE = -126.0
HOUR_LENGTH = 0.38
HOUR_WIDTH = 0.0627
MINUTE_ANGLE = -54.0
MINUTE_LENGTH = 0.54
MINUTE_WIDTH = 0.0507
PIVOT_OUTER = 0.0895
PIVOT_INNER = 0.0417


def mix(c1, c2, t):
    return tuple(a + (b - a) * t for a, b in zip(c1, c2))


def regular_polygon(cx, cy, radius, sides, rotation):
    return [
        (cx + radius * math.cos(rotation + 2 * math.pi * i / sides),
         cy + radius * math.sin(rotation + 2 * math.pi * i / sides))
        for i in range(sides)
    ]


def point_in_polygon(x, y, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y):
            if x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
        j = i
    return inside


def segment_distance(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    length2 = dx * dx + dy * dy
    if length2 == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / length2))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def shapes(cx, cy, radius):
    patches = [
        regular_polygon(
            cx + radius * PATCH_DISTANCE * math.cos(a),
            cy + radius * PATCH_DISTANCE * math.sin(a),
            radius * PATCH_SIZE, 5, a + math.pi / 2,
        )
        for a in (-math.pi / 2 + 2 * math.pi * i / 5 for i in range(5))
    ]
    hands = []
    for angle, length, width in (
        (HOUR_ANGLE, HOUR_LENGTH, HOUR_WIDTH),
        (MINUTE_ANGLE, MINUTE_LENGTH, MINUTE_WIDTH),
    ):
        rad = math.radians(angle)
        hands.append((
            cx, cy,
            cx + radius * length * math.cos(rad),
            cy + radius * length * math.sin(rad),
            radius * width,
        ))
    return patches, hands


def render(size, supersample=3, fill=0.914):
    """يرسم الشعار على خلفية شفّافة.

    size: مقاس الناتج بالبكسل. fill: نسبة قطر الكرة إلى عرض الصورة —
    أيقونات أندرويد التكيّفية تحتاج هامشاً أكبر فتُمرَّر نسبة أصغر.
    """
    width = size * supersample
    cx = cy = width / 2.0
    radius = width * fill / 2.0
    patches, hands = shapes(cx, cy, radius)

    rows = []
    for y in range(width):
        row = bytearray()
        for x in range(width):
            d = math.hypot(x - cx, y - cy)
            if d > radius:
                row += b"\x00\x00\x00\x00"
                continue

            shade = min(1.0, max(0.0, (d / radius) ** 2.2))
            r, g, b = mix(BALL, BALL_SHADE, shade * 0.75)

            for poly in patches:
                if point_in_polygon(x, y, poly):
                    r, g, b = PATCH
                    break
            for (x1, y1, x2, y2, half) in hands:
                if segment_distance(x, y, x1, y1, x2, y2) <= half:
                    r, g, b = ACCENT
                    break
            if d <= radius * PIVOT_OUTER:
                r, g, b = PATCH
            if d <= radius * PIVOT_INNER:
                r, g, b = ACCENT

            row += bytes((int(r + 0.5), int(g + 0.5), int(b + 0.5), 255))
        rows.append(bytes(row))

    return _downsample(rows, size, supersample)


def _downsample(rows, size, supersample):
    out = []
    n = supersample * supersample
    for oy in range(size):
        row = bytearray()
        for ox in range(size):
            r = g = b = a = 0
            for dy in range(supersample):
                src = rows[oy * supersample + dy]
                base = ox * supersample * 4
                for dx in range(supersample):
                    i = base + dx * 4
                    alpha = src[i + 3]
                    r += src[i] * alpha
                    g += src[i + 1] * alpha
                    b += src[i + 2] * alpha
                    a += alpha
            if a == 0:
                row += b"\x00\x00\x00\x00"
            else:
                row += bytes((r // a, g // a, b // a, a // n))
        out.append(bytes(row))
    return out


def write_png(path, rows, size):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)


def svg(size=1024):
    cx = cy = size / 2.0
    radius = size * 0.914 / 2.0
    patches, hands = shapes(cx, cy, radius)

    def rgb(color):
        return "#%02X%02X%02X" % tuple(int(c) for c in color)

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'width="{size}" height="{size}" role="img" aria-label="كورة تايم">',
        "  <defs>",
        '    <radialGradient id="ball" cx="42%" cy="36%" r="72%">',
        f'      <stop offset="0%" stop-color="{rgb(BALL)}"/>',
        f'      <stop offset="100%" stop-color="{rgb(BALL_SHADE)}"/>',
        "    </radialGradient>",
        "  </defs>",
        f'  <circle cx="{cx}" cy="{cy}" r="{radius}" fill="url(#ball)"/>',
    ]
    for poly in patches:
        points = " ".join(f"{x:.1f},{y:.1f}" for x, y in poly)
        parts.append(f'  <polygon points="{points}" fill="{rgb(PATCH)}"/>')
    for (x1, y1, x2, y2, half) in hands:
        parts.append(
            f'  <line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{rgb(ACCENT)}" stroke-width="{half * 2:.1f}" stroke-linecap="round"/>'
        )
    parts.append(f'  <circle cx="{cx}" cy="{cy}" r="{radius * PIVOT_OUTER:.1f}" fill="{rgb(PATCH)}"/>')
    parts.append(f'  <circle cx="{cx}" cy="{cy}" r="{radius * PIVOT_INNER:.1f}" fill="{rgb(ACCENT)}"/>')
    parts.append("</svg>")
    return "\n".join(parts) + "\n"
