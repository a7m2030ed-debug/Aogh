/* ======================================================================
   التقارير والتحليلات
   ----------------------------------------------------------------------
   لا رقم في هذا النظام مُخزَّن بيد أحد. كل مؤشر يُحسب من السجلات الخام
   عند طلبه، فلا يختلف رقمان على شيء واحد.

   قواعد احتساب العدد — مكتوبة هنا مرة واحدة ويقيس عليها كل تقرير:

   · «على رأس العمل في لحظة D» = فترة توظيف بدايتها ≤ D وليس لها نهاية،
     أو نهايتها (آخر يوم عمل) **بعد** D. فمن آخر يوم عمله ‎30/09‎ يُعدّ
     على رأس العمل في ‎29/09‎ ولا يُعدّ في ‎30/09‎ — أي أنه لا يظهر في
     Closing Headcount لسبتمبر ولا في Opening لأكتوبر.

   · Opening Headcount للمدة = العدد في نهاية اليوم السابق لبدايتها.
   · Closing Headcount للمدة = العدد في نهاية آخر يوم منها.
     وبهذا: Closing(سبتمبر) = Opening(أكتوبر) دائمًا، وتتصل الأشهر.

   · New Joiners  = فترات بدايتها داخل المدة (تعيين جديد أو إعادة توظيف).
   · Resignations = سجلات استقالة **تاريخ استقالتها** داخل المدة — لا من
     حالته اليوم «مستقيل»، فمن استقال في سبتمبر يظهر في سبتمبر وحده.
   · Terminations · Retirements = مثلها بتاريخ القرار.
   · Transfers In/Out = تُحسب عند تصفية التقرير بفرع أو قسم بعينه.

   والمطابقة: Opening + Joiners + In − Resignations − Terminations
              − Retirements − Out = Closing. وأي فرق يظهر صراحة في
   التقرير بدل أن يُخفى.
   ====================================================================== */

"use strict";

const D = require("./dates");
const { today } = require("./db");
const V = require("./validate");
const { bad } = require("./http");

/* قيمة الإسناد (فرع/قسم/مسمى) في تاريخ معيّن — أساس كل تقرير تاريخي */
const asOf = (field, emp, date) =>
  `(SELECT a.${field} FROM assignments a WHERE a.employee_id = ${emp}
      AND a.effective_from <= ${date} AND (a.effective_to IS NULL OR a.effective_to >= ${date})
    ORDER BY a.effective_from DESC, a.created_at DESC LIMIT 1)`;

/* ------------------------------------------------------------ المرشّحات */

function normalizeFilters(q = {}, ctx) {
  const f = {
    branchId: q.branchId ? Number(q.branchId) : null,
    departmentId: q.departmentId ? Number(q.departmentId) : null,
    jobTitleId: q.jobTitleId ? Number(q.jobTitleId) : null,
    employmentType: q.employmentType || null,
    nationality: q.nationality || null,
    branchIds: null,
  };
  const scope = ctx && ctx.user && ctx.user.branchScope;
  if (scope && scope.length) {
    if (f.branchId && !scope.includes(f.branchId)) throw bad("هذا الفرع خارج نطاقك");
    if (!f.branchId) f.branchIds = scope.slice();
  }
  return f;
}

function range(q = {}) {
  const from = V.date(q.from, "from", { required: true, label: "من تاريخ" });
  const to = V.date(q.to, "to", { required: true, label: "إلى تاريخ" });
  if (D.cmp(to, from) < 0) V.fail("«إلى تاريخ» قبل «من تاريخ»", "to");
  return { from, to };
}

/* شرط الإسناد كما كان في تاريخ الحدث */
function orgCond(f, p, empExpr, dateExpr, prefix = "f") {
  const parts = [];
  if (f.branchId) { parts.push(`${asOf("branch_id", empExpr, dateExpr)} = :${prefix}Branch`); p[prefix + "Branch"] = f.branchId; }
  if (f.departmentId) { parts.push(`${asOf("department_id", empExpr, dateExpr)} = :${prefix}Dept`); p[prefix + "Dept"] = f.departmentId; }
  if (f.jobTitleId) { parts.push(`${asOf("job_title_id", empExpr, dateExpr)} = :${prefix}Job`); p[prefix + "Job"] = f.jobTitleId; }
  if (f.branchIds && f.branchIds.length) {
    f.branchIds.forEach((b, i) => (p[`${prefix}Sc${i}`] = b));
    parts.push(`${asOf("branch_id", empExpr, dateExpr)} IN (${f.branchIds.map((_, i) => `:${prefix}Sc${i}`).join(",")})`);
  }
  return parts.length ? " AND " + parts.join(" AND ") : "";
}

