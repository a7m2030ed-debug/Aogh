/* ======================================================================
   المرفقات
   ----------------------------------------------------------------------
   الملف يُحفظ باسم عشوائي داخل مجلد البيانات (خارج ما يُخدَم كملفات
   ثابتة)، ولا يصل إليه أحد إلا عبر مسار محمي يتحقق من الجلسة والصلاحية.
   ويُرسل دائمًا بـContent-Disposition: attachment وnosniff، فلا يُفتح
   ملف مرفوع كصفحة داخل نطاق النظام.
   ====================================================================== */

"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const { uuid, nowIso } = require("./db");
const { bad, notFound, forbidden } = require("./http");
const audit = require("./audit");
const EMP = require("./employees");

const ALLOWED = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
};

const REF_TYPES = ["employee", "separation", "transfer", "leave", "disciplinary", "corrective", "other"];

function uploadsDir(config) {
  const dir = path.join(config.dataDir, "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function save(db, ctx, config, { file, employeeId, refType, refId }) {
  if (!file || !file.data || !file.data.length) throw bad("لم يصل أي ملف");
  const ext = path.extname(String(file.filename || "")).toLowerCase();
  if (!ALLOWED[ext]) {
    throw bad(`نوع الملف غير مسموح (${ext || "بلا امتداد"}). المسموح: ${Object.keys(ALLOWED).join(" · ")}`, "bad_file_type");
  }
  const limit = config.maxUploadMb * 1024 * 1024;
  if (file.data.length > limit) throw bad(`حجم الملف أكبر من ${config.maxUploadMb} ميغابايت`, "file_too_large");

  const emp = employeeId ? EMP.rawById(db, employeeId) : null;
  if (employeeId && !emp) throw notFound("لا يوجد موظف بهذا المُعرّف");
  if (emp) EMP.ensureScope(ctx, emp);

  const type = refType && REF_TYPES.includes(refType) ? refType : "other";
  const id = uuid();
  const stored = `${id}${ext}`;
  await fsp.writeFile(path.join(uploadsDir(config), stored), file.data, { mode: 0o600 });

  const sha = crypto.createHash("sha256").update(file.data).digest("hex");
  db.run(
    `INSERT INTO attachments(id, employee_id, ref_type, ref_id, file_name, stored_name, mime, size, sha256, uploaded_at, uploaded_by)
     VALUES(:id, :e, :rt, :ri, :name, :stored, :mime, :size, :sha, :t, :u)`,
    {
      id, e: employeeId || null, rt: type, ri: refId || null,
      name: String(file.filename).slice(0, 200), stored, mime: ALLOWED[ext],
      size: file.data.length, sha, t: nowIso(), u: (ctx.user && ctx.user.id) || null,
    }
  );
  audit.record(db, ctx, {
    action: "upload", entity: "attachment", entityId: id, employeeId: employeeId || null,
    summary: `رفع مرفق «${file.filename}» (${Math.round(file.data.length / 1024)} ك.ب) على ${type}`,
    after: { file_name: file.filename, ref_type: type, ref_id: refId || null, size: file.data.length },
  });
  return shape(db.get("SELECT * FROM attachments WHERE id = :id", { id }));
}

function shape(r) {
  if (!r) return null;
  return {
    id: r.id, employeeId: r.employee_id, refType: r.ref_type, refId: r.ref_id,
    fileName: r.file_name, mime: r.mime, size: r.size,
    uploadedAt: r.uploaded_at, uploadedBy: r.uploaded_by_name || r.uploaded_by,
  };
}

function list(db, ctx, q = {}) {
  const p = {};
  const where = ["a.deleted_at IS NULL"];
  if (q.employeeId) { where.push("a.employee_id = :e"); p.e = String(q.employeeId); }
  if (q.refType) { where.push("a.ref_type = :rt"); p.rt = String(q.refType); }
  if (q.refId) { where.push("a.ref_id = :ri"); p.ri = String(q.refId); }
  const rows = db.all(
    `SELECT a.*, u.full_name AS uploaded_by_name FROM attachments a
     LEFT JOIN users u ON u.id = a.uploaded_by
     WHERE ${where.join(" AND ")} ORDER BY a.uploaded_at DESC LIMIT 200`, p
  );
  return rows.map(shape);
}

function locate(db, ctx, config, id) {
  const r = db.get("SELECT * FROM attachments WHERE id = :id AND deleted_at IS NULL", { id });
  if (!r) throw notFound("المرفق غير موجود");
  if (r.employee_id) {
    const emp = EMP.rawById(db, r.employee_id);
    if (emp) EMP.ensureScope(ctx, emp);
  }
  const full = path.join(uploadsDir(config), path.basename(r.stored_name));
  if (!fs.existsSync(full)) throw notFound("الملف غير موجود على القرص");
  return { row: r, path: full };
}

async function remove(db, ctx, config, id) {
  const { row, path: full } = locate(db, ctx, config, id);
  db.run("UPDATE attachments SET deleted_at = :t WHERE id = :id", { t: nowIso(), id });
  try { await fsp.unlink(full); } catch { /* حُذف من القرص سلفًا */ }
  audit.record(db, ctx, {
    action: "delete", entity: "attachment", entityId: id, employeeId: row.employee_id,
    summary: `حذف مرفق «${row.file_name}»`, before: { file_name: row.file_name, ref_type: row.ref_type }, after: null,
  });
  return { deleted: true };
}

module.exports = { save, list, locate, remove, shape, ALLOWED, REF_TYPES, uploadsDir };
