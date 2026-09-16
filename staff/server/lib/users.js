/* ======================================================================
   المستخدمون والصلاحيات
   ----------------------------------------------------------------------
   الأدوار أربعة، ومصفوفة الصلاحيات نفسها قابلة للتعديل من الإعدادات، فما
   يملكه كل دور يُضبط دون تعديل الكود.
   ====================================================================== */

"use strict";

const { uuid, nowIso, ALL_PERMISSIONS } = require("./db");
const { bad, conflict, notFound, forbidden } = require("./http");
const V = require("./validate");
const A = require("./auth");
const audit = require("./audit");

const ROLES = ["super_admin", "hr_admin", "manager", "viewer"];

function shape(db, u) {
  const settings = db.settings();
  const sessions = db.get(
    "SELECT COUNT(*) AS c FROM sessions WHERE user_id = :u AND revoked_at IS NULL AND expires_at > :t",
    { u: u.id, t: nowIso() }
  ).c;
  return Object.assign(A.publicUser(u, settings), {
    createdAt: u.created_at, updatedAt: u.updated_at,
    lockedUntil: u.locked_until, failedAttempts: u.failed_attempts,
    activeSessions: sessions,
  });
}

function list(db, q = {}) {
  const rows = db.all(
    `SELECT * FROM users ${q.includeInactive ? "" : "WHERE is_active = 1"} ORDER BY full_name`
  );
  return rows.map((u) => shape(db, u));
}

function byId(db, id) {
  const u = db.get("SELECT * FROM users WHERE id = :id", { id });
  if (!u) throw notFound("لا يوجد مستخدم بهذا المُعرّف");
  return shape(db, u);
}

function readScope(db, value) {
  if (value === undefined || value === null || value === "") return null;
  const arr = Array.isArray(value) ? value : String(value).split(",");
  const ids = arr.map((v) => Number(String(v).trim())).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return null;
  for (const id of ids) {
    if (!db.get("SELECT id FROM branches WHERE id = :id", { id })) V.fail("فرع غير موجود في نطاق المستخدم", "branchScope");
  }
  return JSON.stringify(ids);
}

function assertCanGrant(ctx, role) {
  if (role === "super_admin" && (!ctx.user || ctx.user.role !== "super_admin")) {
    throw forbidden("إنشاء حساب بصلاحية كاملة لا يتم إلا من Super Admin");
  }
}

function create(db, ctx, payload) {
  const username = V.str(payload.username, "username", {
    required: true, max: 40, min: 3, label: "اسم المستخدم",
    pattern: /^[A-Za-z0-9._-]+$/, patternMessage: "اسم المستخدم: حروف إنجليزية وأرقام ونقطة وشرطة فقط",
  }).toLowerCase();
  if (db.get("SELECT id FROM users WHERE lower(username) = :u", { u: username })) {
    throw conflict("اسم المستخدم مستخدم سلفًا", "duplicate_username", { field: "username" });
  }
  const role = V.oneOf(payload.role, "role", ROLES, { required: true, label: "الدور" });
  assertCanGrant(ctx, role);

  const id = uuid();
  const t = nowIso();
  db.run(
    `INSERT INTO users(id, username, full_name, email, password_hash, role, branch_scope, is_active,
                       must_change_password, created_at, created_by, updated_at, updated_by)
     VALUES(:id, :u, :n, :mail, :h, :role, :scope, 1, :must, :t, :by, :t, :by)`,
    {
      id, u: username,
      // الأصل أن يغيّر المستخدم كلمته عند أول دخول، ويُستثنى حين يسلّمها
      // المدير له مباشرة ويختار إعفاءه
      must: payload.mustChangePassword === false ? 0 : 1,
      n: V.str(payload.fullName, "fullName", { required: true, max: 120, label: "الاسم" }),
      mail: V.email(payload.email),
      h: A.hashPassword(payload.password),
      role, scope: readScope(db, payload.branchScope),
      t, by: (ctx.user && ctx.user.id) || null,
    }
  );
  audit.record(db, ctx, {
    action: "create", entity: "user", entityId: id,
    summary: `إنشاء مستخدم ${username} بدور ${role}`,
    after: { username, role, full_name: payload.fullName },
  });
  return byId(db, id);
}

