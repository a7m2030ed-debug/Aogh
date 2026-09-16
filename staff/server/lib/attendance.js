/* ======================================================================
   الحضور والغياب والتأخير
   ----------------------------------------------------------------------
   سجل واحد لكل موظف في كل يوم (قيد فريد في القاعدة نفسها، لا في الكود
   وحده) — فإعادة إدخال اليوم تصحّحه ولا تضاعفه.

   الفرع والقسم يُخزَّنان لقطةً وقت الحدث: تقرير أغسطس يبقى على الفرع
   الذي كان فيه الموظف في أغسطس مهما نُقل بعده.
   ====================================================================== */

"use strict";

const { uuid, nowIso, today } = require("./db");
const { bad, conflict, notFound } = require("./http");
const V = require("./validate");
const D = require("./dates");
const H = require("./history");
const audit = require("./audit");
const EMP = require("./employees");

const STATUSES = ["present", "absent", "late", "sick_leave", "annual_leave", "emergency_leave",
  "other_leave", "permission", "official_mission", "holiday", "other"];
const LEAVE_STATUSES = ["sick_leave", "annual_leave", "emergency_leave", "other_leave", "permission", "official_mission"];

const uid = (ctx) => (ctx.user && ctx.user.id) || null;
const toMinutes = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? +m[1] * 60 + +m[2] : null;
};

function shape(r) {
  return {
    id: r.id,
    employee: { id: r.employee_id, employeeNo: r.employee_no, fullNameAr: r.full_name_ar, fullNameEn: r.full_name_en },
    date: r.date,
    branch: r.branch_id ? { id: r.branch_id, nameAr: r.branch_ar, nameEn: r.branch_en } : null,
    department: r.department_id ? { id: r.department_id, nameAr: r.dept_ar, nameEn: r.dept_en } : null,
    status: r.status,
    checkIn: r.check_in, checkOut: r.check_out, scheduledTime: r.scheduled_time,
    lateMinutes: r.late_minutes, approved: r.approved === null ? null : !!r.approved,
    absenceType: r.absence_type, reason: r.reason, notes: r.notes, leaveId: r.leave_id,
    createdAt: r.created_at, createdBy: r.created_by_name, updatedAt: r.updated_at, updatedBy: r.updated_by_name,
  };
}

const SELECT = `
  SELECT a.*, e.employee_no, e.full_name_ar, e.full_name_en,
         b.name_ar AS branch_ar, b.name_en AS branch_en, d.name_ar AS dept_ar, d.name_en AS dept_en,
         cu.full_name AS created_by_name, uu.full_name AS updated_by_name
  FROM attendance a
  JOIN employees e ON e.id = a.employee_id
  LEFT JOIN branches b ON b.id = a.branch_id
  LEFT JOIN departments d ON d.id = a.department_id
  LEFT JOIN users cu ON cu.id = a.created_by
  LEFT JOIN users uu ON uu.id = a.updated_by`;

function byId(db, id) {
  const r = db.get(SELECT + " WHERE a.id = :id", { id });
  return r ? shape(r) : null;
}

