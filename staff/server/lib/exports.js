/* ======================================================================
   التصدير — إكسل لكل جدول وكل تقرير
   ----------------------------------------------------------------------
   «تصدير العرض الحالي»: نفس المرشّحات التي على الشاشة تُمرَّر كما هي إلى
   هنا، فما يخرج في الملف هو ما يراه المستخدم لا الجدول كاملًا.
   ====================================================================== */

"use strict";

const X = require("./xlsx");
const EMP = require("./employees");
const ATT = require("./attendance");
const LV = require("./leaves");
const DIS = require("./discipline");
const MOV = require("./movements");
const R = require("./reports");
const audit = require("./audit");
const D = require("./dates");
const { today } = require("./db");

const BIG = 100000;
const pickName = (o, lang) => (!o ? "" : lang === "en" ? (o.nameEn || o.nameAr || "") : (o.nameAr || o.nameEn || ""));
const empName = (e, lang) => (!e ? "" : lang === "en" ? (e.fullNameEn || e.fullNameAr || "") : (e.fullNameAr || e.fullNameEn || ""));

const T = {
  ar: {
    employeeNo: "الرقم الوظيفي", nationalId: "رقم الهوية", name: "الاسم", nameEn: "الاسم بالإنجليزية",
    gender: "الجنس", mobile: "الجوال", email: "البريد", dob: "تاريخ الميلاد", nationality: "الجنسية",
    joining: "تاريخ المباشرة", status: "الحالة", type: "نوع التوظيف", branch: "الفرع", department: "القسم",
    jobTitle: "المسمى الوظيفي", manager: "المدير المباشر", branchStart: "بداية الفرع الحالي",
    positionStart: "بداية المسمى الحالي", createdAt: "تاريخ الإدخال", createdBy: "أدخله",
    date: "التاريخ", checkIn: "الحضور", checkOut: "الانصراف", scheduled: "الجدول", late: "دقائق التأخير",
    approved: "بعذر", reason: "السبب", notes: "ملاحظات", leaveType: "نوع الإجازة", start: "من", end: "إلى",
    days: "الأيام", approval: "الاعتماد", medical: "شهادة مرضية", actionType: "نوع الإجراء",
    description: "الوصف", actionTaken: "الإجراء المتخذ", issuedBy: "أصدره", opened: "تاريخ الفتح",
    due: "الاستحقاق", closed: "تاريخ الإغلاق", responsible: "المسؤول", correctiveAction: "الإجراء التصحيحي",
    closure: "ملاحظات الإغلاق", from: "من", to: "إلى", transferDate: "تاريخ النقل", approvedBy: "اعتمده",
    eventDate: "تاريخ الحدث", lwd: "آخر يوم عمل", kind: "النوع", subType: "التصنيف", notice: "مدة الإشعار",
    metric: "المؤشر", value: "القيمة", month: "الشهر", opening: "العدد الافتتاحي", joiners: "المباشرون",
    resignations: "الاستقالات", terminations: "إنهاء الخدمة", closing: "العدد الختامي",
    transfersIn: "نقل داخل", transfersOut: "نقل خارج", user: "المستخدم", action: "الإجراء",
    entity: "السجل", field: "الحقل", before: "قبل", after: "بعد", at: "الوقت", summary: "الوصف",
    absences: "الغياب", sick: "أيام المرضية", lateCount: "مرات التأخير", lateMinutes: "دقائق التأخير",
    warnings: "الإنذارات", corrective: "الإجراءات التصحيحية",
  },
  en: {
    employeeNo: "Employee ID", nationalId: "National ID", name: "Name", nameEn: "English Name",
    gender: "Gender", mobile: "Mobile", email: "Email", dob: "Date of Birth", nationality: "Nationality",
    joining: "Joining Date", status: "Status", type: "Employment Type", branch: "Branch", department: "Department",
    jobTitle: "Job Title", manager: "Direct Manager", branchStart: "Current Branch Start",
    positionStart: "Current Position Start", createdAt: "Created At", createdBy: "Created By",
    date: "Date", checkIn: "Check-in", checkOut: "Check-out", scheduled: "Scheduled", late: "Late Minutes",
    approved: "Approved", reason: "Reason", notes: "Notes", leaveType: "Leave Type", start: "From", end: "To",
    days: "Days", approval: "Approval", medical: "Medical Certificate", actionType: "Action Type",
    description: "Description", actionTaken: "Action Taken", issuedBy: "Issued By", opened: "Date Opened",
    due: "Due Date", closed: "Date Closed", responsible: "Responsible", correctiveAction: "Corrective Action",
    closure: "Closure Notes", from: "From", to: "To", transferDate: "Transfer Date", approvedBy: "Approved By",
    eventDate: "Event Date", lwd: "Last Working Date", kind: "Kind", subType: "Type", notice: "Notice Period",
    metric: "Metric", value: "Value", month: "Month", opening: "Opening", joiners: "New Joiners",
    resignations: "Resignations", terminations: "Terminations", closing: "Closing",
    transfersIn: "Transfers In", transfersOut: "Transfers Out", user: "User", action: "Action",
    entity: "Entity", field: "Field", before: "Before", after: "After", at: "Timestamp", summary: "Summary",
    absences: "Absences", sick: "Sick Days", lateCount: "Late Occurrences", lateMinutes: "Late Minutes",
    warnings: "Warning Letters", corrective: "Corrective Actions",
  },
};

