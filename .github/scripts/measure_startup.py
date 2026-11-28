#!/usr/bin/env python3
"""يقيس زمن «أول صورة» لكل قناة، مفصّلاً على مراحله.

الغرض إنهاء التخمين في سبب بطء بدء التشغيل: كم منه أرضية شبكة لا تُختصر
(اتصال + قائمة رئيسية + قائمة مقاطع)، وكم منه اختيار المشغّل لجودة عالية
فيثقل أول مقطع.

يقيس لكل قناة مسارين: البدء بأدنى جودة والبدء بأعلاها — والفرق بينهما هو
ما يكسبه ضبط تقدير عرض النطاق الابتدائي.
"""

import json
import pathlib
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parents[2]
CHANNELS = ROOT / "KoraTime/KoraTime/Resources/channels.json"
REPORT = ROOT / "docs/startup-report.md"

UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"
TIMEOUT = 12
NEEDED_SECONDS = 0.5   # ما يطلبه المشغّل قبل عرض أول صورة

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def get(url, headers=None, limit=None):
    request = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=TIMEOUT, context=CTX) as response:
        data = response.read(limit) if limit else response.read()
    return data, time.monotonic() - started


def connect_ms(url):
    """زمن فتح الاتصال وحده — الأرضية التي لا يملك المشغّل حيالها شيئاً."""
    parts = urllib.parse.urlparse(url)
    port = parts.port or (443 if parts.scheme == "https" else 80)
    started = time.monotonic()
    try:
        sock = socket.create_connection((parts.hostname, port), timeout=TIMEOUT)
        if parts.scheme == "https":
            CTX.wrap_socket(sock, server_hostname=parts.hostname).close()
        else:
            sock.close()
    except Exception:
        return None
    return (time.monotonic() - started) * 1000


def variants(text, base):
    out = []
    bandwidth = None
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("#EXT-X-STREAM-INF"):
            m = re.search(r"BANDWIDTH=(\d+)", line)
            bandwidth = int(m.group(1)) if m else None
        elif line and not line.startswith("#"):
            if bandwidth is not None:
                out.append((bandwidth, urllib.parse.urljoin(base, line)))
                bandwidth = None
    return out


def segments(text, base):
    out = []
    duration = 0.0
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("#EXTINF"):
            try:
                duration = float(line.split(":", 1)[1].split(",")[0])
            except (IndexError, ValueError):
                duration = 0.0
        elif line and not line.startswith("#"):
            out.append((duration, urllib.parse.urljoin(base, line)))
    return out


def first_frame(media_url, headers):
    """جلب قائمة المقاطع ثم ما يكفي من آخر مقطع لعرض أول صورة."""
    body, playlist_ms = get(media_url, headers, limit=400_000)
    parts = segments(body.decode("utf-8", "replace"), media_url)
    if not parts:
        return None, None
    duration, seg_url = parts[-1]

    # المشغّل لا ينتظر المقطع كاملاً: يكفيه ما يغطّي NEEDED_SECONDS
    fraction = min(1.0, NEEDED_SECONDS / duration) if duration else 1.0
    started = time.monotonic()
    request = urllib.request.Request(seg_url, headers={"User-Agent": UA, **headers})
    with urllib.request.urlopen(request, timeout=TIMEOUT, context=CTX) as response:
        total = response.headers.get("Content-Length")
        want = int(int(total) * fraction) if total else 300_000
        got = 0
        while got < want:
            block = response.read(min(65536, want - got))
            if not block:
                break
            got += len(block)
    return playlist_ms * 1000, (time.monotonic() - started) * 1000


def measure(channel):
    name, url = channel["name"], channel["url"]
    headers = {}
    if channel.get("userAgent"):
        headers["User-Agent"] = channel["userAgent"]
    if channel.get("referer"):
        headers["Referer"] = channel["referer"]

    row = {"name": name, "connect": None, "master": None,
           "low": None, "high": None, "note": ""}
    try:
        row["connect"] = connect_ms(url)
        body, master_s = get(url, headers, limit=400_000)
        row["master"] = master_s * 1000
        text = body.decode("utf-8", "replace")
        if "#EXTM3U" not in text:
            row["note"] = "ليس HLS"
            return row

        options = variants(text, url)
        if not options:
            # قائمة مقاطع مباشرة، بلا جودات
            playlist_ms, segment_ms = first_frame(url, headers)
            if playlist_ms is None:
                row["note"] = "بلا مقاطع"
                return row
            row["low"] = row["high"] = row["master"] + playlist_ms + segment_ms
            return row

        for label, pick in (("low", min(options)), ("high", max(options))):
            try:
                playlist_ms, segment_ms = first_frame(pick[1], headers)
                if playlist_ms is not None:
                    row[label] = row["connect"] + row["master"] + playlist_ms + segment_ms
            except Exception as error:
                row["note"] = f"{label}: {type(error).__name__}"
    except Exception as error:
        row["note"] = type(error).__name__
    return row


def ms(value):
    return f"{value:.0f}" if value is not None else "—"


def main():
    channels = [c for c in json.loads(CHANNELS.read_text("utf-8")) if not c.get("isDemo")]
    with ThreadPoolExecutor(max_workers=5) as pool:
        rows = list(pool.map(measure, channels))

    usable = [r for r in rows if r["low"]]
    usable.sort(key=lambda r: r["low"])

    lines = [
        "# زمن أول صورة",
        "",
        "كل الأزمنة بالملّي ثانية، من خادم في مركز بيانات — على شبكة جوال",
        f"ستكون أعلى. «أدنى جودة» و«أعلى جودة» هما نفس القناة بمسارين، والفرق",
        "بينهما هو ما يكسبه ضبط تقدير عرض النطاق الابتدائي في المشغّل.",
        "",
        "| القناة | الاتصال | القائمة الرئيسية | أدنى جودة | أعلى جودة | الفرق |",
        "|---|---|---|---|---|---|",
    ]
    for r in usable:
        gain = (r["high"] - r["low"]) if (r["high"] and r["low"]) else None
        lines.append(
            f'| {r["name"]} | {ms(r["connect"])} | {ms(r["master"])} | '
            f'**{ms(r["low"])}** | {ms(r["high"])} | {ms(gain)} |'
        )

    broken = [r for r in rows if not r["low"]]
    if broken:
        lines += ["", "## لم تُقَس", ""]
        lines += [f'- {r["name"]} — {r["note"] or "سبب غير معروف"}' for r in broken]

    if usable:
        lows = sorted(r["low"] for r in usable)
        median = lows[len(lows) // 2]
        floor = sorted(
            (r["connect"] or 0) + (r["master"] or 0) for r in usable
        )[len(usable) // 2]
        lines += [
            "",
            "## الخلاصة",
            "",
            f"- وسيط زمن أول صورة بأدنى جودة: **{median:.0f} م.ث**",
            f"- منه أرضية لا تُختصر (اتصال + قائمة رئيسية): **{floor:.0f} م.ث**",
            f"- أبطأ قناة: **{max(lows):.0f} م.ث** · أسرع: **{min(lows):.0f} م.ث**",
        ]
        print(f"وسيط={median:.0f}ms أرضية={floor:.0f}ms عدد={len(usable)}")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
