#!/usr/bin/env python3
"""فحص قنوات الكأس: الروابط الحالية، وما يقترحه فهرس iptv-org، مع ترويسات وبدونها."""
import json, urllib.parse, urllib.request, urllib.error

UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"

def get(url, headers=None, limit=4000):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.geturl(), r.read(limit).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, url, e.read(400).decode("utf-8", "replace")
    except Exception as e:
        return None, url, repr(e)

ours = json.load(open("KoraTime/KoraTime/Resources/channels.json"))
urls = [(c["name"], c["url"]) for c in ours if "alkass" in c["url"]]

streams = json.loads(get("https://iptv-org.github.io/api/streams.json", limit=10**9)[2])
for s in streams:
    blob = json.dumps(s).lower()
    if "alkass" in blob or "kass" in (s.get("channel") or "").lower():
        print("IPTV-ORG:", json.dumps(s, ensure_ascii=False))
        urls.append((s.get("channel") or s.get("title") or "?", s["url"]))

variants = [
    ("plain", {}),
    ("shoof-referer", {"Referer": "https://shoof.alkass.net/", "Origin": "https://shoof.alkass.net"}),
    ("alkass-referer", {"Referer": "https://www.alkass.net/", "Origin": "https://www.alkass.net"}),
]
seen = set()
for name, url in urls:
    if url in seen:
        continue
    seen.add(url)
    for label, h in variants:
        status, final, body = get(url, h)
        head = body.strip().replace("\n", " | ")[:300]
        print(f"[{name}] {label} -> {status} {final}\n    {head}")
        if status == 200 and body.lstrip().startswith("#EXTM3U"):
            # جرّب أول قائمة فرعية
            for line in body.splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    sub = urllib.parse.urljoin(final, line)
                    s2, f2, b2 = get(sub, h)
                    print(f"    variant {s2} {sub[:160]} :: {b2.strip()[:160]!r}")
                    break
