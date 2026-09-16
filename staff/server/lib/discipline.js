/* ======================================================================
   الإجراءات الانضباطية والإجراءات التصحيحية
   ----------------------------------------------------------------------
   «متأخّر» ليست حالة تُخزَّن بل تُحسب: إجراء تصحيحي غير مغلق تجاوز تاريخ
   استحقاقه متأخّر اليوم ولو حُفظ أمس على أنه مفتوح — فلا يبقى تنبيه
   قديم معلَّقًا لأن أحدًا لم يحدّث حقلًا بيده.
   ====================================================================== */

"use strict";

const { uuid, nowIso, today } = require("./db");
const { bad, notFound } = require("./http");
const V = require("./validate");
const D = require("./dates");
const audit = require("./audit");
const EMP = require("./employees");

const ACTION_TYPES = ["verbal_warning", "warning_letter", "written_warning", "final_warning", "corrective_action", "other"];
const WARNING_TYPES = ["warning_letter", "written_warning", "final_warning"];
const ACTION_STATUS = ["active", "revoked", "closed"];
const CA_STATUS = ["open", "in_progress", "closed"];

const uid = (ctx) => (ctx.user && ctx.user.id) || null;

/* -------------------------------------------------- إجراءات انضباطية */

const DA_SELECT = `
  SELECT d.*, e.employee_no, e.full_name_ar, e.full_name_en, e.branch_id, e.department_id,
         b.name_ar AS branch_ar, b.name_en AS branch_en,
         cu.full_name AS created_by_name, uu.full_name AS updated_by_name,
         (SELECT COUNT(*) FROM attachments a WHERE a.ref_type='disciplinary' AND a.ref_id=d.id AND a.deleted_at IS NULL) AS attachments
  FROM disciplinary_actions d
  JOIN employees e ON e.id = d.employee_id
  LEFT JOIN branches b ON b.id = e.branch_id
  LEFT JOIN users cu ON cu.id = d.created_by
  LEFT JOIN users uu ON uu.id = d.updated_by`;

function shapeAction(r) {
  return {
    id: r.id,
    employee: { id: r.employee_id, employeeNo: r.employee_no, fullNameAr: r.full_name_ar, fullNameEn: r.full_name_en },
    branch: r.branch_id ? { id: r.branch_id, nameAr: r.branch_ar, nameEn: r.branch_en } : null,
    actionDate: r.action_date, actionType: r.action_type, reason: r.reason, description: r.description,
    actionTaken: r.action_taken, issuedBy: r.issued_by, status: r.status, notes: r.notes,
    attachments: r.attachments || 0,
    createdAt: r.created_at, createdBy: r.created_by_name, updatedAt: r.updated_at, updatedBy: r.updated_by_name,
  };
}

function actionById(db, id) {
  const r = db.get(DA_SELECT + " WHERE d.id = :id", { id });
  return r ? shapeAction(r) : null;
}