const cols = (arr) => arr.map((c) => (Array.isArray(c) ? { header: c[0], width: c[1] } : { header: c, width: 18 }));

/* ------------------------------------------------------------ الجداول */

function employees(db, ctx, q, lang = "ar") {
  const t = T[lang];
  const data = EMP.list(db, ctx, Object.assign({}, q, { size: BIG, page: 1 }));
  const rows = data.rows.map((e) => [
    e.employeeNo, e.nationalId, e.fullNameAr, e.fullNameEn, e.gender, e.mobile, e.email, e.dob, e.nationality,
    e.originalJoiningDate, e.employmentStatus, e.employmentType, pickName(e.branch, lang),
    pickName(e.department, lang), pickName(e.jobTitle, lang), e.manager ? e.manager.name : "",
    e.branchStartDate, e.positionStartDate, String(e.createdAt || "").slice(0, 10), e.createdBy || "",
  ]);
  return X.build([{
    name: "Employees", rtl: lang !== "en",
    columns: cols([[t.employeeNo, 14], [t.nationalId, 16], [t.name, 28], [t.nameEn, 24], [t.gender, 10],
      [t.mobile, 14], [t.email, 24], [t.dob, 14], [t.nationality, 14], [t.joining, 14], [t.status, 14],
      [t.type, 14], [t.branch, 16], [t.department, 18], [t.jobTitle, 22], [t.manager, 20],
      [t.branchStart, 14], [t.positionStart, 14], [t.createdAt, 14], [t.createdBy, 18]]),
    rows,
  }]);
}

function attendance(db, ctx, q, lang = "ar") {
  const t = T[lang];
  const data = ATT.list(db, ctx, Object.assign({}, q, { size: BIG, page: 1 }));
  const rows = data.rows.map((a) => [
    a.date, a.employee.employeeNo, empName(a.employee, lang), pickName(a.branch, lang), pickName(a.department, lang),
    a.status, a.scheduledTime, a.checkIn, a.checkOut, a.lateMinutes,
    a.approved === null ? "" : a.approved ? "نعم" : "لا", a.reason, a.notes,
  ]);
  return X.build([{
    name: "Attendance", rtl: lang !== "en",
    columns: cols([[t.date, 12], [t.employeeNo, 14], [t.name, 26], [t.branch, 16], [t.department, 18],
      [t.status, 14], [t.scheduled, 10], [t.checkIn, 10], [t.checkOut, 10], [t.late, 12], [t.approved, 10],
      [t.reason, 24], [t.notes, 24]]),
    rows,
  }]);
}

