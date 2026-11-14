#!/usr/bin/env python3
"""يبحث عن مصدر مباريات يغطّي دوري روشن والدوريات الكبرى بلا تسجيل.

ثبت أن مفتاح TheSportsDB التجريبي المشترك يُرجع ثلاث مباريات في اليوم من
دوريات هامشية. قبل أن نطلب من المستخدم تسجيلاً، نجرّب البدائل المجانية
ونثبت أيّها يعمل بلا مفتاح — والنتيجة تُكتب كما هي، سلبية كانت أو موجبة.
"""

import json
import pathlib
import ssl
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[2]
REPORT = ROOT / "docs/sources-report.md"

UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"
TIMEOUT = 20

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

TODAY = date.today().isoformat()
WEEK = (date.today() + timedelta(days=7)).isoformat()


def fetch(url, headers=None):
    request = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT, context=CTX) as response:
            return response.status, response.read(400_000)
    except urllib.error.HTTPError as error:
        return error.code, error.read(4000)
    except Exception as error:
        return None, type(error).__name__.encode()


def count_events(blob, keys):
    """يعدّ العناصر ويبحث عن ذكر للدوريات المهمّة."""
    try:
        data = json.loads(blob.decode("utf-8", "replace"))
    except Exception:
        return None, []
    text = blob.decode("utf-8", "replace").lower()
    hits = [k for k in keys if k.lower() in text]
    for field in ("events", "matches", "response", "data", "result"):
        value = data.get(field) if isinstance(data, dict) else None
        if isinstance(value, list):
            return len(value), hits
    return (len(data) if isinstance(data, list) else 0), hits


WANTED = ["Saudi", "Hilal", "Nassr", "Ittihad",
          "Premier League", "La Liga", "Bundesliga", "Serie A"]

CANDIDATES = [
    # مفاتيح TheSportsDB التجريبية المتداولة
    ("TheSportsDB key=123 (اليوم)",
     f"https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d={TODAY}&s=Soccer", None),
    ("TheSportsDB key=1 (اليوم)",
     f"https://www.thesportsdb.com/api/v1/json/1/eventsday.php?d={TODAY}&s=Soccer", None),
    ("TheSportsDB key=3 (اليوم)",
     f"https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d={TODAY}&s=Soccer", None),
    # الدوري السعودي في فهرس TheSportsDB
    ("TheSportsDB بحث: الدوري السعودي",
     "https://www.thesportsdb.com/api/v1/json/123/search_all_leagues.php?c=Saudi%20Arabia&s=Soccer", None),
    # football-data.org بلا مفتاح
    ("football-data.org بلا مفتاح",
     "https://api.football-data.org/v4/competitions/PL/matches", None),
    # API-Football بلا مفتاح
    ("API-Football بلا مفتاح",
     f"https://v3.football.api-sports.io/fixtures?date={TODAY}", None),
    # openligadb (ألماني، مفتوح تماماً) — للمقارنة فقط
    ("OpenLigaDB (ألماني، بلا مفتاح)",
     "https://api.openligadb.de/getmatchdata/bl1", None),
    # Sofascore عبر واجهته العامة
    ("Sofascore (واجهة عامة غير رسمية)",
     f"https://api.sofascore.com/api/v1/sport/football/scheduled-events/{TODAY}", None),
]


def main():
    lines = [
        "# البحث عن مصدر مباريات بلا تسجيل",
        "",
        "ثبت أن مفتاح TheSportsDB المشترك يُرجع ثلاث مباريات يومياً من دوريات",
        "هامشية. هذه محاولة إثبات وجود بديل مجاني قبل طلب تسجيل من المستخدم.",
        "",
        "| المصدر | الحالة | عدد النتائج | ذكر الدوريات المهمّة |",
        "|---|---|---|---|",
    ]
    for label, url, headers in CANDIDATES:
        status, blob = fetch(url, headers)
        if status is None:
            lines.append(f"| {label} | تعذّر: {blob.decode()} | — | — |")
            continue
        if status != 200:
            lines.append(f"| {label} | HTTP {status} | — | — |")
            continue
        count, hits = count_events(blob, WANTED)
        lines.append(
            f"| {label} | ✅ 200 | {count if count is not None else 'ليس JSON'} | "
            f"{'، '.join(hits) if hits else '—'} |"
        )
        print(f"{label}: {status} count={count} hits={hits}")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