/* شرط على جدول employees مباشرة (للحالة الحالية لا التاريخية) */
function currentCond(f, p, alias = "e") {
  const parts = [];
  if (f.employmentType) { parts.push(`${alias}.employment_type = :cType`); p.cType = f.employmentType; }
  if (f.nationality) { parts.push(`${alias}.nationality = :cNat`); p.cNat = f.nationality; }
  return parts.length ? " AND " + parts.join(" AND ") : "";
}

/* ------------------------------------------------------- عدد الموظفين */

/* العدد في نهاية اليوم D */
function headcountAt(db, date, f) {
  const p = { d: date };
  const org = orgCond(f, p, "p.employee_id", ":d");
  const cur = currentCond(f, p);
  return db.get(
    `SELECT COUNT(DISTINCT p.employee_id) AS c
     FROM employment_periods p JOIN employees e ON e.id = p.employee_id
     WHERE p.start_date <= :d AND (p.end_date IS NULL OR p.end_date > :d)${org}${cur}`, p
  ).c;
}

/* من هم على رأس العمل في تاريخ معيّن — لتفصيل الرقم لا للعدّ فقط */
function activeEmployees(db, date, f, limit = 1000) {
  const p = { d: date, limit };
  const org = orgCond(f, p, "p.employee_id", ":d");
  const cur = currentCond(f, p);
  return db.all(
    `SELECT DISTINCT e.id, e.employee_no, e.full_name_ar, e.full_name_en, e.employment_status,
            ${asOf("branch_id", "e.id", ":d")} AS branch_id,
            ${asOf("department_id", "e.id", ":d")} AS department_id,
            ${asOf("job_title_id", "e.id", ":d")} AS job_title_id,
            p.start_date
     FROM employment_periods p JOIN employees e ON e.id = p.employee_id
     WHERE p.start_date <= :d AND (p.end_date IS NULL OR p.end_date > :d)${org}${cur}
     ORDER BY e.full_name_ar LIMIT :limit`, p
  );
}

/* ------------------------------------------------------- حركة الموظفين */

function movement(db, { from, to }, f) {
  const opening = headcountAt(db, D.addDays(from, -1), f);
  const closing = headcountAt(db, to, f);

  const p = { from, to };
  const orgStart = orgCond(f, p, "p.employee_id", "p.start_date", "j");
  const joiners = db.all(
    `SELECT p.start_reason AS reason, COUNT(*) AS c
     FROM employment_periods p JOIN employees e ON e.id = p.employee_id
     WHERE p.start_date BETWEEN :from AND :to${orgStart}${currentCond(f, p)}
     GROUP BY p.start_reason`, p
  );
  const newHires = joiners.filter((r) => r.reason !== "rehire").reduce((a, r) => a + r.c, 0);
  const rehires = joiners.filter((r) => r.reason === "rehire").reduce((a, r) => a + r.c, 0);

  const ps = { from, to };
  const orgSep = orgCond(f, ps, "s.employee_id", "s.event_date", "s");
  const seps = db.all(
    `SELECT s.kind, COUNT(*) AS c
     FROM separations s JOIN employees e ON e.id = s.employee_id
     WHERE s.event_date BETWEEN :from AND :to${orgSep}${currentCond(f, ps)}
     GROUP BY s.kind`, ps
  );
  const kind = (k) => (seps.find((r) => r.kind === k) || { c: 0 }).c;

  /* النقل: «داخل» و«خارج» لا معنى لهما إلا عند تحديد فرع أو قسم */
  let transfersIn = 0, transfersOut = 0, transfersTotal = 0;
  const pt = { from, to };
  transfersTotal = db.get(
    `SELECT COUNT(*) AS c FROM transfers t WHERE t.transfer_date BETWEEN :from AND :to`, pt).c;
  if (f.branchId) {
    const pb = { from, to, b: f.branchId };
    transfersIn = db.get(
      `SELECT COUNT(*) AS c FROM transfers t WHERE t.transfer_date BETWEEN :from AND :to
        AND t.to_branch_id = :b AND (t.from_branch_id IS NULL OR t.from_branch_id != :b)`, pb).c;
    transfersOut = db.get(
      `SELECT COUNT(*) AS c FROM transfers t WHERE t.transfer_date BETWEEN :from AND :to
        AND t.from_branch_id = :b AND (t.to_branch_id IS NULL OR t.to_branch_id != :b)`, pb).c;
  } else if (f.departmentId) {
    const pd = { from, to, d: f.departmentId };
    transfersIn = db.get(
      `SELECT COUNT(*) AS c FROM transfers t WHERE t.transfer_date BETWEEN :from AND :to
        AND t.to_department_id = :d AND (t.from_department_id IS NULL OR t.from_department_id != :d)`, pd).c;
    transfersOut = db.get(
      `SELECT COUNT(*) AS c FROM transfers t WHERE t.transfer_date BETWEEN :from AND :to
        AND t.from_department_id = :d AND (t.to_department_id IS NULL OR t.to_department_id != :d)`, pd).c;
  }

  const resignations = kind("resignation");
  const terminations = kind("termination");
  const retirements = kind("retirement");
  const expected = opening + newHires + rehires + transfersIn - resignations - terminations - retirements - transfersOut;

  return {
    from, to,
    openingHeadcount: opening,
    newJoiners: newHires + rehires,
    newHires, rehires,
    resignations, terminations, retirements,
    transfersIn, transfersOut, transfers: transfersTotal,
    closingHeadcount: closing,
    reconciliation: { expectedClosing: expected, difference: closing - expected },
  };
}

