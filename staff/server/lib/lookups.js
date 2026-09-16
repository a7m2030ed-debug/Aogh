/* ======================================================================
   القوائم — الفروع والأقسام والمسميات وأنواع الإجازات
   ----------------------------------------------------------------------
   لا يُحذف عنصر له بيانات تاريخية: يُعطَّل فلا يظهر في قوائم الاختيار،
   ويبقى اسمه على تقارير السنوات الماضية.
   ====================================================================== */

"use strict";

const { nowIso } = require("./db");
const { bad, conflict, notFound } = require("./http");
const V = require("./validate");
const audit = require("./audit");

const TABLES = {
  branches: { table: "branches", label: "الفرع", refs: [["employees", "branch_id"], ["assignments", "branch_id"], ["attendance", "branch_id"]] },
  departments: { table: "departments", label: "القسم", refs: [["employees", "department_id"], ["assignments", "department_id"], ["attendance", "department_id"]] },
  "job-titles": { table: "job_titles", label: "المسمى الوظيفي", refs: [["employees", "job_title_id"], ["assignments", "job_title_id"]] },
  "leave-types": { table: "leave_types", label: "نوع الإجازة", refs: [["leaves", "leave_type_id"]] },
};

function def(kind) {
  const d = TABLES[kind];
  if (!d) throw notFound("قائمة غير معروفة: " + kind);
  return d;
}

