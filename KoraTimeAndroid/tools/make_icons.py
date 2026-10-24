#!/usr/bin/env python3
"""يولّد أيقونة أندرويد التكيّفية من هندسة الشعار نفسها المستعملة في الآيفون.

الأيقونة التكيّفية طبقتان: خلفية بلون التطبيق، وأمامية شفّافة فيها الكرة.
النظام يقصّ الطبقتين بأشكال مختلفة حسب الجهاز (دائرة، مربّع، حصاة)، ولهذا
تُرسم الكرة داخل ٦٠٪ من العرض حتى لا تُقصّ حوافها.

التشغيل:  python3 tools/make_icons.py
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "..", "KoraTime", "Tools")))

import logo_render  # noqa: E402

# مقاسات الطبقة الأمامية للأيقونة التكيّفية (١٠٨dp لكل كثافة)
DENSITIES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

# نسبة قطر الكرة إلى عرض الطبقة: المنطقة الآمنة ٦٦٪ تقريباً
FOREGROUND_FILL = 0.60


def main():
    res = os.path.normpath(os.path.join(HERE, "..", "app", "src", "main", "res"))

    for density, size in DENSITIES.items():
        folder = os.path.join(res, f"mipmap-{density}")
        os.makedirs(folder, exist_ok=True)
        # التنعيم أعلى في المقاسات الصغيرة لأن الحواف أظهر فيها
        supersample = 6 if size <= 216 else 4
        rows = logo_render.render(size, supersample=supersample, fill=FOREGROUND_FILL)
        destination = os.path.join(folder, "ic_launcher_foreground.png")
        logo_render.write_png(destination, rows, size)
        print(f"  {density:8} {size:>3}px  {os.path.getsize(destination):>6} بايت")

    # نسخة كاملة للمتجر وصفحات العرض
    play = os.path.join(HERE, "..", "app", "src", "main", "play-store-icon.png")
    play = os.path.normpath(play)
    logo_render.write_png(play, logo_render.render(512, supersample=3, fill=0.914), 512)
    print(f"  متجر    512px  {os.path.getsize(play):>6} بايت")


if __name__ == "__main__":
    main()