/* --------------------------------------------------------- الحضور */

function attendanceSummary(db, { from, to }, f) {
  const p = { from, to };
  const parts = [];
  if (f.branchId) { parts.push("a.branch_id = :b"); p.b = f.branchId; }
  if (f.departmentId) { parts.push("a.department_id = :dep"); p.dep = f.departmentId; }
  if (f.jobTitleId) { parts.push(`${asOf("job_title_id", "a.employee_id", "a.date")} = :job`); p.job = f.jobTitleId; }
  if (f.branchIds && f.branchIds.length) {
    f.branchIds.forEach((b, i) => (p["asc" + i] = b));
    parts.push(`a.branch_id IN (${f.branchIds.map((_, i) => ":asc" + i).join(",")})`);
  }
  const cond = parts.length ? " AND " + parts.join(" AND ") : "";

  const r = db.get(
    `SELECT
       SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
       SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
       SUM(CASE WHEN a.status = 'absent' AND a.approved = 0 THEN 1 ELSE 0 END) AS absentUnapproved,
       SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS lateOccurrences,
       COALESCE(SUM(a.late_minutes), 0) AS lateMinutes,
       SUM(CASE WHEN a.status = 'sick_leave' THEN 1 ELSE 0 END) AS sickLeaveDays,
       SUM(CASE WHEN a.status = 'annual_leave' THEN 1 ELSE 0 END) AS annualLeaveDays,
       SUM(CASE WHEN a.status IN ('emergency_leave','other_leave') THEN 1 ELSE 0 END) AS otherLeaveDays,
       SUM(CASE WHEN a.status = 'permission' THEN 1 ELSE 0 END) AS permissions,
       SUM(CASE WHEN a.status = 'official_mission' THEN 1 ELSE 0 END) AS missions,
       COUNT(*) AS records
     FROM attendance a WHERE a.date BETWEEN :from AND :to${cond}`, p
  );
  const late = r.lateOccurrences || 0;

  /* أيام الإجازات مصدرها سجل الإجازات نفسه لا سجل الحضور: الإجازة قد
     تُسجَّل ولمّا يُدخَل حضور تلك الأيام، والعدّ من مصدرها لا يتأثر. */
  const lv = leaveDaysSummary(db, { from, to }, f);
  const byCode = lv.byCode || {};
  const sick = byCode.sick || 0;
  const annual = byCode.annual || 0;

  return {
    present: r.present || 0,
    absent: r.absent || 0,
    absentUnapproved: r.absentUnapproved || 0,
    lateOccurrences: late,
    lateMinutes: r.lateMinutes || 0,
    lateAverage: late ? Math.round(((r.lateMinutes || 0) / late) * 10) / 10 : 0,
    sickLeaveDays: sick,
    annualLeaveDays: annual,
    otherLeaveDays: Math.max(lv.total - sick - annual, 0),
    permissions: r.permissions || 0,
    officialMissions: r.missions || 0,
    records: r.records || 0,
    leaveDays: lv,
    // نفس الأيام كما ظهرت في سجل الحضور — للمقارنة لا للعدّ
    fromAttendance: {
      sickLeaveDays: r.sickLeaveDays || 0,
      annualLeaveDays: r.annualLeaveDays || 0,
      otherLeaveDays: r.otherLeaveDays || 0,
    },
  };
}