function createAction(db, ctx, payload) {
  const employeeId = V.str(payload.employeeId, "employeeId", { required: true, max: 40 });
  const emp = EMP.rawById(db, employeeId);
  if (!emp) throw notFound("لا يوجد موظف بهذا المُعرّف");
  EMP.ensureScope(ctx, emp);

  const date = V.date(payload.actionDate, "actionDate", { required: true, label: "تاريخ الإجراء" });
  V.ensureOrder(emp.original_joining_date, date, "تاريخ الإجراء لا يكون قبل تاريخ المباشرة", "actionDate");
  const type = V.oneOf(payload.actionType, "actionType", ACTION_TYPES, { required: true, label: "نوع الإجراء" });

  const id = uuid();
  const t = nowIso();
  db.run(
    `INSERT INTO disciplinary_actions(id, employee_id, action_date, action_type, reason, description,
                                      action_taken, issued_by, status, notes, created_at, created_by, updated_at, updated_by)
     VALUES(:id, :e, :d, :type, :reason, :desc, :taken, :by, :status, :notes, :t, :u, :t, :u)`,
    {
      id, e: employeeId, d: date, type,
      reason: V.str(payload.reason, "reason", { max: 1000 }),
      desc: V.str(payload.description, "description", { max: 4000 }),
      taken: V.str(payload.actionTaken, "actionTaken", { max: 1000 }),
      by: V.str(payload.issuedBy, "issuedBy", { max: 150 }),
      status: V.oneOf(payload.status, "status", ACTION_STATUS, { dflt: "active" }) || "active",
      notes: V.str(payload.notes, "notes", { max: 2000 }),
      t, u: uid(ctx),
    }
  );
  audit.record(db, ctx, {
    action: "create", entity: "disciplinary", entityId: id, employeeId,
    summary: `إجراء انضباطي (${type}) على ${emp.employee_no} — ${emp.full_name_ar} بتاريخ ${date}`,
    after: db.get("SELECT * FROM disciplinary_actions WHERE id = :id", { id }),
  });
  return actionById(db, id);
}

function updateAction(db, ctx, id, payload) {
  const before = db.get("SELECT * FROM disciplinary_actions WHERE id = :id", { id });
  if (!before) throw notFound("لا يوجد إجراء بهذا المُعرّف");
  const emp = EMP.rawById(db, before.employee_id);
  EMP.ensureScope(ctx, emp);

  const f = {
    date: payload.actionDate !== undefined ? V.date(payload.actionDate, "actionDate", { required: true }) : before.action_date,
    type: payload.actionType !== undefined ? V.oneOf(payload.actionType, "actionType", ACTION_TYPES, { required: true }) : before.action_type,
    reason: payload.reason !== undefined ? V.str(payload.reason, "reason", { max: 1000 }) : before.reason,
    desc: payload.description !== undefined ? V.str(payload.description, "description", { max: 4000 }) : before.description,
    taken: payload.actionTaken !== undefined ? V.str(payload.actionTaken, "actionTaken", { max: 1000 }) : before.action_taken,
    by: payload.issuedBy !== undefined ? V.str(payload.issuedBy, "issuedBy", { max: 150 }) : before.issued_by,
    status: payload.status !== undefined ? V.oneOf(payload.status, "status", ACTION_STATUS, { required: true }) : before.status,
    notes: payload.notes !== undefined ? V.str(payload.notes, "notes", { max: 2000 }) : before.notes,
  };
  db.run(
    `UPDATE disciplinary_actions SET action_date = :date, action_type = :type, reason = :reason, description = :desc,
            action_taken = :taken, issued_by = :by, status = :status, notes = :notes,
            updated_at = :t, updated_by = :u WHERE id = :id`,
    Object.assign({ id, t: nowIso(), u: uid(ctx) }, f)
  );
  const after = db.get("SELECT * FROM disciplinary_actions WHERE id = :id", { id });
  const changes = audit.diff(before, after);
  if (changes.length) {
    audit.record(db, ctx, {
      action: "update", entity: "disciplinary", entityId: id, employeeId: before.employee_id,
      summary: `تعديل إجراء انضباطي على ${emp.employee_no}`, before, after, changes,
    });
  }
  return actionById(db, id);
}

function removeAction(db, ctx, id) {
  const before = db.get("SELECT * FROM disciplinary_actions WHERE id = :id", { id });
  if (!before) throw notFound("لا يوجد إجراء بهذا المُعرّف");
  const emp = EMP.rawById(db, before.employee_id);
  EMP.ensureScope(ctx, emp);
  db.run("DELETE FROM disciplinary_actions WHERE id = :id", { id });
  audit.record(db, ctx, {
    action: "delete", entity: "disciplinary", entityId: id, employeeId: before.employee_id,
    summary: `حذف إجراء انضباطي على ${emp.employee_no} بتاريخ ${before.action_date}`, before, after: null,
  });
  return { deleted: true };
}