function leaves(db, ctx, q, lang = "ar") {
  const t = T[lang];
  const data = LV.list(db, ctx, Object.assign({}, q, { size: BIG, page: 1 }));
  const rows = data.rows.map((l) => [
    l.employee.employeeNo, empName(l.employee, lang), pickName(l.branch, lang), pickName(l.leaveType, lang),
    l.startDate, l.endDate, l.days, l.approvalStatus, l.medicalCertificate ? "نعم" : "", l.reason, l.notes,
  ]);
  return X.build([{
    name: "Leaves", rtl: lang !== "en",
    columns: cols([[t.employeeNo, 14], [t.name, 26], [t.branch, 16], [t.leaveType, 18], [t.start, 12],
      [t.end, 12], [t.days, 8], [t.approval, 12], [t.medical, 12], [t.reason, 24], [t.notes, 24]]),
    rows,
  }]);
}

function discipline(db, ctx, q, lang = "ar") {
  const t = T[lang];
  const acts = DIS.listActions(db, ctx, Object.assign({}, q, { size: BIG, page: 1 }));
  const ca = DIS.listCorrective(db, ctx, Object.assign({}, q, { size: BIG, page: 1 }));
  return X.build([
    {
      name: "Disciplinary", rtl: lang !== "en",
      columns: cols([[t.date, 12], [t.employeeNo, 14], [t.name, 26], [t.branch, 16], [t.actionType, 18],
        [t.reason, 24], [t.description, 30], [t.actionTaken, 24], [t.issuedBy, 18], [t.status, 12]]),
      rows: acts.rows.map((a) => [a.actionDate, a.employee.employeeNo, empName(a.employee, lang),
        pickName(a.branch, lang), a.actionType, a.reason, a.description, a.actionTaken, a.issuedBy, a.status]),
    },
    {
      name: "CorrectiveActions", rtl: lang !== "en",
      columns: cols([[t.opened, 12], [t.employeeNo, 14], [t.name, 26], [t.branch, 16], [t.reason, 24],
        [t.correctiveAction, 30], [t.responsible, 18], [t.due, 12], [t.status, 12], [t.closed, 12], [t.closure, 24]]),
      rows: ca.rows.map((c) => [c.dateOpened, c.employee.employeeNo, empName(c.employee, lang),
        pickName(c.branch, lang), c.reason, c.correctiveAction, c.responsiblePerson, c.dueDate,
        c.displayStatus, c.dateClosed, c.closureNotes]),
    },
  ]);
}

function movements(db, ctx, q, lang = "ar") {
  const t = T[lang];
  const tr = MOV.listTransfers(db, ctx, Object.assign({}, q, { size: BIG, page: 1 }));
  const sp = MOV.listSeparations(db, ctx, Object.assign({}, q, { size: BIG, page: 1 }));
  return X.build([
    {
      name: "Transfers", rtl: lang !== "en",
      columns: cols([[t.transferDate, 12], [t.employeeNo, 14], [t.name, 26], [`${t.from} ${t.branch}`, 16],
        [`${t.to} ${t.branch}`, 16], [`${t.from} ${t.department}`, 18], [`${t.to} ${t.department}`, 18],
        [`${t.from} ${t.jobTitle}`, 20], [`${t.to} ${t.jobTitle}`, 20], [t.reason, 24], [t.approvedBy, 18]]),
      rows: tr.rows.map((r) => [r.transferDate, r.employee.employeeNo, empName(r.employee, lang),
        pickName(r.fromBranch, lang), pickName(r.toBranch, lang), pickName(r.fromDepartment, lang),
        pickName(r.toDepartment, lang), pickName(r.fromJobTitle, lang), pickName(r.toJobTitle, lang),
        r.reason, r.approvedBy]),
    },
    {
      name: "Separations", rtl: lang !== "en",
      columns: cols([[t.eventDate, 12], [t.employeeNo, 14], [t.name, 26], [t.branch, 16], [t.kind, 14],
        [t.lwd, 14], [t.subType, 16], [t.reason, 24], [t.notice, 12], [t.approvedBy, 18], [t.notes, 24]]),
      rows: sp.rows.map((r) => [r.eventDate, r.employee.employeeNo, empName(r.employee, lang),
        pickName(r.branch, lang), r.kind, r.lastWorkingDate, r.subType, r.reason, r.noticePeriodDays,
        r.approvedBy, r.notes]),
    },
  ]);
}