/* أيام الإجازات من سجل الإجازات نفسه، بقصّ ما يقع خارج المدة */
function leaveDaysSummary(db, { from, to }, f) {
  const p = { from, to };
  const parts = [];
  if (f.branchId) { parts.push(`${asOf("branch_id", "l.employee_id", "l.start_date")} = :b`); p.b = f.branchId; }
  if (f.departmentId) { parts.push(`${asOf("department_id", "l.employee_id", "l.start_date")} = :dep`); p.dep = f.departmentId; }
  if (f.branchIds && f.branchIds.length) {
    f.branchIds.forEach((b, i) => (p["lsc" + i] = b));
    parts.push(`${asOf("branch_id", "l.employee_id", "l.start_date")} IN (${f.branchIds.map((_, i) => ":lsc" + i).join(",")})`);
  }
  const cond = parts.length ? " AND " + parts.join(" AND ") : "";
  const overlap = `CASE WHEN l.start_date >= :from AND l.end_date <= :to THEN l.days
    ELSE CAST(julianday(min(l.end_date, :to)) - julianday(max(l.start_date, :from)) + 1 AS INTEGER) END`;

  const rows = db.all(
    `SELECT COALESCE(lt.code, 'other') AS code, COALESCE(lt.name_ar, 'أخرى') AS nameAr,
            COALESCE(lt.name_en, 'Other') AS nameEn,
            COUNT(*) AS requests, COALESCE(SUM(${overlap}), 0) AS days
     FROM leaves l LEFT JOIN leave_types lt ON lt.id = l.leave_type_id
     WHERE l.approval_status = 'approved' AND l.start_date <= :to AND l.end_date >= :from${cond}
     GROUP BY code ORDER BY days DESC`, p
  );
  const byCode = {};
  let total = 0;
  for (const r of rows) { byCode[r.code] = r.days; total += r.days; }
  return { total, byCode, rows };
}

/* -------------------------------------------------- الإجراءات الانضباطية */

function disciplinarySummary(db, { from, to }, f) {
  const p = { from, to };
  const org = orgCond(f, p, "d.employee_id", "d.action_date", "d");
  const rows = db.all(
    `SELECT d.action_type AS type, COUNT(*) AS c
     FROM disciplinary_actions d JOIN employees e ON e.id = d.employee_id
     WHERE d.action_date BETWEEN :from AND :to${org}
     GROUP BY d.action_type`, p
  );
  const get = (t) => (rows.find((r) => r.type === t) || { c: 0 }).c;
  const warningLetters = get("warning_letter") + get("written_warning") + get("final_warning");

  const pc = { from, to, day: today() };
  const orgC = orgCond(f, pc, "c.employee_id", "c.date_opened", "c");
  const ca = db.get(
    `SELECT COUNT(*) AS opened,
            SUM(CASE WHEN c.status = 'closed' THEN 1 ELSE 0 END) AS closed,
            SUM(CASE WHEN c.status != 'closed' AND c.due_date IS NOT NULL AND c.due_date < :day THEN 1 ELSE 0 END) AS overdue
     FROM corrective_actions c JOIN employees e ON e.id = c.employee_id
     WHERE c.date_opened BETWEEN :from AND :to${orgC}`, pc
  );
  const pcc = { from, to };
  const orgCC = orgCond(f, pcc, "c.employee_id", "c.date_opened", "cc");
  const closedInRange = db.get(
    `SELECT COUNT(*) AS c FROM corrective_actions c JOIN employees e ON e.id = c.employee_id
     WHERE c.date_closed BETWEEN :from AND :to${orgCC}`, pcc
  ).c;

  return {
    verbalWarnings: get("verbal_warning"),
    warningLetters,
    writtenWarnings: get("written_warning"),
    finalWarnings: get("final_warning"),
    correctiveActionRecords: get("corrective_action"),
    otherActions: get("other"),
    total: rows.reduce((a, r) => a + r.c, 0),
    correctiveOpened: ca.opened || 0,
    correctiveClosed: ca.closed || 0,
    correctiveClosedInRange: closedInRange || 0,
    correctiveOverdue: ca.overdue || 0,
    byType: rows,
  };
}

