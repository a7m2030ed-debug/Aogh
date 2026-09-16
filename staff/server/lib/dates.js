/* ======================================================================
   التواريخ — كلها نصّ 'YYYY-MM-DD'
   ----------------------------------------------------------------------
   الحساب هنا بالأيام لا بالمللي ثانية: لا منطقة زمنية تُزحزح يومًا،
   ولا توقيت صيفي يجعل «يومين» ‎47‎ ساعة فتُحسب يومًا واحدًا.
   ====================================================================== */

"use strict";

const RX = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const MONTH_NAMES_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTH_NAMES_EN = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function isDate(s) {
  const m = RX.exec(String(s || ""));
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const toUtc = (s) => {
  const m = RX.exec(s);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
};

const fromUtc = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

const DAY = 86400000;

function addDays(iso, n) {
  return fromUtc(toUtc(iso) + n * DAY);
}

/* فرق الأيام: b − a. اليوم نفسه = 0 */
function diffDays(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / DAY);
}

/* عدد الأيام شاملًا الطرفين: 01 سبتمبر إلى 03 سبتمبر = ٣ أيام */
function inclusiveDays(a, b) {
  return diffDays(a, b) + 1;
}

/* عدد أيام العمل شاملًا الطرفين، بأيام أسبوع العمل المضبوطة */
function workingDays(a, b, workDays) {
  const set = new Set(workDays || [0, 1, 2, 3, 4]);
  let n = 0;
  for (let t = toUtc(a); t <= toUtc(b); t += DAY) {
    if (set.has(new Date(t).getUTCDay())) n++;
  }
  return n;
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const min = (a, b) => (!a ? b : !b ? a : a < b ? a : b);
const max = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

function monthBounds(year, month) {
  const p = (n) => String(n).padStart(2, "0");
  const from = `${year}-${p(month)}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from, to: `${year}-${p(month)}-${p(last)}` };
}

function yearBounds(year) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/* تقسيم مدى إلى أشهر كاملة أو جزئية — أساس الجدول الشهري في التقرير السنوي */
function monthsInRange(from, to) {
  const out = [];
  let y = +from.slice(0, 4), m = +from.slice(5, 7);
  while (true) {
    const b = monthBounds(y, m);
    if (b.from > to) break;
    out.push({ year: y, month: m, from: max(b.from, from), to: min(b.to, to), label: `${y}-${String(m).padStart(2, "0")}` });
    m++;
    if (m > 12) { m = 1; y++; }
    if (out.length > 600) break; // حارس: لا مدى أطول من ٥٠ سنة
  }
  return out;
}

/* أسبوع يبدأ الأحد (أسبوع العمل في السعودية) */
function weekBounds(iso) {
  const dow = new Date(toUtc(iso)).getUTCDay(); // 0 الأحد
  const from = addDays(iso, -dow);
  return { from, to: addDays(from, 6) };
}

/* -------------------------------------------------- قراءة تاريخ مرن

   يُستعمل في الاستيراد وحده: ملفات الإكسل تحمل التاريخ رقمًا تسلسليًا
   أو 15/09/2026 أو 15-Sep-2026. أما واجهة النظام فلا تقبل إلا ISO. */
function parseLoose(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v)) {
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  if (isDate(s)) return s;

  // رقم إكسل التسلسلي: يبدأ من 1899-12-30 (ومعه خطأ سنة 1900 الكبيسة)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) return fromUtc(Date.UTC(1899, 11, 30) + Math.floor(n) * DAY);
  }

  let m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (m) {
    let d = +m[1], mo = +m[2];
    if (d > 12 && mo <= 12) { /* DD/MM */ } else if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
    const iso = `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return isDate(iso) ? iso : null;
  }

  m = /^(\d{1,2})[\s\-/]([A-Za-z]{3,})[\s\-/](\d{4})$/.exec(s);
  if (m) {
    const mo = MONTHS_EN.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mo >= 0) {
      const iso = `${m[3]}-${String(mo + 1).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
      return isDate(iso) ? iso : null;
    }
  }

  m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(s);
  if (m) {
    const iso = `${m[1]}-${String(+m[2]).padStart(2, "0")}-${String(+m[3]).padStart(2, "0")}`;
    return isDate(iso) ? iso : null;
  }
  return null;
}

function monthName(month, lang) {
  return (lang === "en" ? MONTH_NAMES_EN : MONTH_NAMES_AR)[month - 1] || String(month);
}

module.exports = {
  isDate, addDays, diffDays, inclusiveDays, workingDays, cmp, min, max,
  monthBounds, yearBounds, monthsInRange, weekBounds, parseLoose, monthName,
  MONTH_NAMES_AR, MONTH_NAMES_EN,
};