/* قراءة الحقول وفحصها — تُستعمل في الإضافة والتعديل والإدخال الجماعي */
function read(db, payload, settings, existing) {
  const date = payload.date !== undefined || !existing
    ? V.date(payload.date, "date", { required: true, label: "التاريخ" })
    : existing.date;
  const status = payload.status !== undefined || !existing
    ? V.oneOf(payload.status, "status", STATUSES, { required: true, label: "حالة الحضور" })
    : existing.status;

  const scheduled = payload.scheduledTime !== undefined
    ? V.time(payload.scheduledTime, "scheduledTime")
    : (existing ? existing.scheduled_time : settings.scheduledStartTime || null);
  const checkIn = payload.checkIn !== undefined ? V.time(payload.checkIn, "checkIn") : (existing ? existing.check_in : null);
  const checkOut = payload.checkOut !== undefined ? V.time(payload.checkOut, "checkOut") : (existing ? existing.check_out : null);

  if (checkIn && checkOut && toMinutes(checkOut) < toMinutes(checkIn)) {
    V.fail("وقت الانصراف قبل وقت الحضور", "checkOut");
  }

  /* دقائق التأخير: تُحسب من الجدول والحضور الفعلي ما لم تُكتب يدويًا،
     ومهلة السماح تُخصم. والتأخير لا يُسجَّل إلا على حالة «تأخير». */
  let late = payload.lateMinutes !== undefined
    ? V.int(payload.lateMinutes, "lateMinutes", { min: 0, max: 1440 })
    : (existing ? existing.late_minutes : null);
  if (status === "late") {
    if (late === null || late === undefined) {
      const s = toMinutes(scheduled), c = toMinutes(checkIn);
      late = s !== null && c !== null ? Math.max(0, c - s - (Number(settings.lateGraceMinutes) || 0)) : 0;
    }
  } else {
    late = 0;
  }

  return {
    date, status, scheduled, checkIn, checkOut, late,
    approved: payload.approved !== undefined ? V.bool(payload.approved, null) : (existing ? existing.approved : null),
    absenceType: payload.absenceType !== undefined
      ? V.str(payload.absenceType, "absenceType", { max: 80 }) : (existing ? existing.absence_type : null),
    reason: payload.reason !== undefined ? V.str(payload.reason, "reason", { max: 1000 }) : (existing ? existing.reason : null),
    notes: payload.notes !== undefined ? V.str(payload.notes, "notes", { max: 1000 }) : (existing ? existing.notes : null),
  };
}

/* الفرع والقسم وقت الحدث: من تاريخ الإسناد لا من الحالة اليوم */
function snapshotOrg(db, employeeId, date, emp) {
  const asg = H.assignmentAsOf(db, employeeId, date);
  return {
    branchId: asg ? asg.branch_id : emp.branch_id,
    departmentId: asg ? asg.department_id : emp.department_id,
  };
}

function ensureWithinEmployment(db, employeeId, date, emp) {
  const periods = db.all("SELECT * FROM employment_periods WHERE employee_id = :e", { e: employeeId });
  const ok = periods.some((p) => D.cmp(date, p.start_date) >= 0 && (!p.end_date || D.cmp(date, p.end_date) <= 0));
  if (!ok) {
    V.fail(`التاريخ ${date} خارج فترة عمل ${emp.full_name_ar} — راجع تاريخ المباشرة أو آخر يوم عمل`, "date");
  }
}

function create(db, ctx, payload, opts = {}) {
  const settings = db.settings();
  const employeeId = V.str(payload.employeeId, "employeeId", { required: true, max: 40 });
  const emp = EMP.rawById(db, employeeId);
  if (!emp) throw notFound("لا يوجد موظف بهذا المُعرّف");
  EMP.ensureScope(ctx, emp);

  const f = read(db, payload, settings, null);
  if (D.cmp(f.date, today()) > 0 && !opts.allowFuture) V.fail("لا يُسجَّل حضور ليوم لم يأتِ بعد", "date");
  ensureWithinEmployment(db, employeeId, f.date, emp);

  const existing = db.get("SELECT * FROM attendance WHERE employee_id = :e AND date = :d", { e: employeeId, d: f.date });
  if (existing && !opts.upsert) {
    throw conflict(`يوجد سجل حضور لهذا الموظف في ${f.date}`, "attendance_exists", { id: existing.id });
  }
  if (existing) return update(db, ctx, existing.id, payload);

  const org = snapshotOrg(db, employeeId, f.date, emp);
  const id = uuid();
  const t = nowIso();
  db.run(
    `INSERT INTO attendance(id, employee_id, date, branch_id, department_id, status, check_in, check_out,
                            scheduled_time, late_minutes, approved, absence_type, leave_id, reason, notes,
                            created_at, created_by, updated_at, updated_by)
     VALUES(:id, :e, :d, :b, :dep, :s, :ci, :co, :sch, :late, :appr, :atype, :leave, :reason, :notes, :t, :u, :t, :u)`,
    {
      id, e: employeeId, d: f.date, b: org.branchId, dep: org.departmentId, s: f.status,
      ci: f.checkIn, co: f.checkOut, sch: f.scheduled, late: f.late || 0, appr: f.approved,
      atype: f.absenceType, leave: payload.leaveId || null, reason: f.reason, notes: f.notes,
      t, u: uid(ctx),
    }
  );
  audit.record(db, ctx, {
    action: "create", entity: "attendance", entityId: id, employeeId,
    summary: `حضور ${emp.employee_no} ${f.date}: ${f.status}${f.late ? ` (${f.late} دقيقة تأخير)` : ""}`,
    after: db.get("SELECT * FROM attendance WHERE id = :id", { id }),
  });
  return byId(db, id);
}

