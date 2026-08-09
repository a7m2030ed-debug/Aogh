#!/usr/bin/env python3
"""Generate single.html — the one-branch page — from index.html.

The two pages share every line of logic; they differ only in a mode flag and
in which template is embedded (the single-branch one carries a NO SHOW column
in its doctor table). Regenerate after any change to index.html:

    python3 build_single.py
"""
import base64, re, sys
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "index.html"
DST = ROOT / "single.html"
TPL = ROOT / "template" / "Cluster2_Daily_Report_SINGLE_Template.pptx"

def main() -> int:
    html = SRC.read_text(encoding="utf-8")
    if not TPL.exists():
        print(f"missing template: {TPL}", file=sys.stderr)
        return 1

    html, n = re.subn(r"const MODE = \{ single: false \};",
                      "const MODE = { single: true };", html, count=1)
    if n != 1:
        print("mode flag not found in index.html", file=sys.stderr)
        return 1

    b64 = base64.b64encode(TPL.read_bytes()).decode()
    html, n = re.subn(r'(const BUILTIN_TPL = ")[A-Za-z0-9+/=]*(";)',
                      lambda m: m.group(1) + b64 + m.group(2), html, count=1)
    if n != 1:
        print("embedded template not found in index.html", file=sys.stderr)
        return 1

    html = html.replace("<title>مُعبِّئ التقرير اليومي — قالب PowerPoint + إكسل</title>",
                        "<title>تقرير الفرع اليومي — فرع واحد + No Show</title>", 1)

    DST.write_text(html, encoding="utf-8")
    print(f"wrote {DST.name}: {len(html.encode()):,} bytes (template {TPL.stat().st_size:,} bytes)")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
