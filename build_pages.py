#!/usr/bin/env python3
"""Generate the sibling pages from index.html.

Every page shares index.html line for line; they differ only in the mode flag,
the embedded template and the title. Regenerate after any change to index.html:

    python3 build_pages.py
"""
import base64, re, sys
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "index.html"
TPL = ROOT / "template"

PAGES = [
    {
        "out": "single.html",
        "template": "Cluster2_Daily_Report_SINGLE_Template.pptx",
        "single": True,
        "title": "تقرير الفرع اليومي — فرع واحد + No Show",
    },
    {
        "out": "cluster6.html",
        "template": "Cluster_SIX_Branches_Template.pptx",
        "single": False,
        "title": "التقرير اليومي — ستة فروع + No Show",
    },
    {
        "out": "khobar.html",
        "template": "Cluster5_AlKhobar_Template.pptx",
        "single": False,
        "title": "التقرير اليومي — خمسة فروع (Al Khobar)",
    },
]

SRC_TITLE = "<title>مُعبِّئ التقرير اليومي — قالب PowerPoint + إكسل أو PDF</title>"

def build(page: dict, html: str) -> int:
    tpl = TPL / page["template"]
    if not tpl.exists():
        print(f"missing template: {tpl}", file=sys.stderr)
        return 1

    out, n = re.subn(r"const MODE = \{ single: false \};",
                     f"const MODE = {{ single: {str(page['single']).lower()} }};", html, count=1)
    if n != 1:
        print("mode flag not found in index.html", file=sys.stderr)
        return 1

    b64 = base64.b64encode(tpl.read_bytes()).decode()
    out, n = re.subn(r'(const BUILTIN_TPL = ")[A-Za-z0-9+/=]*(";)',
                     lambda m: m.group(1) + b64 + m.group(2), out, count=1)
    if n != 1:
        print("embedded template not found in index.html", file=sys.stderr)
        return 1

    out = out.replace(SRC_TITLE, f"<title>{page['title']}</title>", 1)
    (ROOT / page["out"]).write_text(out, encoding="utf-8")
    print(f"wrote {page['out']}: {len(out.encode()):,} bytes  (template {tpl.stat().st_size:,} bytes)")
    return 0

def main() -> int:
    html = SRC.read_text(encoding="utf-8")
    return max(build(p, html) for p in PAGES)

if __name__ == "__main__":
    raise SystemExit(main())
