#!/usr/bin/env python3
"""يجمع عناوين البثّ الحالية للقنوات الرياضية العربية من فهرس iptv-org المفتوح.

المشكلة التي يحلّها: عناوين البثّ المفتوح تتغيّر كل بضعة أشهر، وكتابتها يدوياً
يعني قائمة ميتة خلال أسابيع. فهرس iptv-org مجتمعي ويُحدَّث باستمرار، فنستعمله
«دفتر عناوين» فقط: نأخذ منه الروابط ثم نتحقّق من كل رابط بأنفسنا في
verify_channels.py، ولا ندخل التطبيق إلا ما ثبت أنه يعمل.

ملاحظة مهمّة: كون الرابط مفتوحاً لا يعني بالضرورة أنه بثّ رسمي مرخّص من
صاحب القناة. القنوات المشفّرة (بي إن، SSC، شاهد، TOD) غير موجودة أصلاً لأن
بثّها محمي بـ DRM.

التشغيل:
    python3 .github/scripts/discover_channels.py \
        --manual KoraTime/Tools/channels-candidates.json \
        --output merged-candidates.json
"""

import argparse
import json
import sys
import urllib.request

API_CHANNELS = "https://iptv-org.github.io/api/channels.json"
API_STREAMS = "https://iptv-org.github.io/api/streams.json"
TIMEOUT = 30

# الدول التي نأخذ قنواتها الرياضية
COUNTRIES = {
    "SA": "السعودية", "AE": "الإمارات", "QA": "قطر", "KW": "الكويت",
    "BH": "البحرين", "OM": "عُمان", "EG": "مصر", "IQ": "العراق",
    "JO": "الأردن", "LB": "لبنان", "MA": "المغرب", "DZ": "الجزائر",
    "TN": "تونس", "LY": "ليبيا", "SD": "السودان", "YE": "اليمن",
    "SY": "سوريا", "PS": "فلسطين", "MR": "موريتانيا",
}

# قنوات رياضية عالمية مفتوحة نضيفها ولو كانت خارج الدول أعلاه
EXTRA_KEYWORDS = ("red bull tv", "sport tv", "eurosport news", "olympic")

MAX_CHANNELS = 150


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "KoraTime/1.0"})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))


def wanted(channel):
    """هل هذه قناة رياضية تهمّنا؟"""
    if channel.get("closed") or channel.get("is_nsfw"):
        return False
    categories = channel.get("categories") or []
    if "sports" not in categories:
        return False
    if channel.get("country") in COUNTRIES:
        return True
    name = (channel.get("name") or "").lower()
    return any(keyword in name for keyword in EXTRA_KEYWORDS)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manual", required=True, help="المرشّحون المكتوبون يدوياً")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.manual, encoding="utf-8") as handle:
        manual = json.load(handle)

    try:
        channels = fetch_json(API_CHANNELS)
        streams = fetch_json(API_STREAMS)
    except Exception as error:
        print(f"تعذّر الوصول إلى الفهرس ({type(error).__name__}) — نكتفي بالمرشّحين اليدويين.")
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump(manual, handle, ensure_ascii=False, indent=2)
        return 0

    by_id = {channel["id"]: channel for channel in channels if wanted(channel)}
    print(f"قنوات رياضية مطابقة في الفهرس: {len(by_id)}")

    seen_urls = {entry.get("url") for entry in manual}
    discovered = []

    for stream in streams:
        channel_id = stream.get("channel")
        url = stream.get("url")
        if not channel_id or not url or url in seen_urls:
            continue
        channel = by_id.get(channel_id)
        if channel is None:
            continue
        if not url.startswith("http") or ".m3u8" not in url:
            continue

        seen_urls.add(url)
        country = COUNTRIES.get(channel.get("country"), "دولية")
        entry = {
            "name": channel.get("name") or channel_id,
            "group": "رياضة",
            "url": url,
            "note": f"قناة مفتوحة — {country}",
        }
        if channel.get("logo"):
            entry["logo"] = channel["logo"]
        if stream.get("user_agent"):
            entry["userAgent"] = stream["user_agent"]
        if stream.get("referrer"):
            entry["referer"] = stream["referrer"]
        discovered.append(entry)

    # قناة واحدة قد يكون لها عدة روابط؛ نكتفي بأول رابطين لكل اسم
    per_name = {}
    trimmed = []
    for entry in discovered:
        count = per_name.get(entry["name"], 0)
        if count >= 2:
            continue
        per_name[entry["name"]] = count + 1
        trimmed.append(entry)

    trimmed.sort(key=lambda entry: entry["name"])
    trimmed = trimmed[:MAX_CHANNELS]

    merged = manual + trimmed
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(merged, handle, ensure_ascii=False, indent=2)

    print(f"مرشّحون يدويون: {len(manual)} · من الفهرس: {len(trimmed)} · المجموع: {len(merged)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
