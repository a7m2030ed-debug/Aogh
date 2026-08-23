#!/usr/bin/env python3
"""يولّد جدول نصوص iOS من موارد أندرويد نفسها.

النصّ الواحد يُكتب مرة واحدة في `KoraTimeAndroid/app/src/main/res`، ومن هناك
يُشتقّ `Core/Localization.swift`. بغير ذلك تُصلَح جملة في تطبيق وتبقى خطأً في
الآخر، وهذا ما حدث فعلاً قبل أن يُكتب هذا المولّد.

    python3 KoraTime/Tools/make_localization.py

يفشل إن نقص مفتاح من العربية أو زاد فيها ما ليس في الإنجليزية، فالنقص
يُكتشف هنا لا على شاشة المستخدم.
"""

import pathlib
import re
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
RES = ROOT / "KoraTimeAndroid/app/src/main/res"
OUT = ROOT / "KoraTime/KoraTime/Core/Localization.swift"

# صيغ أندرويد إلى صيغ Foundation: %1$s نصّ و %1$d عدد صحيح طويل.
ARG_PATTERN = re.compile(r"%(\d+)\$([sd])")


def convert_args(text: str) -> str:
    return ARG_PATTERN.sub(lambda m: f"%{m.group(1)}$" + ("@" if m.group(2) == "s" else "ld"), text)


def unescape(text: str) -> str:
    """يفكّ ما تهربه موارد أندرويد: \\' و \\" و \\n."""
    return text.replace("\\'", "'").replace('\\"', '"').replace("\\n", "\n")


def read(path: pathlib.Path) -> dict:
    root = ET.parse(path).getroot()
    table = {}
    for node in root.findall("string"):
        name = node.get("name")
        if not name:
            continue
        # النصّ قد يحوي وسوماً داخلية؛ نجمع النصّ كاملاً كما يفعل أندرويد.
        raw = "".join(node.itertext())
        table[name] = convert_args(unescape(raw))
    return table


def swift_literal(text: str) -> str:
    escaped = text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'


def emit(table: dict, indent: str = "        ") -> str:
    return "\n".join(
        f"{indent}{swift_literal(key)}: {swift_literal(table[key])},"
        for key in sorted(table)
    )


def main() -> int:
    english = read(RES / "values/strings.xml")
    arabic = read(RES / "values-ar/strings.xml")

    missing = sorted(set(english) - set(arabic))
    extra = sorted(set(arabic) - set(english))
    if missing or extra:
        if missing:
            print("ينقص من العربية:", ", ".join(missing), file=sys.stderr)
        if extra:
            print("زائد في العربية:", ", ".join(extra), file=sys.stderr)
        return 1

    body = f'''import Foundation

// مولَّد آلياً — لا يُحرَّر بيد.
// المصدر: KoraTimeAndroid/app/src/main/res/values{{,-ar}}/strings.xml
// التوليد: python3 KoraTime/Tools/make_localization.py

/// اللغات المدعومة. العربية أولاً لأنها لغة التطبيق الافتراضية.
enum Lang: String, CaseIterable, Identifiable, Codable {{
    case ar, en

    var id: String {{ rawValue }}
    var label: String {{ self == .ar ? "العربية" : "English" }}
    var isRTL: Bool {{ self == .ar }}
}}

/// جدول النصوص مولَّد من موارد أندرويد نفسها، فلا تفترق ترجمتا
/// التطبيقين. الوسائط بصيغة %1$@ و %1$ld كعادة Foundation.
enum L {{

    /// اللغة الحالية تُقرأ مباشرة من التخزين حتى تعمل الدالة في أي سياق.
    static var current: Lang {{
        Lang(rawValue: UserDefaults.standard.string(forKey: "general.language") ?? "") ?? .ar
    }}

    static func s(_ key: String) -> String {{
        let table = current == .ar ? arabic : english
        return table[key] ?? english[key] ?? key
    }}

    static func s(_ key: String, _ args: CVarArg...) -> String {{
        String(format: s(key), arguments: args)
    }}

    private static let arabic: [String: String] = [
{emit(arabic)}
    ]

    private static let english: [String: String] = [
{emit(english)}
    ]
}}
'''

    OUT.write_text(body, encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(english)} مفتاحاً")
    return 0


if __name__ == "__main__":
    sys.exit(main())
