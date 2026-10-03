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

# أوروبا: قنواتها الرياضية المفتوحة في الفهرس تُجمع في فئة مستقلة. الكبرى
# منها (سكاي، كانال+، DAZN، يوروسبورت) مدفوعة ومشفّرة فلن تظهر أصلاً، وما
# يصل هو المجاني على الهواء — والفاحص يُسقط منه المحجوب جغرافياً.
EUROPE = {
    "GB": "بريطانيا", "IE": "أيرلندا", "FR": "فرنسا", "DE": "ألمانيا",
    "AT": "النمسا", "CH": "سويسرا", "IT": "إيطاليا", "ES": "إسبانيا",
    "PT": "البرتغال", "NL": "هولندا", "BE": "بلجيكا", "LU": "لوكسمبورغ",
    "DK": "الدنمارك", "SE": "السويد", "NO": "النرويج", "FI": "فنلندا",
    "IS": "آيسلندا", "PL": "بولندا", "CZ": "التشيك", "SK": "سلوفاكيا",
    "HU": "المجر", "RO": "رومانيا", "BG": "بلغاريا", "GR": "اليونان",
    "CY": "قبرص", "TR": "تركيا", "HR": "كرواتيا", "RS": "صربيا",
    "SI": "سلوفينيا", "BA": "البوسنة", "ME": "الجبل الأسود",
    "MK": "مقدونيا الشمالية", "AL": "ألبانيا", "XK": "كوسوفو",
    "UA": "أوكرانيا", "MD": "مولدوفا", "LT": "ليتوانيا", "LV": "لاتفيا",
    "EE": "إستونيا", "MT": "مالطا", "AD": "أندورا", "MC": "موناكو",
    "SM": "سان مارينو",
}
EUROPE_GROUP = "رياضة أوروبية"

# قنوات رياضية عالمية مفتوحة نضيفها ولو كانت خارج الدول أعلاه
EXTRA_KEYWORDS = ("red bull tv", "sport tv", "eurosport news", "olympic",
                  "thmanyah", "ثمانية")

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


def group_for(channel):
    """فئة القناة في التطبيق إن كانت قناة رياضية تهمّنا، وإلا None."""
    if channel.get("closed") or channel.get("is_nsfw"):
        return None
    categories = channel.get("categories") or []
    if "sports" not in categories:
        return None
    country = channel.get("country")
    if country in COUNTRIES:
        return "رياضة"
    name = (channel.get("name") or "").lower()
    if any(keyword in name for keyword in EXTRA_KEYWORDS):
        return "رياضة"
    if country in EUROPE:
        return EUROPE_GROUP
    return None


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

    by_id = {}
    group_by_id = {}
    for channel in channels:
        group = group_for(channel)
        if group:
            by_id[channel["id"]] = channel
            group_by_id[channel["id"]] = group
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
        code = channel.get("country")
        country = COUNTRIES.get(code) or EUROPE.get(code) or "دولية"
        entry = {
            "name": arabic_name(channel.get("name") or channel_id),
            "group": group_by_id[channel_id],
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

    # السقف لكل فئة على حدة: قنوات أوروبا أكثر عدداً، وسقف مشترك كان
    # سيُقصي القنوات العربية من القائمة.
    trimmed.sort(key=lambda entry: entry["name"])
    capped, per_group = [], {}
    for entry in trimmed:
        count = per_group.get(entry["group"], 0)
        if count >= MAX_CHANNELS:
            continue
        per_group[entry["group"]] = count + 1
        capped.append(entry)
    trimmed = capped

    merged = manual + trimmed
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(merged, handle, ensure_ascii=False, indent=2)

    print(f"مرشّحون يدويون: {len(manual)} · من الفهرس: {len(trimmed)} · المجموع: {len(merged)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
