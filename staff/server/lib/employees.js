/* ======================================================================
   الموظفون — الإضافة والتعديل والبحث وملف الموظف والخط الزمني
   ----------------------------------------------------------------------
   لا يوجد في هذا الملف حذف يُفقد بيانات: «الحذف» أرشفة، والحذف النهائي
   مسار مستقل لا يفتحه إلا Super Admin ويُسجَّل في سجل التدقيق.
   ====================================================================== */

"use strict";

const { uuid, nowIso, today } = require("./db");
const { bad, conflict, notFound, forbidden } = require("./http");
const V = require("./validate");
const D = require("./dates");
const H = require("./history");
const audit = require("./audit");

const STATUSES = ["active", "resigned", "terminated", "retired", "on_leave", "suspended", "transferred"];
const MANUAL_STATUSES = ["active", "on_leave", "suspended", "transferred"];
const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "temporary", "intern", "locum"];
const GENDERS = ["male", "female"];

/* --------------------------------------------------------- التشكيل */

function maskNid(nid) {
  if (!nid) return null;
  const s = String(nid);
  return s.length <= 4 ? "••••" : s.slice(0, 2) + "•".repeat(Math.max(s.length - 4, 2)) + s.slice(-2);
}

function shape(row, ctx) {
  if (!row) return null;
  const seeNid = !ctx || !ctx.permissions || ctx.permissions.includes("pii.national_id");
  return {
    id: row.id,
    employeeNo: row.employee_no,
    nationalId: seeNid ? row.national_id : maskNid(row.national_id),
    nationalIdMasked: !seeNid,
    fullNameAr: row.full_name_ar,
    fullNameEn: row.full_name_en,
    gender: row.gender,
    mobile: row.mobile,
    email: row.email,
    dob: row.dob,
    nationality: row.nationality,
    originalJoiningDate: row.original_joining_date,
    employmentStatus: row.employment_status,
    employmentType: row.employment_type,
    employeeCategory: row.employee_category,
    branch: row.branch_id ? { id: row.branch_id, nameAr: row.branch_ar, nameEn: row.branch_en } : null,
    department: row.department_id ? { id: row.department_id, nameAr: row.dept_ar, nameEn: row.dept_en } : null,
    jobTitle: row.job_title_id ? { id: row.job_title_id, nameAr: row.job_ar, nameEn: row.job_en } : null,
    manager: row.manager_id ? { id: row.manager_id, name: row.manager_name || null } : null,
    positionStartDate: row.position_start_date,
    branchStartDate: row.branch_start_date,
    probationEndDate: row.probation_end_date,
    notes: row.notes,
    isArchived: !!row.is_archived,
    createdAt: row.created_at, createdBy: row.created_by_name || row.created_by,
    updatedAt: row.updated_at, updatedBy: row.updated_by_name || row.updated_by,
  };
}

const SELECT = `
  SELECT e.*, b.name_ar AS branch_ar, b.name_en AS branch_en,
         d.name_ar AS dept_ar, d.name_en AS dept_en,
         j.name_ar AS job_ar, j.name_en AS job_en,
         m.full_name_ar AS manager_name,
         cu.full_name AS created_by_name, uu.full_name AS updated_by_name
  FROM employees e
  LEFT JOIN branches b    ON b.id = e.branch_id
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN job_titles j  ON j.id = e.job_title_id
  LEFT JOIN employees m   ON m.id = e.manager_id
  LEFT JOIN users cu      ON cu.id = e.created_by
  LEFT JOIN users uu      ON uu.id = e.updated_by`;

function rawById(db, id) {
  return db.get(SELECT + " WHERE e.id = :id", { id });
}

function byId(db, ctx, id) {
  const row = rawById(db, id);
  if (!row) throw notFound("لا يوجد موظف بهذا المُعرّف");
  ensureScope(ctx, row);
  return shape(row, ctx);
}

