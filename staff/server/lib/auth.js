/* ======================================================================
   المصادقة والصلاحيات
   ----------------------------------------------------------------------
   * كلمة المرور لا تُخزَّن أبدًا: يُخزَّن ناتج scrypt بملح عشوائي لكل
     حساب، والمقارنة بزمن ثابت.
   * الجلسة: رمز عشوائي ‎256‎ بت يُرسل في كوكي HttpOnly، ويُخزَّن في
     القاعدة **مُجزَّأً** — فتسرُّب نسخة القاعدة لا يعطي أحدًا جلسة.
   * انتهاء بالخمول (‎30‎ دقيقة افتراضًا) وحدّ أقصى مطلق (‎12‎ ساعة).
   * كبح المحاولات وقفل الحساب بعد محاولات فاشلة متتابعة.
   * CSRF: الكوكي SameSite=Strict، ويُطلب مع كل كتابة رأس X-CSRF-Token
     يطابق قيمة الجلسة (الرأس لا يمكن لموقع آخر إرساله).
   ====================================================================== */

"use strict";

const crypto = require("node:crypto");
const { uuid, nowIso } = require("./db");
const { unauthorized, forbidden, tooMany, bad } = require("./http");

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const MAX_FAILED = 6;
const LOCK_MINUTES = 15;
const MIN_PASSWORD = 10;

function hashPassword(password) {
  const pw = String(password || "");
  if (pw.length < MIN_PASSWORD) {
    throw bad(`كلمة المرور يجب أن تكون ${MIN_PASSWORD} أحرف فأكثر`, "weak_password", { field: "password" });
  }
  if (!/[A-Za-z؀-ۿ]/.test(pw) || !/\d/.test(pw)) {
    throw bad("كلمة المرور يجب أن تجمع بين حروف وأرقام", "weak_password", { field: "password" });
  }
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, keyB64] = String(stored).split("$");
    if (alg !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(keyB64, "base64");
    const got = crypto.scryptSync(String(password), salt, expected.length, { N: +N, r: +r, p: +p });
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

const newToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const minutesFromNow = (m) => new Date(Date.now() + m * 60000).toISOString();

/* ------------------------------------------------------------ الحسابات */

function publicUser(u, settings) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    email: u.email,
    role: u.role,
    isActive: !!u.is_active,
    mustChangePassword: !!u.must_change_password,
    branchScope: parseScope(u.branch_scope),
    lastLoginAt: u.last_login_at,
    permissions: settings ? permissionsFor(u, settings) : undefined,
  };
}

function parseScope(v) {
  if (!v) return null;
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) && a.length ? a.map(Number) : null;
  } catch { return null; }
}

function permissionsFor(user, settings) {
  const matrix = (settings && settings.permissions) || {};
  return (matrix[user.role] || []).slice();
}

function can(ctx, permission) {
  return !!(ctx && ctx.permissions && ctx.permissions.includes(permission));
}

function require_(ctx, permission) {
  if (!ctx || !ctx.user) throw unauthorized();
  if (!can(ctx, permission)) throw forbidden(`هذا الإجراء يحتاج صلاحية «${permission}»`);
}

/* ------------------------------------------------------------- الدخول */

function logLogin(db, { username, userId, success, reason, ip, ua }) {
  db.run(
    `INSERT INTO login_logs(id, at, username, user_id, success, reason, ip, user_agent)
     VALUES(:id, :at, :u, :uid, :ok, :reason, :ip, :ua)`,
    { id: uuid(), at: nowIso(), u: username || null, uid: userId || null,
      ok: success ? 1 : 0, reason: reason || null, ip: ip || null, ua: (ua || "").slice(0, 300) }
  );
}