function listActions(db, ctx, q = {}) {
  const p = {};
  const where = ["1=1"];
  if (q.employeeId) { where.push("d.employee_id = :e"); p.e = String(q.employeeId); }
  if (q.from) { where.push("d.action_date >= :from"); p.from = V.date(q.from, "from"); }
  if (q.to) { where.push("d.action_date <= :to"); p.to = V.date(q.to, "to"); }
  if (q.actionType) { where.push("d.action_type = :type"); p.type = V.oneOf(q.actionType, "actionType", ACTION_TYPES); }
  if (q.status) { where.push("d.status = :status"); p.status = V.oneOf(q.status, "status", ACTION_STATUS); }
  if (q.branchId) { where.push("e.branch_id = :b"); p.b = Number(q.branchId); }
  if (q.departmentId) { where.push("e.department_id = :dep"); p.dep = Number(q.departmentId); }
  if (q.q) { where.push("(e.full_name_ar LIKE :like OR e.employee_no LIKE :like OR d.reason LIKE :like)"); p.like = `%${q.q}%`; }
  const scope = EMP.scopeSql(ctx, p);
  const cond = ` WHERE ${where.join(" AND ")}${scope}`;
  const total = db.get(`SELECT COUNT(*) AS c FROM disciplinary_actions d JOIN employees e ON e.id = d.employee_id${cond}`, p).c;
  const size = Math.min(Math.max(Number(q.size) || 50, 1), 1000);
  const page = Math.max(Number(q.page) || 1, 1);
  const rows = db.all(`${DA_SELECT}${cond} ORDER BY d.action_date DESC LIMIT :limit OFFSET :offset`,
    Object.assign({}, p, { limit: size, offset: (page - 1) * size }));
  return { total, page, size, rows: rows.map(shapeAction) };
}

/* ------------------------------------------------ إجراءات تصحيحية */

const CA_SELECT = `
  SELECT c.*, e.employee_no, e.full_name_ar, e.full_name_en, e.branch_id,
         b.name_ar AS branch_ar, b.name_en AS branch_en,
         cu.full_name AS created_by_name, uu.full_name AS updated_by_name,
         (SELECT COUNT(*) FROM attachments a WHERE a.ref_type='corrective' AND a.ref_id=c.id AND a.deleted_at IS NULL) AS attachments
  FROM corrective_actions c
  JOIN employees e ON e.id = c.employee_id
  LEFT JOIN branches b ON b.id = e.branch_id
  LEFT JOIN users cu ON cu.id = c.created_by
  LEFT JOIN users uu ON uu.id = c.updated_by`;

function shapeCorrective(r, day) {
  const isOverdue = r.status !== "closed" && !!r.due_date && D.cmp(r.due_date, day || today()) < 0;
  return {
    id: r.id,
    employee: { id: r.employee_id, employeeNo: r.employee_no, fullNameAr: r.full_name_ar, fullNameEn: r.full_name_en },
    branch: r.branch_id ? { id: r.branch_id, nameAr: r.branch_ar, nameEn: r.branch_en } : null,
    dateOpened: r.date_opened, reason: r.reason, description: r.description,
    correctiveAction: r.corrective_action, responsiblePerson: r.responsible_person,
    dueDate: r.due_date, status: r.status, isOverdue,
    displayStatus: isOverdue ? "overdue" : r.status,
    dateClosed: r.date_closed, closureNotes: r.closure_notes, notes: r.notes,
    attachments: r.attachments || 0,
    createdAt: r.created_at, createdBy: r.created_by_name, updatedAt: r.updated_at, updatedBy: r.updated_by_name,
  };
}

function correctiveById(db, id) {
  const r = db.get(CA_SELECT + " WHERE c.id = :id", { id });
  return r ? shapeCorrective(r) : null;
}