/* نطاق المدير: مَن حُدِّدت له فروع لا يرى غيرها — لا في البحث ولا بالرابط */
function ensureScope(ctx, row) {
  const scope = ctx && ctx.user && ctx.user.branchScope;
  if (!scope || !scope.length) return;
  if (!row.branch_id || !scope.includes(Number(row.branch_id))) {
    throw forbidden("هذا الموظف خارج الفروع المسموح لك بها");
  }
}

function scopeSql(ctx, params, alias = "e") {
  const scope = ctx && ctx.user && ctx.user.branchScope;
  if (!scope || !scope.length) return "";
  scope.forEach((b, i) => (params["sc" + i] = b));
  return ` AND ${alias}.branch_id IN (${scope.map((_, i) => ":sc" + i).join(",")})`;
}

/* ----------------------------------------------------------- البحث */

const SORTS = {
  name: "e.full_name_ar",
  employeeNo: "e.employee_no",
  joiningDate: "e.original_joining_date",
  branch: "b.name_ar",
  status: "e.employment_status",
  updated: "e.updated_at",
};

function list(db, ctx, q = {}) {
  const p = {};
  const where = [];

  if (q.q) {
    const term = String(q.q).trim();
    // تطابق تام لرقم الهوية أو الرقم الوظيفي: النتيجة واحدة لا قائمة متشابهين
    const exact = db.get(
      "SELECT id FROM employees WHERE employee_no = :t OR national_id = :t", { t: term }
    );
    if (exact) {
      where.push("e.id = :exact");
      p.exact = exact.id;
    } else {
      where.push("(e.full_name_ar LIKE :like OR e.full_name_en LIKE :like OR e.employee_no LIKE :like" +
        " OR e.national_id LIKE :like OR e.mobile LIKE :like)");
      p.like = `%${term}%`;
    }
  }
  if (q.branchId) { where.push("e.branch_id = :b"); p.b = Number(q.branchId); }
  if (q.departmentId) { where.push("e.department_id = :d"); p.d = Number(q.departmentId); }
  if (q.jobTitleId) { where.push("e.job_title_id = :j"); p.j = Number(q.jobTitleId); }
  if (q.status) { where.push("e.employment_status = :s"); p.s = String(q.status); }
  if (q.employmentType) { where.push("e.employment_type = :et"); p.et = String(q.employmentType); }
  if (q.nationality) { where.push("e.nationality = :nat"); p.nat = String(q.nationality); }
  if (q.managerId) { where.push("e.manager_id = :mg"); p.mg = String(q.managerId); }
  if (q.joinedFrom) { where.push("e.original_joining_date >= :jf"); p.jf = V.date(q.joinedFrom, "joinedFrom"); }
  if (q.joinedTo) { where.push("e.original_joining_date <= :jt"); p.jt = V.date(q.joinedTo, "joinedTo"); }
  if (!V.bool(q.includeArchived, 0)) where.push("e.is_archived = 0");

  let sql = where.length ? " WHERE " + where.join(" AND ") : " WHERE 1=1";
  sql += scopeSql(ctx, p);

  const total = db.get(`SELECT COUNT(*) AS c FROM employees e LEFT JOIN branches b ON b.id = e.branch_id${sql}`, p).c;
  const size = Math.min(Math.max(Number(q.size) || 25, 1), 500);
  const page = Math.max(Number(q.page) || 1, 1);
  const order = SORTS[q.sort] || SORTS.name;
  const dir = String(q.dir || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

  const rows = db.all(
    `${SELECT}${sql} ORDER BY ${order} ${dir}, e.employee_no ASC LIMIT :limit OFFSET :offset`,
    Object.assign({}, p, { limit: size, offset: (page - 1) * size })
  );
  return { total, page, size, rows: rows.map((r) => shape(r, ctx)) };
}

/* بحث مباشر بالهوية أو الرقم الوظيفي — تطابق تام لا جزئي */
function lookup(db, ctx, { nationalId, employeeNo }) {
  const term = String(nationalId || employeeNo || "").trim();
  if (!term) throw bad("أدخل رقم الهوية أو الرقم الوظيفي");
  const row = db.get(
    SELECT + (nationalId ? " WHERE e.national_id = :t" : employeeNo ? " WHERE e.employee_no = :t"
      : " WHERE e.national_id = :t OR e.employee_no = :t"),
    { t: term }
  );
  if (!row) return null;
  ensureScope(ctx, row);
  return shape(row, ctx);
}

/* --------------------------------------------------------- الإضافة */

function readPayload(db, payload, settings, { partial = false } = {}) {
  const p = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(payload, k);
  const need = (k) => !partial || has(k);

  if (need("employeeNo")) p.employee_no = V.employeeNo(payload.employeeNo, settings);
  if (need("nationalId")) p.national_id = V.nationalId(payload.nationalId, settings);
  if (need("fullNameAr")) p.full_name_ar = V.str(payload.fullNameAr, "fullNameAr", { required: !partial, max: 150, label: "الاسم" });
  if (has("fullNameEn")) p.full_name_en = V.str(payload.fullNameEn, "fullNameEn", { max: 150 });
  if (has("gender")) p.gender = V.oneOf(payload.gender, "gender", GENDERS);
  if (has("mobile")) p.mobile = V.mobile(payload.mobile);
  if (has("email")) p.email = V.email(payload.email);
  if (has("dob")) p.dob = V.date(payload.dob, "dob", { label: "تاريخ الميلاد" });
  if (has("nationality")) p.nationality = V.str(payload.nationality, "nationality", { max: 60 });
  if (need("originalJoiningDate")) {
    p.original_joining_date = V.date(payload.originalJoiningDate, "originalJoiningDate",
      { required: !partial, label: "تاريخ المباشرة" });
  }
  if (has("employmentType")) p.employment_type = V.oneOf(payload.employmentType, "employmentType", EMPLOYMENT_TYPES);
  if (has("employeeCategory")) p.employee_category = V.str(payload.employeeCategory, "employeeCategory", { max: 60 });
  if (need("branchId")) p.branch_id = lookupId(db, "branches", payload.branchId, "branchId", !partial, "الفرع");
  if (has("departmentId")) p.department_id = lookupId(db, "departments", payload.departmentId, "departmentId", false, "القسم");
  if (has("jobTitleId")) p.job_title_id = lookupId(db, "job_titles", payload.jobTitleId, "jobTitleId", false, "المسمى الوظيفي");
  if (has("managerId")) {
    p.manager_id = V.str(payload.managerId, "managerId", { max: 40 });
    if (p.manager_id && !db.get("SELECT id FROM employees WHERE id = :id", { id: p.manager_id })) {
      V.fail("المدير المباشر غير موجود", "managerId");
    }
  }
  if (has("probationEndDate")) p.probation_end_date = V.date(payload.probationEndDate, "probationEndDate");
  if (has("notes")) p.notes = V.str(payload.notes, "notes", { max: 4000 });

  if (p.dob && p.original_joining_date) {
    V.ensureOrder(p.dob, p.original_joining_date, "تاريخ المباشرة لا يكون قبل تاريخ الميلاد", "originalJoiningDate");
  }
  return p;
}

function lookupId(db, table, value, field, required, label) {
  if (value === null || value === undefined || value === "") {
    if (required) V.fail(`الحقل «${label}» مطلوب`, field);
    return null;
  }
  const id = V.int(value, field, { required: true, min: 1, label });
  const row = db.get(`SELECT id, is_active FROM ${table} WHERE id = :id`, { id });
  if (!row) V.fail(`«${label}» المختار غير موجود`, field);
  return id;
}

function assertUnique(db, { nationalId, employeeNo, exceptId }) {
  if (nationalId) {
    const dup = db.get("SELECT id, employee_no, full_name_ar FROM employees WHERE national_id = :n AND id != :x",
      { n: nationalId, x: exceptId || "" });
    if (dup) {
      throw conflict("رقم الهوية مسجَّل لموظف آخر", "duplicate_national_id",
        { employeeId: dup.id, employeeNo: dup.employee_no, name: dup.full_name_ar });
    }
  }
  if (employeeNo) {
    const dup = db.get("SELECT id, employee_no, full_name_ar FROM employees WHERE employee_no = :n AND id != :x",
      { n: employeeNo, x: exceptId || "" });
    if (dup) {
      throw conflict("الرقم الوظيفي مسجَّل لموظف آخر", "duplicate_employee_no",
        { employeeId: dup.id, employeeNo: dup.employee_no, name: dup.full_name_ar });
    }
  }
}

function create(db, ctx, payload) {
  const settings = db.settings();
  const p = readPayload(db, payload, settings);
  assertUnique(db, { nationalId: p.national_id, employeeNo: p.employee_no });

  return db.tx(() => {
    const id = uuid();
    const t = nowIso();
    const probation = p.probation_end_date ||
      (settings.probationDays ? D.addDays(p.original_joining_date, settings.probationDays) : null);

    db.run(
      `INSERT INTO employees(id, employee_no, national_id, full_name_ar, full_name_en, gender, mobile, email,
                             dob, nationality, original_joining_date, employment_status, employment_type,
                             employee_category, branch_id, department_id, job_title_id, manager_id,
                             position_start_date, branch_start_date, probation_end_date, notes,
                             is_archived, created_at, created_by, updated_at, updated_by)
       VALUES(:id, :no, :nid, :nar, :nen, :g, :mob, :mail, :dob, :nat, :join, 'active', :et, :cat,
              :b, :dep, :j, :mgr, :join, :join, :prob, :notes, 0, :t, :u, :t, :u)`,
      {
        id, no: p.employee_no, nid: p.national_id, nar: p.full_name_ar, nen: p.full_name_en || null,
        g: p.gender || null, mob: p.mobile || null, mail: p.email || null, dob: p.dob || null,
        nat: p.nationality || null, join: p.original_joining_date, et: p.employment_type || null,
        cat: p.employee_category || null, b: p.branch_id, dep: p.department_id || null,
        j: p.job_title_id || null, mgr: p.manager_id || null, prob: probation,
        notes: p.notes || null, t, u: (ctx.user && ctx.user.id) || null,
      }
    );

    const period = H.openPeriod(db, ctx, { employeeId: id, startDate: p.original_joining_date, reason: "hire" });
    H.openAssignment(db, ctx, {
      employeeId: id, periodId: period.id, branchId: p.branch_id, departmentId: p.department_id,
      jobTitleId: p.job_title_id, managerId: p.manager_id, employmentType: p.employment_type,
      effectiveFrom: p.original_joining_date, reason: "hire",
    });
    H.setStatus(db, ctx, { employeeId: id, status: "active", from: p.original_joining_date, reason: "مباشرة العمل" });
    H.refreshSnapshot(db, ctx, id);

    const row = rawById(db, id);
    audit.record(db, ctx, {
      action: "create", entity: "employee", entityId: id, employeeId: id,
      summary: `إضافة موظف ${p.employee_no} — ${p.full_name_ar}`, after: plain(row),
    });
    return shape(row, ctx);
  });
}

/* ---------------------------------------------------------- التعديل */

const AUDITED = ["employee_no", "national_id", "full_name_ar", "full_name_en", "gender", "mobile", "email",
  "dob", "nationality", "original_joining_date", "employment_status", "employment_type", "employee_category",
  "branch_id", "department_id", "job_title_id", "manager_id", "probation_end_date", "notes", "is_archived"];

function plain(row) {
  const out = {};
  for (const k of AUDITED) out[k] = row[k] === undefined ? null : row[k];
  return out;
}

function update(db, ctx, id, payload) {
  const before = rawById(db, id);
  if (!before) throw notFound("لا يوجد موظف بهذا المُعرّف");
  ensureScope(ctx, before);

  const settings = db.settings();
  const p = readPayload(db, payload, settings, { partial: true });
  assertUnique(db, { nationalId: p.national_id, employeeNo: p.employee_no, exceptId: id });

  // الحالات التي لا تُضبط يدويًا: لها مساراتها (استقالة · إنهاء خدمة)
  let manualStatus = null;
  if (payload.employmentStatus !== undefined && payload.employmentStatus !== before.employment_status) {
    manualStatus = V.oneOf(payload.employmentStatus, "employmentStatus", MANUAL_STATUSES);
    if (!manualStatus) V.fail("هذه الحالة تُسجَّل من شاشة الاستقالة أو إنهاء الخدمة", "employmentStatus");
  }

  if (p.original_joining_date && p.original_joining_date !== before.original_joining_date) {
    const period = db.get("SELECT * FROM employment_periods WHERE employee_id = :e ORDER BY seq ASC LIMIT 1", { e: id });
    if (period && period.end_date && D.cmp(p.original_joining_date, period.end_date) > 0) {
      V.fail("تاريخ المباشرة لا يكون بعد آخر يوم عمل", "originalJoiningDate");
    }
  }

  return db.tx(() => {
    const cols = [];
    const params = { id, t: nowIso(), u: (ctx.user && ctx.user.id) || null };
    const map = {
      employee_no: "employee_no", national_id: "national_id", full_name_ar: "full_name_ar",
      full_name_en: "full_name_en", gender: "gender", mobile: "mobile", email: "email", dob: "dob",
      nationality: "nationality", original_joining_date: "original_joining_date",
      employment_type: "employment_type", employee_category: "employee_category",
      probation_end_date: "probation_end_date", notes: "notes",
    };
    for (const [k, col] of Object.entries(map)) {
      if (k in p) { cols.push(`${col} = :${k}`); params[k] = p[k]; }
    }
    if (cols.length) {
      db.run(`UPDATE employees SET ${cols.join(", ")}, updated_at = :t, updated_by = :u WHERE id = :id`, params);
    } else {
      db.run("UPDATE employees SET updated_at = :t, updated_by = :u WHERE id = :id", params);
    }

    // تصحيح الإسناد الحالي (خطأ إدخال). النقل الحقيقي له سجله المستقل.
    const asgPatch = {};
    if ("branch_id" in p && p.branch_id !== before.branch_id) asgPatch.branchId = p.branch_id;
    if ("department_id" in p && p.department_id !== before.department_id) asgPatch.departmentId = p.department_id;
    if ("job_title_id" in p && p.job_title_id !== before.job_title_id) asgPatch.jobTitleId = p.job_title_id;
    if ("manager_id" in p && p.manager_id !== before.manager_id) asgPatch.managerId = p.manager_id;
    if ("employment_type" in p && p.employment_type !== before.employment_type) asgPatch.employmentType = p.employment_type;
    if (Object.keys(asgPatch).length) H.correctCurrentAssignment(db, ctx, id, asgPatch);

    if (p.original_joining_date && p.original_joining_date !== before.original_joining_date) {
      const first = db.get("SELECT * FROM employment_periods WHERE employee_id = :e ORDER BY seq ASC LIMIT 1", { e: id });
      if (first) {
        db.run("UPDATE employment_periods SET start_date = :d, updated_at = :t WHERE id = :id",
          { d: p.original_joining_date, t: nowIso(), id: first.id });
        db.run("UPDATE assignments SET effective_from = :d WHERE employee_id = :e AND reason = 'hire' AND effective_from = :old",
          { d: p.original_joining_date, e: id, old: before.original_joining_date });
      }
    }

    if (manualStatus) {
      H.setStatus(db, ctx, { employeeId: id, status: manualStatus, from: today(), reason: payload.statusReason || "تغيير يدوي للحالة" });
      db.run("UPDATE employees SET employment_status = :s WHERE id = :id", { s: manualStatus, id });
    } else {
      H.refreshSnapshot(db, ctx, id);
    }

    const after = rawById(db, id);
    const changes = audit.diff(plain(before), plain(after));
    if (changes.length) {
      audit.record(db, ctx, {
        action: "update", entity: "employee", entityId: id, employeeId: id,
        summary: `تعديل بيانات ${after.employee_no} — ${after.full_name_ar}`,
        before: plain(before), after: plain(after), changes,
      });
    }
    return shape(after, ctx);
  });
}

/* --------------------------------------------- الأرشفة والحذف النهائي */

function archive(db, ctx, id, archived, reason) {
  const before = rawById(db, id);
  if (!before) throw notFound("لا يوجد موظف بهذا المُعرّف");
  ensureScope(ctx, before);
  return db.tx(() => {
    db.run("UPDATE employees SET is_archived = :a, updated_at = :t, updated_by = :u WHERE id = :id",
      { a: archived ? 1 : 0, t: nowIso(), u: (ctx.user && ctx.user.id) || null, id });
    audit.record(db, ctx, {
      action: archived ? "archive" : "unarchive", entity: "employee", entityId: id, employeeId: id,
      summary: `${archived ? "أرشفة" : "إلغاء أرشفة"} ${before.employee_no} — ${before.full_name_ar}` +
        (reason ? ` · ${reason}` : ""),
      before: { is_archived: before.is_archived }, after: { is_archived: archived ? 1 : 0 },
    });
    return shape(rawById(db, id), ctx);
  });
}

/* حذف نهائي — لا تفتحه الواجهة إلا لـSuper Admin، ويترك أثره في التدقيق
   (بنسخة كاملة من السجل المحذوف حتى يمكن إعادة بنائه). */
function remove(db, ctx, id, reason) {
  const before = rawById(db, id);
  if (!before) throw notFound("لا يوجد موظف بهذا المُعرّف");
  if (!reason || String(reason).trim().length < 5) {
    throw bad("الحذف النهائي يحتاج سببًا مكتوبًا", "reason_required", { field: "reason" });
  }
  return db.tx(() => {
    const snapshot = {
      employee: plain(before),
      periods: db.all("SELECT * FROM employment_periods WHERE employee_id = :e", { e: id }),
      assignments: db.all("SELECT * FROM assignments WHERE employee_id = :e", { e: id }),
      separations: db.all("SELECT * FROM separations WHERE employee_id = :e", { e: id }),
      transfers: db.all("SELECT * FROM transfers WHERE employee_id = :e", { e: id }),
    };
    db.run("UPDATE employees SET manager_id = NULL WHERE manager_id = :id", { id });
    db.run("DELETE FROM employees WHERE id = :id", { id });
    audit.record(db, ctx, {
      action: "delete", entity: "employee", entityId: id, employeeId: id,
      summary: `حذف نهائي للموظف ${before.employee_no} — ${before.full_name_ar} · السبب: ${reason}`,
      before: snapshot.employee, after: null,
      changes: [{ field: "snapshot", before: JSON.stringify(snapshot).slice(0, 20000), after: null }],
    });
    return { deleted: true };
  });
}

/* ----------------------------------------------------- ملف الموظف */

function profile(db, ctx, id) {
  const emp = byId(db, ctx, id);
  const periods = db.all(
    "SELECT * FROM employment_periods WHERE employee_id = :e ORDER BY seq ASC", { e: id }
  ).map((p) => ({
    id: p.id, seq: p.seq, startDate: p.start_date, startReason: p.start_reason,
    endDate: p.end_date, endKind: p.end_kind, endReason: p.end_reason,
  }));

  const assignments = db.all(
    `SELECT a.*, b.name_ar AS branch_ar, b.name_en AS branch_en, d.name_ar AS dept_ar, d.name_en AS dept_en,
            j.name_ar AS job_ar, j.name_en AS job_en
     FROM assignments a
     LEFT JOIN branches b ON b.id = a.branch_id
     LEFT JOIN departments d ON d.id = a.department_id
     LEFT JOIN job_titles j ON j.id = a.job_title_id
     WHERE a.employee_id = :e ORDER BY a.effective_from ASC`, { e: id }
  ).map((a) => ({
    id: a.id, from: a.effective_from, to: a.effective_to, reason: a.reason,
    branch: a.branch_id ? { id: a.branch_id, nameAr: a.branch_ar, nameEn: a.branch_en } : null,
    department: a.department_id ? { id: a.department_id, nameAr: a.dept_ar, nameEn: a.dept_en } : null,
    jobTitle: a.job_title_id ? { id: a.job_title_id, nameAr: a.job_ar, nameEn: a.job_en } : null,
  }));

  const statuses = db.all(
    "SELECT * FROM status_history WHERE employee_id = :e ORDER BY effective_from ASC, created_at ASC", { e: id }
  ).map((s) => ({ status: s.status, from: s.effective_from, to: s.effective_to, reason: s.reason }));

  const stats = statistics(db, id);
  return { employee: emp, periods, assignments, statuses, stats };
}

/* مؤشرات الموظف — محسوبة من السجلات لا مُخزَّنة */
function statistics(db, id, range) {
  const p = { e: id, from: (range && range.from) || "0000-01-01", to: (range && range.to) || "9999-12-31" };
  const att = db.get(
    `SELECT
       SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absences,
       SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS lateCount,
       COALESCE(SUM(late_minutes), 0) AS lateMinutes,
       SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present
     FROM attendance WHERE employee_id = :e AND date BETWEEN :from AND :to`, p
  );
  const lv = db.get(
    `SELECT COALESCE(SUM(CASE WHEN lt.code = 'sick' THEN l.days ELSE 0 END), 0) AS sickDays,
            COALESCE(SUM(CASE WHEN lt.code = 'annual' THEN l.days ELSE 0 END), 0) AS annualDays,
            COALESCE(SUM(l.days), 0) AS totalDays
     FROM leaves l LEFT JOIN leave_types lt ON lt.id = l.leave_type_id
     WHERE l.employee_id = :e AND l.approval_status = 'approved' AND l.start_date <= :to AND l.end_date >= :from`, p
  );
  const dis = db.get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN action_type IN ('warning_letter','written_warning','final_warning') THEN 1 ELSE 0 END) AS warnings
     FROM disciplinary_actions WHERE employee_id = :e AND action_date BETWEEN :from AND :to`, p
  );
  const ca = db.get(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status != 'closed' THEN 1 ELSE 0 END) AS open
     FROM corrective_actions WHERE employee_id = :e AND date_opened BETWEEN :from AND :to`, p
  );
  const lateCount = att.lateCount || 0;
  return {
    absences: att.absences || 0,
    lateCount,
    lateMinutes: att.lateMinutes || 0,
    lateAverage: lateCount ? Math.round(((att.lateMinutes || 0) / lateCount) * 10) / 10 : 0,
    presentDays: att.present || 0,
    sickLeaveDays: lv.sickDays || 0,
    annualLeaveDays: lv.annualDays || 0,
    totalLeaveDays: lv.totalDays || 0,
    disciplinaryTotal: dis.total || 0,
    warningLetters: dis.warnings || 0,
    correctiveActions: ca.total || 0,
    correctiveOpen: ca.open || 0,
  };
}