function auditLog(db, ctx, q, lang = "ar") {
  const t = T[lang];
  const data = audit.list(db, Object.assign({}, q, { size: 20000, page: 1 }));
  const rows = [];
  for (const r of data.rows) {
    if (r.changes && r.changes.length) {
      for (const c of r.changes) {
        rows.push([r.at, r.userName, r.action, r.entity, r.entityId, r.summary, c.field,
          c.before === null ? "" : String(c.before), c.after === null ? "" : String(c.after), r.ip]);
      }
    } else {
      rows.push([r.at, r.userName, r.action, r.entity, r.entityId, r.summary, "", "", "", r.ip]);
    }
  }
  return X.build([{
    name: "AuditLog", rtl: lang !== "en",
    columns: cols([[t.at, 24], [t.user, 20], [t.action, 12], [t.entity, 16], ["ID", 30], [t.summary, 40],
      [t.field, 20], [t.before, 20], [t.after, 20], ["IP", 14]]),
    rows,
  }]);
}

/* ------------------------------------------------------------ التقارير */

function report(db, ctx, q, lang = "ar") {
  const t = T[lang];
  const rep = R.periodReport(db, ctx, q);
  const f = R.normalizeFilters(q, ctx);
  const m = rep.movement, a = rep.attendance, d = rep.disciplinary;

  const head = [
    [lang === "en" ? "Period" : "المدة", `${rep.range.from} — ${rep.range.to}`],
    [lang === "en" ? "Branch" : "الفرع", rep.filters.branch ? pickName(rep.filters.branch, lang) : (lang === "en" ? "All" : "الكل")],
    [lang === "en" ? "Department" : "القسم", rep.filters.department ? pickName(rep.filters.department, lang) : (lang === "en" ? "All" : "الكل")],
    [lang === "en" ? "Generated" : "تاريخ الإخراج", new Date().toISOString().slice(0, 16).replace("T", " ")],
    [],
  ];

  const movementRows = head.concat([
    [lang === "en" ? "Employee Movement" : "حركة الموظفين", ""],
    [t.opening, m.openingHeadcount],
    [t.joiners, m.newJoiners],
    [lang === "en" ? "— New Hires" : "— تعيين جديد", m.newHires],
    [lang === "en" ? "— Rehires" : "— إعادة توظيف", m.rehires],
    [t.resignations, m.resignations],
    [t.terminations, m.terminations],
    [lang === "en" ? "Retirements" : "التقاعد", m.retirements],
    [t.transfersIn, m.transfersIn],
    [t.transfersOut, m.transfersOut],
    [t.closing, m.closingHeadcount],
    [lang === "en" ? "Reconciliation difference" : "فرق المطابقة", m.reconciliation.difference],
    [],
    [lang === "en" ? "Attendance" : "الحضور", ""],
    [lang === "en" ? "Present" : "حضور", a.present],
    [t.absences, a.absent],
    [t.lateCount, a.lateOccurrences],
    [t.lateMinutes, a.lateMinutes],
    [lang === "en" ? "Average late minutes" : "متوسط دقائق التأخير", a.lateAverage],
    [t.sick, a.sickLeaveDays],
    [lang === "en" ? "Annual Leave Days" : "أيام الإجازة السنوية", a.annualLeaveDays],
    [lang === "en" ? "Other Leave Days" : "أيام الإجازات الأخرى", a.otherLeaveDays],
    [lang === "en" ? "Permissions" : "الاستئذان", a.permissions],
    [],
    [lang === "en" ? "Disciplinary" : "الإجراءات الانضباطية", ""],
    [lang === "en" ? "Verbal Warnings" : "إنذار شفهي", d.verbalWarnings],
    [t.warnings, d.warningLetters],
    [lang === "en" ? "Corrective Actions Opened" : "إجراءات تصحيحية فُتحت", d.correctiveOpened],
    [lang === "en" ? "Corrective Actions Closed" : "إجراءات تصحيحية أُغلقت", d.correctiveClosedInRange],
    [lang === "en" ? "Overdue" : "متأخرة", d.correctiveOverdue],
    [lang === "en" ? "Other Actions" : "إجراءات أخرى", d.otherActions],
  ]);

  const months = R.monthlySeries(db, rep.range, f).map((r) => [
    r.label, r.opening, r.joiners, r.resignations, r.terminations, r.transfersIn, r.transfersOut, r.closing,
  ]);

  const byBranch = R.byDimension(db, ctx, Object.assign({}, q, { dimension: "branch" })).rows.map((r) => [
    lang === "en" ? r.nameEn || r.nameAr : r.nameAr, r.opening, r.joiners, r.resignations, r.terminations,
    r.transfersIn, r.transfersOut, r.closing, r.absences, r.sickLeaveDays, r.lateOccurrences, r.lateMinutes,
    r.warningLetters, r.correctiveActions,
  ]);

  const byDept = R.byDimension(db, ctx, Object.assign({}, q, { dimension: "department" })).rows.map((r) => [
    lang === "en" ? r.nameEn || r.nameAr : r.nameAr, r.opening, r.joiners, r.resignations, r.terminations,
    r.closing, r.absences, r.sickLeaveDays, r.lateOccurrences, r.lateMinutes, r.warningLetters, r.correctiveActions,
  ]);

  return X.build([
    { name: lang === "en" ? "Summary" : "الملخص", rtl: lang !== "en",
      columns: cols([[t.metric, 34], [t.value, 16]]), rows: movementRows },
    { name: lang === "en" ? "Monthly" : "الشهري", rtl: lang !== "en",
      columns: cols([[t.month, 12], [t.opening, 12], [t.joiners, 12], [t.resignations, 12], [t.terminations, 14],
        [t.transfersIn, 12], [t.transfersOut, 12], [t.closing, 12]]), rows: months },
    { name: lang === "en" ? "ByBranch" : "حسب الفرع", rtl: lang !== "en",
      columns: cols([[t.branch, 18], [t.opening, 12], [t.joiners, 12], [t.resignations, 12], [t.terminations, 14],
        [t.transfersIn, 12], [t.transfersOut, 12], [t.closing, 12], [t.absences, 10], [t.sick, 12],
        [t.lateCount, 12], [t.lateMinutes, 14], [t.warnings, 12], [t.corrective, 16]]), rows: byBranch },
    { name: lang === "en" ? "ByDepartment" : "حسب القسم", rtl: lang !== "en",
      columns: cols([[t.department, 20], [t.opening, 12], [t.joiners, 12], [t.resignations, 12], [t.terminations, 14],
        [t.closing, 12], [t.absences, 10], [t.sick, 12], [t.lateCount, 12], [t.lateMinutes, 14],
        [t.warnings, 12], [t.corrective, 16]]), rows: byDept },
  ]);
}