function update(db, ctx, id, payload) {
  const before = db.get("SELECT * FROM users WHERE id = :id", { id });
  if (!before) throw notFound("لا يوجد مستخدم بهذا المُعرّف");

  const patch = {};
  if (payload.fullName !== undefined) patch.full_name = V.str(payload.fullName, "fullName", { required: true, max: 120 });
  if (payload.email !== undefined) patch.email = V.email(payload.email);
  if (payload.role !== undefined) {
    patch.role = V.oneOf(payload.role, "role", ROLES, { required: true });
    assertCanGrant(ctx, patch.role);
    if (before.role === "super_admin" && patch.role !== "super_admin") assertLastAdmin(db, id);
  }
  if (payload.branchScope !== undefined) patch.branch_scope = readScope(db, payload.branchScope);
  if (payload.isActive !== undefined) {
    patch.is_active = V.bool(payload.isActive, 1);
    if (!patch.is_active) {
      if (ctx.user && ctx.user.id === id) throw bad("لا يمكنك إيقاف حسابك بنفسك", "self_deactivate");
      assertLastAdmin(db, id);
    }
  }
  if (!Object.keys(patch).length) return byId(db, id);

  const sets = Object.keys(patch).map((k) => `${k} = :${k}`).join(", ");
  db.run(`UPDATE users SET ${sets}, updated_at = :t, updated_by = :by WHERE id = :id`,
    Object.assign({ id, t: nowIso(), by: (ctx.user && ctx.user.id) || null }, patch));

  if (patch.is_active === 0 || patch.role) A.revokeUserSessions(db, id);

  const after = db.get("SELECT * FROM users WHERE id = :id", { id });
  const clean = (u) => ({ username: u.username, full_name: u.full_name, email: u.email, role: u.role,
    branch_scope: u.branch_scope, is_active: u.is_active });
  audit.record(db, ctx, {
    action: "update", entity: "user", entityId: id,
    summary: `تعديل المستخدم ${before.username}`,
    before: clean(before), after: clean(after),
  });
  return byId(db, id);
}

function assertLastAdmin(db, id) {
  const others = db.get(
    "SELECT COUNT(*) AS c FROM users WHERE role = 'super_admin' AND is_active = 1 AND id != :id", { id }
  ).c;
  if (!others) throw bad("لا يمكن ترك النظام بلا Super Admin واحد على الأقل", "last_admin");
}

function setPassword(db, ctx, id, password, { self = false } = {}) {
  const user = db.get("SELECT * FROM users WHERE id = :id", { id });
  if (!user) throw notFound("لا يوجد مستخدم بهذا المُعرّف");
  const hash = A.hashPassword(password);
  db.run(
    `UPDATE users SET password_hash = :h, must_change_password = :must, failed_attempts = 0,
            locked_until = NULL, updated_at = :t, updated_by = :by WHERE id = :id`,
    { h: hash, must: self ? 0 : 1, t: nowIso(), by: (ctx.user && ctx.user.id) || null, id }
  );
  A.revokeUserSessions(db, id);
  audit.record(db, ctx, {
    action: "password", entity: "user", entityId: id,
    summary: self ? `تغيير كلمة مرور الحساب ${user.username}` : `إعادة تعيين كلمة مرور ${user.username}`,
  });
  return { ok: true };
}

function changeOwnPassword(db, ctx, { currentPassword, newPassword }) {
  const user = db.get("SELECT * FROM users WHERE id = :id", { id: ctx.user.id });
  if (!user) throw notFound("الحساب غير موجود");
  if (!A.verifyPassword(currentPassword, user.password_hash)) {
    throw bad("كلمة المرور الحالية غير صحيحة", "bad_password", { field: "currentPassword" });
  }
  if (String(newPassword) === String(currentPassword)) {
    throw bad("كلمة المرور الجديدة مطابقة للحالية", "same_password", { field: "newPassword" });
  }
  return setPassword(db, ctx, ctx.user.id, newPassword, { self: true });
}