/* ------------------------------------------------------- الخط الزمني

   كل حدث بتاريخه الفعلي (event date) ومعه تاريخ إدخاله (created at)،
   فما أُدخل متأخرًا يظهر في موضعه الصحيح من التاريخ لا في يوم إدخاله. */
function timeline(db, ctx, id) {
  const emp = rawById(db, id);
  if (!emp) throw notFound("لا يوجد موظف بهذا المُعرّف");
  ensureScope(ctx, emp);
  const ev = [];
  const push = (date, type, details, row) => {
    if (!date) return;
    ev.push({
      date, type, details: details || {},
      createdAt: row ? row.created_at : null,
      createdBy: row ? row.created_by_name || null : null,
    });
  };
  const byName = (t) => `LEFT JOIN users u ON u.id = ${t}.created_by`;

  for (const p of db.all(`SELECT p.*, u.full_name AS created_by_name FROM employment_periods p ${byName("p")} WHERE p.employee_id = :e ORDER BY p.seq`, { e: id })) {
    push(p.start_date, p.start_reason === "rehire" ? "rehired" : "joined", { seq: p.seq }, p);
    if (p.end_date) push(p.end_date, "last_working_day", { kind: p.end_kind, seq: p.seq }, p);
  }

  for (const t of db.all(
    `SELECT t.*, u.full_name AS created_by_name,
            fb.name_ar AS fb_ar, fb.name_en AS fb_en, tb.name_ar AS tb_ar, tb.name_en AS tb_en,
            fd.name_ar AS fd_ar, td.name_ar AS td_ar, fj.name_ar AS fj_ar, tj.name_ar AS tj_ar
     FROM transfers t ${byName("t")}
     LEFT JOIN branches fb ON fb.id = t.from_branch_id LEFT JOIN branches tb ON tb.id = t.to_branch_id
     LEFT JOIN departments fd ON fd.id = t.from_department_id LEFT JOIN departments td ON td.id = t.to_department_id
     LEFT JOIN job_titles fj ON fj.id = t.from_job_title_id LEFT JOIN job_titles tj ON tj.id = t.to_job_title_id
     WHERE t.employee_id = :e`, { e: id })) {
    push(t.transfer_date, "transfer", {
      id: t.id, fromBranch: t.fb_ar, toBranch: t.tb_ar, fromBranchEn: t.fb_en, toBranchEn: t.tb_en,
      fromDepartment: t.fd_ar, toDepartment: t.td_ar, fromJobTitle: t.fj_ar, toJobTitle: t.tj_ar,
      reason: t.reason,
    }, t);
  }

  for (const s of db.all(`SELECT s.*, u.full_name AS created_by_name FROM separations s ${byName("s")} WHERE s.employee_id = :e`, { e: id })) {
    push(s.event_date, s.kind, { id: s.id, subType: s.sub_type, reason: s.reason, lastWorkingDate: s.last_working_date }, s);
  }

  for (const l of db.all(
    `SELECT l.*, lt.name_ar AS type_ar, lt.name_en AS type_en, lt.code AS type_code, u.full_name AS created_by_name
     FROM leaves l LEFT JOIN leave_types lt ON lt.id = l.leave_type_id ${byName("l")} WHERE l.employee_id = :e`, { e: id })) {
    push(l.start_date, "leave", {
      id: l.id, typeAr: l.type_ar, typeEn: l.type_en, code: l.type_code, days: l.days,
      startDate: l.start_date, endDate: l.end_date, status: l.approval_status,
    }, l);
  }

  for (const a of db.all(
    `SELECT a.*, u.full_name AS created_by_name FROM attendance a ${byName("a")}
     WHERE a.employee_id = :e AND a.status IN ('absent','late')`, { e: id })) {
    push(a.date, a.status, { id: a.id, lateMinutes: a.late_minutes, approved: a.approved, reason: a.reason }, a);
  }

  for (const d of db.all(`SELECT d.*, u.full_name AS created_by_name FROM disciplinary_actions d ${byName("d")} WHERE d.employee_id = :e`, { e: id })) {
    push(d.action_date, "disciplinary", { id: d.id, actionType: d.action_type, reason: d.reason, status: d.status }, d);
  }

  for (const c of db.all(`SELECT c.*, u.full_name AS created_by_name FROM corrective_actions c ${byName("c")} WHERE c.employee_id = :e`, { e: id })) {
    push(c.date_opened, "corrective_opened", { id: c.id, reason: c.reason, dueDate: c.due_date, status: c.status }, c);
    if (c.date_closed) push(c.date_closed, "corrective_closed", { id: c.id, notes: c.closure_notes }, c);
  }

  const created = db.get("SELECT e.created_at, u.full_name AS n FROM employees e LEFT JOIN users u ON u.id = e.created_by WHERE e.id = :e", { e: id });
  if (created) {
    ev.push({
      date: String(created.created_at).slice(0, 10), type: "record_created",
      details: { by: created.n }, createdAt: created.created_at, createdBy: created.n,
    });
  }

  ev.sort((a, b) => (a.date === b.date ? String(a.createdAt || "").localeCompare(String(b.createdAt || "")) : a.date < b.date ? 1 : -1));
  return ev;
}

module.exports = {
  list, lookup, byId, rawById, create, update, archive, remove, profile, timeline, statistics,
  shape, plain, maskNid, ensureScope, scopeSql, assertUnique, readPayload,
  STATUSES, MANUAL_STATUSES, EMPLOYMENT_TYPES, GENDERS,
};
