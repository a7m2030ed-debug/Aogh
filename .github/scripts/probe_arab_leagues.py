#!/usr/bin/env python3
"""هل تُغطّي نقاط «لكل دوري» في TheSportsDB الدوريات العربية بلا مفتاح؟

الفحص السابق جرّب نقطة «مباريات اليوم» فأعطت ثلاث مباريات هامشية، فاستنتجنا
أن المصدر لا يصلح. لكن ذلك يخصّ تلك النقطة وحدها — والنقاط التي تُسأل عن
دوري بعينه قد تسلك سلوكاً آخر.

إن صحّ ذلك فهو الحلّ الذي نبحث عنه: تغطية الدوريات العربية بلا أن يسجّل
المستخدم في أي خدمة. وإن لم يصحّ فالنتيجة تُكتب كما هي.
"""

import json
import pathlib
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parents[2]
REPORT = ROOT / "docs/arab-leagues-report.md"

KEY = "123"
BASE = f"https://www.thesportsdb.com/api/v1/json/{KEY}"
UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"
TIMEOUT = 15
PAUSE = 0.4          # المفتاح المجاني محدود المعدّل، فلا نُغرقه

# ضبط: الدوري الإنجليزي أغزر ما في المصدر. إن ردّ هو أيضاً بخمس عشرة
# مباراة للموسم فالرقم سقف المفتاح المجاني لا حدّ التغطية — وحينها لا
# يصلح المصدر لجدول يومي مهما كان البلد.
CONTROL = ("English Premier League", "4328")

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

COUNTRIES = ["Saudi Arabia", "Egypt", "Qatar", "United Arab Emirates",
             "Kuwait", "Jordan", "Morocco", "Tunisia", "Algeria", "Iraq",
             "Bahrain", "Oman"]

# الموسم يُكتب بصيغتين مختلفتين حسب الدوري، فنجرّب الاثنتين.
TODAY = date.today()
SEASONS = [f"{TODAY.year}-{TODAY.year + 1}", str(TODAY.year),
           f"{TODAY.year - 1}-{TODAY.year}"]


def get(url):
    """يُرجع (الحالة، الحمولة أو اسم الخطأ)."""
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT, context=CTX) as response:
            body = response.read().decode("utf-8", "replace")
        time.sleep(PAUSE)
        try:
            return response.status, json.loads(body)
        except json.JSONDecodeError:
            return response.status, None
    except urllib.error.HTTPError as error:
        time.sleep(PAUSE)
        return error.code, None
    except Exception as error:
        return None, type(error).__name__


def events(payload):
    """نقاط TheSportsDB تُرجع events=null حين لا تتوفّر للمفتاح المجاني."""
    if not isinstance(payload, dict):
        return []
    found = payload.get("events")
    return found if isinstance(found, list) else []


