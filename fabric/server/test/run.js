#!/usr/bin/env node
/* ======================================================================
   اختبارات الخادم — من طرف إلى طرف على خادم حقيقي
   التشغيل:  node test/run.js
   تركّز على ما يمسّ المال والمخزون، فهو ما يكلّف إن انكسر.
   ====================================================================== */

"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert");

const PORT = 3411;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "naseej-test-"));
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    pass++;
    results.push("  ✓ " + name);
  } catch (e) {
    fail++;
    results.push("  ✗ " + name + "\n      " + (e.message || e).split("\n")[0]);
  }
}

let cookie = "";

async function api(method, url, body, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie && !opts.noCookie) headers.Cookie = cookie;
  Object.assign(headers, opts.headers || {});
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const sc = res.headers.get("set-cookie");
  if (sc && !opts.noCookie) cookie = sc.split(";")[0];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* قد يكون HTML */ }
  return { status: res.status, json, text, headers: res.headers };
}

/* ------------------------------------------------------------ الإقلاع */

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server.js"], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        PORT: String(PORT),
        DATA_DIR: DATA,
        PUBLIC_URL: BASE,
        NODE_ENV: "development",
        PAYMENT_PROVIDER: "demo",
        SHIPPING_PROVIDER: "manual",
      }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const onData = (b) => {
      out += b.toString();
      const m = /كلمة المرور: (\S+)/.exec(out);
      if (out.includes("يعمل على") && m) resolve({ child, password: m[1], out });
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (c) => reject(new Error("الخادم توقّف برمز " + c + "\n" + out)));
    setTimeout(() => reject(new Error("مهلة إقلاع الخادم:\n" + out)), 10000);
  });
}

/* ------------------------------------------------------------ المسار */

