/* ======================================================================
   الإجازات — المرضية والسنوية وسائر الأنواع
   ----------------------------------------------------------------------
   عدد الأيام يحسبه النظام لا المستخدم: ‎01‎ سبتمبر إلى ‎03‎ سبتمبر = ‎3‎ أيام.
   والإجازة المعتمدة تُسقط على أيام الحضور حالتَها الخاصة، فلا تُحسب
   غيابًا في أي تقرير.
   ====================================================================== */

"use strict";

const { uuid, nowIso } = require("./db");
const { bad, conflict, notFound } = require("./http");
const V = require("./validate");
const D = require("./dates");
const audit = require("./audit");
const EMP = require("./employees");
const ATT = require("./attendance");

const APPROVALS = ["pending", "approved", "rejected", "cancelled"];
const uid = (ctx) => (ctx.user && ctx.user.id) || null;

const SELECT = `
  SELECT l.*, e.employee_no, e.full_name_ar, e.full_name_en, e.branch_id, e.department_id,
         lt.code AS type_code, lt.name_ar AS type_ar, lt.name_en AS type_en, lt.requires_attachment,
         b.name_ar AS branch_ar, b.name_en AS branch_en,
         cu.full_name AS created_by_name, uu.full_name AS updated_by_name,
         (SELECT COUNT(*) FROM attachments at WHERE at.ref_type = 'leave' AND at.ref_id = l.id AND at.deleted_at IS NULL) AS attachments
  FROM leaves l
  JOIN employees e ON e.id = l.employee_id
  LEFT JOIN leave_types lt ON lt.id = l.leave_type_id
  LEFT JOIN branches b ON b.id = e.branch_id
  LEFT JOIN users cu ON cu.id = l.created_by
  LEFT JOIN users uu ON uu.id = l.updated_by`;

function shape(r) {
  return {
    id: r.id,
    employee: { id: r.employee_id, employeeNo: r.employee_no, fullNameAr: r.full_name_ar, fullNameEn: r.full_name_en },
    branch: r.branch_id ? { id: r.branch_id, nameAr: r.branch_ar, nameEn: r.branch_en } : null,
    leaveType: r.leave_type_id ? { id: r.leave_type_id, code: r.type_code, nameAr: r.type_ar, nameEn: r.type_en } : null,
    startDate: r.start_date, endDate: r.end_date, days: r.days,
    approvalStatus: r.approval_status, medicalCertificate: !!r.medical_certificate,
    approvedBy: r.approved_by, reason: r.reason, notes: r.notes,
    attachments: r.attachments || 0,
    createdAt: r.created_at, createdBy: r.created_by_name, updatedAt: r.updated_at, updatedBy: r.updated_by_name,
  };
}

function byId(db, id) {
  const r = db.get(SELECT + " WHERE l.id = :id", { id });
  return r ? shape(r) : null;
}

function countDays(start, end, settings) {
  return settings.leaveDaysBasis === "workdays"
    ? D.workingDays(start, end, settings.workDays)
    : D.inclusiveDays(start, end);
}

function read(db, payload, settings, existing) {
  const start = payload.startDate !== undefined || !existing
    ? V.date(payload.startDate, "startDate", { required: true, label: "تاريخ البداية" }) : existing.start_date;
  const end = payload.endDate !== undefined || !existing
    ? V.date(payload.endDate, "endDate", { required: true, label: "تاريخ النهاية" }) : existing.end_date;
  V.ensureOrder(start, end, "تاريخ نهاية الإجازة لا يكون قبل تاريخ بدايتها", "endDate");
  if (D.inclusiveDays(start, end) > 400) V.fail("مدة الإجازة أطول من المعقول", "endDate");

  let typeId = existing ? existing.leave_type_id : null;
  if (payload.leaveTypeId !== undefined || !existing) {
    typeId = V.int(payload.leaveTypeId, "leaveTypeId", { required: true, min: 1, label: "نوع الإجازة" });
    if (!db.get("SELECT id FROM leave_types WHERE id = :id", { id: typeId })) {
      V.fail("نوع الإجازة غير موجود", "leaveTypeId");
    }
  }

  return {
    start, end, typeId,
    days: payload.days !== undefined && payload.days !== null && payload.days !== ""
      ? V.int(payload.days, "days", { min: 1, max: 400 })
      : countDays(start, end, settings),
    approval: payload.approvalStatus !== undefined
      ? V.oneOf(payload.approvalStatus, "approvalStatus", APPROVALS, { required: true })
      : (existing ? existing.approval_status : "approved"),
    medical: payload.medicalCertificate !== undefined
      ? V.bool(payload.medicalCertificate, 0) : (existing ? existing.medical_certificate : 0),
    approvedBy: payload.approvedBy !== undefined
      ? V.str(payload.approvedBy, "approvedBy", { max: 150 }) : (existing ? existing.approved_by : null),
    reason: payload.reason !== undefined ? V.str(payload.reason, "reason", { max: 1000 }) : (existing ? existing.reason : null),
    notes: payload.notes !== undefined ? V.str(payload.notes, "notes", { max: 1000 }) : (existing ? existing.notes : null),
  };
}