def main():
    lines = [
        "# هل تُغطّي TheSportsDB الدوريات العربية بنقاط «لكل دوري»؟",
        "",
        f"فُحصت يوم {TODAY.isoformat()} بالمفتاح المجاني `123`.",
        "",
        "الفحص السابق جرّب نقطة «مباريات اليوم» فأعطت ثلاث مباريات هامشية.",
        "هذا الفحص يسأل عن كل دوري عربي على حدة — وهو سؤال مختلف.",
        "",
    ]

    # ١) ما الدوريات المتاحة في كل بلد عربي؟
    leagues = []
    lines += ["## الدوريات المتاحة", "",
              "| البلد | الدوري | المعرّف |", "|---|---|---|"]
    for country in COUNTRIES:
        status, payload = get(
            f"{BASE}/search_all_leagues.php?c={country.replace(' ', '%20')}&s=Soccer")
        if status != 200 or not isinstance(payload, dict):
            reason = payload if isinstance(payload, str) else status
            lines.append(f"| {country} | تعذّر ({reason}) | — |")
            print(f"[تعذّر] {country}: {reason}", flush=True)
            continue
        found = payload.get("countries")
        found = found if isinstance(found, list) else []
        if not found:
            lines.append(f"| {country} | لا شيء | — |")
            print(f"{country}: لا دوريات", flush=True)
            continue
        # بلا سقف: الفحص الأول اقتطع ثلاثة لكل بلد فسقط دوري روشن نفسه.
        for item in found:
            name = item.get("strLeague") or "?"
            lid = item.get("idLeague")
            if not lid:
                continue
            leagues.append((country, name, lid))
            lines.append(f"| {country} | {name} | `{lid}` |")
        print(f"{country}: {len(found)} دوري", flush=True)

    leagues.append(("ضبط", CONTROL[0], CONTROL[1]))
    lines.append(f"| ضبط | {CONTROL[0]} | `{CONTROL[1]}` |")

    # ٢) هل تُرجع نقاط «لكل دوري» مباريات فعلاً؟
    lines += ["", "## هل تُرجع مباريات؟", "",
              "| الدوري | القادمة | السابقة | الموسم | مثال |",
              "|---|---|---|---|---|"]

    usable = 0
    control_season = 0
    for country, name, lid in leagues:
        upcoming = events(get(f"{BASE}/eventsnextleague.php?id={lid}")[1])
        past = events(get(f"{BASE}/eventspastleague.php?id={lid}")[1])

        seasonal, season_used = [], ""
        for season in SEASONS:
            seasonal = events(get(f"{BASE}/eventsseason.php?id={lid}&s={season}")[1])
            if seasonal:
                season_used = season
                break

        sample = ""
        pool = upcoming or seasonal or past
        if pool:
            first = pool[0]
            sample = (f"{first.get('strHomeTeam', '?')} × {first.get('strAwayTeam', '?')}"
                      f" — {first.get('dateEvent', '?')}")
        if upcoming and country != "ضبط":
            usable += 1
        if country == "ضبط":
            control_season = len(seasonal)

        season_cell = f"{len(seasonal)}" + (f" ({season_used})" if season_used else "")
        lines.append(f"| {name} | {len(upcoming)} | {len(past)} | {season_cell} | {sample or '—'} |")
        print(f"{name} ({lid}): قادمة={len(upcoming)} سابقة={len(past)} "
              f"موسم={len(seasonal)}{' ' + season_used if season_used else ''}", flush=True)

    arab_count = max(len(leagues) - 1, 0)
    verdict = (
        f"**{usable}** من **{arab_count}** دوري عربي ردّ بمباريات قادمة."
        if arab_count else "لم يُعثر على أي دوري عربي في المصدر."
    )

    # الضبط يفصل بين «لا تغطية عربية» و«سقف على كل شيء».
    if control_season and control_season <= 20:
        control_note = (
            f"وصفّ الضبط حاسم: الدوري الإنجليزي — أغزر ما في المصدر — ردّ بـ"
            f"**{control_season}** مباراة للموسم كلّه. فالرقم **سقف المفتاح"
            " المجاني** لا حدّ التغطية، ولا يصلح المصدر لجدول يومي مهما كان"
            " البلد."
        )
    elif control_season:
        control_note = (
            f"وصفّ الضبط: الدوري الإنجليزي ردّ بـ**{control_season}** مباراة"
            " للموسم — أي لا سقف عامّ، والنقص في التغطية العربية وحدها."
        )
    else:
        control_note = (
            "وصفّ الضبط ردّ بصفر أيضاً — أي أن نقاط «لكل دوري» محجوبة عن"
            " المفتاح المجاني أصلاً، لا أن التغطية العربية ناقصة."
        )

    lines += [
        "",
        "## الخلاصة",
        "",
        verdict,
        "",
        control_note,
        "",
        "عمود «القادمة» هو الحاسم: إن كان أكبر من صفر لعدّة دوريات فالمصدر",
        "يصلح لبناء جدول عربي **بلا مفتاح من المستخدم**، ويكفي أن نسأل عن كل",
        "دوري مختار بدل نقطة «مباريات اليوم» العامّة. وإن كان صفراً في كلّها",
        "فالنقطة محجوزة للمشتركين، ويبقى API-Football عبر الوسيط هو الطريق.",
    ]

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n{verdict}")
    print(f"كُتب: {REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
