#!/usr/bin/env python3
"""يفحص ماذا يُرجع مصدر المباريات فعلاً، بدل التخمين في سبب غياب الدوريات.

الشكوى: دوري روشن والدوريات الكبرى لا تظهر في تبويب المباريات. الاحتمالات
ثلاثة ولا يفرّق بينها إلا القياس:
  أ) نقطة «مباريات اليوم» تُرجع مجموعة جزئية لا تشمل هذه الدوريات
  ب) الدوريات موجودة لكن بأسماء لا تطابق ما نبحث عنه
  ج) لا مباريات في هذه الأيام أصلاً (خارج الموسم)

نفحص أيضاً نقاط «لكل دوري» لأنها البديل إن ثبت (أ).
"""

import json
import pathlib
import ssl
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[2]
REPORT = ROOT / "docs/matches-report.md"

KEY = "123"
BASE = f"https://www.thesportsdb.com/api/v1/json/{KEY}"
UA = "KoraTime/1.0 (probe)"
TIMEOUT = 20

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# ما يهمّ المستخدم، بالاسم كما يكتبه المصدر غالباً
WANTED = [
    "Saudi", "Premier League", "La Liga", "Serie A",
    "Bundesliga", "Ligue 1", "Champions League",
]


def api(path):
    url = f"{BASE}/{path}"
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=TIMEOUT, context=CTX) as response:
        return json.loads(response.read().decode("utf-8", "replace"))


def day_leagues(day):
    """الدوريات التي تُرجعها نقطة «مباريات اليوم»."""
    try:
        data = api(f"eventsday.php?d={day}&s=Soccer")
    except Exception as error:
        return None, type(error).__name__
    events = data.get("events")
    if not isinstance(events, list):
        return [], "لا مباريات"
    return [e.get("strLeague") or "?" for e in events], ""


def find_leagues():
    """يبحث عن معرّفات الدوريات المطلوبة في فهرس المصدر."""
    try:
        data = api("all_leagues.php")
    except Exception as error:
        return {}, type(error).__name__
    found = {}
    for league in data.get("leagues") or []:
        name = league.get("strLeague") or ""
        if league.get("strSport") != "Soccer":
            continue
        for want in WANTED:
            if want.lower() in name.lower():
                found.setdefault(name, league.get("idLeague"))
    return found, ""


def next_events(league_id):
    try:
        data = api(f"eventsnextleague.php?id={league_id}")
    except Exception as error:
        return None, type(error).__name__
    events = data.get("events")
    if not isinstance(events, list):
        return [], "لا مباريات قادمة"
    return events, ""


def main():
    lines = ["# فحص مصدر المباريات", ""]

    # ١) ماذا تُرجع نقطة «مباريات اليوم» على مدى أسبوع
    lines += ["## نقطة «مباريات اليوم»", "",
              "| اليوم | عدد المباريات | عدد الدوريات | من الدوريات المطلوبة |",
              "|---|---|---|---|"]
    today = date.today()
    all_seen = Counter()
    for offset in range(-1, 6):
        day = (today + timedelta(days=offset)).isoformat()
        leagues, note = day_leagues(day)
        if leagues is None:
            lines.append(f"| {day} | خطأ: {note} | — | — |")
            continue
        all_seen.update(leagues)
        hits = sorted({w for w in WANTED
                       for lg in leagues if w.lower() in lg.lower()})
        lines.append(
            f"| {day} | {len(leagues)} | {len(set(leagues))} | "
            f"{'، '.join(hits) if hits else '**لا شيء**'} |"
        )

    lines += ["", "### أكثر الدوريات ورودًا في الأسبوع", ""]
    for name, count in all_seen.most_common(15):
        lines.append(f"- {name} — {count}")
    if not all_seen:
        lines.append("- لم تُرجع النقطة أي مباراة طوال الأسبوع")

    # ٢) هل الدوريات موجودة في الفهرس أصلاً؟
    found, error = find_leagues()
    lines += ["", "## الدوريات في فهرس المصدر", ""]
    if error:
        lines.append(f"تعذّر جلب الفهرس: {error}")
    elif not found:
        lines.append("**لم يُعثر على أي من الدوريات المطلوبة في الفهرس.**")
    else:
        lines += ["| الدوري | المعرّف | مباريات قادمة |", "|---|---|---|"]
        for name, league_id in sorted(found.items()):
            events, note = next_events(league_id)
            count = "خطأ" if events is None else (str(len(events)) or note)
            if events is not None and not events:
                count = f"0 ({note})"
            lines.append(f"| {name} | {league_id} | {count} |")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("الدوريات المطلوبة الموجودة في الفهرس:", len(found))
    print("مباريات الأسبوع من نقطة اليوم:", sum(all_seen.values()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
