#!/usr/bin/env python3
"""يقيس هل يستطيع كل بثّ أن يُشغَّل بلا تقطيع، لا هل رابطه حيّ فقط.

لكل قناة: زمن جلب القائمة، معدّل بتّ البثّ، وسرعة التنزيل الفعلية.
النسبة بينهما هي الحكم — أقل من ١٫٠ تعني أن المشغّل سيستهلك أسرع مما
ينزل، فيتوقّف حتماً مهما ضُبط المشغّل.
"""

import json
import pathlib
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parents[2]
CHANNELS = ROOT / "KoraTime/KoraTime/Resources/channels.json"
REPORT = ROOT / "docs/stream-report.md"

UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"
TIMEOUT = 10
MAX_SEGMENT_BYTES = 3_000_000   # سقف التنزيل لكل قناة
TARGET_SECONDS = 6.0            # كم ثانية من المحتوى نجرّب

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def fetch(url, headers=None, limit=None):
    """يرجع (البايتات، ثانية حتى أول بايت، ثانية كلية)."""
    request = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=TIMEOUT, context=CTX) as response:
        first = response.read(1)
        ttfb = time.monotonic() - started
        chunks = [first]
        total = 1
        while limit is None or total < limit:
            block = response.read(65536)
            if not block:
                break
            chunks.append(block)
            total += len(block)
        return b"".join(chunks), ttfb, time.monotonic() - started


def parse_playlist(text, base):
    """يرجع (variants, segments) — variants لقائمة رئيسية، segments لقائمة وسائط."""
    variants, segments = [], []
    pending_bandwidth = None
    pending_duration = None

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#EXT-X-STREAM-INF"):
            match = re.search(r"BANDWIDTH=(\d+)", line)
            pending_bandwidth = int(match.group(1)) if match else None
        elif line.startswith("#EXTINF"):
            match = re.match(r"#EXTINF:\s*([\d.]+)", line)
            pending_duration = float(match.group(1)) if match else None
        elif line.startswith("#"):
            continue
        else:
            absolute = urllib.parse.urljoin(base, line)
            if pending_bandwidth is not None:
                variants.append((pending_bandwidth, absolute))
                pending_bandwidth = None
            else:
                segments.append((pending_duration or 0.0, absolute))
                pending_duration = None
    return variants, segments


def measure(channel):
    name, url = channel["name"], channel["url"]
    headers = {}
    if channel.get("userAgent"):
        headers["User-Agent"] = channel["userAgent"]
    if channel.get("referer"):
        headers["Referer"] = channel["referer"]

    result = {
        "name": name,
        "group": channel.get("group", ""),
        "geo": bool(channel.get("geoRestricted")),
        "status": "",
        "manifest_ms": None,
        "bitrate_kbps": None,
        "throughput_kbps": None,
        "headroom": None,
        "note": "",
    }

    try:
        body, ttfb, _ = fetch(url, headers, limit=400_000)
    except urllib.error.HTTPError as error:
        result["status"] = "ميت"
        result["note"] = f"HTTP {error.code}"
        return result
    except Exception as error:
        result["status"] = "ميت"
        result["note"] = type(error).__name__
        return result

    result["manifest_ms"] = round(ttfb * 1000)
    text = body.decode("utf-8", "replace")
    if "#EXTM3U" not in text:
        result["status"] = "ليس HLS"
        return result

    variants, segments = parse_playlist(text, url)

    declared = None
    if variants:
        # المشغّل يبدأ بأدنى جودة ثم يترقّى، فنقيس ما سيبدأ به فعلاً
        declared, media_url = min(variants, key=lambda v: v[0])
        try:
            body, _, _ = fetch(media_url, headers, limit=400_000)
            _, segments = parse_playlist(body.decode("utf-8", "replace"), media_url)
        except Exception as error:
            result["status"] = "ميت"
            result["note"] = f"القائمة الفرعية: {type(error).__name__}"
            return result

    if not segments:
        result["status"] = "بلا مقاطع"
        return result

    downloaded = 0
    content_seconds = 0.0
    elapsed = 0.0
    for duration, segment_url in segments[-4:]:
        if content_seconds >= TARGET_SECONDS or downloaded >= MAX_SEGMENT_BYTES:
            break
        try:
            blob, _, took = fetch(segment_url, headers, limit=MAX_SEGMENT_BYTES - downloaded)
        except Exception as error:
            result["status"] = "مقاطع مفقودة"
            result["note"] = type(error).__name__
            return result
        downloaded += len(blob)
        elapsed += took
        content_seconds += duration or 0.0

    if downloaded == 0 or elapsed <= 0:
        result["status"] = "بلا بيانات"
        return result

    throughput = downloaded * 8 / elapsed / 1000
    result["throughput_kbps"] = round(throughput)

    if declared:
        bitrate = declared / 1000
    elif content_seconds > 0:
        bitrate = downloaded * 8 / content_seconds / 1000
    else:
        bitrate = throughput
    result["bitrate_kbps"] = round(bitrate)

    headroom = throughput / bitrate if bitrate else 0
    result["headroom"] = round(headroom, 2)
    if headroom >= 2.0:
        result["status"] = "ممتاز"
    elif headroom >= 1.3:
        result["status"] = "جيد"
    elif headroom >= 1.0:
        result["status"] = "على الحافة"
    else:
        result["status"] = "سيتقطّع"
    return result