function assertNoOverlap(db, employeeId, start, end, exceptId) {
  const clash = db.get(
    `SELECT l.id, l.start_date, l.end_date, lt.name_ar AS t FROM leaves l
     LEFT JOIN leave_types lt ON lt.id = l.leave_type_id
     WHERE l.employee_id = :e AND l.id != :x AND l.approval_status IN ('approved','pending')
       AND l.start_date <= :end AND l.end_date >= :start LIMIT 1`,
    { e: employeeId, x: exceptId || "", start, end }
  );
  if (clash) {
    throw conflict(
      `تتداخل مع إجازة مسجَّلة (${clash.t || "إجازة"}: ${clash.start_date} — ${clash.end_date})`,
      "leave_overlap", { id: clash.id }
    );
  }
}

function create(db, ctx, payload) {
  const settings = db.settings();
  const employeeId = V.str(payload.employeeId, "employeeId", { required: true, max: 40 });
  const emp = EMP.rawById(db, employeeId);
  if (!emp) throw notFound("لا يوجد موظف بهذا المُعرّف");
  EMP.ensureScope(ctx, emp);

  const f = read(db, payload, settings, null);
  V.ensureOrder(emp.original_joining_date, f.start, "تاريخ الإجازة لا يكون قبل تاريخ المباشرة", "startDate");
  assertNoOverlap(db, employeeId, f.start, f.end);

  return db.tx(() => {
    const id = uuid();
    const t = nowIso();
    db.run(
      `INSERT INTO leaves(id, employee_id, leave_type_id, start_date, end_date, days, approval_status,
                          medical_certificate, approved_by, reason, notes, created_at, created_by, updated_at, updated_by)
       VALUES(:id, :e, :type, :s, :end, :days, :appr, :med, :by, :reason, :notes, :t, :u, :t, :u)`,
      { id, e: employeeId, type: f.typeId, s: f.start, end: f.end, days: f.days, appr: f.approval,
        med: f.medical || 0, by: f.approvedBy, reason: f.reason, notes: f.notes, t, u: uid(ctx) }
    );
    const row = db.get("SELECT * FROM leaves WHERE id = :id", { id });
    if (f.approval === "approved") {
      ATT.applyLeave(db, ctx, row, db.get("SELECT * FROM leave_types WHERE id = :id", { id: f.typeId }));
    }
    const type = db.get("SELECT name_ar FROM leave_types WHERE id = :id", { id: f.typeId });
    audit.record(db, ctx, {
      action: "create", entity: "leave", entityId: id, employeeId,
      summary: `إجازة ${type ? type.name_ar : ""} ${emp.employee_no} · ${f.start} — ${f.end} (${f.days} يوم)`,
      after: row,
    });
    return byId(db, id);
  });
}

