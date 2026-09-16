/* ======================================================================
   سجل التدقيق — من فعل ماذا ومتى، وما القيمة قبل وبعد
   ----------------------------------------------------------------------
   يُكتب في نفس معاملة التغيير: إن فشل الحفظ لم يبق في السجل أثر لتغيير
   لم يحدث، وإن نجح فلا يمكن أن يمرّ تغيير بلا سطر يشهد عليه.
   لا يوجد في النظام كله مسار تعديل أو حذف على هذا الجدول.
   ====================================================================== */

"use strict";

const { uuid, nowIso } = require("./db");

/* الفروق حقلًا حقلًا — هذا ما تعرضه الواجهة: قبل/بعد لا كائنين كاملين */
function diff(before, after) {
  const out = [];
  if (!before) return out;
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (k === "updated_at" || k === "updated_by" || k === "created_at" || k === "created_by") continue;
    const a = before ? before[k] : undefined;
    const b = after ? after[k] : undefined;
    if (a === undefined && b === undefined) continue;
    const na = a === null || a === undefined ? "" : String(a);
    const nb = b === null || b === undefined ? "" : String(b);
    if (na !== nb) out.push({ field: k, before: a === undefined ? null : a, after: b === undefined ? null : b });
  }
  return out;
}

function record(db, ctx, entry) {
  const changes = entry.changes || (entry.before ? diff(entry.before, entry.after) : null);
  db.run(
    `INSERT INTO audit_logs(id, at, user_id, user_name, action, entity, entity_id, employee_id,
                            summary, before_json, after_json, changes_json, ip)
     VALUES(:id, :at, :uid, :uname, :action, :entity, :eid, :emp, :summary, :before, :after, :changes, :ip)`,
    {
      id: uuid(),
      at: nowIso(),
      uid: (ctx && ctx.user && ctx.user.id) || null,
      uname: (ctx && ctx.user && (ctx.user.fullName || ctx.user.full_name || ctx.user.username)) || "system",
      action: entry.action,
      entity: entry.entity,
      eid: entry.entityId || null,
      emp: entry.employeeId || null,
      summary: entry.summary || null,
      before: entry.before ? JSON.stringify(entry.before) : null,
      after: entry.after ? JSON.stringify(entry.after) : null,
      changes: changes && changes.length ? JSON.stringify(changes) : null,
      ip: (ctx && ctx.ip) || null,
    }
  );
}

/* قراءة السجل — مُصفّاة، بترقيم صفحات */
function list(db, q = {}) {
  const where = [];
  const p = {};
  if (q.employeeId) { where.push("employee_id = :emp"); p.emp = q.employeeId; }
  if (q.entity) { where.push("entity = :entity"); p.entity = q.entity; }
  if (q.action) { where.push("action = :action"); p.action = q.action; }
  if (q.userId) { where.push("user_id = :uid"); p.uid = q.userId; }
  if (q.from) { where.push("at >= :from"); p.from = q.from + "T00:00:00.000Z"; }
  if (q.to) { where.push("at <= :to"); p.to = q.to + "T23:59:59.999Z"; }
  if (q.q) { where.push("(summary LIKE :q OR user_name LIKE :q OR entity_id LIKE :q)"); p.q = `%${q.q}%`; }
  const sql = where.length ? " WHERE " + where.join(" AND ") : "";
  const total = db.get(`SELECT COUNT(*) AS c FROM audit_logs${sql}`, p).c;
  const size = Math.min(Math.max(Number(q.size) || 50, 1), 500);
  const page = Math.max(Number(q.page) || 1, 1);
  const rows = db.all(
    `SELECT * FROM audit_logs${sql} ORDER BY at DESC LIMIT :limit OFFSET :offset`,
    Object.assign({}, p, { limit: size, offset: (page - 1) * size })
  );
  return {
    total, page, size,
    rows: rows.map((r) => ({
      id: r.id, at: r.at, userName: r.user_name, userId: r.user_id,
      action: r.action, entity: r.entity, entityId: r.entity_id, employeeId: r.employee_id,
      summary: r.summary, ip: r.ip,
      changes: r.changes_json ? JSON.parse(r.changes_json) : [],
    })),
  };
}

module.exports = { record, diff, list };
