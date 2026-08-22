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
API_LOGOS = "https://iptv-org.github.io/api/logos.json"
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

# الفهرس بالإنجليزية والتطبيق عربي — نعرّب ما نعرفه ونترك الباقي كما هو
ARABIC_NAMES = {
    "alkass one": "الكأس ١",
    "alkass two": "الكأس ٢",
    "alkass three": "الكأس ٣",
    "alkass four": "الكأس ٤",
    "alkass five": "الكأس ٥",
    "alkass six": "الكأس ٦",
    "alkass seven": "الكأس ٧",
    "alkass shoof": "الكأس شوف",
    "alkass shoof 2": "الكأس شوف ٢",
    "arryadia": "الرياضية المغربية",
    "ktv sport": "الكويت الرياضية",
    "ktv sport plus": "الكويت الرياضية بلس",
    "bahrain sports 1": "البحرين الرياضية ١",
    "bahrain sports 2": "البحرين الرياضية ٢",
    "jordan sport": "الأردن الرياضية",
    "oman sports tv": "عُمان الرياضية",
    "al iraqia sport": "العراقية الرياضية",
    "el-heddaf tv": "الهدّاف",
    "sharjah sports": "الشارقة الرياضية",
    "dubai sports": "دبي الرياضية",
    "dubai racing": "دبي ريسينج",
    "abu dhabi sports 1": "أبوظبي الرياضية ١",
    "abu dhabi sports 2": "أبوظبي الرياضية ٢",
    "ad sports 1": "أبوظبي الرياضية ١",
    "ad sports 2": "أبوظبي الرياضية ٢",
    "saudi sports": "السعودية الرياضية",
    "libya sport": "ليبيا الرياضية",
    "tunisia national 2": "الوطنية التونسية ٢",
    "olympic channel": "القناة الأولمبية",
    "red bull tv": "ريد بُل",
}


def arabic_name(name):
    return ARABIC_NAMES.get(name.strip().lower(), name)


def build_logo_index(logos):
    """channel_id -> أفضل شعار متاح. الفهرس نقل الشعارات إلى ملف مستقل،
    فنقرأه دفاعياً: أي تغيّر في شكله يعني شعارات أقل، لا انهياراً."""
    preferred = {"PNG": 0, "SVG": 1, "WEBP": 2, "JPEG": 3}
    best = {}
    if not isinstance(logos, list):
        return best
    for logo in logos:
        if not isinstance(logo, dict):
            continue
        channel_id = logo.get("channel")
        url = logo.get("url")
        if not channel_id or not isinstance(url, str) or not url.startswith("http"):
            continue
        rank = (preferred.get((logo.get("format") or "").upper(), 9),
                -(logo.get("width") or 0))
        current = best.get(channel_id)
        if current is None or rank < current[0]:
            best[channel_id] = (rank, url)
    return {key: value[1] for key, value in best.items()}


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

    try:
        logo_by_id = build_logo_index(fetch_json(API_LOGOS))
        print(f"شعارات متاحة: {len(logo_by_id)}")
    except Exception as error:
        print(f"تعذّر جلب الشعارات ({type(error).__name__}) — تُعرض الأحرف الأولى بدلاً منها.")
        logo_by_id = {}

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
            "name": arabic_name(channel.get("name") or channel_id),
            "group": "رياضة",
            "url": url,
            "note": f"قناة مفتوحة — {country}",
        }
        logo = channel.get("logo") or logo_by_id.get(channel_id)
        if logo:
            entry["logo"] = logo
        if stream.get("user_agent"):
            entry["userAgent"] = stream["user_agent"]
        if stream.get("referrer"):
            entry["referer"] = stream["referrer"]
        discovered.append(entry)

    # قناة واحدة قد يكون لها عدة روابط؛ نُبقي ثلاثة كحد أقصى ليختار الفاحص
    # منها الشغّال، ثم يزيل التكرار بعد الفحص.
    per_name = {}
    trimmed = []
    for entry in discovered:
        count = per_name.get(entry["name"], 0)
        if count >= 3:
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
