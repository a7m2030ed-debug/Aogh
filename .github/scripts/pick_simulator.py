#!/usr/bin/env python3
"""يختار محاكي آيفون متاحاً من مخرجات `xcrun simctl list devices available -j`.

يقرأ JSON من stdin ويطبع سطرين بصيغة key=value جاهزين لـ $GITHUB_OUTPUT:

    udid=XXXXXXXX-XXXX-...
    name=iPhone 16

يُفضّل الموديل القياسي (لا Pro Max ولا Plus) من أحدث إصدار iOS متاح.
"""

import json
import sys


def rank(name):
    """كلما صغر الرقم كان الجهاز أنسب للقطات الشاشة."""
    if "Pro Max" in name or "Plus" in name:
        return 2
    if "Pro" in name:
        return 1
    return 0


def runtime_order(identifier):
    """يرتّب إصدارات iOS تصاعدياً حسب الرقم، فنأخذ الأحدث."""
    digits = []
    for chunk in identifier.replace("-", ".").split("."):
        if chunk.isdigit():
            digits.append(int(chunk))
    return digits or [0]


def main():
    payload = json.load(sys.stdin)
    candidates = []

    for runtime, devices in payload.get("devices", {}).items():
        if "iOS" not in runtime:
            continue
        for device in devices:
            if not device.get("isAvailable"):
                continue
            name = device.get("name", "")
            if "iPhone" not in name:
                continue
            candidates.append((runtime, name, device["udid"]))

    if not candidates:
        sys.exit("لم يُعثر على أي محاكي آيفون متاح على هذا الجهاز.")

    # الأحدث إصداراً أولاً، ثم الموديل الأنسب، ثم الاسم لثبات النتيجة
    candidates.sort(key=lambda item: (
        [-part for part in runtime_order(item[0])],
        rank(item[1]),
        item[1],
    ))

    runtime, name, udid = candidates[0]
    print(f"udid={udid}")
    print(f"name={name}")
    print(f"runtime={runtime}", file=sys.stderr)


if __name__ == "__main__":
    main()