function update(db, ctx, id, payload) {
  const before = db.get("SELECT * FROM attendance WHERE id = :id", { id });
  if (!before) throw notFound("لا يوجد سجل حضور بهذا المُعرّف");
  const emp = EMP.rawById(db, before.employee_id);
  EMP.ensureScope(ctx, emp);
  const settings = db.settings();
  const f = read(db, payload, settings, before);
  ensureWithinEmployment(db, before.employee_id, f.date, emp);

  if (f.date !== before.date) {
    const clash = db.get("SELECT id FROM attendance WHERE employee_id = :e AND date = :d AND id != :id",
      { e: before.employee_id, d: f.date, id });
    if (clash) throw conflict(`يوجد سجل حضور آخر لهذا الموظف في ${f.date}`, "attendance_exists", { id: clash.id });
  }

  const org = snapshotOrg(db, before.employee_id, f.date, emp);
  db.run(
    `UPDATE attendance SET date = :d, branch_id = :b, department_id = :dep, status = :s, check_in = :ci,
            check_out = :co, scheduled_time = :sch, late_minutes = :late, approved = :appr,
            absence_type = :atype, reason = :reason, notes = :notes, updated_at = :t, updated_by = :u
     WHERE id = :id`,
    {
      id, d: f.date, b: org.branchId, dep: org.departmentId, s: f.status, ci: f.checkIn, co: f.checkOut,
      sch: f.scheduled, late: f.late || 0, appr: f.approved, atype: f.absenceType,
      reason: f.reason, notes: f.notes, t: nowIso(), u: uid(ctx),
    }
  );
  const after = db.get("SELECT * FROM attendance WHERE id = :id", { id });
  const changes = audit.diff(before, after);
  if (changes.length) {
    audit.record(db, ctx, {
      action: "update", entity: "attendance", entityId: id, employeeId: before.employee_id,
      summary: `تعديل حضور ${emp.employee_no} ${after.date}`, before, after, changes,
    });
  }
  return byId(db, id);
}

function remove(db, ctx, id) {
  const before = db.get("SELECT * FROM attendance WHERE id = :id", { id });
  if (!before) throw notFound("لا يوجد سجل حضور بهذا المُعرّف");
  const emp = EMP.rawById(db, before.employee_id);
  EMP.ensureScope(ctx, emp);
  db.run("DELETE FROM attendance WHERE id = :id", { id });
  audit.record(db, ctx, {
    action: "delete", entity: "attendance", entityId: id, employeeId: before.employee_id,
    summary: `حذف سجل حضور ${emp.employee_no} ${before.date}`, before, after: null,
  });
  return { deleted: true };
}

/* إدخال يوم كامل لفرع أو قسم دفعة واحدة */
function bulk(db, ctx, payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!rows.length) throw bad("لا توجد سجلات للحفظ");
  if (rows.length > 500) throw bad("الحد الأقصى ‎500‎ سجل في المرة الواحدة");
  const out = { saved: 0, errors: [] };
  db.tx(() => {
    rows.forEach((r, i) => {
      try {
        create(db, ctx, Object.assign({}, r, { date: r.date || payload.date }), { upsert: true });
        out.saved++;
      } catch (e) {
        out.errors.push({ row: i + 1, employeeId: r.employeeId, message: e.message });
      }
    });
  });
  return out;
}