function shape(kind, r) {
  const base = {
    id: r.id, code: r.code, nameAr: r.name_ar, nameEn: r.name_en,
    isActive: !!r.is_active, sortOrder: r.sort_order,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
  if (kind === "branches") base.city = r.city;
  if (kind === "leave-types") {
    base.isPaid = !!r.is_paid;
    base.requiresAttachment = !!r.requires_attachment;
    base.attendanceStatus = r.attendance_status;
  }
  return base;
}

function list(db, kind, { includeInactive = true } = {}) {
  const d = def(kind);
  const rows = db.all(
    `SELECT * FROM ${d.table} ${includeInactive ? "" : "WHERE is_active = 1"} ORDER BY sort_order, name_ar`
  );
  return rows.map((r) => shape(kind, r));
}

function usage(db, kind, id) {
  const d = def(kind);
  let n = 0;
  for (const [table, col] of d.refs) {
    n += db.get(`SELECT COUNT(*) AS c FROM ${table} WHERE ${col} = :id`, { id }).c;
  }
  return n;
}

function create(db, ctx, kind, payload) {
  const d = def(kind);
  const nameAr = V.str(payload.nameAr, "nameAr", { required: true, max: 120, label: d.label });
  const code = V.str(payload.code, "code", { max: 30 });
  if (code && db.get(`SELECT id FROM ${d.table} WHERE lower(code) = lower(:c)`, { c: code })) {
    throw conflict("الرمز مستخدم سلفًا", "duplicate_code", { field: "code" });
  }
  if (db.get(`SELECT id FROM ${d.table} WHERE lower(name_ar) = lower(:n)`, { n: nameAr })) {
    throw conflict(`${d.label} بهذا الاسم موجود سلفًا`, "duplicate_name", { field: "nameAr" });
  }

  const t = nowIso();
  const extra = extraFields(kind, payload, null);
  const cols = Object.assign({
    code: code || null, name_ar: nameAr, name_en: V.str(payload.nameEn, "nameEn", { max: 120 }),
    is_active: payload.isActive === undefined ? 1 : V.bool(payload.isActive, 1),
    sort_order: V.int(payload.sortOrder, "sortOrder", { min: 0, max: 9999 }) || 500,
    created_at: t, created_by: (ctx.user && ctx.user.id) || null, updated_at: t, updated_by: (ctx.user && ctx.user.id) || null,
  }, extra);

  const keys = Object.keys(cols);
  const r = db.run(`INSERT INTO ${d.table}(${keys.join(",")}) VALUES(${keys.map((k) => ":" + k).join(",")})`, cols);
  const id = Number(r.lastInsertRowid);
  audit.record(db, ctx, {
    action: "create", entity: kind, entityId: String(id),
    summary: `إضافة ${d.label}: ${nameAr}`, after: cols,
  });
  return shape(kind, db.get(`SELECT * FROM ${d.table} WHERE id = :id`, { id }));
}

function extraFields(kind, payload, before) {
  if (kind === "branches") {
    return { city: payload.city !== undefined ? V.str(payload.city, "city", { max: 80 }) : (before ? before.city : null) };
  }
  if (kind === "leave-types") {
    return {
      is_paid: payload.isPaid !== undefined ? V.bool(payload.isPaid, 1) : (before ? before.is_paid : 1),
      requires_attachment: payload.requiresAttachment !== undefined
        ? V.bool(payload.requiresAttachment, 0) : (before ? before.requires_attachment : 0),
      attendance_status: payload.attendanceStatus !== undefined
        ? V.oneOf(payload.attendanceStatus, "attendanceStatus",
          ["sick_leave", "annual_leave", "emergency_leave", "other_leave", "permission", "official_mission"])
        : (before ? before.attendance_status : "other_leave"),
    };
  }
  return {};
}

function update(db, ctx, kind, id, payload) {
  const d = def(kind);
  const before = db.get(`SELECT * FROM ${d.table} WHERE id = :id`, { id: Number(id) });
  if (!before) throw notFound(`${d.label} غير موجود`);

  const cols = Object.assign({
    code: payload.code !== undefined ? V.str(payload.code, "code", { max: 30 }) : before.code,
    name_ar: payload.nameAr !== undefined ? V.str(payload.nameAr, "nameAr", { required: true, max: 120 }) : before.name_ar,
    name_en: payload.nameEn !== undefined ? V.str(payload.nameEn, "nameEn", { max: 120 }) : before.name_en,
    is_active: payload.isActive !== undefined ? V.bool(payload.isActive, 1) : before.is_active,
    sort_order: payload.sortOrder !== undefined ? V.int(payload.sortOrder, "sortOrder", { min: 0, max: 9999 }) : before.sort_order,
  }, extraFields(kind, payload, before));

  if (cols.code && cols.code !== before.code &&
      db.get(`SELECT id FROM ${d.table} WHERE lower(code) = lower(:c) AND id != :id`, { c: cols.code, id: Number(id) })) {
    throw conflict("الرمز مستخدم سلفًا", "duplicate_code", { field: "code" });
  }

  const sets = Object.keys(cols).map((k) => `${k} = :${k}`).join(", ");
  db.run(`UPDATE ${d.table} SET ${sets}, updated_at = :t, updated_by = :by WHERE id = :id`,
    Object.assign({ id: Number(id), t: nowIso(), by: (ctx.user && ctx.user.id) || null }, cols));

  const after = db.get(`SELECT * FROM ${d.table} WHERE id = :id`, { id: Number(id) });
  const changes = audit.diff(before, after);
  if (changes.length) {
    audit.record(db, ctx, {
      action: "update", entity: kind, entityId: String(id),
      summary: `تعديل ${d.label}: ${after.name_ar}`, before, after, changes,
    });
  }
  return shape(kind, after);
}

/* الحذف لا يُسمح به إلا لعنصر لم يُستعمل قط */
function remove(db, ctx, kind, id) {
  const d = def(kind);
  const before = db.get(`SELECT * FROM ${d.table} WHERE id = :id`, { id: Number(id) });
  if (!before) throw notFound(`${d.label} غير موجود`);
  const used = usage(db, kind, Number(id));
  if (used) {
    throw conflict(
      `لا يُحذف ${d.label} «${before.name_ar}» لأن له ${used} سجلًا تاريخيًا. عطّله بدل حذفه ليبقى في تقارير الماضي.`,
      "lookup_in_use", { usage: used }
    );
  }
  db.run(`DELETE FROM ${d.table} WHERE id = :id`, { id: Number(id) });
  audit.record(db, ctx, {
    action: "delete", entity: kind, entityId: String(id),
    summary: `حذف ${d.label}: ${before.name_ar}`, before, after: null,
  });
  return { deleted: true };
}

function all(db) {
  return {
    branches: list(db, "branches"),
    departments: list(db, "departments"),
    jobTitles: list(db, "job-titles"),
    leaveTypes: list(db, "leave-types"),
  };
}

module.exports = { list, create, update, remove, usage, all, shape, TABLES };