function sessions(db, ctx, userId) {
  const rows = db.all(
    `SELECT s.id, s.user_id, s.created_at, s.last_seen_at, s.expires_at, s.ip, s.user_agent, s.revoked_at,
            u.username, u.full_name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.revoked_at IS NULL AND s.expires_at > :t ${userId ? "AND s.user_id = :u" : ""}
     ORDER BY s.last_seen_at DESC LIMIT 200`,
    userId ? { t: nowIso(), u: userId } : { t: nowIso() }
  );
  return rows.map((s) => ({
    id: s.id, userId: s.user_id, username: s.username, fullName: s.full_name,
    createdAt: s.created_at, lastSeenAt: s.last_seen_at, expiresAt: s.expires_at,
    ip: s.ip, userAgent: s.user_agent,
  }));
}

function revokeSession(db, ctx, sessionId) {
  const s = db.get("SELECT * FROM sessions WHERE id = :id", { id: sessionId });
  if (!s) throw notFound("لا توجد جلسة بهذا المُعرّف");
  db.run("UPDATE sessions SET revoked_at = :t WHERE id = :id", { t: nowIso(), id: sessionId });
  audit.record(db, ctx, {
    action: "revoke", entity: "session", entityId: sessionId,
    summary: `إلغاء جلسة مستخدم`, before: { user_id: s.user_id, ip: s.ip }, after: null,
  });
  return { revoked: true };
}

function loginLog(db, q = {}) {
  const p = {};
  const where = [];
  if (q.username) { where.push("lower(username) = :u"); p.u = String(q.username).toLowerCase(); }
  if (q.success !== undefined && q.success !== "") { where.push("success = :s"); p.s = V.bool(q.success, 0); }
  if (q.from) { where.push("at >= :from"); p.from = q.from + "T00:00:00.000Z"; }
  const sql = where.length ? " WHERE " + where.join(" AND ") : "";
  return db.all(`SELECT * FROM login_logs${sql} ORDER BY at DESC LIMIT 200`, p).map((r) => ({
    id: r.id, at: r.at, username: r.username, success: !!r.success, reason: r.reason, ip: r.ip,
  }));
}

/* مصفوفة الصلاحيات — عرضها وتعديلها */
function permissionMatrix(db) {
  const s = db.settings();
  return { roles: ROLES, permissions: ALL_PERMISSIONS, matrix: s.permissions };
}

function savePermissionMatrix(db, ctx, matrix) {
  if (!matrix || typeof matrix !== "object") throw bad("مصفوفة الصلاحيات غير صالحة");
  const clean = {};
  for (const role of ROLES) {
    const given = Array.isArray(matrix[role]) ? matrix[role] : [];
    clean[role] = given.filter((p) => ALL_PERMISSIONS.includes(p));
  }
  // لا يُترك النظام بلا من يديره
  for (const need of ["users.manage", "settings.manage"]) {
    if (!clean.super_admin.includes(need)) clean.super_admin.push(need);
  }
  const settings = db.settings();
  const before = settings.permissions;
  settings.permissions = clean;
  db.saveSettings(settings, ctx.user && ctx.user.id);
  audit.record(db, ctx, {
    action: "update", entity: "permissions", entityId: "matrix",
    summary: "تعديل مصفوفة الصلاحيات",
    before: { matrix: JSON.stringify(before) }, after: { matrix: JSON.stringify(clean) },
  });
  return permissionMatrix(db);
}

module.exports = {
  list, byId, create, update, setPassword, changeOwnPassword, sessions, revokeSession,
  loginLog, permissionMatrix, savePermissionMatrix, shape, ROLES,
};
