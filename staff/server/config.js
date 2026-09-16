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

  /* وضع الشبكة المحلية: النظام يعمل على جهاز في العيادة ويفتحه الموظفون
     من الشبكة نفسها — بلا نطاق ولا استضافة ولا إنترنت. يُسمح فيه بـhttp
     لأن حركة البيانات لا تغادر الشبكة، ويبقى كل ما عداه كما هو. */
  const lan = bool(env.LAN, false);

  /* شهادة محلية اختيارية (self-signed) تجعل حتى الشبكة المحلية مشفَّرة */
  const tls = env.TLS_CERT && env.TLS_KEY
    ? { cert: path.resolve(rootDir, env.TLS_CERT), key: path.resolve(rootDir, env.TLS_KEY) }
    : null;

  const scheme = tls ? "https" : "http";
  const publicUrl = (env.PUBLIC_URL || `${scheme}://localhost:${port}`).replace(/\/+$/, "");

  const config = {
    env: nodeEnv,
    lan,
    tls,
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
    // الكوكي المحمي لا يُرسل إلا على https، فلا يُفعَّل على شبكة محلية بلا شهادة
    secureCookies: bool(env.SECURE_COOKIES, !!tls || (nodeEnv === "production" && !lan)),
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
   لأن بيانات الموظفين وأرقام الهوية لا تُترك على اتصال غير مشفَّر.

   وتُستثنى الشبكة المحلية (LAN=1): هناك لا يخرج شيء إلى الإنترنت أصلًا،
   فيُسمح بـhttp ويُكتفى بتنبيه ظاهر عند الإقلاع. */
function auditProduction(config) {
  const problems = [];
  if (config.env !== "production" || config.lan) return problems;
  if (!config.publicUrl.startsWith("https://")) {
    problems.push("PUBLIC_URL ليس https — لا يجوز نقل أرقام الهوية على اتصال غير مشفَّر، والكوكي لن يُحمى." +
      "\n     (إن كان النظام على شبكة داخلية بلا إنترنت فاضبط LAN=1)");
  }
  if (!config.secureCookies) {
    problems.push("SECURE_COOKIES مُطفأ في الإنتاج — كوكي الجلسة سيُرسل على http.");
  }
  if (config.backupHour >= 0 && path.resolve(config.backupDir).startsWith(path.resolve(config.dataDir) + path.sep)) {
    problems.push("BACKUP_DIR داخل DATA_DIR — النسخة الاحتياطية تضيع مع أصلها. اجعله على حجم آخر.");
  }
  return problems;
}

/* تنبيهات لا توقف التشغيل، تُطبع عند الإقلاع ليعرف المشغّل ما يجري */
function warnings(config) {
  const out = [];
  if (config.lan && !config.tls) {
    out.push("وضع الشبكة المحلية بلا تشفير: كلمات المرور تمرّ داخل شبكتك كما هي.");
    out.push("لا تفتح منفذ هذا الجهاز على الإنترنت، واحمِ شبكة الواي فاي بكلمة قوية.");
  }
  if (config.backupHour < 0) out.push("النسخ الاحتياطي التلقائي مُطفأ (BACKUP_HOUR=-1).");
  return out;
}

/* عناوين هذا الجهاز على الشبكة المحلية — ليعرف الموظفون ماذا يكتبون */
function localAddresses() {
  const os = require("node:os");
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === "IPv4" && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

module.exports = { build, auditProduction, warnings, localAddresses, loadDotEnv };