function update(db, ctx, id, payload) {
  const before = db.get("SELECT * FROM leaves WHERE id = :id", { id });
  if (!before) throw notFound("لا توجد إجازة بهذا المُعرّف");
  const emp = EMP.rawById(db, before.employee_id);
  EMP.ensureScope(ctx, emp);
  const settings = db.settings();
  const f = read(db, payload, settings, before);
  assertNoOverlap(db, before.employee_id, f.start, f.end, id);

  return db.tx(() => {
    db.run(
      `UPDATE leaves SET leave_type_id = :type, start_date = :s, end_date = :end, days = :days,
              approval_status = :appr, medical_certificate = :med, approved_by = :by, reason = :reason,
              notes = :notes, updated_at = :t, updated_by = :u WHERE id = :id`,
      { id, type: f.typeId, s: f.start, end: f.end, days: f.days, appr: f.approval, med: f.medical || 0,
        by: f.approvedBy, reason: f.reason, notes: f.notes, t: nowIso(), u: uid(ctx) }
    );
    const after = db.get("SELECT * FROM leaves WHERE id = :id", { id });
    ATT.clearLeave(db, id);
    if (f.approval === "approved") {
      ATT.applyLeave(db, ctx, after, db.get("SELECT * FROM leave_types WHERE id = :id", { id: f.typeId }));
    }
    const changes = audit.diff(before, after);
    if (changes.length) {
      audit.record(db, ctx, {
        action: "update", entity: "leave", entityId: id, employeeId: before.employee_id,
        summary: `تعديل إجازة ${emp.employee_no} · ${after.start_date} — ${after.end_date}`,
        before, after, changes,
      });
    }
    return byId(db, id);
  });
}

function remove(db, ctx, id) {
  const before = db.get("SELECT * FROM leaves WHERE id = :id", { id });
  if (!before) throw notFound("لا توجد إجازة بهذا المُعرّف");
  const emp = EMP.rawById(db, before.employee_id);
  EMP.ensureScope(ctx, emp);
  return db.tx(() => {
    ATT.clearLeave(db, id);
    db.run("DELETE FROM leaves WHERE id = :id", { id });
    audit.record(db, ctx, {
      action: "delete", entity: "leave", entityId: id, employeeId: before.employee_id,
      summary: `حذف إجازة ${emp.employee_no} · ${before.start_date} — ${before.end_date}`,
      before, after: null,
    });
    return { deleted: true };
  });
}

function list(db, ctx, q = {}) {
  const p = {};
  const where = ["1=1"];
  if (q.employeeId) { where.push("l.employee_id = :e"); p.e = String(q.employeeId); }
  // إجازة تقع ضمن المدى ولو جزئيًا
  if (q.from) { where.push("l.end_date >= :from"); p.from = V.date(q.from, "from"); }
  if (q.to) { where.push("l.start_date <= :to"); p.to = V.date(q.to, "to"); }
  if (q.leaveTypeId) { where.push("l.leave_type_id = :type"); p.type = Number(q.leaveTypeId); }
  if (q.code) { where.push("lt.code = :code"); p.code = String(q.code); }
  if (q.approvalStatus) { where.push("l.approval_status = :appr"); p.appr = V.oneOf(q.approvalStatus, "approvalStatus", APPROVALS); }
  if (q.branchId) { where.push("e.branch_id = :b"); p.b = Number(q.branchId); }
  if (q.departmentId) { where.push("e.department_id = :dep"); p.dep = Number(q.departmentId); }
  if (q.q) { where.push("(e.full_name_ar LIKE :like OR e.employee_no LIKE :like)"); p.like = `%${q.q}%`; }
  const scope = EMP.scopeSql(ctx, p);
  const from = ` FROM leaves l JOIN employees e ON e.id = l.employee_id LEFT JOIN leave_types lt ON lt.id = l.leave_type_id
                 WHERE ${where.join(" AND ")}${scope}`;

  const total = db.get(`SELECT COUNT(*) AS c${from}`, p).c;
  const totals = db.get(`SELECT COALESCE(SUM(l.days),0) AS days,
     COALESCE(SUM(CASE WHEN lt.code='sick' THEN l.days ELSE 0 END),0) AS sickDays${from}`, p);
  const size = Math.min(Math.max(Number(q.size) || 50, 1), 1000);
  const page = Math.max(Number(q.page) || 1, 1);
  const rows = db.all(
    `${SELECT} WHERE ${where.join(" AND ")}${scope} ORDER BY l.start_date DESC LIMIT :limit OFFSET :offset`,
    Object.assign({}, p, { limit: size, offset: (page - 1) * size })
  );
  return { total, page, size, totals, rows: rows.map(shape) };
}

module.exports = { create, update, remove, list, byId, shape, countDays, APPROVALS };
