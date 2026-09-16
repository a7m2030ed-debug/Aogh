#!/usr/bin/env node
/* ======================================================================
   فحص ما قبل التسليم
   ----------------------------------------------------------------------
   يفحص خادمًا يعمل فعلًا ويقول: هل يصلح لاستقبال بيانات موظفين حقيقية؟
   لا يكتب شيئًا ولا يعدّل بيانات.

       node deploy/preflight.js                  # الخادم المحلي
       node deploy/preflight.js https://نطاقك    # الخادم المنشور

   يخرج برمز 1 إن وُجد مانع، فيصلح لخط نشر آلي.
   ====================================================================== */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const BASE = (process.argv[2] || process.env.PUBLIC_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const SERVER_DIR = path.join(__dirname, "..");

const blockers = [];
const warnings = [];
const good = [];

const ok = (m) => good.push(m);
const warn = (m) => warnings.push(m);
const block = (m) => blockers.push(m);

async function main() {
  console.log(`\n  فحص ${BASE}\n`);

  /* ------------------------------------------------ الخادم يستجيب */
  let health;
  try {
    const r = await fetch(BASE + "/api/health");
    health = await r.json();
    ok(`الخادم يستجيب · نسخة المخطط ${health.version} · البيئة ${health.env}`);
    if (health.env !== "production") warn("NODE_ENV ليس production — رسائل الأخطاء أوسع والكوكي غير محمي");
  } catch (e) {
    block(`الخادم لا يستجيب على ${BASE} (${e.message})`);
    return report();
  }

  /* ------------------------------------------------------ https */
  if (!BASE.startsWith("https://")) {
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(BASE)) warn("الفحص محلي — أعِده على النطاق العام بـhttps");
    else block("النظام يُفتح على http — أرقام الهوية وكلمات المرور تمرّ بلا تشفير");
  } else {
    ok("https");
  }

  /* -------------------------------------------- الحماية والرؤوس */
  const res = await fetch(BASE + "/");
  const h = (n) => res.headers.get(n) || "";
  if (h("content-security-policy").includes("script-src 'self'")) ok("سياسة CSP تمنع أي سكربت خارجي");
  else block("رأس Content-Security-Policy ناقص");
  if (h("x-content-type-options") === "nosniff") ok("nosniff"); else warn("رأس X-Content-Type-Options ناقص");
  if (/DENY|SAMEORIGIN/i.test(h("x-frame-options"))) ok("منع التأطير"); else warn("رأس X-Frame-Options ناقص");
  if (BASE.startsWith("https://")) {
    if (h("strict-transport-security")) ok("HSTS"); else warn("رأس HSTS ناقص — أضِفه في Nginx");
  }

  /* ------------------------------------------- المسارات المحمية */
  for (const p of ["/api/employees", "/api/reports/dashboard?from=2026-01-01&to=2026-12-31",
    "/api/audit", "/api/users", "/api/backups", "/api/export/employees.xlsx"]) {
    const r = await fetch(BASE + p);
    if (r.status === 401) continue;
    block(`المسار ${p} لا يطلب تسجيل دخول (رمز ${r.status})`);
  }
  ok("كل مسارات البيانات تطلب جلسة");

  /* ------------------------------ الكوكي: HttpOnly وSecure وSameSite */
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "preflight-check", password: "not-a-real-password-1" }),
  });
  if (login.status === 401) ok("كلمة مرور خاطئة تُرفض");
  else warn(`ردّ الدخول غير متوقع (${login.status})`);

  /* --------------------------------- لا تُخدَم ملفات الخادم والبيانات */
  for (const p of ["/server/.env", "/server/data/staff.db", "/server/server.js", "/data/staff.db",
    "/server/lib/db.js", "/.git/config"]) {
    const r = await fetch(BASE + p);
    const body = await r.text();
    if (r.ok && !body.includes("<!DOCTYPE html>")) block(`الملف ${p} قابل للتنزيل من الإنترنت`);
  }
  ok("ملفات الخادم والقاعدة غير قابلة للتنزيل");

  /* ------------------------------------------------ الإعداد المحلي */
  if (fs.existsSync(path.join(SERVER_DIR, ".env"))) {
    const env = require("../config").loadDotEnv(path.join(SERVER_DIR, ".env"));
    const mode = fs.statSync(path.join(SERVER_DIR, ".env")).mode & 0o077;
    if (mode) warn("ملف .env يقرؤه غيرك — نفّذ: chmod 600 server/.env");
    else ok("صلاحيات .env محصورة");

    if (env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length < 12) {
      warn("ADMIN_PASSWORD قصيرة — الأفضل تركها فارغة ليُولَّد سرّ عشوائي");
    }
    if (env.PUBLIC_URL && !env.PUBLIC_URL.startsWith("https://")) block("PUBLIC_URL في .env ليس https");

    const dataDir = path.resolve(SERVER_DIR, env.DATA_DIR || "data");
    const backupDir = path.resolve(SERVER_DIR, env.BACKUP_DIR || "backups");
    if (backupDir.startsWith(dataDir + path.sep)) block("BACKUP_DIR داخل DATA_DIR — النسخة تضيع مع أصلها");
    else ok("النسخ الاحتياطية خارج مجلد البيانات");

    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir).filter((f) => /^staff-\d{8}-\d{6}\.db$/.test(f));
      if (!files.length) warn("لا توجد نسخة احتياطية بعد — خُذ واحدة من الإعدادات أو: npm run backup");
      else {
        const newest = files.map((f) => fs.statSync(path.join(backupDir, f)).mtimeMs).sort().pop();
        const ageH = (Date.now() - newest) / 3600000;
        if (ageH > 36) warn(`أحدث نسخة احتياطية عمرها ${Math.round(ageH / 24)} يومًا — تأكد أن النسخ اليومي يعمل`);
        else ok(`أحدث نسخة احتياطية عمرها ${Math.round(ageH)} ساعة`);
      }
      if (fs.statSync(backupDir).mode & 0o007) warn("مجلد النسخ مقروء للجميع — احصره: chmod 750");
    }
    if (env.BACKUP_HOUR === "-1") warn("النسخ التلقائي مُطفأ (BACKUP_HOUR=-1)");
  } else {
    warn("لا يوجد server/.env — يعمل النظام بإعداداته الافتراضية");
  }

  report();
}

function report() {
  const line = "  " + "─".repeat(62);
  console.log(line);
  good.forEach((m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`));
  warnings.forEach((m) => console.log(`  \x1b[33m!\x1b[0m ${m}`));
  blockers.forEach((m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`));
  console.log(line);
  if (blockers.length) {
    console.log(`\n  \x1b[31m${blockers.length} مانعًا\x1b[0m — لا تُدخل بيانات حقيقية قبل معالجتها.\n`);
    process.exit(1);
  }
  console.log(`\n  \x1b[32mجاهز\x1b[0m${warnings.length ? ` · ${warnings.length} تنبيهًا يستحسن معالجتها` : ""}.\n`);
}

main().catch((e) => {
  console.error("تعذّر الفحص: " + e.message);
  process.exit(1);
});
