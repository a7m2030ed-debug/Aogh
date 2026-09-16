/* ======================================================================
   الحركات — النقل والاستقالة وإنهاء الخدمة والتقاعد وإعادة التوظيف
   ----------------------------------------------------------------------
   كل حركة سجلّ مستقل بتاريخه، والحالة الحالية نتيجة له لا بديل عنه.
   النقل لا يعدّل الفرع، بل يُغلق إسنادًا ويفتح إسنادًا جديدًا من تاريخه،
   فتقرير أغسطس يبقى على الفرع القديم وتقرير سبتمبر على الجديد.
   ====================================================================== */

"use strict";

const { uuid, nowIso, today } = require("./db");
const { bad, conflict, notFound } = require("./http");
const V = require("./validate");
const D = require("./dates");
const H = require("./history");
const audit = require("./audit");
const EMP = require("./employees");

const KINDS = ["resignation", "termination", "retirement"];
const uid = (ctx) => (ctx.user && ctx.user.id) || null;

/* -------------------------------------------------------------- النقل */

function transfer(db, ctx, employeeId, payload) {
  const emp = EMP.rawById(db, employeeId);
  if (!emp) throw notFound("لا يوجد موظف بهذا المُعرّف");
  EMP.ensureScope(ctx, emp);

  const date = V.date(payload.transferDate, "transferDate", { required: true, label: "تاريخ النقل" });
  const period = H.currentPeriod(db, employeeId);
  if (!period) throw bad("لا توجد فترة توظيف لهذا الموظف");
  if (D.cmp(date, period.start_date) < 0) {
    V.fail("تاريخ النقل لا يكون قبل تاريخ المباشرة", "transferDate");
  }
  if (period.end_date && D.cmp(date, period.end_date) > 0) {
    V.fail("تاريخ النقل لا يكون بعد آخر يوم عمل", "transferDate");
  }

  const cur = H.assignmentAsOf(db, employeeId, date) || H.latestAssignment(db, employeeId) || {};
  const to = {
    branchId: pick(db, "branches", payload.toBranchId, "toBranchId", cur.branch_id, "الفرع"),
    departmentId: pick(db, "departments", payload.toDepartmentId, "toDepartmentId", cur.department_id, "القسم"),
    jobTitleId: pick(db, "job_titles", payload.toJobTitleId, "toJobTitleId", cur.job_title_id, "المسمى الوظيفي"),
  };
  const managerId = payload.toManagerId !== undefined
    ? (V.str(payload.toManagerId, "toManagerId", { max: 40 }) || null) : cur.manager_id;
  const employmentType = payload.employmentType !== undefined
    ? V.oneOf(payload.employmentType, "employmentType", EMP.EMPLOYMENT_TYPES) : cur.employment_type;

  const same = Number(to.branchId) === Number(cur.branch_id) &&
    Number(to.departmentId) === Number(cur.department_id) &&
    Number(to.jobTitleId) === Number(cur.job_title_id) &&
    String(managerId || "") === String(cur.manager_id || "");
  if (same) throw bad("لم يتغيّر شيء: اختر فرعًا أو قسمًا أو مسمّى مختلفًا", "no_change");

  return db.tx(() => {
    const id = uuid();
    const t = nowIso();
    db.run(
      `INSERT INTO transfers(id, employee_id, transfer_date, from_branch_id, to_branch_id,
                             from_department_id, to_department_id, from_job_title_id, to_job_title_id,
                             reason, approved_by, notes, created_at, created_by, updated_at, updated_by)
       VALUES(:id, :e, :d, :fb, :tb, :fd, :td, :fj, :tj, :reason, :appr, :notes, :t, :u, :t, :u)`,
      {
        id, e: employeeId, d: date,
        fb: cur.branch_id || null, tb: to.branchId || null,
        fd: cur.department_id || null, td: to.departmentId || null,
        fj: cur.job_title_id || null, tj: to.jobTitleId || null,
        reason: V.str(payload.reason, "reason", { max: 1000 }),
        appr: V.str(payload.approvedBy, "approvedBy", { max: 150 }),
        notes: V.str(payload.notes, "notes", { max: 2000 }),
        t, u: uid(ctx),
      }
    );

    H.openAssignment(db, ctx, {
      employeeId, periodId: period.id, branchId: to.branchId, departmentId: to.departmentId,
      jobTitleId: to.jobTitleId, managerId, employmentType,
      effectiveFrom: date, reason: "transfer", refType: "transfer", refId: id,
    });
    H.refreshSnapshot(db, ctx, employeeId);

    const row = db.get("SELECT * FROM transfers WHERE id = :id", { id });
    audit.record(db, ctx, {
      action: "create", entity: "transfer", entityId: id, employeeId,
      summary: `نقل ${emp.employee_no} — ${emp.full_name_ar} بتاريخ ${date}`,
      after: row,
    });
    return shapeTransfer(db, id);
  });
}