/* ------------------------------------------------------------ التوزيع */

const DIMENSIONS = {
  branch: { table: "branches", field: "branch_id" },
  department: { table: "departments", field: "department_id" },
  jobTitle: { table: "job_titles", field: "job_title_id" },
};

/* توزيع العدد على فرع/قسم/مسمى في تاريخ معيّن — من التاريخ لا من الحالي */
function headcountBy(db, dimension, date, f) {
  const dim = DIMENSIONS[dimension];
  if (!dim) throw bad("بُعد غير معروف: " + dimension);
  const p = { d: date };
  const org = orgCond(f, p, "p.employee_id", ":d");
  const rows = db.all(
    `SELECT k.id, k.name_ar AS nameAr, k.name_en AS nameEn, COUNT(DISTINCT p.employee_id) AS c
     FROM employment_periods p
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN ${dim.table} k ON k.id = ${asOf(dim.field, "p.employee_id", ":d")}
     WHERE p.start_date <= :d AND (p.end_date IS NULL OR p.end_date > :d)${org}${currentCond(f, p)}
     GROUP BY k.id ORDER BY c DESC`, p
  );
  return rows.map((r) => ({
    id: r.id, nameAr: r.nameAr || "غير محدَّد", nameEn: r.nameEn || "Unassigned", value: r.c,
  }));
}

/* توزيع الغياب/التأخير على الفروع أو الأقسام — «أكثر فرع غيابًا» */
function attendanceBy(db, dimension, { from, to }, f, metric = "absent") {
  const dim = DIMENSIONS[dimension];
  if (!dim) throw bad("بُعد غير معروف: " + dimension);
  // الفرع والقسم محفوظان لقطةً في سجل الحضور، والمسمى يُقرأ من التاريخ
  const col = dimension === "branch" ? "a.branch_id" : dimension === "department" ? "a.department_id"
    : asOf("job_title_id", "a.employee_id", "a.date");
  const expr = {
    absent: "SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END)",
    late: "SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END)",
    lateMinutes: "COALESCE(SUM(a.late_minutes), 0)",
    sick: "SUM(CASE WHEN a.status = 'sick_leave' THEN 1 ELSE 0 END)",
  }[metric];
  if (!expr) throw bad("مؤشر غير معروف: " + metric);

  const p = { from, to };
  const parts = [];
  if (f.branchIds && f.branchIds.length) {
    f.branchIds.forEach((b, i) => (p["bsc" + i] = b));
    parts.push(`a.branch_id IN (${f.branchIds.map((_, i) => ":bsc" + i).join(",")})`);
  }
  const cond = parts.length ? " AND " + parts.join(" AND ") : "";
  const rows = db.all(
    `SELECT k.id, k.name_ar AS nameAr, k.name_en AS nameEn, ${expr} AS value
     FROM attendance a LEFT JOIN ${dim.table} k ON k.id = ${col}
     WHERE a.date BETWEEN :from AND :to${cond}
     GROUP BY k.id HAVING value > 0 ORDER BY value DESC`, p
  );
  return rows.map((r) => ({ id: r.id, nameAr: r.nameAr || "غير محدَّد", nameEn: r.nameEn || "Unassigned", value: r.value }));
}

function statusBreakdown(db, f) {
  const p = {};
  const scope = f.branchIds && f.branchIds.length
    ? ` AND e.branch_id IN (${f.branchIds.map((b, i) => { p["ssc" + i] = b; return ":ssc" + i; }).join(",")})` : "";
  const branch = f.branchId ? " AND e.branch_id = :sb" : "";
  if (f.branchId) p.sb = f.branchId;
  return db.all(
    `SELECT e.employment_status AS status, COUNT(*) AS value FROM employees e
     WHERE e.is_archived = 0${branch}${scope} GROUP BY e.employment_status ORDER BY value DESC`, p
  );
}

/* ------------------------------------------------------- سلسلة زمنية */

