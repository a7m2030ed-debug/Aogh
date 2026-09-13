/* ======================================================================
   الإعداد — من متغيّرات البيئة، ومنها وحدها تأتي الأسرار
   ----------------------------------------------------------------------
   لا يُكتب أي مفتاح في الكود ولا في ملف يُرفع إلى المستودع.
   انسخ .env.example إلى .env واملأه، أو اضبط المتغيّرات في لوحة
   الاستضافة. الملف .env مستثنى في .gitignore.
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

function build(rootDir) {
  const fileEnv = loadDotEnv(path.join(rootDir, ".env"));
  // متغيّرات النظام تغلب ملف .env
  const env = Object.assign({}, fileEnv, process.env);

  const nodeEnv = (env.NODE_ENV || "development").toLowerCase();
  const port = Number(env.PORT || 3000);
  const publicUrl = (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, "");

  const config = {
    env: nodeEnv === "production" ? "production" : "development",
    port,
    host: env.HOST || "0.0.0.0",
    publicUrl,
    dataDir: path.resolve(rootDir, env.DATA_DIR || "data"),
    staticDir: path.resolve(rootDir, env.STATIC_DIR || ".."),
    paymentProvider: (env.PAYMENT_PROVIDER || "demo").toLowerCase(),
    shippingProvider: (env.SHIPPING_PROVIDER || "manual").toLowerCase(),
    // النطاقات المسموح لها بمناداة الواجهة بكوكي الجلسة
    allowedOrigins: String(env.ALLOWED_ORIGINS || publicUrl)
      .split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean),
    trustProxy: env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true",
    secureCookies: nodeEnv === "production" ? env.SECURE_COOKIES !== "0" : false,
  };

  const secrets = {};
  for (const [k, v] of Object.entries(env)) {
    if (/^(PAYTABS|MYFATOORAH|TAP|ARAMEX|SMSA)_/.test(k)) secrets[k] = v;
  }

  return { config, secrets };
}

/* فحوص لا يجوز تشغيل الإنتاج بدونها */
function auditProduction(config, secrets, payAdapter) {
  const problems = [];
  if (config.env !== "production") return problems;

  if (config.paymentProvider === "demo") {
    problems.push("PAYMENT_PROVIDER ما زال demo — لن يُحصَّل أي مبلغ حقيقي.");
  } else if (payAdapter && !payAdapter.configured({ secrets, config })) {
    problems.push(`مفاتيح بوابة ${config.paymentProvider} ناقصة.`);
  }
  if (!config.publicUrl.startsWith("https://")) {
    problems.push("PUBLIC_URL ليس https — بوابات الدفع ترفض الرجوع إلى http، والكوكي لن يُحمى.");
  }
  return problems;
}

module.exports = { build, auditProduction, loadDotEnv };