function readCorrective(payload, existing) {
  const opened = payload.dateOpened !== undefined || !existing
    ? V.date(payload.dateOpened, "dateOpened", { required: true, label: "تاريخ الفتح" }) : existing.date_opened;
  const due = payload.dueDate !== undefined ? V.date(payload.dueDate, "dueDate") : (existing ? existing.due_date : null);
  const status = payload.status !== undefined
    ? V.oneOf(payload.status, "status", CA_STATUS, { required: true }) : (existing ? existing.status : "open");
  let closed = payload.dateClosed !== undefined ? V.date(payload.dateClosed, "dateClosed") : (existing ? existing.date_closed : null);

  if (due) V.ensureOrder(opened, due, "تاريخ الاستحقاق لا يكون قبل تاريخ الفتح", "dueDate");
  if (status === "closed") {
    closed = closed || today();
    V.ensureOrder(opened, closed, "تاريخ الإغلاق لا يكون قبل تاريخ الفتح", "dateClosed");
  } else {
    closed = null;
  }
  return {
    opened, due, status, closed,
    reason: payload.reason !== undefined ? V.str(payload.reason, "reason", { max: 1000 }) : (existing ? existing.reason : null),
    desc: payload.description !== undefined ? V.str(payload.description, "description", { max: 4000 }) : (existing ? existing.description : null),
    action: payload.correctiveAction !== undefined ? V.str(payload.correctiveAction, "correctiveAction", { max: 4000 }) : (existing ? existing.corrective_action : null),
    person: payload.responsiblePerson !== undefined ? V.str(payload.responsiblePerson, "responsiblePerson", { max: 150 }) : (existing ? existing.responsible_person : null),
    closureNotes: payload.closureNotes !== undefined ? V.str(payload.closureNotes, "closureNotes", { max: 2000 }) : (existing ? existing.closure_notes : null),
    notes: payload.notes !== undefined ? V.str(payload.notes, "notes", { max: 2000 }) : (existing ? existing.notes : null),
  };
}

/* المعاملات المربوطة تُبنى بأسمائها كما في الجملة تمامًا: SQLite يرفض
   معاملًا زائدًا كما يرفض ناقصًا. */
function caParams(base, f) {
  return Object.assign({}, base, {
    opened: f.opened, due: f.due, status: f.status, closed: f.closed,
    reason: f.reason, desc: f.desc, action: f.action, person: f.person,
    cnotes: f.closureNotes, notes: f.notes,
  });
}

function createCorrective(db, ctx, payload) {
  const employeeId = V.str(payload.employeeId, "employeeId", { required: true, max: 40 });
  const emp = EMP.rawById(db, employeeId);
  if (!emp) throw notFound("لا يوجد موظف بهذا المُعرّف");
  EMP.ensureScope(ctx, emp);
  const f = readCorrective(payload, null);

  const id = uuid();
  const t = nowIso();
  db.run(
    `INSERT INTO corrective_actions(id, employee_id, date_opened, reason, description, corrective_action,
                                    responsible_person, due_date, status, date_closed, closure_notes, notes,
                                    created_at, created_by, updated_at, updated_by)
     VALUES(:id, :e, :opened, :reason, :desc, :action, :person, :due, :status, :closed, :cnotes, :notes, :t, :u, :t, :u)`,
    caParams({ id, e: employeeId, t, u: uid(ctx) }, f)
  );
  audit.record(db, ctx, {
    action: "create", entity: "corrective", entityId: id, employeeId,
    summary: `إجراء تصحيحي على ${emp.employee_no} — ${emp.full_name_ar} · فُتح ${f.opened}`,
    after: db.get("SELECT * FROM corrective_actions WHERE id = :id", { id }),
  });
  return correctiveById(db, id);
}