/* الجدول الشهري: افتتاح · مباشرون · مستقيلون · منتهون · إقفال لكل شهر */
function monthlySeries(db, { from, to }, f) {
  return D.monthsInRange(from, to).map((m) => {
    const bounds = D.monthBounds(m.year, m.month);
    const mv = movement(db, { from: bounds.from, to: bounds.to }, f);
    return {
      year: m.year, month: m.month, label: m.label,
      from: bounds.from, to: bounds.to,
      opening: mv.openingHeadcount,
      joiners: mv.newJoiners,
      resignations: mv.resignations,
      terminations: mv.terminations,
      retirements: mv.retirements,
      transfersIn: mv.transfersIn,
      transfersOut: mv.transfersOut,
      closing: mv.closingHeadcount,
    };
  });
}

/* --------------------------------------------------------- التجميعات */

function periodReport(db, ctx, q) {
  const r = range(q);
  const f = normalizeFilters(q, ctx);
  return {
    range: r,
    filters: describeFilters(db, f),
    movement: movement(db, r, f),
    attendance: attendanceSummary(db, r, f),
    disciplinary: disciplinarySummary(db, r, f),
  };
}

function describeFilters(db, f) {
  const nameOf = (table, id) => {
    if (!id) return null;
    const r = db.get(`SELECT id, name_ar AS nameAr, name_en AS nameEn FROM ${table} WHERE id = :id`, { id });
    return r || null;
  };
  return {
    branch: nameOf("branches", f.branchId),
    department: nameOf("departments", f.departmentId),
    jobTitle: nameOf("job_titles", f.jobTitleId),
    employmentType: f.employmentType || null,
    scopedBranches: f.branchIds || null,
  };
}

function dashboard(db, ctx, q) {
  const r = range(q);
  const f = normalizeFilters(q, ctx);
  const day = today();
  const base = periodReport(db, ctx, q);

  return Object.assign(base, {
    today: day,
    currentActive: headcountAt(db, day, f),
    charts: {
      headcountByBranch: headcountBy(db, "branch", r.to, f),
      headcountByDepartment: headcountBy(db, "department", r.to, f),
      statusBreakdown: statusBreakdown(db, f),
      monthly: monthlySeries(db, widen(r), f),
      absenceByBranch: attendanceBy(db, "branch", r, f, "absent"),
      lateByDepartment: attendanceBy(db, "department", r, f, "late"),
    },
    alerts: alerts(db, ctx, f),
  });
}

/* الرسوم الشهرية تحتاج مدى لا يقلّ عن ستة أشهر ليظهر الاتجاه */
function widen(r) {
  const months = D.monthsInRange(r.from, r.to).length;
  if (months >= 6) return r;
  let y = +r.to.slice(0, 4), m = +r.to.slice(5, 7) - 11;
  while (m < 1) { m += 12; y--; }
  return { from: D.monthBounds(y, m).from, to: r.to };
}

function monthly(db, ctx, q) {
  const year = V.int(q.year, "year", { required: true, min: 1900, max: 2199 });
  const month = V.int(q.month, "month", { required: true, min: 1, max: 12 });
  const b = D.monthBounds(year, month);
  const out = periodReport(db, ctx, Object.assign({}, q, b));
  out.year = year;
  out.month = month;
  return out;
}

function annual(db, ctx, q) {
  const year = V.int(q.year, "year", { required: true, min: 1900, max: 2199 });
  const b = D.yearBounds(year);
  const f = normalizeFilters(q, ctx);
  const out = periodReport(db, ctx, Object.assign({}, q, b));
  out.year = year;
  out.months = monthlySeries(db, b, f);
  out.charts = {
    headcountByBranch: headcountBy(db, "branch", b.to, f),
    headcountByDepartment: headcountBy(db, "department", b.to, f),
    absenceByBranch: attendanceBy(db, "branch", b, f, "absent"),
    lateByDepartment: attendanceBy(db, "department", b, f, "late"),
  };
  return out;
}