function list(db, ctx, q = {}) {
  const p = {};
  const where = ["1=1"];
  if (q.employeeId) { where.push("a.employee_id = :e"); p.e = String(q.employeeId); }
  if (q.from) { where.push("a.date >= :from"); p.from = V.date(q.from, "from"); }
  if (q.to) { where.push("a.date <= :to"); p.to = V.date(q.to, "to"); }
  if (q.date) { where.push("a.date = :d"); p.d = V.date(q.date, "date"); }
  if (q.status) { where.push("a.status = :s"); p.s = V.oneOf(q.status, "status", STATUSES); }
  if (q.branchId) { where.push("a.branch_id = :b"); p.b = Number(q.branchId); }
  if (q.departmentId) { where.push("a.department_id = :dep"); p.dep = Number(q.departmentId); }
  if (q.q) { where.push("(e.full_name_ar LIKE :like OR e.employee_no LIKE :like)"); p.like = `%${q.q}%`; }
  if (q.unapproved) where.push("a.approved = 0");
  const scope = EMP.scopeSql(ctx, p);
  const sql = ` FROM attendance a JOIN employees e ON e.id = a.employee_id WHERE ${where.join(" AND ")}${scope}`;

  const total = db.get(`SELECT COUNT(*) AS c${sql}`, p).c;
  const totals = db.get(
    `SELECT COALESCE(SUM(a.late_minutes),0) AS lateMinutes,
            SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) AS lateCount,
            SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absences${sql}`, p);
  const size = Math.min(Math.max(Number(q.size) || 50, 1), 1000);
  const page = Math.max(Number(q.page) || 1, 1);
  const rows = db.all(
    `${SELECT} WHERE ${where.join(" AND ")}${scope} ORDER BY a.date DESC, e.full_name_ar ASC LIMIT :limit OFFSET :offset`,
    Object.assign({}, p, { limit: size, offset: (page - 1) * size })
  );
  return { total, page, size, totals, rows: rows.map(shape) };
}

/* سجلّات حضور مولَّدة من إجازة معتمدة — حتى لا تُحسب الإجازة غيابًا */
function applyLeave(db, ctx, leave, leaveType) {
  const status = (leaveType && leaveType.attendance_status) || "other_leave";
  if (!LEAVE_STATUSES.includes(status)) return 0;
  const emp = EMP.rawById(db, leave.employee_id);
  if (!emp) return 0;
  let n = 0;
  for (let d = leave.start_date; D.cmp(d, leave.end_date) <= 0; d = D.addDays(d, 1)) {
    if (n > 400) break;
    const existing = db.get("SELECT * FROM attendance WHERE employee_id = :e AND date = :d",
      { e: leave.employee_id, d });
    if (existing && existing.leave_id !== leave.id) continue; // لا نمسّ إدخالًا يدويًا
    const org = snapshotOrg(db, leave.employee_id, d, emp);
    const t = nowIso();
    if (existing) {
      db.run(`UPDATE attendance SET status = :s, leave_id = :l, updated_at = :t, updated_by = :u WHERE id = :id`,
        { s: status, l: leave.id, t, u: uid(ctx), id: existing.id });
    } else {
      db.run(
        `INSERT INTO attendance(id, employee_id, date, branch_id, department_id, status, late_minutes,
                                approved, leave_id, reason, created_at, created_by, updated_at, updated_by)
         VALUES(:id, :e, :d, :b, :dep, :s, 0, 1, :l, :reason, :t, :u, :t, :u)`,
        { id: uuid(), e: leave.employee_id, d, b: org.branchId, dep: org.departmentId, s: status,
          l: leave.id, reason: "إجازة معتمدة", t, u: uid(ctx) }
      );
    }
    n++;
  }
  return n;
}

function clearLeave(db, leaveId) {
  const n = db.run("DELETE FROM attendance WHERE leave_id = :l", { l: leaveId });
  return n.changes || 0;
}

module.exports = { create, update, remove, bulk, list, byId, applyLeave, clearLeave, shape, STATUSES, LEAVE_STATUSES };