function login(db, { username, password, ip, ua, config }) {
  const uname = String(username || "").trim().toLowerCase();
  const user = db.get("SELECT * FROM users WHERE lower(username) = :u", { u: uname });

  if (!user) {
    // زمن مقارب لزمن الحساب الموجود حتى لا يُستدل على الأسماء الصحيحة
    crypto.scryptSync(String(password || ""), "no-such-user", 64, SCRYPT);
    logLogin(db, { username: uname, success: 0, reason: "unknown_user", ip, ua });
    throw unauthorized("اسم المستخدم أو كلمة المرور غير صحيحة", "bad_credentials");
  }

  if (user.locked_until && user.locked_until > nowIso()) {
    logLogin(db, { username: uname, userId: user.id, success: 0, reason: "locked", ip, ua });
    throw tooMany(`الحساب موقوف مؤقتًا بعد محاولات فاشلة. جرّب بعد ${LOCK_MINUTES} دقيقة.`);
  }

  if (!user.is_active) {
    logLogin(db, { username: uname, userId: user.id, success: 0, reason: "inactive", ip, ua });
    throw unauthorized("الحساب موقوف. راجع مدير النظام.", "inactive");
  }

  if (!verifyPassword(password, user.password_hash)) {
    const failed = (user.failed_attempts || 0) + 1;
    db.run(
      "UPDATE users SET failed_attempts = :n, locked_until = :lock, updated_at = :t WHERE id = :id",
      { n: failed, lock: failed >= MAX_FAILED ? minutesFromNow(LOCK_MINUTES) : null, t: nowIso(), id: user.id }
    );
    logLogin(db, { username: uname, userId: user.id, success: 0, reason: "bad_password", ip, ua });
    throw unauthorized("اسم المستخدم أو كلمة المرور غير صحيحة", "bad_credentials");
  }

  db.run(
    "UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = :t, updated_at = :t WHERE id = :id",
    { t: nowIso(), id: user.id }
  );
  logLogin(db, { username: uname, userId: user.id, success: 1, ip, ua });
  return Object.assign({}, user, { last_login_at: nowIso() });
}

/* ------------------------------------------------------------ الجلسات */

function createSession(db, user, { ip, ua, config }) {
  const token = newToken();
  const csrf = newToken();
  const t = nowIso();
  db.run(
    `INSERT INTO sessions(id, user_id, csrf, created_at, last_seen_at, expires_at, ip, user_agent)
     VALUES(:id, :uid, :csrf, :t, :t, :exp, :ip, :ua)`,
    { id: hashToken(token), uid: user.id, csrf, t,
      exp: new Date(Date.now() + config.sessionMaxHours * 3600000).toISOString(),
      ip: ip || null, ua: (ua || "").slice(0, 300) }
  );
  return { token, csrf };
}

/* تُنادى مع كل طلب: تتحقق وتُجدّد الخمول، وتنظّف المنتهية أولًا بأول */
function resolveSession(db, token, config) {
  if (!token) return null;
  const id = hashToken(token);
  const s = db.get("SELECT * FROM sessions WHERE id = :id", { id });
  if (!s || s.revoked_at) return null;

  const now = nowIso();
  const idleCutoff = new Date(Date.now() - config.sessionIdleMinutes * 60000).toISOString();
  if (s.expires_at <= now || s.last_seen_at <= idleCutoff) {
    db.run("UPDATE sessions SET revoked_at = :t WHERE id = :id", { t: now, id });
    return null;
  }

  const user = db.get("SELECT * FROM users WHERE id = :id", { id: s.user_id });
  if (!user || !user.is_active) {
    db.run("UPDATE sessions SET revoked_at = :t WHERE id = :id", { t: now, id });
    return null;
  }

  db.run("UPDATE sessions SET last_seen_at = :t WHERE id = :id", { t: now, id });
  return { session: Object.assign({}, s, { last_seen_at: now }), user };
}

function revokeSession(db, token) {
  if (!token) return;
  db.run("UPDATE sessions SET revoked_at = :t WHERE id = :id AND revoked_at IS NULL",
    { t: nowIso(), id: hashToken(token) });
}

function revokeUserSessions(db, userId) {
  db.run("UPDATE sessions SET revoked_at = :t WHERE user_id = :u AND revoked_at IS NULL",
    { t: nowIso(), u: userId });
}

function purgeSessions(db) {
  db.run("DELETE FROM sessions WHERE expires_at < :t OR (revoked_at IS NOT NULL AND revoked_at < :old)",
    { t: nowIso(), old: new Date(Date.now() - 7 * 86400000).toISOString() });
}

/* ------------------------------------------------------ الحساب الأول */

function ensureSeedAdmin(db, config) {
  const n = db.get("SELECT COUNT(*) AS c FROM users").c;
  if (n > 0) return null;

  const generated = !config.seedAdmin.password;
  const password = config.seedAdmin.password || crypto.randomBytes(9).toString("base64url") + "7a";
  const t = nowIso();
  db.run(
    `INSERT INTO users(id, username, full_name, email, password_hash, role, is_active,
                       must_change_password, created_at, updated_at)
     VALUES(:id, :u, :n, NULL, :h, 'super_admin', 1, :must, :t, :t)`,
    { id: uuid(), u: config.seedAdmin.username, n: config.seedAdmin.name,
      h: hashPassword(password), must: generated ? 1 : 0, t }
  );
  return { username: config.seedAdmin.username, password, generated };
}

module.exports = {
  hashPassword, verifyPassword, login, createSession, resolveSession,
  revokeSession, revokeUserSessions, purgeSessions, ensureSeedAdmin,
  permissionsFor, can, require: require_, publicUser, parseScope, logLogin,
  hashToken, MIN_PASSWORD,
};
