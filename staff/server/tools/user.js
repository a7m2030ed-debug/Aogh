#!/usr/bin/env node
/* ======================================================================
   إدارة المستخدمين من سطر الأوامر — للطوارئ حين يُقفل آخر حساب مدير
   ----------------------------------------------------------------------
       node tools/user.js list
       node tools/user.js add <username> "<الاسم>" <role> <password>
       node tools/user.js password <username> <new-password>
       node tools/user.js unlock <username>
       node tools/user.js role <username> <role>

   الأدوار: super_admin · hr_admin · manager · viewer
   ====================================================================== */

"use strict";

const path = require("node:path");
const CONFIG = require("../config");
const DB = require("../lib/db");
const A = require("../lib/auth");
const USERS = require("../lib/users");

const config = CONFIG.build(path.join(__dirname, ".."));
const db = DB.open(config);
const ctx = { user: { id: null, fullName: "سطر الأوامر" }, ip: "cli" };
const [, , cmd, ...args] = process.argv;

function list() {
  const rows = db.all("SELECT username, full_name, role, is_active, locked_until, last_login_at FROM users ORDER BY username");
  if (!rows.length) return console.log("لا يوجد مستخدمون");
  for (const u of rows) {
    console.log(`  ${u.username.padEnd(16)} ${String(u.role).padEnd(12)} ${u.is_active ? "نشط" : "موقوف"}` +
      `${u.locked_until && u.locked_until > DB.nowIso() ? "  (مقفل مؤقتًا)" : ""}` +
      `   ${u.full_name}`);
  }
}

function must(v, name) {
  if (!v) { console.error(`ينقص ${name}`); process.exit(1); }
  return v;
}

try {
  switch (cmd) {
    case "list": list(); break;

    case "add": {
      const [username, fullName, role, password] = args;
      USERS.create(db, ctx, {
        username: must(username, "اسم المستخدم"), fullName: must(fullName, "الاسم"),
        role: must(role, "الدور"), password: must(password, "كلمة المرور"),
        mustChangePassword: true,
      });
      console.log(`أُنشئ ${username} بدور ${role} — يُطلب منه تغيير كلمة المرور عند أول دخول`);
      break;
    }

    case "password": {
      const [username, password] = args;
      const u = db.get("SELECT id FROM users WHERE lower(username) = lower(:u)", { u: must(username, "اسم المستخدم") });
      if (!u) { console.error("لا يوجد مستخدم بهذا الاسم"); process.exit(1); }
      USERS.setPassword(db, ctx, u.id, must(password, "كلمة المرور"));
      console.log("تغيّرت كلمة المرور، وأُنهيت جلسات المستخدم");
      break;
    }

    case "unlock": {
      const [username] = args;
      const r = db.run("UPDATE users SET locked_until = NULL, failed_attempts = 0, is_active = 1 WHERE lower(username) = lower(:u)",
        { u: must(username, "اسم المستخدم") });
      console.log(r.changes ? "فُكّ القفل" : "لا يوجد مستخدم بهذا الاسم");
      break;
    }

    case "role": {
      const [username, role] = args;
      const u = db.get("SELECT id FROM users WHERE lower(username) = lower(:u)", { u: must(username, "اسم المستخدم") });
      if (!u) { console.error("لا يوجد مستخدم بهذا الاسم"); process.exit(1); }
      USERS.update(db, { user: { id: null, role: "super_admin" }, ip: "cli" }, u.id, { role: must(role, "الدور") });
      console.log("تغيّر الدور");
      break;
    }

    default:
      console.log(require("node:fs").readFileSync(__filename, "utf8").split("*/")[0].split("\n").slice(2, -1)
        .map((l) => l.replace(/^ {3}/, "")).join("\n"));
  }
} catch (e) {
  console.error("خطأ: " + e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