function pick(db, table, value, field, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback || null;
  const id = V.int(value, field, { required: true, min: 1, label });
  if (!db.get(`SELECT id FROM ${table} WHERE id = :id`, { id })) V.fail(`«${label}» المختار غير موجود`, field);
  return id;
}

function shapeTransfer(db, id) {
  const r = db.get(
    `SELECT t.*, e.employee_no, e.full_name_ar, e.full_name_en,
            fb.name_ar AS fb_ar, fb.name_en AS fb_en, tb.name_ar AS tb_ar, tb.name_en AS tb_en,
            fd.name_ar AS fd_ar, fd.name_en AS fd_en, td.name_ar AS td_ar, td.name_en AS td_en,
            fj.name_ar AS fj_ar, fj.name_en AS fj_en, tj.name_ar AS tj_ar, tj.name_en AS tj_en,
            u.full_name AS created_by_name
     FROM transfers t
     JOIN employees e ON e.id = t.employee_id
     LEFT JOIN branches fb ON fb.id = t.from_branch_id LEFT JOIN branches tb ON tb.id = t.to_branch_id
     LEFT JOIN departments fd ON fd.id = t.from_department_id LEFT JOIN departments td ON td.id = t.to_department_id
     LEFT JOIN job_titles fj ON fj.id = t.from_job_title_id LEFT JOIN job_titles tj ON tj.id = t.to_job_title_id
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.id = :id`, { id }
  );
  if (!r) return null;
  const nm = (ar, en) => (ar ? { nameAr: ar, nameEn: en } : null);
  return {
    id: r.id,
    employee: { id: r.employee_id, employeeNo: r.employee_no, fullNameAr: r.full_name_ar, fullNameEn: r.full_name_en },
    transferDate: r.transfer_date,
    fromBranch: nm(r.fb_ar, r.fb_en), toBranch: nm(r.tb_ar, r.tb_en),
    fromDepartment: nm(r.fd_ar, r.fd_en), toDepartment: nm(r.td_ar, r.td_en),
    fromJobTitle: nm(r.fj_ar, r.fj_en), toJobTitle: nm(r.tj_ar, r.tj_en),
    fromBranchId: r.from_branch_id, toBranchId: r.to_branch_id,
    reason: r.reason, approvedBy: r.approved_by, notes: r.notes,
    createdAt: r.created_at, createdBy: r.created_by_name,
  };
}

function listTransfers(db, ctx, q = {}) {
  const p = {};
  const where = ["1=1"];
  if (q.from) { where.push("t.transfer_date >= :from"); p.from = V.date(q.from, "from"); }
  if (q.to) { where.push("t.transfer_date <= :to"); p.to = V.date(q.to, "to"); }
  if (q.employeeId) { where.push("t.employee_id = :e"); p.e = String(q.employeeId); }
  if (q.branchId) { where.push("(t.from_branch_id = :b OR t.to_branch_id = :b)"); p.b = Number(q.branchId); }
  const scope = EMP.scopeSql(ctx, p);
  const sql = ` FROM transfers t JOIN employees e ON e.id = t.employee_id WHERE ${where.join(" AND ")}${scope}`;
  const total = db.get(`SELECT COUNT(*) AS c${sql}`, p).c;
  const size = Math.min(Math.max(Number(q.size) || 50, 1), 500);
  const page = Math.max(Number(q.page) || 1, 1);
  const ids = db.all(`SELECT t.id${sql} ORDER BY t.transfer_date DESC, t.created_at DESC LIMIT :limit OFFSET :offset`,
    Object.assign({}, p, { limit: size, offset: (page - 1) * size }));
  return { total, page, size, rows: ids.map((r) => shapeTransfer(db, r.id)) };
}

/* ----------------------------------- الاستقالة وإنهاء الخدمة والتقاعد */

