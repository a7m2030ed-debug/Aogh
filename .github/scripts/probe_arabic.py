#!/usr/bin/env python3
"""يفحص المصادر العربية لجدول المباريات: هل تعطي بيانات تُقرأ آلياً؟

الطلب: «خذ الجدول من مصادر عربية». والسؤال الحقيقي ليس لغة الموقع بل
أمران: هل يعطي بيانات منظّمة (لا صفحة HTML تُكشط)، وهل يغطّي الدوريات
العربية فعلاً. هذا الفاحص يجيب عنهما بالقياس لا بالتقدير.

النتيجة تُكتب كما هي، سلبية كانت أو موجبة.
"""

import json
import pathlib
import re
import ssl
import sys
import urllib.error
import urllib.request
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parents[2]
REPORT = ROOT / "docs/arabic-sources-report.md"

UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/120 Mobile Safari/537.36")
TIMEOUT = 20

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

TODAY = date.today()
DMY = TODAY.strftime("%m/%d/%Y")
ISO = TODAY.isoformat()

# ما نبحث عنه: دليل على تغطية عربية حقيقية
ARAB_MARKERS = ["الهلال", "النصر", "الاتحاد", "الأهلي", "روشن", "الزمالك",
                "السد", "العين", "الترجي", "Al Hilal", "Al Nassr", "Al Ahly",
                "Saudi", "Roshn", "Egypt", "Qatar"]

CANDIDATES = [
    # واجهة يلا كورة التي يستعملها موقعهم نفسه
    ("يلا كورة — واجهة مركز المباريات",
     f"https://api.yallakora.com/api/MatchCenter/GetMatches?date={DMY}", "json"),
    ("يلا كورة — صفحة مركز المباريات",
     f"https://www.yallakora.com/match-center/?date={DMY}", "html"),

    # كووورة
    ("كووورة — الصفحة الرئيسية",
     "https://www.kooora.com/", "html"),

    # في الجول
    ("في الجول — المباريات",
     "https://www.filgoal.com/matches/", "html"),

    # الموقع الرسمي لدوري روشن
    ("دوري روشن — الموقع الرسمي",
     "https://spl.com.sa/ar/matches", "html"),
    ("دوري روشن — واجهة محتملة",
     "https://spl.com.sa/api/matches", "json"),

    # الاتحاد السعودي
    ("الاتحاد السعودي لكرة القدم",
     "https://saff.com.sa/ar", "html"),

    # مصادر مفتوحة تغطّي العرب — للمقارنة
    ("AllSportsAPI بلا مفتاح",
     f"https://apiv2.allsportsapi.com/football/?met=Fixtures&from={ISO}&to={ISO}", "json"),
    ("TheSportsDB — الدوري السعودي بالمعرّف",
     "https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=4419", "json"),
    ("OpenLigaDB (ألماني، للمقارنة فقط)",
     "https://api.openligadb.de/getmatchdata/bl1", "json"),
]


def fetch(url):
    request = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/json, text/html;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en;q=0.8",
    })
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT, context=CTX) as response:
            return response.status, response.read(600_000), None
    except urllib.error.HTTPError as error:
        return error.code, b"", None
    except Exception as error:
        return None, b"", type(error).__name__


def analyse(blob, kind):
    """يُرجع (عدد المباريات المقدَّر، أسماء عربية ظاهرة، ملاحظة)."""
    text = blob.decode("utf-8", "replace")
    hits = sorted({m for m in ARAB_MARKERS if m in text})

    if kind == "json":
        try:
            data = json.loads(text)
        except Exception:
            return None, hits, "ليس JSON"
        count = None
        for field in ("result", "data", "matches", "response", "events", "Result"):
            value = data.get(field) if isinstance(data, dict) else None
            if isinstance(value, list):
                count = len(value)
                break
            if isinstance(value, dict):
                for inner in value.values():
                    if isinstance(inner, list):
                        count = len(inner)
                        break
                if count is not None:
                    break
        if count is None and isinstance(data, list):
            count = len(data)
        return count, hits, "JSON"

    # HTML: نقدّر عدد المباريات من أنماط الوقت، وننبّه أن الكشط هشّ
    times = len(re.findall(r"\b\d{1,2}:\d{2}\b", text))
    return times or None, hits, "HTML — يحتاج كشطاً"


def main():
    lines = [
        "# المصادر العربية لجدول المباريات",
        "",
        f"فُحصت يوم {ISO}. السؤال ليس لغة الموقع بل: هل يعطي بيانات منظّمة",
        "تُقرأ آلياً، وهل يغطّي الدوريات العربية فعلاً.",
        "",
        "| المصدر | الحالة | النوع | عدد تقديري | أسماء عربية ظاهرة |",
        "|---|---|---|---|---|",
    ]

    for label, url, kind in CANDIDATES:
        status, blob, error = fetch(url)
        if status is None:
            lines.append(f"| {label} | تعذّر: {error} | — | — | — |")
            print(f"[تعذّر] {label}: {error}", flush=True)
            continue
        if status != 200:
            lines.append(f"| {label} | HTTP {status} | — | — | — |")
            print(f"[{status}] {label}", flush=True)
            continue

        count, hits, note = analyse(blob, kind)
        shown = "، ".join(hits[:6]) if hits else "—"
        lines.append(f"| {label} | ✅ 200 | {note} | {count if count is not None else '؟'} | {shown} |")
        print(f"[200] {label}: {note} count={count} hits={hits[:6]}", flush=True)

    lines += [
        "",
        "## ما يعنيه هذا",
        "",
        "- **JSON** يعني واجهة تُقرأ آلياً وتثبت نسبياً.",
        "- **HTML** يعني كشط صفحة: يتعطّل عند أي تغيير في التصميم، وغالباً",
        "  يخالف شروط الموقع — وهو ما رفضناه في حالة 365Scores.",
        "- عدد المباريات في صفوف HTML تقدير من أنماط الوقت، لا إحصاء دقيق.",
    ]

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nكُتب التقرير: {REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