async function main() {
  // كتالوج تجريبي قبل الإقلاع
  const { execFileSync } = require("node:child_process");
  execFileSync(process.execPath, ["seed-demo.js"], { cwd: ROOT, env: Object.assign({}, process.env, { DATA_DIR: DATA }) });

  const { child, password } = await startServer();
  const done = () => { try { child.kill("SIGKILL"); } catch {} };

  try {
    /* ---------------------------------------------------- عام */

    await test("الكتالوج العام يُقرأ بلا دخول", async () => {
      const r = await api("GET", "/api/catalog", undefined, { noCookie: true });
      assert.strictEqual(r.status, 200);
      assert.ok(r.json.products.length >= 15, "عدد المنتجات");
      assert.ok(r.json.settings.storeName, "اسم المتجر");
    });

    await test("الكتالوج العام لا يسرّب بيانات إدارية", async () => {
      const r = await api("GET", "/api/catalog", undefined, { noCookie: true });
      const raw = JSON.stringify(r.json);
      assert.ok(!raw.includes("passwordHash"), "لا كلمات مرور");
      assert.ok(!raw.includes("vatNumber"), "لا رقم ضريبي");
      assert.ok(!raw.includes("reserved"), "لا حقل الحجز الخام");
    });

    await test("مسارات اللوحة مرفوضة بلا جلسة", async () => {
      for (const [m, u] of [["GET", "/api/admin/data"], ["POST", "/api/admin/products"], ["PUT", "/api/admin/settings"]]) {
        const r = await api(m, u, m === "GET" ? undefined : {}, { noCookie: true });
        assert.strictEqual(r.status, 401, `${m} ${u} أعاد ${r.status}`);
      }
    });

    /* ---------------------------------------------------- التسعير */

    let prod, boltProd;
    await test("التسعير يُحتسب على الخادم", async () => {
      const cat = await api("GET", "/api/catalog", undefined, { noCookie: true });
      prod = cat.json.products.find((p) => p.meter.enabled && p.meter.stock > 20);
      boltProd = cat.json.products.find((p) => p.bolt.enabled && p.bolt.stock > 2);
      const r = await api("POST", "/api/orders/quote", {
        items: [{ productId: prod.id, mode: "meter", qty: 4 }],
        carrier: "smsa",
      });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.totals.subtotal, Math.round(prod.meter.price * 4 * 100) / 100);
      assert.strictEqual(r.json.items[0].unitPrice, prod.meter.price);
    });

    await test("سعر مرسل من العميل يُهمل", async () => {
      const r = await api("POST", "/api/orders/quote", {
        items: [{ productId: prod.id, mode: "meter", qty: 4, unitPrice: 1, lineTotal: 4 }],
        carrier: "smsa",
      });
      assert.strictEqual(r.json.items[0].unitPrice, prod.meter.price, "السعر من الكتالوج");
      assert.ok(r.json.totals.grand > 100, "الإجمالي لم يتأثر بما أرسله العميل");
    });

    await test("الضريبة مطفأة افتراضيًا فلا تُحصَّل", async () => {
      const r = await api("POST", "/api/orders/quote", {
        items: [{ productId: prod.id, mode: "meter", qty: 4 }], carrier: "smsa",
      });
      const t = r.json.totals;
      assert.strictEqual(t.vat, 0, "لا ضريبة");
      assert.strictEqual(t.grand, Math.round((t.subtotal + t.shipping) * 100) / 100, "الإجمالي = المجموع + الشحن");
      const cat = await api("GET", "/api/catalog", undefined, { noCookie: true });
      assert.strictEqual(cat.json.settings.vatEnabled, false, "المتجر يعلن أنها مطفأة");
    });

    await test("كمية غير مضاعفة لنصف المتر تُرفض", async () => {
      const r = await api("POST", "/api/orders/quote", {
        items: [{ productId: prod.id, mode: "meter", qty: 3.3 }], carrier: "smsa",
      });
      assert.strictEqual(r.status, 400);
      assert.ok(/مضاعفات/.test(r.json.error), r.json.error);
    });

    await test("كمية سالبة تُرفض", async () => {
      const r = await api("POST", "/api/orders/quote", {
        items: [{ productId: prod.id, mode: "meter", qty: -5 }], carrier: "smsa",
      });
      assert.strictEqual(r.status, 400);
    });

    await test("كمية أكبر من المتاح تُرفض", async () => {
      // الطاقات مخزونها صغير، فتختبر حدّ المخزون لا حدّ الصنف الواحد
      const r = await api("POST", "/api/orders/quote", {
        items: [{ productId: boltProd.id, mode: "bolt", qty: boltProd.bolt.stock + 1 }], carrier: "smsa",
      });
      assert.strictEqual(r.status, 409, r.text);
      assert.strictEqual(r.json.code, "out_of_stock");
    });

    await test("كمية أكبر من حدّ الصنف الواحد تُرفض", async () => {
      const r = await api("POST", "/api/orders/quote", {
        items: [{ productId: prod.id, mode: "meter", qty: 500 }], carrier: "smsa",
      });
      assert.strictEqual(r.status, 400);
    });

    await test("طريقة شحن غير مفعّلة تُرفض", async () => {
      const r = await api("POST", "/api/orders/quote", {
        items: [{ productId: prod.id, mode: "meter", qty: 3 }], carrier: "لا-توجد",
      });
      assert.strictEqual(r.status, 400);
    });

    /* ---------------------------------------------------- الطلب */

    let order;
    await test("إنشاء الطلب يحجز الكمية ولا يخصمها", async () => {
      const before = (await api("GET", "/api/catalog", undefined, { noCookie: true }))
        .json.products.find((p) => p.id === prod.id).meter.stock;

      const r = await api("POST", "/api/orders", {
        items: [{ productId: prod.id, mode: "meter", qty: 4 }],
        customer: { name: "عبدالله محمد الحربي", phone: "0551234567" },
        shipping: { carrier: "smsa", city: "الرياض", district: "النرجس", address: "شارع الأمير سلطان مبنى 12" },
        paymentMethod: "mada",
      });
      assert.strictEqual(r.status, 201, r.text);
      order = r.json.order;
      assert.strictEqual(order.status, "pending_payment");
      assert.ok(r.json.redirectUrl, "رابط الدفع");

      const after = (await api("GET", "/api/catalog", undefined, { noCookie: true }))
        .json.products.find((p) => p.id === prod.id).meter.stock;
      assert.strictEqual(after, Math.round((before - 4) * 100) / 100, "المتاح نقص بالحجز");
    });

    await test("الطلب لا يُعتمد قبل إشعار البوابة", async () => {
      const r = await api("GET", `/api/orders/track?number=${order.number}&phone=0551234567`, undefined, { noCookie: true });
      assert.strictEqual(r.json.order.payment.status, "pending");
      assert.strictEqual(r.json.order.status, "pending_payment");
    });

    await test("جوال خاطئ لا يكشف الطلب", async () => {
      const r = await api("GET", `/api/orders/track?number=${order.number}&phone=0559999999`, undefined, { noCookie: true });
      assert.strictEqual(r.status, 404);
    });

    await test("إشعار بمبلغ مخالف يُرفض ولا يُعتمد الطلب", async () => {
      const r = await api("POST", "/api/payments/webhook/demo", {
        reference: order.payment.ref || "", orderId: order.id, status: "paid", amount: 1,
      }, { noCookie: true });
      assert.strictEqual(r.status, 409, "رُفض");
      const t = await api("GET", `/api/orders/track?number=${order.number}&phone=0551234567`, undefined, { noCookie: true });
      assert.strictEqual(t.json.order.payment.status, "pending", "بقي غير مدفوع");
    });

    await test("إشعار صحيح يعتمد الطلب ويخصم المخزون", async () => {
      const before = (await api("GET", "/api/catalog", undefined, { noCookie: true }))
        .json.products.find((p) => p.id === prod.id).meter.stock;

      const r = await api("POST", "/api/payments/webhook/demo", {
        reference: order.payment.ref || "", orderId: order.id, status: "paid", amount: order.totals.grand,
      }, { noCookie: true });
      assert.strictEqual(r.status, 200);

      const t = await api("GET", `/api/orders/track?number=${order.number}&phone=0551234567`, undefined, { noCookie: true });
      assert.strictEqual(t.json.order.payment.status, "paid");
      assert.strictEqual(t.json.order.status, "new");

      const after = (await api("GET", "/api/catalog", undefined, { noCookie: true }))
        .json.products.find((p) => p.id === prod.id).meter.stock;
      assert.strictEqual(after, before, "المتاح ثابت: الحجز تحوّل إلى خصم");
    });

    await test("تكرار الإشعار لا يخصم مرتين", async () => {
      const before = (await api("GET", "/api/catalog", undefined, { noCookie: true }))
        .json.products.find((p) => p.id === prod.id).meter.stock;
      for (let i = 0; i < 3; i++) {
        await api("POST", "/api/payments/webhook/demo", {
          reference: order.payment.ref || "", orderId: order.id, status: "paid", amount: order.totals.grand,
        }, { noCookie: true });
      }
      const after = (await api("GET", "/api/catalog", undefined, { noCookie: true }))
        .json.products.find((p) => p.id === prod.id).meter.stock;
      assert.strictEqual(after, before, "لم يتغيّر المخزون");
    });

    await test("طلبان متزامنان لا يبيعان أكثر من الموجود", async () => {
      // نضبط قماشًا على عشرة أمتار بالضبط، ثم نطلب ثمانية مرتين معًا
      await api("POST", "/api/admin/login", { username: "admin", password });
      const all = (await api("GET", "/api/admin/data")).json.products;
      const target = all.find((p) => p.meter.enabled && p.id !== prod.id && p.meter.stock > 0);
      await api("PATCH", `/api/admin/products/${target.id}/stock`, { "meter.stock": 10 });

      const mk = () => api("POST", "/api/orders", {
        items: [{ productId: target.id, mode: "meter", qty: 8 }],
        customer: { name: "زبون متزامن", phone: "0551110000" },
        shipping: { carrier: "smsa", city: "جدة", address: "شارع التحلية مبنى 1" },
        paymentMethod: "mada",
      }, { noCookie: true });

      const [a, b] = await Promise.all([mk(), mk()]);
      const codes = [a.status, b.status].sort();
      assert.deepStrictEqual(codes, [201, 409], `النتائج ${JSON.stringify(codes)} — يجب أن ينجح واحد ويُرفض الآخر`);

      const avail = (await api("GET", "/api/catalog", undefined, { noCookie: true }))
        .json.products.find((p) => p.id === target.id).meter.stock;
      assert.strictEqual(avail, 2, "بقي مترين متاحين");
    });

    /* ---------------------------------------------------- اللوحة */

    await test("كلمة مرور خاطئة تُرفض", async () => {
      const r = await api("POST", "/api/admin/login", { username: "admin", password: "خطأ" }, { noCookie: true });
      assert.strictEqual(r.status, 401);
    });

    await test("الدخول الصحيح يفتح الجلسة", async () => {
      cookie = "";
      const r = await api("POST", "/api/admin/login", { username: "admin", password });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.user.username, "admin");
      assert.ok(r.json.user.mustChangePassword, "مطلوب تغيير كلمة المرور");
      assert.ok(/HttpOnly/i.test(r.headers.get("set-cookie") || ""), "الكوكي HttpOnly");
    });

    await test("كلمة المرور لا تُعاد أبدًا", async () => {
      const r = await api("GET", "/api/admin/data");
      assert.ok(!JSON.stringify(r.json).includes("passwordHash"));
    });

    await test("قماش صيفي بلا وقفة يُرفض", async () => {
      const r = await api("POST", "/api/admin/products", {
        name: "بلا وقفة", sku: "T-NOWQ", category: "summer",
        images: ["data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E"],
        meter: { enabled: true, price: 100, stock: 10 },
      });
      assert.strictEqual(r.status, 400);
      assert.ok(/الوقفة/.test(r.json.error), r.json.error);
    });

    await test("رمز مكرر يُرفض", async () => {
      const r = await api("POST", "/api/admin/products", {
        name: "مكرر", sku: prod.sku, category: "summer", wiqfa: "nisf",
        images: ["data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E"],
        meter: { enabled: true, price: 100, stock: 10 },
      });
      assert.strictEqual(r.status, 409);
      assert.strictEqual(r.json.code, "sku_taken");
    });

    await test("رابط صورة خارجي يُرفض", async () => {
      const r = await api("POST", "/api/admin/products", {
        name: "صورة خارجية", sku: "T-EXT", category: "winter",
        images: ["https://example.com/a.png"],
        meter: { enabled: true, price: 100, stock: 10 },
      });
      assert.strictEqual(r.status, 400);
    });

    let created;
    await test("إضافة قماش صحيح تنجح وتظهر في المتجر", async () => {
      const r = await api("POST", "/api/admin/products", {
        name: "قماش اختبار", sku: "T-OK-1", category: "summer", wiqfa: "waqif",
        colorName: "أبيض", blurb: "للاختبار",
        images: ["data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E"],
        specs: { origin: "اليابان", composition: "100٪ بوليستر", weight: "180 غم/م²", width: 150 },
        meter: { enabled: true, price: 199, stock: 50, low: 10 },
        active: true,
      });
      assert.strictEqual(r.status, 201, r.text);
      created = r.json.product;
      const cat = await api("GET", "/api/catalog", undefined, { noCookie: true });
      assert.ok(cat.json.products.some((p) => p.id === created.id), "ظهر في الكتالوج");
    });

    await test("إخفاء القماش يُخرجه من المتجر ويبقيه في اللوحة", async () => {
      await api("PUT", `/api/admin/products/${created.id}`, Object.assign({}, created, { active: false }));
      const cat = await api("GET", "/api/catalog", undefined, { noCookie: true });
      assert.ok(!cat.json.products.some((p) => p.id === created.id), "اختفى من المتجر");
      const adm = await api("GET", "/api/admin/data");
      assert.ok(adm.json.products.some((p) => p.id === created.id), "باقٍ في اللوحة");
    });

    await test("حذف القماش ينجح", async () => {
      const r = await api("DELETE", `/api/admin/products/${created.id}`);
      assert.strictEqual(r.status, 200);
      const adm = await api("GET", "/api/admin/data");
      assert.ok(!adm.json.products.some((p) => p.id === created.id));
    });

    await test("تفعيل الضريبة يحتسب 15٪ ضمن السعر، وإطفاؤها يعيدها صفرًا", async () => {
      await api("PUT", "/api/admin/settings", { vatEnabled: true, vatRate: 0.15, vatIncluded: true });
      const on = await api("POST", "/api/orders/quote", {
        items: [{ productId: prod.id, mode: "meter", qty: 4 }], carrier: "smsa",
      }, { noCookie: true });
      const t = on.json.totals;
      const expected = Math.round((t.subtotal + t.shipping - (t.subtotal + t.shipping) / 1.15) * 100) / 100;
      assert.ok(Math.abs(t.vat - expected) < 0.02, `الضريبة ${t.vat} ≠ ${expected}`);

      await api("PUT", "/api/admin/settings", { vatEnabled: false });
      const off = await api("POST", "/api/orders/quote", {
        items: [{ productId: prod.id, mode: "meter", qty: 4 }], carrier: "smsa",
      }, { noCookie: true });
      assert.strictEqual(off.json.totals.vat, 0, "عادت صفرًا");
      assert.strictEqual(off.json.totals.grand, t.grand, "الإجمالي لم يتغيّر: السعر هو هو");
    });

    await test("الفاتورة بلا ضريبة لا تُوسم ضريبية", async () => {
      const r = await api("GET", `/api/admin/orders/${order.id}/invoice`);
      assert.strictEqual(r.json.invoice.vatApplied, false, "vatApplied=false");
      assert.strictEqual(r.json.invoice.totals.vat, 0, "لا ضريبة في الفاتورة");
    });

    await test("رقم ضريبي غير صحيح يُرفض", async () => {
      const r = await api("PUT", "/api/admin/settings", { vatEnabled: true, vatNumber: "123" });
      assert.strictEqual(r.status, 400);
    });

    await test("رقم ضريبي صحيح يُقبل", async () => {
      const r = await api("PUT", "/api/admin/settings", {
        vatEnabled: true, vatNumber: "300000000000003", legalName: "مؤسسة نسيج للأقمشة",
      });
      assert.strictEqual(r.status, 200, r.text);
      assert.strictEqual(r.json.settings.vatNumber, "300000000000003");
    });

    await test("إطفاء كل وسائل الدفع مرفوض", async () => {
      const cur = (await api("GET", "/api/admin/data")).json.settings;
      const r = await api("PUT", "/api/admin/settings", {
        gateways: cur.gateways.map((g) => Object.assign({}, g, { active: false })),
      });
      assert.strictEqual(r.status, 400);
    });

    await test("البوليصة تصدر ويتغيّر حال الطلب", async () => {
      const r = await api("POST", `/api/admin/orders/${order.id}/waybill`);
      assert.strictEqual(r.status, 200, r.text);
      assert.ok(r.json.awb, "رقم بوليصة");
      assert.strictEqual(r.json.official, false, "غير رسمية بلا ربط");
      const adm = await api("GET", "/api/admin/data");
      const o = adm.json.orders.find((x) => x.id === order.id);
      assert.strictEqual(o.status, "processing");
    });

    await test("الفاتورة الضريبية صدرت برمز QR سليم", async () => {
      const r = await api("GET", `/api/admin/orders/${order.id}/invoice`);
      assert.strictEqual(r.status, 200, r.text);
      const inv = r.json.invoice;
      assert.ok(/^INV-\d{6}$/.test(inv.number), inv.number);
      assert.strictEqual(inv.totals.grand, order.totals.grand);

      const { parseQrPayload } = require("../lib/zatca");
      const tags = parseQrPayload(inv.qr);
      assert.ok(tags[1], "اسم البائع");
      assert.ok(tags[3].endsWith("Z"), "طابع زمني");
      assert.strictEqual(Number(tags[4]), order.totals.grand, "الإجمالي في الرمز");
      assert.strictEqual(Number(tags[5]), order.totals.vat, "الضريبة في الرمز");
    });

    await test("إلغاء طلب مدفوع يعيد الكمية", async () => {
      const before = (await api("GET", "/api/catalog", undefined, { noCookie: true }))
        .json.products.find((p) => p.id === prod.id).meter.stock;
      const r = await api("POST", `/api/admin/orders/${order.id}/cancel`);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.stockRestored, true);
      const after = (await api("GET", "/api/catalog", undefined, { noCookie: true }))
        .json.products.find((p) => p.id === prod.id).meter.stock;
      assert.strictEqual(after, Math.round((before + 4) * 100) / 100, "عادت أربعة أمتار");
    });

    await test("الخروج يُبطل الجلسة", async () => {
      await api("POST", "/api/admin/logout");
      const r = await api("GET", "/api/admin/data");
      assert.strictEqual(r.status, 401);
    });

    await test("كبح محاولات الدخول يعمل", async () => {
      cookie = "";
      let blocked = false;
      for (let i = 0; i < 12; i++) {
        const r = await api("POST", "/api/admin/login", { username: "admin", password: "غلط" + i }, { noCookie: true });
        if (r.status === 429) { blocked = true; break; }
      }
      assert.ok(blocked, "لم يُكبح بعد اثنتي عشرة محاولة");
    });

    /* ---------------------------------------------------- متفرقات */

    await test("مسار غير معروف يعيد 404 بصيغة JSON", async () => {
      const r = await api("GET", "/api/لا-يوجد", undefined, { noCookie: true });
      assert.strictEqual(r.status, 404);
      assert.ok(r.json.error);
    });

    await test("مجلد الخادم وأسراره غير قابلة للتنزيل", async () => {
      for (const p of ["/server/server.js", "/server/.env", "/server/.env.example",
                       "/server/data/products.json", "/../server/.env", "/.git/config"]) {
        const res = await fetch(BASE + p, { redirect: "manual" });
        const body = await res.text();
        assert.ok(res.status === 404, `${p} أعاد ${res.status}`);
        assert.ok(!body.includes("PAYTABS"), `${p} سرّب محتوى`);
      }
    });

    await test("ملفات المتجر تُخدَم طبيعيًا", async () => {
      const res = await fetch(BASE + "/assets/styles.css");
      assert.strictEqual(res.status, 200);
      assert.ok((await res.text()).includes("--gold"), "ملف التصميم");
    });

    await test("جسم غير JSON يُرفض بوضوح", async () => {
      const res = await fetch(BASE + "/api/orders/quote", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "ليس-json",
      });
      assert.strictEqual(res.status, 400);
    });
  } finally {
    done();
  }

  console.log("\nاختبارات الخادم\n" + "─".repeat(52));
  results.forEach((r) => console.log(r));
  console.log("─".repeat(52));
  console.log(`  نجح ${pass} · أخفق ${fail}\n`);
  fs.rmSync(DATA, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("تعذّر تشغيل الاختبارات:", e);
  process.exit(1);
});
