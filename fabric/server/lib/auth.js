/* ======================================================================
   المصادقة — كلمة مرور مُجزّأة، جلسات، وكبح المحاولات
   ----------------------------------------------------------------------
   كلمة المرور لا تُخزَّن أبدًا: يُخزَّن ناتج scrypt مع ملح عشوائي لكل
   حساب. المقارنة بزمن ثابت حتى لا يُستدل على الصحيح من زمن الرد.
   ====================================================================== */

"use strict";

const crypto = require("node:crypto");
const { unauthorized, tooMany, forbidden } = require("./http");

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_DAYS = 7;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_TRIES = 8;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, keyB64] = String(stored).split("$");
    if (alg !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(keyB64, "base64");
    const got = crypto.scryptSync(String(password), salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

const token = () => crypto.randomBytes(32).toString("base64url");

class Auth {
  constructor(store) {
    this.store = store;
    this.tries = new Map(); // كبح المحاولات في الذاكرة
  }

  admins() {
    return this.store.read("admins", []);
  }

  /* أول تشغيل: حساب واحد بكلمة مرور تُطبع مرة في الطرفية */
  async ensureSeedAdmin() {
    const list = this.admins();
    if (list.length) return null;
    const password = crypto.randomBytes(9).toString("base64url");
    await this.store.mutate("admins", [], (cur) => {
      cur.push({
        id: "a1",
        username: "admin",
        name: "المدير",
        passwordHash: hashPassword(password),
        role: "owner",
        createdAt: Date.now(),
        mustChangePassword: true,
      });
      return cur;
    });
    return password;
  }

  checkRate(ip) {
    const now = Date.now();
    const rec = this.tries.get(ip);
    if (!rec || now - rec.first > LOGIN_WINDOW_MS) return;
    if (rec.count >= LOGIN_MAX_TRIES) {
      const mins = Math.ceil((LOGIN_WINDOW_MS - (now - rec.first)) / 60000);
      throw tooMany(`محاولات دخول كثيرة. انتظر ${mins} دقيقة.`);
    }
  }

  noteFailure(ip) {
    const now = Date.now();
    const rec = this.tries.get(ip);
    if (!rec || now - rec.first > LOGIN_WINDOW_MS) this.tries.set(ip, { first: now, count: 1 });
    else rec.count++;
  }

  clearFailures(ip) {
    this.tries.delete(ip);
  }

  async login(username, password, ip) {
    this.checkRate(ip);
    const user = this.admins().find((u) => u.username === String(username || "").trim().toLowerCase());
    // نفس الرد ونفس التكلفة الحسابية سواء وُجد المستخدم أم لا
    const ok = user
      ? verifyPassword(password, user.passwordHash)
      : (verifyPassword(password, hashPassword("x")), false);
    if (!ok) {
      this.noteFailure(ip);
      throw unauthorized("اسم المستخدم أو كلمة المرور غير صحيحة");
    }
    this.clearFailures(ip);

    const tok = token();
    const expiresAt = Date.now() + SESSION_DAYS * 86400000;
    await this.store.mutate("sessions", [], (cur) => {
      const live = cur.filter((s) => s.expiresAt > Date.now());
      live.push({ token: tok, userId: user.id, expiresAt, createdAt: Date.now() });
      return live;
    });
    return { token: tok, expiresAt, user: this.publicUser(user) };
  }

  async logout(tok) {
    if (!tok) return;
    await this.store.mutate("sessions", [], (cur) => cur.filter((s) => s.token !== tok));
  }

  userFromToken(tok) {
    if (!tok) return null;
    const s = this.store.read("sessions", []).find((x) => x.token === tok);
    if (!s || s.expiresAt <= Date.now()) return null;
    const u = this.admins().find((x) => x.id === s.userId);
    return u || null;
  }

  publicUser(u) {
    return { id: u.id, username: u.username, name: u.name, role: u.role, mustChangePassword: !!u.mustChangePassword };
  }

  async changePassword(userId, currentPassword, newPassword) {
    const u = this.admins().find((x) => x.id === userId);
    if (!u) throw unauthorized();
    if (!verifyPassword(currentPassword, u.passwordHash)) throw forbidden("كلمة المرور الحالية غير صحيحة");
    const pw = String(newPassword || "");
    if (pw.length < 10) throw forbidden("كلمة المرور الجديدة أقصر من عشرة محارف");
    await this.store.mutate("admins", [], (cur) => {
      const t = cur.find((x) => x.id === userId);
      t.passwordHash = hashPassword(pw);
      t.mustChangePassword = false;
      return cur;
    });
    // إبطال كل الجلسات الأخرى بعد تغيير كلمة المرور
    await this.store.mutate("sessions", [], (cur) => cur.filter((s) => s.userId !== userId));
  }

  async sweep() {
    const live = this.store.read("sessions", []).filter((s) => s.expiresAt > Date.now());
    if (live.length !== this.store.read("sessions", []).length) {
      await this.store.mutate("sessions", [], () => live);
    }
  }
}

module.exports = { Auth, hashPassword, verifyPassword, token };