/* تقرير لكل فرع (أو كل قسم) في مدة واحدة — صفٌّ لكل واحد */
function byDimension(db, ctx, q) {
  const r = range(q);
  const dimension = q.dimension || "branch";
  const dim = DIMENSIONS[dimension];
  if (!dim) throw bad("بُعد غير معروف: " + dimension);
  const base = normalizeFilters(q, ctx);

  let items = db.all(`SELECT id, name_ar AS nameAr, name_en AS nameEn FROM ${dim.table} ORDER BY sort_order, name_ar`);
  if (base.branchIds && dimension === "branch") items = items.filter((i) => base.branchIds.includes(i.id));
  if (base.branchId && dimension === "branch") items = items.filter((i) => i.id === base.branchId);

  const key = dimension === "branch" ? "branchId" : dimension === "department" ? "departmentId" : "jobTitleId";
  const rows = items.map((it) => {
    const f = Object.assign({}, base, { [key]: it.id, branchIds: dimension === "branch" ? null : base.branchIds });
    const mv = movement(db, r, f);
    const att = attendanceSummary(db, r, f);
    const dis = disciplinarySummary(db, r, f);
    return {
      id: it.id, nameAr: it.nameAr, nameEn: it.nameEn,
      opening: mv.openingHeadcount, joiners: mv.newJoiners,
      resignations: mv.resignations, terminations: mv.terminations,
      transfersIn: mv.transfersIn, transfersOut: mv.transfersOut,
      closing: mv.closingHeadcount,
      absences: att.absent, sickLeaveDays: att.sickLeaveDays,
      lateOccurrences: att.lateOccurrences, lateMinutes: att.lateMinutes,
      warningLetters: dis.warningLetters, correctiveActions: dis.correctiveOpened,
    };
  });
  return { range: r, dimension, rows };
}

/* ------------------------------------------------------------ تنبيهات */

function alerts(db, ctx, f) {
  const day = today();
  const settings = db.settings();
  const soon = D.addDays(day, Number(settings.correctiveDueSoonDays) || 7);
  const out = [];

  for (const r of db.all(
    `SELECT c.id, c.due_date, c.status, e.id AS eid, e.employee_no, e.full_name_ar
     FROM corrective_actions c JOIN employees e ON e.id = c.employee_id
     WHERE c.status != 'closed' AND c.due_date IS NOT NULL AND c.due_date < :day
     ORDER BY c.due_date ASC LIMIT 50`, { day })) {
    out.push({ type: "corrective_overdue", severity: "high", date: r.due_date, id: r.id,
      employee: { id: r.eid, employeeNo: r.employee_no, fullNameAr: r.full_name_ar },
      days: D.diffDays(r.due_date, day) });
  }
  for (const r of db.all(
    `SELECT c.id, c.due_date, e.id AS eid, e.employee_no, e.full_name_ar
     FROM corrective_actions c JOIN employees e ON e.id = c.employee_id
     WHERE c.status != 'closed' AND c.due_date BETWEEN :day AND :soon
     ORDER BY c.due_date ASC LIMIT 50`, { day, soon })) {
    out.push({ type: "corrective_due", severity: "medium", date: r.due_date, id: r.id,
      employee: { id: r.eid, employeeNo: r.employee_no, fullNameAr: r.full_name_ar },
      days: D.diffDays(day, r.due_date) });
  }
  for (const r of db.all(
    `SELECT e.id AS eid, e.employee_no, e.full_name_ar, e.probation_end_date
     FROM employees e WHERE e.employment_status = 'active' AND e.is_archived = 0
       AND e.probation_end_date BETWEEN :day AND :soon2
     ORDER BY e.probation_end_date ASC LIMIT 50`, { day, soon2: D.addDays(day, 30) })) {
    out.push({ type: "probation_end", severity: "low", date: r.probation_end_date,
      employee: { id: r.eid, employeeNo: r.employee_no, fullNameAr: r.full_name_ar },
      days: D.diffDays(day, r.probation_end_date) });
  }
  for (const r of db.all(
    `SELECT l.id, l.start_date, l.end_date, e.id AS eid, e.employee_no, e.full_name_ar
     FROM leaves l JOIN employees e ON e.id = l.employee_id
     WHERE l.approval_status = 'pending' ORDER BY l.start_date ASC LIMIT 50`)) {
    out.push({ type: "leave_pending", severity: "medium", date: r.start_date, id: r.id,
      employee: { id: r.eid, employeeNo: r.employee_no, fullNameAr: r.full_name_ar } });
  }

  const scope = f && f.branchIds;
  if (!scope) return out;
  const allowed = new Set(scope);
  return out.filter((a) => {
    const e = db.get("SELECT branch_id FROM employees WHERE id = :id", { id: a.employee.id });
    return e && allowed.has(Number(e.branch_id));
  });
}

module.exports = {
  headcountAt, activeEmployees, movement, attendanceSummary, leaveDaysSummary, disciplinarySummary,
  headcountBy, attendanceBy, statusBreakdown, monthlySeries,
  periodReport, dashboard, monthly, annual, byDimension, alerts,
  normalizeFilters, range, describeFilters, asOf, DIMENSIONS,
};