function separate(db, ctx, employeeId, kind, payload) {
  if (!KINDS.includes(kind)) throw bad("نوع إنهاء الخدمة غير معروف");
  const emp = EMP.rawById(db, employeeId);
  if (!emp) throw notFound("لا يوجد موظف بهذا المُعرّف");
  EMP.ensureScope(ctx, emp);

  const period = H.currentPeriod(db, employeeId);
  if (!period) throw bad("لا توجد فترة توظيف لهذا الموظف");
  if (period.end_date) {
    throw conflict("خدمة الموظف منتهية بالفعل. لإعادته استخدم «إعادة توظيف».", "already_separated");
  }

  const eventDate = V.date(payload.eventDate || payload.resignationDate || payload.terminationDate, "eventDate",
    { required: true, label: kind === "resignation" ? "تاريخ الاستقالة" : "تاريخ القرار" });
  const lwd = V.date(payload.lastWorkingDate, "lastWorkingDate", { required: true, label: "آخر يوم عمل" });

  V.ensureOrder(period.start_date, eventDate, "تاريخ الاستقالة/القرار لا يكون قبل تاريخ المباشرة", "eventDate");
  V.ensureOrder(period.start_date, lwd, "آخر يوم عمل لا يكون قبل تاريخ المباشرة", "lastWorkingDate");

  return db.tx(() => {
    const id = uuid();
    const t = nowIso();
    db.run(
      `INSERT INTO separations(id, employee_id, period_id, kind, event_date, last_working_date, sub_type,
                               reason, notice_period_days, approved_by, notes, created_at, created_by, updated_at, updated_by)
       VALUES(:id, :e, :p, :k, :ed, :lwd, :st, :reason, :notice, :appr, :notes, :t, :u, :t, :u)`,
      {
        id, e: employeeId, p: period.id, k: kind, ed: eventDate, lwd,
        st: V.str(payload.subType, "subType", { max: 80 }),
        reason: V.str(payload.reason, "reason", { max: 2000 }),
        notice: V.int(payload.noticePeriodDays, "noticePeriodDays", { min: 0, max: 365 }),
        appr: V.str(payload.approvedBy, "approvedBy", { max: 150 }),
        notes: V.str(payload.notes, "notes", { max: 2000 }),
        t, u: uid(ctx),
      }
    );

    H.closePeriod(db, ctx, { periodId: period.id, endDate: lwd, kind, reason: payload.reason || null });
    H.setStatus(db, ctx, {
      employeeId, status: H.SEP_STATUS[kind], from: eventDate,
      reason: payload.reason || null, refType: "separation", refId: id,
    });
    // الإسناد الأخير ينتهي بآخر يوم عمل فلا يُحسب الموظف على فرعه بعده
    db.run(
      `UPDATE assignments SET effective_to = :lwd
       WHERE employee_id = :e AND (effective_to IS NULL OR effective_to > :lwd)`,
      { lwd, e: employeeId }
    );
    H.refreshSnapshot(db, ctx, employeeId);

    const row = db.get("SELECT * FROM separations WHERE id = :id", { id });
    audit.record(db, ctx, {
      action: "create", entity: kind, entityId: id, employeeId,
      summary: `${labelOf(kind)} ${emp.employee_no} — ${emp.full_name_ar} · تاريخ الحدث ${eventDate} · آخر يوم عمل ${lwd}`,
      after: row,
    });
    return shapeSeparation(db, id);
  });
}

const labelOf = (k) => ({ resignation: "استقالة", termination: "إنهاء خدمة", retirement: "تقاعد" }[k] || k);

