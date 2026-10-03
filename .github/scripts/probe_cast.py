#!/usr/bin/env python3
"""هل تقبل خوادم القنوات التشغيل من التلفزيون؟ مستقبل Cast الافتراضي متصفّح،
فيحتاج ترويسة Access-Control-Allow-Origin على القائمة وعلى المقاطع."""
import json, urllib.parse, urllib.request, urllib.error, concurrent.futures

ORIGIN = "https://www.gstatic.com"

def get(url, headers):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (CrKey armv7l 1.5.16041) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.0 Safari/537.36", "Origin": ORIGIN, **headers})
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.status, r.headers.get("Access-Control-Allow-Origin"), r.geturl(), r.read(200000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Access-Control-Allow-Origin"), url, ""
    except Exception as e:
        return None, None, url, ""

def check(c):
    h = {}
    if c.get("referer"): h["Referer"] = c["referer"]
    st, acao, final, body = get(c["url"], h)
    seg_acao = None
    lines = [l.strip() for l in body.splitlines() if l.strip() and not l.startswith("#")]
    if lines:
        st2, a2, f2, b2 = get(urllib.parse.urljoin(final, lines[0]), h)
        seg_acao = a2
        lines2 = [l.strip() for l in b2.splitlines() if l.strip() and not l.startswith("#")]
        if lines2 and ".m3u8" in lines[0]:
            st3, a3, _, _ = get(urllib.parse.urljoin(f2, lines2[-1]), h)
            seg_acao = a3
    needs_headers = bool(c.get("referer") or c.get("userAgent"))
    ok = bool(acao) and bool(seg_acao) and not needs_headers
    return ok, c["name"], c["group"], st, acao, seg_acao, needs_headers

chs = json.load(open("KoraTime/KoraTime/Resources/channels.json"))
with concurrent.futures.ThreadPoolExecutor(16) as p:
    res = list(p.map(check, chs))
print(f"CASTABLE {sum(r[0] for r in res)}/{len(res)}")
for r in sorted(res, key=lambda r: (not r[0], r[2], r[1])):
    print(("OK  " if r[0] else "NO  "), r[1], "|", r[2], "| status", r[3], "| acao", r[4], "| seg", r[5], "| hdrs", r[6])
