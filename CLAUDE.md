# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

A set of **standalone, single-file browser apps** for a Saudi medical-clinic group
(مجموعة مينا — السويدي). Each page takes files the clinics already produce — MIS
spreadsheet/PDF exports — and turns them into a finished deliverable (a filled
PowerPoint deck, a PDF report, an employee database).

Three properties define the whole codebase, and every change must preserve them:

1. **Zero dependencies.** There is not one external library, CDN link, npm package
   or bundler anywhere. ZIP reading/writing, `.xlsx` parsing, `.pptx` reading and
   writing, PDF parsing *and* PDF writing are all hand-written in the page, on top
   of built-in browser APIs (`CompressionStream` / `DecompressionStream`,
   `DOMParser`, `TextDecoder`, `canvas`). Never add a dependency to solve a
   problem — extend the hand-rolled code.
2. **No server, no upload.** All processing happens in the browser. Clinic data
   (patient counts, staff records) never leaves the device. Persistence is
   `IndexedDB` / `localStorage` only.
3. **One file per app.** Each page is a self-contained `.html` with its CSS in one
   `<style>` block and all its JS in one `<script>` block. A page must keep working
   when opened by double-clicking the file — no build step, no module imports,
   no `fetch()` of sibling assets.

## Repository layout

```
index.html        Daily report filler — cluster of 4 branches. THE SOURCE PAGE.
single.html       GENERATED from index.html — one branch + NO SHOW column
cluster6.html     GENERATED from index.html — six branches + NO SHOW
build_pages.py    Generates the two pages above. Run after any index.html edit.
physician.html    Physician Detail report — MIS export → PDF/PPTX, any date range
hr.html           Employee register — IndexedDB `aogh_hr` + full UI
branch.html       Branch management pilot — IndexedDB `aogh_branch`, 3 modules
template/         Source .pptx templates (embedded into pages as base64)
README.md         Canonical Arabic spec — behaviour, rules, formulas, rationale
.github/workflows/pages.yml   GitHub Pages deploy
```

`physician.html`, `hr.html` and `branch.html` are **independent apps** — they share
conventions and hand-rolled helpers (`zipRead`, `zipWrite`, `parseCSV`,
`findHeaderRow`, `toast`, `save`) by copy, not by import. Fixing a bug in one does
not fix it in the others; check whether the sibling pages carry the same code.

## The generated-pages contract — read before touching index.html

`single.html` and `cluster6.html` are byte-for-byte copies of `index.html` except
for three lines:

| Line | What differs |
|---|---|
| 2 | `<title>` |
| 298 | `const BUILTIN_TPL = "…"` — base64 of the page's own `.pptx` template |
| 304 | `const MODE = { single: … }` — only `single.html` flips this to `true` |

**Never hand-edit `single.html` or `cluster6.html`.** Edit `index.html`, then:

```bash
python3 build_pages.py     # writes single.html and cluster6.html
```

Commit all three files together. Verify the regeneration was clean:

```bash
python3 - <<'PY'
import pathlib
src = pathlib.Path('index.html').read_text(encoding='utf-8').splitlines()
for f in ('single.html', 'cluster6.html'):
    out = pathlib.Path(f).read_text(encoding='utf-8').splitlines()
    print(f, [i+1 for i, (a, b) in enumerate(zip(src, out)) if a != b])
PY
# expect: single.html [2, 298, 304]   cluster6.html [2, 298]
```

Any other differing line means `index.html` and the generated pages have drifted.

Behaviour that differs between the two modes is branched on `MODE.single` inside
`index.html`. Behaviour that differs because of the *template* (e.g. the NO SHOW
column) is detected from the loaded template at runtime — see `templateHasNoShow()`
— not hard-coded. Prefer runtime detection over a new mode flag.

## Working with these files

The pages are 1,900–2,700 lines and contain very long base64 lines, so `grep`
reports some of them as binary and a whole-file read is wasteful.

- Use `grep -a` (or `grep -an`) — plain `grep` skips `physician.html` as binary.
- Read by range (`sed -n '500,600p' file.html`) rather than loading the whole file.
- Never print line 298 of `index.html` (or the equivalent `BUILTIN_TPL` /
  logo-data lines elsewhere) — it is ~115 KB of base64 on a single line.
- To find your way around, list the section banners:
  `grep -an '^/\* ═══' physician.html`

### Section maps

`index.html` — `<style>` 3–210, `<script>` 292–2587:

| Line | Section |
|---|---|
| 298 | `BUILTIN_TPL` base64 · 304 `MODE` · 306 `BUILD` stamp |
| 324 | ZIP reader/writer (`zipRead`, `zipWrite`, `crc32`) |
| 402 | Spreadsheet reader (`readSheet` — xlsx/xlsm/csv) |
| 459 | PDF reader — object parser, Flate/LZW/A85/AHx/RunLength, text layout → grid |
| ~1180 | Column mapping, field guessing, stored maps, branch grouping |
| 1391 | Template analysis — token scan, table shape, blank-template injection |
| 1621 | Report maths — totals, rates, department ordering, pagination |
| 1702 | Slide rendering — clones template rows, rewrites DrawingML |
| 1929 | Package assembly — writes the .pptx |
| 1982 | PDF export of the deck |
| 2151 | UI — preview, mapping editor, drag/drop, wiring |

`physician.html`: 8 page shell · 151 report markup · 358 helpers · 368 workbook
reader · 461 sheet shapes · 507 dates · 536 the report's arithmetic · 728 header
facts · 757 the template as markup · 941 pagination · 1021 **PDF writer**
(hand-written xref/content streams) · 1303 **PowerPoint writer** · 1659 state and
wiring.

