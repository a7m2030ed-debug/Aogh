#!/usr/bin/env node
/* ======================================================================
   فحص ما قبل الإطلاق
   ----------------------------------------------------------------------
   يفحص خادمًا يعمل فعلًا ويقول هل يصلح لاستقبال أول ريال حقيقي.
   يفحص الإعداد والأمان والبيانات، ولا يلمس شيئًا.

       node deploy/preflight.js                 # الخادم المحلي
       node deploy/preflight.js https://نطاقك   # الخادم المنشور

   يخرج برمز 1 إن وُجد مانع، فيصلح للاستعمال في خط نشر آلي.
   ====================================================================== */

"use strict";

const path = require("node:path");
const fs = require("node:fs");

const BASE = (process.argv[2] || process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/+$/, "");
const SERVER_DIR = path.join(__dirname, "..");

const blockers = [];
const warnings = [];
const good = [];

const block = (m, fix) => blockers.push({ m, fix });
const warn = (m, fix) => warnings.push({ m, fix });
const ok = (m) => good.push(m);

async function get(p, opts = {}) {
  const res = await fetch(BASE + p, Object.assign({ redirect: "manual" }, opts));
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ليس JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function main() {
  console.log(`\nفحص ما قبل الإطلاق — ${BASE}\n${"─".repeat(58)}`);

  /* ------------------------------------------------- هل الخادم يردّ */

  let catalog;
  try {
    catalog = await get("/api/catalog");
    if (catalog.status !== 200) throw new Error("رمز " + catalog.status);
    ok("الخادم يردّ");
  } catch (e) {
    console.error(`\n✗ الخادم لا يردّ على ${BASE}\n  ${e.message}\n`);
    console.error("  تأكد أنه يعمل:  systemctl status naseej\n");
    process.exit(1);
  }

  /* ------------------------------------------------------- البروتوكول */

  if (BASE.startsWith("https://")) {
    ok("الاتصال عبر https");
  } else if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0)/.test(BASE)) {
    warn("تفحص خادمًا محليًا. أعد الفحص على النطاق الحقيقي قبل الإطلاق.");
  } else {
    block("الموقع يعمل على http لا https.",
          "بوابات الدفع ترفض الرجوع إلى http، وكوكي الجلسة لن يُحمى. شغّل: certbot --nginx -d نطاقك");
  }

  /* ---------------------------------------------------------- الكتالوج */

  const products = (catalog.json && catalog.json.products) || [];
  const settings = (catalog.json && catalog.json.settings) || {};

  if (!products.length) {
    block("الكتالوج فارغ.", "أضف أقمشتك من اللوحة، أو للتجربة: node seed-demo.js");
  } else {
    ok(`الكتالوج فيه ${products.length} قماشًا معروضًا`);
  }

  const demoSkus = ["SM-TA-101", "SM-NS-301", "BL-601"];
  const demoLeft = products.filter((p) => demoSkus.includes(p.sku));
  if (demoLeft.length) {
    warn(`ما زال الكتالوج التجريبي معروضًا (${demoLeft.length} صنفًا منه).`,
         "احذفه من اللوحة وأدخل أقمشتك الحقيقية قبل الإطلاق.");
  }

  /* العلامة تأتي من اللوحة. وللأقمشة التي أُدخلت قبلها: النقش المولَّد
     SVG دائمًا، بقي data URI أو صار ملفًا بعد الترحيل. */
  const isGeneratedArt = (p) =>
    p.imagesGenerated === true ||
    (p.imagesGenerated === undefined &&
      (p.images || []).length > 0 &&
      (p.images || []).every((s) => typeof s === "string" && /^data:image\/svg\+xml|\.svg$/i.test(s)));
  const generated = products.filter(isGeneratedArt);
  if (generated.length) {
    warn(`${generated.length} قماشًا بنقش مولَّد لا بصورة القماش نفسه.`,
         'لا يمنع الإطلاق. ارفع صورها من اللوحة متى صوّرتها — تجدها بعلامة «بلا صورة» في قائمة الأقمشة.');
  }

  const noStock = products.filter((p) =>
    (!p.meter.enabled || p.meter.stock <= 0) && (!p.bolt.enabled || p.bolt.stock <= 0));
  if (noStock.length) {
    warn(`${noStock.length} قماشًا معروضًا بلا مخزون.`, "زوّده أو أخفِه من اللوحة.");
  }

  /* ---------------------------------------------------------- الضريبة */

  if (settings.vatEnabled) {
    const pct = Math.round((settings.vatRate || 0) * 100);
    ok(`الضريبة مفعّلة (${pct}٪ ضمن السعر)`);
    warn("تحصيل الضريبة يستلزم تسجيلًا ضريبيًا ساريًا.",
         "إن لم تكن المنشأة مسجَّلة فأطفئها من الإعدادات: تحصيلها بلا تسجيل مخالفة.");
  } else {
    ok("الضريبة مطفأة — الأسعار بلا ضريبة ولا تُصدر فاتورة ضريبية");
  }

  /* ------------------------------------------------------ وسائل الدفع */

  /* الكتالوج العام لا يعيد إلا الوسائل المفعّلة */
  const gateways = settings.gateways || [];
  if (!gateways.length) block("لا وسيلة دفع مفعّلة.", "فعّل واحدة على الأقل من الإعدادات.");
  else ok(`وسائل الدفع المعروضة: ${gateways.map((g) => g.name).join("، ")}`);

  /* الدفع عند الاستلام لا يمرّ ببوابة: الخادم يعتمد الطلب مباشرة. فمتجر
     يبيع به وحده لا يحتاج بوابة أصلًا، ولا يصحّ منعه من الإطلاق لأن
     PAYMENT_PROVIDER ما زال التجريبية. */
  const onlineGateways = gateways.filter((g) => g.id !== "cod");
  const needsGateway = onlineGateways.length > 0;

  /* --------------------------------------------- الإعداد من ملف البيئة */

  const envPath = path.join(SERVER_DIR, ".env");
  let env = {};
  if (fs.existsSync(envPath)) {
    const mode = (fs.statSync(envPath).mode & 0o777).toString(8);
    if (mode !== "600") {
      warn(`صلاحيات .env هي ${mode} لا 600.`, `chmod 600 ${envPath}`);
    } else {
      ok(".env محمي بصلاحيات 600");
    }
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } else {
    warn("لا ملف .env بجوار الخادم.", "قد تكون الإعدادات من متغيّرات المنصّة، وهذا سليم.");
  }

  const provider = (env.PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER || "demo").toLowerCase();

  if (provider === "demo") {
    if (needsGateway) {
      block(`بوابة الدفع ما زالت التجريبية، و${onlineGateways.map((g) => g.name).join("، ")} تحتاجها.`,
            "لن يُحصَّل أي مبلغ. إما أن تضع بوابتك ومفاتيحها في .env، أو تُبقي «الدفع عند الاستلام» وحده مفعّلًا من الإعدادات.");
    } else {
      ok("الدفع عند الاستلام وحده — لا حاجة لبوابة، والطلب يُعتمد على الخادم مباشرة");
      warn("لا دفع إلكتروني: الزبون يدفع نقدًا عند التسليم.",
           "حين يجهز حسابك لدى بوابة، ضع مفاتيحها في .env وفعّل مدى وApple Pay من الإعدادات.");
    }
  } else {
    const need = {
      paytabs: ["PAYTABS_PROFILE_ID", "PAYTABS_SERVER_KEY"],
      myfatoorah: ["MYFATOORAH_TOKEN", "MYFATOORAH_WEBHOOK_SECRET"],
      tap: ["TAP_SECRET_KEY"],
    }[provider] || [];
    const missing = need.filter((k) => !(env[k] || process.env[k]));
    if (missing.length) {
      // بلا وسيلة إلكترونية مفعّلة لا تُستدعى البوابة، فالنقص تنبيه لا مانع
      const msg = `مفاتيح ${provider} ناقصة: ${missing.join("، ")}`;
      if (needsGateway) block(msg, "أضفها في .env ثم أعد التشغيل.");
      else warn(msg, "لا يمنع الإطلاق ما دام «الدفع عند الاستلام» هو الوسيلة الوحيدة المفعّلة.");
    } else {
      ok(`بوابة الدفع: ${provider}، ومفاتيحها مضبوطة`);
    }

    const testKey = Object.entries(env).find(([, v]) => /(^|_)test(_|$)|sk_test_/i.test(String(v)));
    if (testKey) warn(`المفتاح ${testKey[0]} يبدو مفتاح اختبار.`, "استبدله بمفتاح الإنتاج قبل الإطلاق.");
  }

  if ((env.NODE_ENV || process.env.NODE_ENV) !== "production") {
    warn("NODE_ENV ليس production.", "في وضع الإنتاج يرفض الخادم البوابة التجريبية ويشدّد الكوكي.");
  } else {
    ok("NODE_ENV = production");
  }

  if (env.TRUST_PROXY !== "1" && /^https/.test(BASE)) {
    warn("TRUST_PROXY ليس 1 والموقع خلف بروكسي غالبًا.",
         "بدونه يرى الخادم عنوان البروكسي بدل عنوان الزائر، فيُكبح كل الزوار معًا.");
  }

  /* ------------------------------------------------------------ الأمان */

  const leak = await get("/server/.env");
  if (leak.status === 200) block("ملف .env قابل للتنزيل من المتصفح!", "حدّث الخادم فورًا: هذه ثغرة مُصلَحة.");
  else ok("مجلد الخادم وأسراره محجوبة عن الويب");

  const admin = await get("/api/admin/data");
  if (admin.status !== 401) block(`مسار اللوحة يردّ ${admin.status} بلا جلسة!`, "يجب أن يردّ 401.");
  else ok("مسارات اللوحة محمية");

  const track = await get("/api/orders/track?number=NS-2457");
  if (track.status === 200) block("تتبّع الطلب يعمل بلا رقم جوال!", "يجب أن يطلب الرقمين معًا.");
  else ok("تتبّع الطلب يتحقق من هوية صاحبه");

  const hdr = catalog.headers;
  if (hdr.get("x-content-type-options") !== "nosniff") warn("ترويسة nosniff غير موجودة.");

  /* ---------------------------------------------- كلمة مرور المدير */

  const weak = ["admin", "1234", "12345678", "password", "naseej"];
  let cracked = null;
  for (const pw of weak) {
    const r = await fetch(BASE + "/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: pw }),
    });
    if (r.status === 200) { cracked = pw; break; }
    if (r.status === 429) break; // الكبح يعمل، وهذا جيد
  }
  if (cracked) block(`كلمة مرور المدير ضعيفة («${cracked}»).`, "غيّرها فورًا من اللوحة.");
  else ok("كلمة مرور المدير ليست من الكلمات الشائعة");

  /* ------------------------------------------------ بيانات المنشأة */

  const admins = path.join(SERVER_DIR, env.DATA_DIR || "data", "settings.json");
  if (fs.existsSync(admins)) {
    try {
      const s = JSON.parse(fs.readFileSync(admins, "utf8"));
      if (s.vatEnabled !== false) {
        if (!/^3\d{13}3$/.test(String(s.vatNumber || ""))) {
          block("الرقم الضريبي غير مضبوط أو غير صحيح مع تفعيل الضريبة.",
                "خمس عشرة خانة تبدأ بـ3 وتنتهي بـ3. اضبطه من الإعدادات، وإلا فالفواتير لا تصلح ضريبيًا.");
        } else ok("الرقم الضريبي مضبوط");
        if (!s.legalName) warn("الاسم النظامي للمنشأة غير محدد.", "يظهر على الفاتورة الضريبية.");
      }
    } catch { /* تُقرأ من الخادم بدلًا منه */ }
  }

  /* ------------------------------------------------------------ النتيجة */

  const line = "─".repeat(58);
  console.log();
  good.forEach((m) => console.log("  \x1b[32m✓\x1b[0m " + m));
  if (warnings.length) {
    console.log("\n" + line + "\n  تنبيهات (لا تمنع الإطلاق):\n");
    warnings.forEach((w) => {
      console.log("  \x1b[33m!\x1b[0m " + w.m);
      if (w.fix) console.log("      " + w.fix);
    });
  }
  if (blockers.length) {
    console.log("\n" + line + "\n  موانع يجب حلّها قبل أول بيع:\n");
    blockers.forEach((b) => {
      console.log("  \x1b[31m✗\x1b[0m " + b.m);
      if (b.fix) console.log("      " + b.fix);
    });
  }

  console.log("\n" + line);
  if (blockers.length) {
    console.log(`  \x1b[31mغير جاهز\x1b[0m — ${blockers.length} مانعًا، و${warnings.length} تنبيهًا.\n`);
    process.exit(1);
  }
  console.log(`  \x1b[32mجاهز للإطلاق\x1b[0m — بلا موانع، و${warnings.length} تنبيهًا للمراجعة.\n`);
}

main().catch((e) => {
  console.error("\nتعذّر الفحص:", e.message, "\n");
  process.exit(1);
});