def check_logo(channel):
    logo = channel.get("logo")
    if not logo:
        return channel["name"], "بلا شعار"
    try:
        request = urllib.request.Request(logo, headers={"User-Agent": UA}, method="GET")
        with urllib.request.urlopen(request, timeout=TIMEOUT, context=CTX) as response:
            blob = response.read(2048)
        return channel["name"], "يعمل" if blob else "فارغ"
    except urllib.error.HTTPError as error:
        return channel["name"], f"HTTP {error.code}"
    except Exception as error:
        return channel["name"], type(error).__name__


def main():
    channels = json.loads(CHANNELS.read_text("utf-8"))
    playable = [c for c in channels if not c.get("isDemo")]

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(measure, playable))
    with ThreadPoolExecutor(max_workers=10) as pool:
        logos = list(pool.map(check_logo, playable))

    order = {"سيتقطّع": 0, "على الحافة": 1, "ميت": 2, "مقاطع مفقودة": 2,
             "بلا مقاطع": 2, "ليس HLS": 2, "بلا بيانات": 2, "جيد": 3, "ممتاز": 4}
    results.sort(key=lambda r: (order.get(r["status"], 5), -(r["headroom"] or 0)))

    lines = [
        "# تقرير جودة البثّ",
        "",
        f"فُحصت **{len(playable)}** قناة. العمود الحاسم هو **الهامش**: نسبة سرعة",
        "التنزيل الفعلية إلى معدّل بتّ البثّ. أقل من ١٫٠ يعني أن المشغّل يستهلك",
        "أسرع مما ينزل — سيتقطّع حتماً مهما ضُبط المشغّل.",
        "",
        "| القناة | الحالة | الهامش | معدّل البثّ | سرعة التنزيل | زمن القائمة | ملاحظة |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in results:
        lines.append(
            "| {name} | {status} | {headroom} | {bitrate} | {through} | {ms} | {note} |".format(
                name=r["name"] + (" ⚠️" if r["geo"] else ""),
                status=r["status"],
                headroom=f'{r["headroom"]}×' if r["headroom"] is not None else "—",
                bitrate=f'{r["bitrate_kbps"]} ك.ب/ث' if r["bitrate_kbps"] else "—",
                through=f'{r["throughput_kbps"]} ك.ب/ث' if r["throughput_kbps"] else "—",
                ms=f'{r["manifest_ms"]} م.ث' if r["manifest_ms"] else "—",
                note=r["note"] or "",
            )
        )

    broken = [n for n, s in logos if s not in ("يعمل", "بلا شعار")]
    missing = [n for n, s in logos if s == "بلا شعار"]
    lines += [
        "",
        "## الشعارات",
        "",
        f"- تعمل: **{sum(1 for _, s in logos if s == 'يعمل')}**",
        f"- بلا شعار أصلاً: **{len(missing)}**" + (f" — {'، '.join(missing)}" if missing else ""),
        f"- معطوبة: **{len(broken)}**" + (f" — {'، '.join(broken)}" if broken else ""),
    ]

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    counts = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    print("الخلاصة:", counts)
    print("الشعارات المعطوبة:", len(broken))
    return 0


if __name__ == "__main__":
    sys.exit(main())
