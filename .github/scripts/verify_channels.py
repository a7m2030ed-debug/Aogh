#!/usr/bin/env python3
"""يفحص روابط البثّ المرشّحة ويبني channels.json من الشغّال منها.

لماذا: لا يمكن التحقّق من الروابط في بيئة التطوير (الشبكة محجوبة)، فيتولّى
هذا الفاحص المهمّة على خادم GitHub الذي يملك إنترنتاً مفتوحاً.

التصنيف:
  ok    الرابط يردّ بقائمة HLS صالحة  → يدخل التطبيق
  geo   يردّ 403/451 (حجب جغرافي غالباً) → يدخل التطبيق مع تنبيه، لأن خوادم
        GitHub خارج المنطقة وقد تعمل القناة عند المستخدم
  dead  لا يردّ أو يردّ بمحتوى ليس HLS → يُستبعد

التشغيل:
    python3 .github/scripts/verify_channels.py \
        --candidates merged-candidates.json \
        --output KoraTime/KoraTime/Resources/channels.json \
        --report channel-report.md
"""

import argparse
import concurrent.futures
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

TIMEOUT = 15
USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
              "(KHTML, like Gecko) Version/17.0 Safari/605.1.15")
GEO_CODES = {401, 403, 451}
GROUP_ORDER = {"رياضة": 0, "إخبارية": 1, "تجريبي": 2}


def fetch(url, headers=None):
    """يُرجع (status, body_text, error). status = None عند فشل الاتصال."""
    request = urllib.request.Request(url)
    request.add_header("User-Agent", USER_AGENT)
    request.add_header("Accept", "*/*")
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            body = response.read(262144)
            return response.status, body.decode("utf-8", errors="replace"), None
    except urllib.error.HTTPError as error:
        return error.code, "", f"HTTP {error.code}"
    except Exception as error:  # timeout, DNS, TLS…
        return None, "", type(error).__name__


def looks_like_hls(text):
    return text.lstrip().startswith("#EXTM3U")


def first_variant(playlist_text, base_url):
    """يستخرج أول رابط جودة من قائمة master."""
    lines = [line.strip() for line in playlist_text.splitlines()]
    for index, line in enumerate(lines):
        if line.startswith("#EXT-X-STREAM-INF") and index + 1 < len(lines):
            for candidate in lines[index + 1:]:
                if candidate and not candidate.startswith("#"):
                    return urllib.parse.urljoin(base_url, candidate)
    return None


def check(channel):
    """يفحص قناة واحدة ويُرجع (status, detail)."""
    url = channel.get("url", "")
    if not url.startswith("http"):
        return "dead", "رابط غير صالح"

    headers = {}
    if channel.get("userAgent"):
        headers["User-Agent"] = channel["userAgent"]
    if channel.get("referer"):
        headers["Referer"] = channel["referer"]

    code, body, error = fetch(url, headers)

    if code in GEO_CODES:
        return "geo", f"HTTP {code}"
    if code is None:
        return "dead", error or "لا استجابة"
    if code != 200:
        return "dead", error or f"HTTP {code}"
    if not looks_like_hls(body):
        return "dead", "الردّ ليس قائمة HLS"

    # قائمة جودات: نتأكّد أن إحدى الجودات تعمل وفيها مقاطع فعلية
    if "#EXT-X-STREAM-INF" in body:
        variant = first_variant(body, url)
        if not variant:
            return "dead", "قائمة جودات بلا روابط"
        code2, body2, error2 = fetch(variant, headers)
        if code2 in GEO_CODES:
            return "geo", f"الجودة HTTP {code2}"
        if code2 != 200 or not looks_like_hls(body2):
            return "dead", error2 or "الجودة لا تعمل"
        if "#EXTINF" not in body2:
            return "dead", "لا مقاطع في الجودة"
        return "ok", "قائمة جودات"

    if "#EXTINF" not in body:
        return "dead", "قائمة بلا مقاطع"
    return "ok", "بث مباشر"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report")
    args = parser.parse_args()

    with open(args.candidates, encoding="utf-8") as handle:
        candidates = json.load(handle)

    kept, rows = [], []
    counts = {"ok": 0, "geo": 0, "dead": 0}

    # الفحص متوازٍ: مئة رابط بمهلة ١٥ ثانية لا تُفحص بالتتابع في وقت معقول
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(check, candidates))

    survivors = []
    for channel, (status, detail) in zip(candidates, results):
        counts[status] += 1
        rows.append((status, channel.get("name", "?"), channel.get("group", ""), detail))
        print(f"[{status:4}] {channel.get('name')} — {detail}", flush=True)

        if status == "dead":
            continue

        entry = {key: value for key, value in channel.items() if value is not None}
        if status == "geo":
            note = entry.get("note", "")
            warning = "قد تعمل داخل المنطقة فقط — تعذّر التحقّق من خارجها."
            entry["note"] = f"{note} {warning}".strip()
            entry["geoRestricted"] = True
        survivors.append((status, entry))

    # القناة الواحدة قد تصل بعدة روابط؛ نُبقي واحداً لكل اسم ونفضّل المؤكّد
    # على المحجوب جغرافياً.
    best = {}
    for status, entry in survivors:
        key = " ".join(entry.get("name", "").split()).casefold()
        current = best.get(key)
        if current is None or (current[0] == "geo" and status == "ok"):
            best[key] = (status, entry)

    kept = [entry for _, entry in best.values()]
    kept.sort(key=lambda entry: (GROUP_ORDER.get(entry.get("group"), 9),
                                 entry.get("name", "")))

    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(kept, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    if args.report:
        icons = {"ok": "✅", "geo": "🌍", "dead": "❌"}
        lines = [
            "## فحص قنوات كورة تايم",
            "",
            f"تعمل: **{counts['ok']}** · محجوبة جغرافياً: **{counts['geo']}** · "
            f"معطّلة: **{counts['dead']}** · المحفوظة في التطبيق: **{len(kept)}**",
            "",
            "| | القناة | الفئة | النتيجة |",
            "|---|---|---|---|",
        ]
        order = {"ok": 0, "geo": 1, "dead": 2}
        for status, name, group, detail in sorted(rows, key=lambda r: (order[r[0]], r[1])):
            lines.append(f"| {icons[status]} | {name} | {group} | {detail} |")
        with open(args.report, "w", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")

    print(f"\nكُتبت {len(kept)} قناة إلى {args.output}")
    # لا نُفشل المهمة بسبب قناة ميتة — القوائم المفتوحة تتغيّر باستمرار
    return 0


if __name__ == "__main__":
    sys.exit(main())