`hr.html`: tokens/CSS · 685 IndexedDB (`aogh_hr`, store `employees` keyed by
employee ID) · 765 workbook import · 940 i18n tables · 1162 xlsx export · 1261
state · 1283 form · 1351 table · 1440 employee file · 1489 dashboard/charts ·
1651 import-export wiring.

`branch.html`: tokens/CSS · 1063 IndexedDB (`aogh_branch` — `employees`,
`records`, `resources`, `meta`) · 1211 routing (`#/emp` `#/staff` `#/cap`) ·
1241 home · 1307 employee module · 1482 all-staff · 1584 capacity · 1734 modals
and forms · 2000 import/export.

## Conventions

**Language.** UI strings, `toast()` messages, error text, `README.md` and most
commit subjects are **Arabic**. Code identifiers and code comments are **English**.
Keep that split: a new user-facing string is Arabic, a new comment is English.

**Direction.** Pages are RTL. `physician.html`, `hr.html` and `branch.html` declare
`<html lang="ar" dir="rtl">`; `index.html` sets it from JS instead
(`document.documentElement.dir = "rtl"`). Report output itself is LTR English —
inner LTR blocks set `direction:ltr; unicode-bidi:isolate` in CSS rather than on
the element, per commit `اتجاه الصفحة في القواعد لا في وسم html`.

**Comments explain *why*, with measurements.** The house style is a short comment
above a non-obvious block giving the reason it exists, often with the number that
justified it ("the widest thing that lands in it is 143pt"). Match that density —
sparse, but substantive. Section banners are `/* ═════ name ═════ */`.

**JS style.** One IIFE, `"use strict"`, 2-space indent, `const`/`let`, arrow
helpers for one-liners, `function` for anything larger, `$` as
`querySelector`. No classes, no framework, no build tooling.

**Storage keys** are namespaced `aogh_*`: `aogh_hr`, `aogh_branch`,
`aogh_branch_theme`, `aogh_colmap_v1`, `aogh_physician_logo`. Bump the suffix
(`_v2`) when a stored shape changes incompatibly rather than migrating silently.

**Build stamp.** `index.html` carries `const BUILD = "date · note"` shown next to
the title so a stale cached copy is visible at a glance. Update it when shipping a
user-visible change to that page.

**Host bridge.** `physician.html` detects being inside an iframe (`framed()`) and
delivers files through `window.claude.use("downloads")` when the ordinary
`<a download>` path is blocked. Keep that fallback intact when touching file
delivery.

**Templates.** The `.pptx` files under `template/` are the source of truth; the
base64 in a page is a derived copy. To change an embedded template: optimise the
`.pptx` (dedupe media, re-deflate — the Cluster 2 template went 395 KB → 86 KB),
replace it in `template/`, then update `BUILTIN_TPL` in `index.html` and rerun
`build_pages.py`. Fill logic reads `{{TOKEN}}` markers *and* handles blank
templates by cloning row prototypes — see README § "كيف يُملأ القالب".

## Verifying a change

There is no test suite, no linter and no CI beyond the Pages deploy. Verification
is manual, so do it deliberately:

1. **Syntax check** the page's script — this catches the most common breakage:

   ```bash
   python3 -c "import re,pathlib,sys; h=pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'); \
   open('/tmp/chk.js','w').write(re.search(r'<script>(.*)</script>',h,re.S).group(1))" index.html \
     && node --check /tmp/chk.js && echo OK
   ```

2. **Regenerate** if you touched `index.html`, and run the drift check above.
3. **Open the page in a browser** and exercise the actual path you changed with a
   real export file. Chromium is available at `/opt/pw-browsers/chromium` and can
   be driven with Playwright when a headless check is worth it.
4. **Check the numbers.** The reports have documented reference figures
   (e.g. physician detail on the 17–18 August export: 254,131 SAR, 1,694 orders,
   428 visits, 30 providers, 9 departments). If a change moves a number, say which
   number and why — that is what the commit bodies in this repo do.

## Deployment

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on
every push to **`claude/excel-data-form-template-lz5rmp`** — that branch, not
`main`, is the publish branch. Live URLs:

- https://a7m2030ed-debug.github.io/Aogh/ (cluster of 4)
- https://a7m2030ed-debug.github.io/Aogh/single.html
- https://a7m2030ed-debug.github.io/Aogh/cluster6.html
- https://a7m2030ed-debug.github.io/Aogh/physician.html
- https://a7m2030ed-debug.github.io/Aogh/hr.html
- https://a7m2030ed-debug.github.io/Aogh/branch.html

Pages had to be switched on by hand once (Settings → Pages → Source: GitHub
Actions); `GITHUB_TOKEN` cannot create the site itself. Work on your assigned
feature branch and do not push to the publish branch without being asked.

## Commits

Subject lines are short and descriptive — mostly Arabic, some page-prefixed
English (`physician: PROVIDER column sized to what actually fits in it`). Bodies
are substantial: what changed, the reason, and the measured effect. Follow that.
Do not describe the change as "AI-generated" in the message body, and keep model
identifiers out of anything committed.

## README.md is the spec

The 58 KB Arabic `README.md` is the canonical description of every rule the pages
implement — how the emergency word works, how the rate is computed and coloured,
how weekly files merge, how visits are counted per MRNO + bill date, how packages
collapse to one session, how pagination avoids orphan department heads, every
measured value in the physician template. **When you change behaviour, update the
matching README section in the same commit.** When you need to know what the
intended behaviour is, read the README before reading the code.