/* قائمة من هم على رأس العمل في تاريخ — تفصيل رقم العدد الافتتاحي/الختامي */
function headcountDetail(db, ctx, q, lang = "ar") {
  const t = T[lang];
  const f = R.normalizeFilters(q, ctx);
  const date = q.date || today();
  const rows = R.activeEmployees(db, date, f, BIG).map((e) => {
    const b = db.get("SELECT name_ar, name_en FROM branches WHERE id = :id", { id: e.branch_id });
    const d = db.get("SELECT name_ar, name_en FROM departments WHERE id = :id", { id: e.department_id });
    const j = db.get("SELECT name_ar, name_en FROM job_titles WHERE id = :id", { id: e.job_title_id });
    const nm = (r) => (!r ? "" : lang === "en" ? r.name_en || r.name_ar : r.name_ar);
    return [e.employee_no, lang === "en" ? e.full_name_en || e.full_name_ar : e.full_name_ar,
      nm(b), nm(d), nm(j), e.start_date, e.employment_status];
  });
  return X.build([{
    name: `Headcount ${date}`, rtl: lang !== "en",
    columns: cols([[t.employeeNo, 14], [t.name, 28], [t.branch, 16], [t.department, 18], [t.jobTitle, 22],
      [t.joining, 14], [t.status, 12]]),
    rows,
  }]);
}

module.exports = { employees, attendance, leaves, discipline, movements, auditLog, report, headcountDetail, T };
