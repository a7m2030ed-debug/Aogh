#!/usr/bin/env python3
"""يولّد أيقونة التطبيق (1024×1024) بدون أي مكتبات خارجية.

الشعار: كرة قدم بيضاء رقعها الداكنة على المحيط، وفي منتصفها عقربا ساعة —
"كورة" + "تايم". الخلفية تدرّج أخضر داكن بلمسة ضوء علوية.

التشغيل:  python3 Tools/make_appicon.py
الناتج:   KoraTime/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png
"""

import math
import os
import struct
import zlib

SIZE = 1024          # مقاس الأيقونة النهائي
SS = 3               # معامل التنعيم (يُرسم بثلاثة أضعاف ثم يُصغَّر)
W = SIZE * SS

BG_TOP = (7, 34, 25)
BG_BOTTOM = (4, 18, 14)
GLOW = (0, 122, 84)
BALL = (247, 249, 248)
BALL_SHADE = (206, 216, 212)
PATCH = (8, 26, 20)
ACCENT = (0, 214, 143)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return (lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t))


def regular_polygon(cx, cy, radius, sides, rotation):
    pts = []
    for i in range(sides):
        ang = rotation + (2.0 * math.pi * i) / sides
        pts.append((cx + radius * math.cos(ang), cy + radius * math.sin(ang)))
    return pts


def point_in_polygon(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y):
            xint = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < xint:
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


def build_shapes():
    """يبني الأشكال مرة واحدة بإحداثيات الصورة المكبّرة."""
    cx = cy = W / 2.0
    ball_r = W * 0.335

    patches = []
    # خمس رقع داكنة على محيط الكرة، والفراغات بينها يمرّ فيها العقربان
    for i in range(5):
        ang = -math.pi / 2 + (2 * math.pi * i) / 5
        px = cx + ball_r * 0.70 * math.cos(ang)
        py = cy + ball_r * 0.70 * math.sin(ang)
        patches.append(regular_polygon(px, py, ball_r * 0.27, 5, ang + math.pi / 2))

    # العقربان يتّجهان إلى فراغين متجاورين أعلى الكرة (شكل ساعة واضح)
    hour_ang = math.radians(-126)
    minute_ang = math.radians(-54)
    hands = [
        (cx, cy, cx + ball_r * 0.38 * math.cos(hour_ang), cy + ball_r * 0.38 * math.sin(hour_ang), W * 0.021),
        (cx, cy, cx + ball_r * 0.54 * math.cos(minute_ang), cy + ball_r * 0.54 * math.sin(minute_ang), W * 0.017),
    ]
    return cx, cy, ball_r, patches, hands


def render():
    cx, cy, ball_r, patches, hands = build_shapes()
    glow_cx, glow_cy, glow_r = W * 0.5, W * 0.18, W * 0.62
    ring_r = ball_r * 1.115
    rows = []

    for y in range(W):
        row = bytearray()
        for x in range(W):
            t = y / float(W - 1)
            r, g, b = mix(BG_TOP, BG_BOTTOM, t * t)

            # وهج علوي خفيف
            gd = math.hypot(x - glow_cx, y - glow_cy)
            if gd < glow_r:
                k = (1.0 - gd / glow_r) ** 3 * 0.55
                r, g, b = mix((r, g, b), GLOW, k)

            d = math.hypot(x - cx, y - cy)

            # حلقة الإبراز حول الكرة
            if ball_r < d <= ring_r:
                k = 1.0 - (d - ball_r) / (ring_r - ball_r)
                r, g, b = mix((r, g, b), ACCENT, k * 0.30)

            if d <= ball_r:
                # تظليل كروي بسيط ليبدو للكرة حجم
                shade = min(1.0, max(0.0, (d / ball_r) ** 2.2))
                r, g, b = mix(BALL, BALL_SHADE, shade * 0.75)

                for poly in patches:
                    if point_in_polygon(x, y, poly):
                        r, g, b = PATCH
                        break

                for (x1, y1, x2, y2, half) in hands:
                    if segment_distance(x, y, x1, y1, x2, y2) <= half:
                        r, g, b = ACCENT
                        break

                # مسمار العقارب
                if d <= W * 0.030:
                    r, g, b = PATCH
                if d <= W * 0.014:
                    r, g, b = ACCENT

            row += bytes((int(r + 0.5), int(g + 0.5), int(b + 0.5)))
        rows.append(bytes(row))
    return rows


def downsample(rows):
    out = []
    for oy in range(SIZE):
        row = bytearray()
        for ox in range(SIZE):
            r = g = b = 0
            for dy in range(SS):
                src = rows[oy * SS + dy]
                base = (ox * SS) * 3
                for dx in range(SS):
                    i = base + dx * 3
                    r += src[i]
                    g += src[i + 1]
                    b += src[i + 2]
            n = SS * SS
            row += bytes((r // n, g // n, b // n))
        out.append(bytes(row))
    return out


def write_png(path, rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    dest = os.path.join(here, "..", "KoraTime", "Resources",
                        "Assets.xcassets", "AppIcon.appiconset", "AppIcon.png")
    dest = os.path.normpath(dest)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    write_png(dest, downsample(render()))
    print("wrote", dest, os.path.getsize(dest), "bytes")