function updateSeparation(db, ctx, id, payload) {
  const before = db.get("SELECT * FROM separations WHERE id = :id", { id });
  if (!before) throw notFound("لا يوجد سجل إنهاء خدمة بهذا المُعرّف");
  const emp = EMP.rawById(db, before.employee_id);
  EMP.ensureScope(ctx, emp);
  const period = db.get("SELECT * FROM employment_periods WHERE id = :id", { id: before.period_id });

  const eventDate = payload.eventDate !== undefined
    ? V.date(payload.eventDate, "eventDate", { required: true }) : before.event_date;
  const lwd = payload.lastWorkingDate !== undefined
    ? V.date(payload.lastWorkingDate, "lastWorkingDate", { required: true }) : before.last_working_date;
  if (period) {
    V.ensureOrder(period.start_date, eventDate, "تاريخ الحدث لا يكون قبل تاريخ المباشرة", "eventDate");
    V.ensureOrder(period.start_date, lwd, "آخر يوم عمل لا يكون قبل تاريخ المباشرة", "lastWorkingDate");
  }

  return db.tx(() => {
    db.run(
      `UPDATE separations SET event_date = :ed, last_working_date = :lwd, sub_type = :st, reason = :reason,
              notice_period_days = :notice, approved_by = :appr, notes = :notes, updated_at = :t, updated_by = :u
       WHERE id = :id`,
      {
        id, ed: eventDate, lwd,
        st: payload.subType !== undefined ? V.str(payload.subType, "subType", { max: 80 }) : before.sub_type,
        reason: payload.reason !== undefined ? V.str(payload.reason, "reason", { max: 2000 }) : before.reason,
        notice: payload.noticePeriodDays !== undefined
          ? V.int(payload.noticePeriodDays, "noticePeriodDays", { min: 0, max: 365 }) : before.notice_period_days,
        appr: payload.approvedBy !== undefined ? V.str(payload.approvedBy, "approvedBy", { max: 150 }) : before.approved_by,
        notes: payload.notes !== undefined ? V.str(payload.notes, "notes", { max: 2000 }) : before.notes,
        t: nowIso(), u: uid(ctx),
      }
    );
    if (period) {
      H.closePeriod(db, ctx, { periodId: period.id, endDate: lwd, kind: before.kind, reason: payload.reason || before.reason });
      db.run(`UPDATE assignments SET effective_to = :lwd WHERE employee_id = :e AND (effective_to IS NULL OR effective_to > :lwd)`,
        { lwd, e: before.employee_id });
    }
    H.refreshSnapshot(db, ctx, before.employee_id);
    const after = db.get("SELECT * FROM separations WHERE id = :id", { id });
    audit.record(db, ctx, {
      action: "update", entity: before.kind, entityId: id, employeeId: before.employee_id,
      summary: `تعديل ${labelOf(before.kind)} ${emp.employee_no} — ${emp.full_name_ar}`,
      before, after,
    });
    return shapeSeparation(db, id);
  });
}

/* إلغاء استقالة — تُحذف الحركة وتُعاد الفترة مفتوحة، ويبقى الأثر في التدقيق */
function cancelSeparation(db, ctx, id, reason) {
  const before = db.get("SELECT * FROM separations WHERE id = :id", { id });
  if (!before) throw notFound("لا يوجد سجل إنهاء خدمة بهذا المُعرّف");
  const emp = EMP.rawById(db, before.employee_id);
  EMP.ensureScope(ctx, emp);
  if (!reason || String(reason).trim().length < 3) throw bad("اكتب سبب الإلغاء", "reason_required", { field: "reason" });

  return db.tx(() => {
    db.run("DELETE FROM separations WHERE id = :id", { id });
    if (before.period_id) {
      db.run(`UPDATE employment_periods SET end_date = NULL, end_kind = NULL, end_reason = NULL,
                     updated_at = :t, updated_by = :u WHERE id = :p`,
        { t: nowIso(), u: uid(ctx), p: before.period_id });
    }
    db.run(`UPDATE assignments SET effective_to = NULL
            WHERE employee_id = :e AND effective_to = :lwd`, { e: before.employee_id, lwd: before.last_working_date });
    db.run(`DELETE FROM status_history WHERE ref_type = 'separation' AND ref_id = :id`, { id });
    // تُعاد الحالة التي أغلقتها الاستقالة إلى الانفتاح — وهي التي انتهت
    // في اليوم السابق لتاريخ الحدث بالضبط
    db.run(`UPDATE status_history SET effective_to = NULL
            WHERE employee_id = :e AND effective_to = :closed`,
      { e: before.employee_id, closed: D.addDays(before.event_date, -1) });
    H.refreshSnapshot(db, ctx, before.employee_id);
    audit.record(db, ctx, {
      action: "delete", entity: before.kind, entityId: id, employeeId: before.employee_id,
      summary: `إلغاء ${labelOf(before.kind)} ${emp.employee_no} — ${emp.full_name_ar} · السبب: ${reason}`,
      before, after: null,
    });
    return { cancelled: true };
  });
}

function shapeSeparation(db, id) {
  const r = db.get(
    `SELECT s.*, e.employee_no, e.full_name_ar, e.full_name_en, e.branch_id,
            b.name_ar AS branch_ar, b.name_en AS branch_en, u.full_name AS created_by_name
     FROM separations s JOIN employees e ON e.id = s.employee_id
     LEFT JOIN branches b ON b.id = e.branch_id
     LEFT JOIN users u ON u.id = s.created_by WHERE s.id = :id`, { id }
  );
  if (!r) return null;
  return {
    id: r.id, kind: r.kind,
    employee: { id: r.employee_id, employeeNo: r.employee_no, fullNameAr: r.full_name_ar, fullNameEn: r.full_name_en },
    branch: r.branch_id ? { id: r.branch_id, nameAr: r.branch_ar, nameEn: r.branch_en } : null,
    eventDate: r.event_date, lastWorkingDate: r.last_working_date, subType: r.sub_type,
    reason: r.reason, noticePeriodDays: r.notice_period_days, approvedBy: r.approved_by, notes: r.notes,
    createdAt: r.created_at, createdBy: r.created_by_name,
  };
}

