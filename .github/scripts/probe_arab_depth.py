#!/usr/bin/env python3
"""هل النقص في التغطية العربية أم في معدّل المفتاح المجاني؟

المسح العريض أعطى نمطاً مريباً: أوّل أربعة دوريات تردّ بمباريات، وكل ما
بعدها أصفار — في التشغيلين كليهما، وبترتيب مختلف. وهذا شكل حدّ المعدّل
لا شكل نقص التغطية. وقد وضعتُ صفّ الضبط آخر الجدول فردّ بصفر، فأوحى
باستنتاج معكوس.

فهذا الفاحص يعزل السببين: دوريات قليلة مختارة، ومهلة كافية بينها، وإعادة
محاولة عند الفراغ. الصفر بعد إعادة المحاولة صفر حقيقي. والضبط أوّلاً لا
آخراً، حيث الشروط متكافئة.
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
REPORT = ROOT / "docs/arab-fixtures-report.md"

BASE = "https://www.thesportsdb.com/api/v1/json/123"
UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"
TIMEOUT = 20
PAUSE = 3.0          # مهلة سخيّة: المقصود قياس التغطية لا اختبار الحدّ
RETRY_WAIT = 12.0    # الفراغ قد يكون حدّ معدّل، فننتظر ونعيد مرّة

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# الضبط أوّلاً: أغزر دوري في المصدر، حين يكون المفتاح في أفضل حالاته.
LEAGUES = [
    ("ضبط — الدوري الإنجليزي", "4328"),
    # ٤٦٦٨ من فهرس المصدر نفسه، لا من تخمين. الفاحص الأوّل جرّب ٤٤١٩.
    ("دوري روشن السعودي", "4668"),
    ("دوري يلو السعودي", "5627"),
    ("الدوري المصري الممتاز", "4829"),
    ("دوري نجوم قطر", "4663"),
    ("دوري أدنوك الإماراتي", "4678"),
    ("الدوري المغربي", "4520"),
    ("الدوري التونسي", "4828"),
    ("الدوري الجزائري", "4753"),
    ("الدوري العراقي", "5056"),
]


def get(url):
    """يُرجع (الحالة، الحمولة)."""
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT, context=CTX) as response:
            body = response.read().decode("utf-8", "replace")
        try:
            return response.status, json.loads(body)
        except json.JSONDecodeError:
            return response.status, None
    except urllib.error.HTTPError as error:
        return error.code, None
    except Exception as error:
        return None, type(error).__name__


def fixtures(league_id):
    """المباريات القادمة، مع إعادة محاولة واحدة عند الفراغ.

    يُرجع (القائمة، الحالة، أأُعيدت المحاولة).
    """
    url = f"{BASE}/eventsnextleague.php?id={league_id}"
    status, payload = get(url)
    found = (payload or {}).get("events") if isinstance(payload, dict) else None
    if isinstance(found, list) and found:
        return found, status, False

    # الفراغ محتمل أن يكون حدّ معدّل لا نقص بيانات — نتحقّق.
    time.sleep(RETRY_WAIT)
    status, payload = get(url)
    found = (payload or {}).get("events") if isinstance(payload, dict) else None
    return (found if isinstance(found, list) else []), status, True


def main():
    lines = [
        "# تغطية الدوريات العربية بعد عزل حدّ المعدّل",
        "",
        f"فُحصت يوم {date.today().isoformat()} بالمفتاح المجاني `123`.",
        "",
        "المسح العريض أعطى نمطاً مريباً: أوّل أربعة دوريات تردّ، وكل ما بعدها",
        "أصفار — وهذا شكل حدّ المعدّل لا نقص التغطية. هنا دوريات قليلة، ومهلة",
        f"{PAUSE:.0f} ثوانٍ بينها، وإعادة محاولة بعد {RETRY_WAIT:.0f} ثانية عند",
        "الفراغ. والضبط أوّلاً لا آخراً.",
        "",
        "| الدوري | المباريات القادمة | الحالة | أُعيدت المحاولة | أقرب مباراة |",
        "|---|---|---|---|---|",
    ]

    covered = 0
    arab_total = 0
    control_count = 0
    for label, league_id in LEAGUES:
        found, status, retried = fixtures(league_id)
        if label.startswith("ضبط"):
            control_count = len(found)
        else:
            arab_total += 1
            if found:
                covered += 1

        sample = "—"
        if found:
            first = found[0]
            sample = (f"{first.get('strHomeTeam', '?')} × {first.get('strAwayTeam', '?')}"
                      f" — {first.get('dateEvent', '?')}")

        lines.append(f"| {label} | {len(found)} | {status} | "
                     f"{'نعم' if retried else 'لا'} | {sample} |")
        print(f"{label}: {len(found)} مباراة (حالة={status}"
              f"{'، بعد إعادة' if retried else ''}) {sample}", flush=True)
        time.sleep(PAUSE)

    # الضبط يفصل «المصدر لا يعرف الدوريات العربية» عن «المفتاح المجاني
    # يقصّ الردّ». وهذا فرق يقلب الاستنتاج رأساً على عقب.
    if control_count and control_count <= 2 and covered:
        reading = (
            f"والضبط يحسم التفسير: الدوري الإنجليزي — أكثر دوري تغطيةً في"
            f" الدنيا — ردّ هو أيضاً بـ**{control_count}** مباراة. فالرقم سقف"
            " المفتاح المجاني لا حدّ التغطية.\n\n"
            "أي أن المصدر **يعرف الدوريات العربية ويحمل مبارياتها الجارية**،"
            " لكن المفتاح المجاني يعطي المباراة القادمة الواحدة لكل دوري. وهذا"
            " لا يبني تبويب مباريات: عرضُ يومٍ بعد ثلاثة أيام يحتاج كل مباريات"
            " ذلك اليوم، لا أقربَ مباراة في كل دوري."
        )
    elif covered:
        reading = (
            f"والضبط ردّ بـ**{control_count}** مباراة، فلا سقف عامّاً على الردّ."
            " والأرقام في الصفوف العربية هي التغطية الحقيقية."
        )
    else:
        reading = (
            "ولم يردّ أي دوري عربي بمباريات حتى بعد إعادة المحاولة، فالنقص في"
            " التغطية نفسها لا في المعدّل."
        )

    lines += [
        "",
        "## الخلاصة",
        "",
        f"**{covered}** من **{arab_total}** دوري عربي ردّ بمباريات قادمة بعد"
        " عزل حدّ المعدّل.",
        "",
        reading,
    ]

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n{covered}/{arab_total} دوري عربي مغطّى")
    print(f"كُتب: {REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
