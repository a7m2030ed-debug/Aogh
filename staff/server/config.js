/* ======================================================================
   الإعداد — من متغيّرات البيئة، ومنها وحدها تأتي الأسرار
   ----------------------------------------------------------------------
   لا تُكتب كلمة مرور ولا مفتاح في الكود. انسخ .env.example إلى .env
   واملأه، أو اضبط المتغيّرات في لوحة الاستضافة.
   ====================================================================== */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

/* قارئ .env بسيط: KEY=VALUE، ويتجاهل التعليقات والفراغات */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k) out[k] = v;
  }
  return out;
}

const num = (v, dflt) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? dflt : Number(v));
const bool = (v, dflt) => (v === undefined || v === "" ? dflt : v === "1" || String(v).toLowerCase() === "true");

function build(rootDir) {
  const fileEnv = loadDotEnv(path.join(rootDir, ".env"));
  // متغيّرات النظام تغلب ملف .env
  const env = Object.assign({}, fileEnv, process.env);

  const nodeEnv = (env.NODE_ENV || "development").toLowerCase() === "production" ? "production" : "development";
  const port = num(env.PORT, 3000);
  const publicUrl = (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, "");

  const config = {
    env: nodeEnv,
    port,
    host: env.HOST || "0.0.0.0",
    publicUrl,
    dataDir: path.resolve(rootDir, env.DATA_DIR || "data"),
    backupDir: path.resolve(rootDir, env.BACKUP_DIR || "backups"),
    staticDir: path.resolve(rootDir, env.STATIC_DIR || ".."),
    backupRetentionDays: num(env.BACKUP_RETENTION_DAYS, 30),
    backupHour: num(env.BACKUP_HOUR, 2),
    sessionIdleMinutes: num(env.SESSION_IDLE_MINUTES, 30),
    sessionMaxHours: num(env.SESSION_MAX_HOURS, 12),
    maxUploadMb: num(env.MAX_UPLOAD_MB, 10),
    trustProxy: bool(env.TRUST_PROXY, false),
    secureCookies: nodeEnv === "production" ? bool(env.SECURE_COOKIES, true) : false,
    allowedOrigins: String(env.ALLOWED_ORIGINS || publicUrl)
      .split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean),
    seedAdmin: {
      username: env.ADMIN_USERNAME || "admin",
      password: env.ADMIN_PASSWORD || "",
      name: env.ADMIN_NAME || "مدير النظام",
    },
  };

  return config;
}

/* فحوص لا يجوز تشغيل الإنتاج بدونها — تُوقف الإقلاع لا تُطبع فقط،
   لأن بيانات الموظفين وأرقام الهوية لا تُترك على اتصال غير مشفَّر. */
function auditProduction(config) {
  const problems = [];
  if (config.env !== "production") return problems;
  if (!config.publicUrl.startsWith("https://")) {
    problems.push("PUBLIC_URL ليس https — لا يجوز نقل أرقام الهوية على اتصال غير مشفَّر، والكوكي لن يُحمى.");
  }
  if (!config.secureCookies) {
    problems.push("SECURE_COOKIES مُطفأ في الإنتاج — كوكي الجلسة سيُرسل على http.");
  }
  if (config.backupHour >= 0 && path.resolve(config.backupDir).startsWith(path.resolve(config.dataDir) + path.sep)) {
    problems.push("BACKUP_DIR داخل DATA_DIR — النسخة الاحتياطية تضيع مع أصلها. اجعله على حجم آخر.");
  }
  return problems;
}

module.exports = { build, auditProduction, loadDotEnv };