function listSeparations(db, ctx, q = {}) {
  const p = {};
  const where = ["1=1"];
  if (q.kind) { where.push("s.kind = :k"); p.k = V.oneOf(q.kind, "kind", KINDS); }
  if (q.from) { where.push("s.event_date >= :from"); p.from = V.date(q.from, "from"); }
  if (q.to) { where.push("s.event_date <= :to"); p.to = V.date(q.to, "to"); }
  if (q.employeeId) { where.push("s.employee_id = :e"); p.e = String(q.employeeId); }
  if (q.branchId) { where.push("e.branch_id = :b"); p.b = Number(q.branchId); }
  const scope = EMP.scopeSql(ctx, p);
  const sql = ` FROM separations s JOIN employees e ON e.id = s.employee_id WHERE ${where.join(" AND ")}${scope}`;
  const total = db.get(`SELECT COUNT(*) AS c${sql}`, p).c;
  const size = Math.min(Math.max(Number(q.size) || 50, 1), 500);
  const page = Math.max(Number(q.page) || 1, 1);
  const ids = db.all(`SELECT s.id${sql} ORDER BY s.event_date DESC, s.created_at DESC LIMIT :limit OFFSET :offset`,
    Object.assign({}, p, { limit: size, offset: (page - 1) * size }));
  return { total, page, size, rows: ids.map((r) => shapeSeparation(db, r.id)) };
}

/* ------------------------------------------------------ إعادة التوظيف

   لا يُنشأ سجل جديد للموظف العائد: تُفتح له **فترة توظيف جديدة** على
   نفس الملف، ويبقى تاريخ المباشرة الأصلي وفترته السابقة كما هي. */
function rehire(db, ctx, employeeId, payload) {
  const emp = EMP.rawById(db, employeeId);
  if (!emp) throw notFound("لا يوجد موظف بهذا المُعرّف");
  EMP.ensureScope(ctx, emp);

  const last = H.currentPeriod(db, employeeId);
  if (!last || !last.end_date) throw conflict("الموظف على رأس العمل — لا حاجة لإعادة توظيف", "still_employed");

  const date = V.date(payload.rehireDate, "rehireDate", { required: true, label: "تاريخ إعادة التوظيف" });
  if (D.cmp(date, last.end_date) <= 0) {
    V.fail("تاريخ إعادة التوظيف يجب أن يكون بعد آخر يوم عمل السابق", "rehireDate");
  }

  const branchId = pick(db, "branches", payload.branchId, "branchId", emp.branch_id, "الفرع");
  const departmentId = pick(db, "departments", payload.departmentId, "departmentId", emp.department_id, "القسم");
  const jobTitleId = pick(db, "job_titles", payload.jobTitleId, "jobTitleId", emp.job_title_id, "المسمى الوظيفي");
  const employmentType = payload.employmentType !== undefined
    ? V.oneOf(payload.employmentType, "employmentType", EMP.EMPLOYMENT_TYPES) : emp.employment_type;

  return db.tx(() => {
    const period = H.openPeriod(db, ctx, { employeeId, startDate: date, reason: "rehire" });
    H.openAssignment(db, ctx, {
      employeeId, periodId: period.id, branchId, departmentId, jobTitleId,
      managerId: payload.managerId !== undefined ? payload.managerId || null : emp.manager_id,
      employmentType, effectiveFrom: date, reason: "rehire", refType: "period", refId: period.id,
    });
    H.setStatus(db, ctx, { employeeId, status: "active", from: date, reason: "إعادة توظيف", refType: "period", refId: period.id });
    db.run("UPDATE employees SET is_archived = 0, updated_at = :t, updated_by = :u WHERE id = :id",
      { t: nowIso(), u: uid(ctx), id: employeeId });
    H.refreshSnapshot(db, ctx, employeeId);

    audit.record(db, ctx, {
      action: "create", entity: "rehire", entityId: period.id, employeeId,
      summary: `إعادة توظيف ${emp.employee_no} — ${emp.full_name_ar} بتاريخ ${date} (الفترة ${period.seq})`,
      after: { period_id: period.id, start_date: date, seq: period.seq, previous_end: last.end_date },
    });
    return EMP.profile(db, ctx, employeeId);
  });
}

module.exports = {
  transfer, listTransfers, shapeTransfer,
  separate, updateSeparation, cancelSeparation, listSeparations, shapeSeparation,
  rehire, KINDS,
};