function updateCorrective(db, ctx, id, payload) {
  const before = db.get("SELECT * FROM corrective_actions WHERE id = :id", { id });
  if (!before) throw notFound("لا يوجد إجراء تصحيحي بهذا المُعرّف");
  const emp = EMP.rawById(db, before.employee_id);
  EMP.ensureScope(ctx, emp);
  const f = readCorrective(payload, before);

  db.run(
    `UPDATE corrective_actions SET date_opened = :opened, reason = :reason, description = :desc,
            corrective_action = :action, responsible_person = :person, due_date = :due, status = :status,
            date_closed = :closed, closure_notes = :cnotes, notes = :notes, updated_at = :t, updated_by = :u
     WHERE id = :id`,
    caParams({ id, t: nowIso(), u: uid(ctx) }, f)
  );
  const after = db.get("SELECT * FROM corrective_actions WHERE id = :id", { id });
  const changes = audit.diff(before, after);
  if (changes.length) {
    audit.record(db, ctx, {
      action: "update", entity: "corrective", entityId: id, employeeId: before.employee_id,
      summary: `تعديل إجراء تصحيحي على ${emp.employee_no}` + (after.status !== before.status ? ` · الحالة: ${after.status}` : ""),
      before, after, changes,
    });
  }
  return correctiveById(db, id);
}

function removeCorrective(db, ctx, id) {
  const before = db.get("SELECT * FROM corrective_actions WHERE id = :id", { id });
  if (!before) throw notFound("لا يوجد إجراء تصحيحي بهذا المُعرّف");
  const emp = EMP.rawById(db, before.employee_id);
  EMP.ensureScope(ctx, emp);
  db.run("DELETE FROM corrective_actions WHERE id = :id", { id });
  audit.record(db, ctx, {
    action: "delete", entity: "corrective", entityId: id, employeeId: before.employee_id,
    summary: `حذف إجراء تصحيحي على ${emp.employee_no} فُتح ${before.date_opened}`, before, after: null,
  });
  return { deleted: true };
}

function listCorrective(db, ctx, q = {}) {
  const p = {};
  const where = ["1=1"];
  const day = today();
  if (q.employeeId) { where.push("c.employee_id = :e"); p.e = String(q.employeeId); }
  if (q.from) { where.push("c.date_opened >= :from"); p.from = V.date(q.from, "from"); }
  if (q.to) { where.push("c.date_opened <= :to"); p.to = V.date(q.to, "to"); }
  if (q.branchId) { where.push("e.branch_id = :b"); p.b = Number(q.branchId); }
  if (q.q) { where.push("(e.full_name_ar LIKE :like OR e.employee_no LIKE :like OR c.reason LIKE :like)"); p.like = `%${q.q}%`; }
  if (q.status === "overdue") {
    where.push("c.status != 'closed' AND c.due_date IS NOT NULL AND c.due_date < :day");
    p.day = day;
  } else if (q.status) {
    where.push("c.status = :status");
    p.status = V.oneOf(q.status, "status", CA_STATUS);
  }
  const scope = EMP.scopeSql(ctx, p);
  const cond = ` WHERE ${where.join(" AND ")}${scope}`;
  const total = db.get(`SELECT COUNT(*) AS c FROM corrective_actions c JOIN employees e ON e.id = c.employee_id${cond}`, p).c;
  const size = Math.min(Math.max(Number(q.size) || 50, 1), 1000);
  const page = Math.max(Number(q.page) || 1, 1);
  const rows = db.all(`${CA_SELECT}${cond} ORDER BY (c.status != 'closed') DESC, c.due_date ASC, c.date_opened DESC LIMIT :limit OFFSET :offset`,
    Object.assign({}, p, { limit: size, offset: (page - 1) * size }));
  return { total, page, size, rows: rows.map((r) => shapeCorrective(r, day)) };
}

module.exports = {
  createAction, updateAction, removeAction, listActions, actionById, shapeAction,
  createCorrective, updateCorrective, removeCorrective, listCorrective, correctiveById, shapeCorrective,
  ACTION_TYPES, WARNING_TYPES, ACTION_STATUS, CA_STATUS,
};
