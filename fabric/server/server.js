#!/usr/bin/env node
/* ======================================================================
   متجر نسيج — الخادم
   ----------------------------------------------------------------------
   التشغيل:   node server.js
   بلا اعتماديات: لا npm install ولا بناء.

   المسارات العامة (المتجر):
     GET  /api/catalog                 الكتالوج والإعدادات المعروضة
     POST /api/orders/quote            تسعير السلة قبل الدفع
     POST /api/orders                  إنشاء طلب وبدء الدفع
     GET  /api/orders/track            تتبّع بالرقم والجوال
     POST /api/payments/webhook/:gw    إشعار البوابة (هنا يُعتمد الطلب)

   المسارات المحمية (اللوحة): كلها تحت /api/admin ومحمية بجلسة.
   ====================================================================== */

"use strict";

const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const H = require("./lib/http");
const { Store } = require("./lib/store");
const { Auth } = require("./lib/auth");
const SHOP = require("./lib/shop");
const ZATCA = require("./lib/zatca");
const PAY = require("./payments");
const SHIP = require("./shipping");
const CONFIG = require("./config");

const ROOT = __dirname;
const { config, secrets } = CONFIG.build(ROOT);
const store = new Store(config.dataDir);
const auth = new Auth(store);

const COLLECTIONS = ["products", "orders", "settings", "admins", "counters", "invoices"];

/* ---------------------------------------------------------- مساعدات */

const settings = () => Object.assign({}, SHOP.DEFAULT_SETTINGS, store.read("settings", {}));
const products = () => store.read("products", []);
const orders = () => store.read("orders", []);

function ctx() {
  return { config, secrets, settings: settings() };
}

function clientIp(req) {
  if (config.trustProxy) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || "unknown";
}

async function nextSeq(name, start) {
  let val = start;
  await store.mutate("counters", {}, (cur) => {
    cur[name] = (cur[name] == null ? start - 1 : cur[name]) + 1;
    val = cur[name];
    return cur;
  });
  return val;
}

/* المنتج كما يراه الزبون: بلا حقول إدارية */
function publicProduct(p) {
  return {
    id: p.id, sku: p.sku, name: p.name, category: p.category, wiqfa: p.wiqfa,
    color: p.color, colorName: p.colorName, blurb: p.blurb,
    images: p.images, video: p.video, specs: p.specs,
    // يُعرض المتاح (المخزون ناقص المحجوز)، لا الرقم الخام
    meter: { enabled: p.meter.enabled, price: p.meter.price, stock: SHOP.available(p.meter), low: p.meter.low },
    bolt: { enabled: p.bolt.enabled, price: p.bolt.price, stock: SHOP.available(p.bolt), metersPer: p.bolt.metersPer, low: p.bolt.low },
    featured: p.featured, bestseller: p.bestseller, active: p.active, sold: p.sold, createdAt: p.createdAt,
  };
}

/* الإعدادات كما يراها الزبون: بلا بيانات داخلية */
function publicSettings(s) {
  return {
    storeName: s.storeName, tagline: s.tagline, currency: s.currency,
    vatEnabled: s.vatEnabled, vatRate: s.vatRate, vatIncluded: s.vatIncluded,
    freeShipOver: s.freeShipOver, thobeMetersMin: s.thobeMetersMin, thobeMetersMax: s.thobeMetersMax,
    meterStep: s.meterStep, minMeters: s.minMeters, whatsapp: s.whatsapp,
    carriers: (s.carriers || []).filter((c) => c.active),
    // يُبقى على active وإن كانت القائمة مُرشَّحة أصلًا: الواجهة ترشّح بها
    // في الوضعين، فحذفها هنا كان يُفرغ قائمة وسائل الدفع في المتصفح.
    gateways: (s.gateways || []).filter((g) => g.active)
      .map((g) => ({ id: g.id, name: g.name, note: g.note, logo: g.logo, active: true })),
  };
}

/* الطلب كما يراه صاحبه: بلا سجلّ البوابة الخام */
function publicOrder(o) {
  return {
    id: o.id, number: o.number, createdAt: o.createdAt, items: o.items,
    customer: { name: o.customer.name, phone: maskPhone(o.customer.phone) },
    shipping: o.shipping, totals: o.totals, status: o.status, awb: o.awb,
    payment: { method: o.payment.method, status: o.payment.status },
    timeline: (o.timeline || []).map((t) => ({ at: t.at, status: t.status, note: t.note })),
  };
}

const maskPhone = (p) => String(p || "").replace(/^(\d{3})\d+(\d{2})$/, "$1•••••$2");

/* ------------------------------------------------------------ الموجّه */

const router = new H.Router();

/* ====================== الكتالوج ====================== */

router.get("/api/catalog", async (req, res) => {
  const s = settings();
  H.sendJson(res, 200, {
    products: products().filter((p) => p.active !== false).map(publicProduct),
    settings: publicSettings(s),
  });
});

/* ====================== التسعير ====================== */

router.post("/api/orders/quote", async (req, res) => {
  const body = await H.readJson(req);
  const s = settings();
  const priced = SHOP.priceOrder(body.items, products(), s, body.carrier);
  H.sendJson(res, 200, {
    items: priced.items,
    totals: priced.totals,
    carrier: { id: priced.carrier.id, name: priced.carrier.name, eta: priced.carrier.eta },
  });
});

/* ====================== إنشاء الطلب ====================== */

router.post("/api/orders", async (req, res) => {
  const body = await H.readJson(req);
  const s = settings();

  const customer = SHOP.normalizeCustomer(body.customer);
  const shipping = SHOP.normalizeShipping(body.shipping, s);
  const method = SHOP.str(body.paymentMethod, "طريقة الدفع", { required: true, max: 30 });
  const gw = (s.gateways || []).find((g) => g.id === method && g.active);
  if (!gw) throw H.bad("طريقة دفع غير متاحة");

  // التسعير من الكتالوج، ثم حجز الكمية في كتابة واحدة على المنتجات حتى
  // لا يمرّ طلبان متزامنان على نفس القطعة. الرقم يُسحب قبل القفل، لأن
  // نداء mutate من داخل mutate يوقف الطابور على نفسه.
  const priced = SHOP.priceOrder(body.items, products(), s, shipping.carrier);
  await store.mutate("products", [], (list) => {
    SHOP.reserve(list, priced.items);
    return list;
  });

  let created;
  try {
    const seq = await nextSeq("order", 2457);
    created = await store.mutate("orders", [], (list) => {
      list.unshift({
        id: "o" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
        number: "NS-" + seq,
        createdAt: Date.now(),
        items: priced.items,
        customer,
        shipping: Object.assign({}, shipping, { cost: priced.totals.shipping }),
        totals: priced.totals,
        payment: { method, status: "pending", ref: "", provider: config.paymentProvider, stockCommitted: false, reserved: true },
        status: "pending_payment",
        awb: "",
        timeline: [{ at: Date.now(), status: "pending_payment", note: "أُنشئ الطلب وحُجزت الكمية" }],
      });
      return list;
    }).then((list) => list[0]);
  } catch (e) {
    // فشل إنشاء الطلب بعد الحجز: يُفرَج عن المحجوز فورًا
    await store.mutate("products", [], (list) => { SHOP.release(list, priced.items); return list; });
    throw e;
  }

  // الدفع عند الاستلام: يُعتمد فورًا
  if (method === "cod") {
    await confirmOrder(created.id, { reference: "COD-" + created.number, status: "pending_cod" });
    return H.sendJson(res, 201, { order: publicOrder(orders().find((o) => o.id === created.id)), redirectUrl: null });
  }

  // غير ذلك: نبدأ الدفع لدى البوابة
  let payment;
  try {
    payment = await PAY.adapter(config.paymentProvider).createPayment(created, ctx());
  } catch (e) {
    console.error("[دفع] تعذّر بدء الدفع للطلب", created.number, "-", e.message);
    await failOrder(created.id, "تعذّر بدء الدفع");
    throw new H.HttpError(502, "تعذّر بدء عملية الدفع. حاول مرة أخرى أو اختر وسيلة دفع أخرى.");
  }

  await store.mutate("orders", [], (list) => {
    const o = list.find((x) => x.id === created.id);
    if (o) o.payment.ref = payment.reference;
    return list;
  });

  H.sendJson(res, 201, { order: publicOrder(orders().find((o) => o.id === created.id)), redirectUrl: payment.redirectUrl });
});

/* إلغاء طلب لم يُدفع: يُفرَج عن الحجز مرة واحدة */
async function failOrder(orderId, note) {
  let items = null;
  await store.mutate("orders", [], (list) => {
    const o = list.find((x) => x.id === orderId);
    if (!o || o.payment.stockCommitted) return list;
    if (o.payment.reserved) { o.payment.reserved = false; items = o.items; }
    o.payment.status = "failed";
    o.status = "cancelled";
    o.timeline.push({ at: Date.now(), status: "cancelled", note });
    return list;
  });
  if (items) {
    await store.mutate("products", [], (list) => { SHOP.release(list, items); return list; });
  }
}

/* الحجوزات المعلّقة التي تجاوزت المهلة تُفرَج تلقائيًا، وإلا بقي
   المخزون محجوزًا لطلبات هجرها أصحابها على صفحة البوابة */
async function sweepReservations() {
  const stale = orders().filter(
    (o) => o.payment.reserved && !o.payment.stockCommitted && Date.now() - o.createdAt > SHOP.RESERVE_TTL_MS
  );
  for (const o of stale) {
    await failOrder(o.id, "انتهت مهلة الدفع، أُفرج عن الكمية المحجوزة");
    console.log("[حجز] أُفرج عن حجز الطلب", o.number);
  }
}

/* ============ اعتماد الطلب: نقطة واحدة، وخصم المخزون مرة واحدة ============ */

async function confirmOrder(orderId, pay) {
  let first = false;

  await store.mutate("orders", [], (list) => {
    const o = list.find((x) => x.id === orderId);
    if (!o) throw H.notFound("الطلب غير موجود");
    if (o.payment.stockCommitted) return list; // إشعار مكرّر: لا يُعتمد مرتين

    o.payment.status = pay.status === "pending_cod" ? "pending" : "paid";
    o.payment.ref = pay.reference || o.payment.ref;
    o.payment.stockCommitted = true;
    o.payment.reserved = false;
    o.status = "new";
    o.timeline.push({
      at: Date.now(),
      status: "new",
      note: pay.status === "pending_cod" ? "طلب بالدفع عند الاستلام" : "تأكّد الدفع",
    });
    first = true;
    return list;
  });

  if (!first) return null; // أُعتمد سابقًا: لا فاتورة ثانية ولا خصم ثانٍ

  const o = orders().find((x) => x.id === orderId);
  if (!o) return null;

  // تحويل الحجز إلى خصم فعلي
  let shortfalls = [];
  await store.mutate("products", [], (list) => {
    shortfalls = SHOP.commit(list, o.items);
    return list;
  });

  if (shortfalls.length) {
    // المبلغ حُصِّل والكمية لا تكفي: لا يُبتلع بصمت ولا يُلغى الطلب تلقائيًا
    const note = "نقص في المخزون بعد الدفع: " + shortfalls.map((s) => `${s.name} (${s.missing})`).join("، ");
    console.error("[مخزون]", o.number, note);
    await store.mutate("orders", [], (list) => {
      const t = list.find((x) => x.id === orderId);
      if (t) { t.needsAttention = note; t.timeline.push({ at: Date.now(), status: t.status, note }); }
      return list;
    });
  }

  // الفاتورة الضريبية
  const s = settings();
  const seq = await nextSeq("invoice", 1);
  const invoice = ZATCA.buildInvoice(o, s, seq);
  await store.mutate("invoices", [], (list) => { list.unshift(invoice); return list; });
  await store.mutate("orders", [], (list) => {
    const t = list.find((x) => x.id === orderId);
    if (t) t.invoiceNumber = invoice.number;
    return list;
  });

  return invoice;
}

/* ====================== إشعار البوابة ====================== */

router.post("/api/payments/webhook/:gw", async (req, res) => {
  const name = req.params.gw;
  let result;
  try {
    const raw = await H.readBody(req, 512 * 1024);
    result = await PAY.adapter(name).verifyWebhook(req, raw, ctx());
  } catch (e) {
    console.error("[webhook] رُفض إشعار", name, "-", e.message);
    return H.sendJson(res, 400, { ok: false });
  }

  const list = orders();
  const order =
    list.find((o) => o.payment.ref && o.payment.ref === result.reference) ||
    (result.orderNumber ? list.find((o) => o.number === result.orderNumber) : null) ||
    (result.orderId ? list.find((o) => o.id === result.orderId) : null);

  if (!order) {
    console.error("[webhook] لا طلب مطابق للمرجع", result.reference);
    return H.sendJson(res, 404, { ok: false });
  }

  if (result.status !== "paid") {
    await failOrder(order.id, "فشل الدفع لدى البوابة");
    return H.sendJson(res, 200, { ok: true });
  }

  // المبلغ المُحصَّل يطابق إجمالي الطلب المحسوب على الخادم
  if (result.amount != null && Math.abs(result.amount - order.totals.grand) > 0.01) {
    console.error("[webhook] المبلغ لا يطابق الطلب", order.number, result.amount, order.totals.grand);
    await store.mutate("orders", [], (l) => {
      const o = l.find((x) => x.id === order.id);
      if (o) o.timeline.push({ at: Date.now(), status: o.status, note: `تنبيه: المبلغ المُحصَّل ${result.amount} لا يطابق ${order.totals.grand}` });
      return l;
    });
    return H.sendJson(res, 409, { ok: false });
  }

  await confirmOrder(order.id, { reference: result.reference, status: "paid" });
  H.sendJson(res, 200, { ok: true });
});

/* صفحة الرجوع من البوابة: تعرض الحالة فقط، ولا تعتمد شيئًا */
router.get("/pay/return", async (req, res, url) => {
  const id = url.searchParams.get("order") || "";
  const target = `${config.publicUrl}/#/order/${encodeURIComponent(id)}`;
  H.send(res, 302, "", { Location: target, "Cache-Control": "no-store" });
});

/* صفحة محاكاة الدفع — تطوير فقط */
router.get("/pay/demo", async (req, res, url) => {
  if (config.env === "production") throw H.notFound();
  const ref = url.searchParams.get("ref") || "";
  const id = url.searchParams.get("order") || "";
  const o = orders().find((x) => x.id === id);
  if (!o) throw H.notFound("الطلب غير موجود");
  const page = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>محاكاة الدفع</title>
<style>body{font-family:system-ui,sans-serif;background:#f8f5ef;color:#1b1a17;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
.c{background:#fff;border:1px solid #e4ded2;border-radius:20px;padding:24px;max-width:420px;width:100%;text-align:center}
b{font-size:26px;display:block;margin:8px 0 4px}button{font:inherit;font-weight:800;padding:13px 20px;border-radius:12px;border:0;cursor:pointer;width:100%;margin-top:9px}
.ok{background:#2f7d52;color:#fff}.no{background:#fff;color:#a63a32;border:1px solid #e4ded2}
.w{background:#fbf0dd;border:1px solid #e8d3a8;border-radius:12px;padding:10px;font-size:13px;margin-top:14px;text-align:start}</style>
<div class="c"><div style="font-size:13px;color:#6f6a60">محاكاة بوابة الدفع</div>
<b>${o.totals.grand.toFixed(2)} ر.س</b>
<div style="font-size:13px;color:#6f6a60">طلب ${o.number} · مرجع ${ref}</div>
<button class="ok" onclick="go('paid')">تأكيد الدفع</button>
<button class="no" onclick="go('failed')">رفض الدفع</button>
<div class="w">هذه صفحة تطوير، لا تتصل بأي بنك ولا تحرّك مالًا. تُعطَّل تلقائيًا حين يعمل الخادم في وضع الإنتاج.</div></div>
<script>
async function go(status){
  await fetch('/api/payments/webhook/demo',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({reference:${JSON.stringify(ref)},orderId:${JSON.stringify(id)},status:status,amount:${o.totals.grand}})});
  location.href=${JSON.stringify(config.publicUrl)}+'/#/order/'+${JSON.stringify(id)};
}
</script></html>`;
  H.send(res, 200, page, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
});

/* ====================== تتبّع الطلب ====================== */

router.get("/api/orders/track", async (req, res, url) => {
  const number = String(url.searchParams.get("number") || "").trim();
  const phone = String(url.searchParams.get("phone") || "").replace(/[\s-]/g, "").replace(/^(?:\+966|00966)/, "0");
  if (!number || !phone) throw H.bad("أدخل رقم الطلب ورقم الجوال");
  // الرقم وحده لا يكفي: بدونه يستطيع أي أحد تعداد الطلبات
  const o = orders().find((x) => x.number.toLowerCase() === number.toLowerCase() && x.customer.phone === phone);
  if (!o) throw H.notFound("لا يوجد طلب بهذا الرقم لهذا الجوال");
  H.sendJson(res, 200, { order: publicOrder(o) });
});

/* ====================== الدخول ====================== */

router.post("/api/admin/login", async (req, res) => {
  const body = await H.readJson(req);
  const out = await auth.login(body.username, body.password, clientIp(req));
  H.sendJson(res, 200, { user: out.user }, {
    "Set-Cookie": H.cookie("naseej_sid", out.token, {
      maxAge: Math.floor((out.expiresAt - Date.now()) / 1000),
      secure: config.secureCookies,
      sameSite: config.secureCookies ? "None" : "Lax",
    }),
  });
});

router.post("/api/admin/logout", async (req, res) => {
  await auth.logout(H.parseCookies(req).naseej_sid);
  H.sendJson(res, 200, { ok: true }, {
    "Set-Cookie": H.cookie("naseej_sid", "", { maxAge: 0, secure: config.secureCookies }),
  });
});

router.get("/api/admin/me", async (req, res) => {
  const u = auth.userFromToken(H.parseCookies(req).naseej_sid);
  if (!u) throw H.unauthorized();
  H.sendJson(res, 200, { user: auth.publicUser(u) });
});

router.post("/api/admin/password", async (req, res) => {
  const u = requireAdmin(req);
  const body = await H.readJson(req);
  await auth.changePassword(u.id, body.currentPassword, body.newPassword);
  H.sendJson(res, 200, { ok: true });
});

function requireAdmin(req) {
  const u = auth.userFromToken(H.parseCookies(req).naseej_sid);
  if (!u) throw H.unauthorized();
  return u;
}

/* ====================== اللوحة ====================== */

router.get("/api/admin/data", async (req, res) => {
  requireAdmin(req);
  const s = settings();
  const payAdapter = PAY.ADAPTERS[config.paymentProvider];
  H.sendJson(res, 200, {
    products: products(),
    orders: orders(),
    settings: s,
    health: {
      env: config.env,
      paymentProvider: config.paymentProvider,
      paymentConfigured: payAdapter ? payAdapter.configured(ctx()) : false,
      shippingProvider: config.shippingProvider,
      shippingConfigured: SHIP.adapter(config.shippingProvider).configured(ctx()),
      vatNumberValid: ZATCA.isValidVatNumber(s.vatNumber),
      publicUrl: config.publicUrl,
      warnings: CONFIG.auditProduction(config, secrets, payAdapter),
    },
  });
});

router.post("/api/admin/products", async (req, res) => {
  requireAdmin(req);
  const body = await H.readJson(req);
  let saved;
  await store.mutate("products", [], (list) => {
    saved = SHOP.normalizeProduct(body, null, list);
    list.unshift(saved);
    return list;
  });
  H.sendJson(res, 201, { product: saved });
});

router.put("/api/admin/products/:id", async (req, res) => {
  requireAdmin(req);
  const body = await H.readJson(req);
  let saved;
  await store.mutate("products", [], (list) => {
    const cur = list.find((p) => p.id === req.params.id);
    if (!cur) throw H.notFound("القماش غير موجود");
    saved = SHOP.normalizeProduct(body, cur, list);
    list[list.indexOf(cur)] = saved;
    return list;
  });
  H.sendJson(res, 200, { product: saved });
});

router.delete("/api/admin/products/:id", async (req, res) => {
  requireAdmin(req);
  let gone = false;
  await store.mutate("products", [], (list) => {
    const i = list.findIndex((p) => p.id === req.params.id);
    if (i < 0) throw H.notFound("القماش غير موجود");
    list.splice(i, 1);
    gone = true;
    return list;
  });
  H.sendJson(res, 200, { ok: gone });
});

/* تعديل سريع للسعر والمخزون من جدول اللوحة */
router.patch("/api/admin/products/:id/stock", async (req, res) => {
  requireAdmin(req);
  const body = await H.readJson(req);
  let saved;
  await store.mutate("products", [], (list) => {
    const p = list.find((x) => x.id === req.params.id);
    if (!p) throw H.notFound("القماش غير موجود");
    const fields = [
      ["meter", "price", 1e5], ["meter", "stock", 1e6], ["meter", "low", 1e6],
      ["bolt", "price", 1e6], ["bolt", "stock", 1e5], ["bolt", "low", 1e4],
    ];
    for (const [grp, key, max] of fields) {
      const v = body[`${grp}.${key}`];
      if (v === undefined) continue;
      p[grp][key] = SHOP.num(v, `${grp}.${key}`, { max });
      if (key !== "price") p[grp][key] = grp === "bolt" ? Math.floor(p[grp][key]) : p[grp][key];
    }
    p.updatedAt = Date.now();
    saved = p;
    return list;
  });
  H.sendJson(res, 200, { product: saved });
});

router.patch("/api/admin/orders/:id", async (req, res) => {
  requireAdmin(req);
  const body = await H.readJson(req);
  let saved;
  await store.mutate("orders", [], (list) => {
    const o = list.find((x) => x.id === req.params.id);
    if (!o) throw H.notFound("الطلب غير موجود");

    if (body.status !== undefined) {
      const st = String(body.status);
      if (!SHOP.ORDER_STATUSES.includes(st)) throw H.bad("حالة غير معروفة");
      if (st !== o.status) {
        o.status = st;
        o.timeline.push({ at: Date.now(), status: st, note: "تغيّرت الحالة" });
        if (st === "delivered" && o.payment.method === "cod") o.payment.status = "paid";
      }
    }
    if (body.awb !== undefined) {
      o.awb = SHOP.str(body.awb, "رقم البوليصة", { max: 60 });
      o.timeline.push({ at: Date.now(), status: o.status, note: "رقم البوليصة: " + (o.awb || "—") });
    }
    saved = o;
    return list;
  });
  H.sendJson(res, 200, { order: saved });
});

/* إلغاء طلب: يعيد المخزون مرة واحدة */
router.post("/api/admin/orders/:id/cancel", async (req, res) => {
  requireAdmin(req);
  const cur = orders().find((x) => x.id === req.params.id);
  if (!cur) throw H.notFound("الطلب غير موجود");
  if (cur.status === "cancelled") throw H.conflict("الطلب ملغى أصلًا");

  if (!cur.payment.stockCommitted) {
    // لم يُخصم بعد: يكفي الإفراج عن الحجز
    await failOrder(cur.id, "أُلغي الطلب من اللوحة");
    return H.sendJson(res, 200, { ok: true, stockRestored: false });
  }

  let items = null;
  await store.mutate("orders", [], (list) => {
    const o = list.find((x) => x.id === req.params.id);
    o.status = "cancelled";
    o.payment.stockCommitted = false;
    o.timeline.push({ at: Date.now(), status: "cancelled", note: "أُلغي الطلب من اللوحة وأُعيدت الكمية" });
    items = o.items;
    return list;
  });
  await store.mutate("products", [], (list) => { SHOP.restore(list, items); return list; });
  H.sendJson(res, 200, { ok: true, stockRestored: true });
});

router.post("/api/admin/orders/:id/waybill", async (req, res) => {
  requireAdmin(req);
  const o = orders().find((x) => x.id === req.params.id);
  if (!o) throw H.notFound("الطلب غير موجود");

  const carrierAdapter = SHIP.adapter(o.shipping.carrier === "pickup" ? "manual" : config.shippingProvider);
  let result;
  try {
    result = await carrierAdapter.createWaybill(o, ctx());
  } catch (e) {
    if (e.code === "carrier_not_configured" || e.code === "carrier_not_implemented") {
      result = await SHIP.adapter("manual").createWaybill(o, ctx());
      result.fallbackReason = e.message;
    } else throw e;
  }

  await store.mutate("orders", [], (list) => {
    const t = list.find((x) => x.id === o.id);
    t.awb = result.awb;
    if (t.status === "new") t.status = "processing";
    t.timeline.push({ at: Date.now(), status: t.status, note: "صدرت بوليصة " + result.awb });
    return list;
  });
  H.sendJson(res, 200, { awb: result.awb, official: !!result.official, note: result.note || result.fallbackReason || "" });
});

router.get("/api/admin/orders/:id/invoice", async (req, res) => {
  requireAdmin(req);
  const inv = store.read("invoices", []).find((i) => i.orderId === req.params.id);
  if (!inv) throw H.notFound("لا فاتورة لهذا الطلب. تُصدَر بعد تأكيد الدفع.");
  H.sendJson(res, 200, { invoice: inv });
});

router.put("/api/admin/settings", async (req, res) => {
  requireAdmin(req);
  const body = await H.readJson(req);
  let saved;
  await store.mutate("settings", {}, (cur) => {
    const next = Object.assign({}, SHOP.DEFAULT_SETTINGS, cur);
    const allow = [
      "storeName", "tagline", "vatEnabled", "vatRate", "vatIncluded", "freeShipOver",
      "thobeMetersMin", "thobeMetersMax", "meterStep", "minMeters", "whatsapp",
      "legalName", "vatNumber", "crNumber", "address",
    ];
    for (const k of allow) {
      if (body[k] === undefined) continue;
      if (typeof SHOP.DEFAULT_SETTINGS[k] === "boolean") next[k] = SHOP.bool(body[k]);
      else if (typeof SHOP.DEFAULT_SETTINGS[k] === "number") next[k] = SHOP.num(body[k], k, { max: 1e7 });
      else next[k] = SHOP.str(body[k], k, { max: 300 });
    }
    if (Array.isArray(body.carriers)) {
      next.carriers = body.carriers.slice(0, 12).map((c) => ({
        id: SHOP.str(c.id, "معرّف الشحن", { required: true, max: 30 }),
        name: SHOP.str(c.name, "اسم الشركة", { required: true, max: 60 }),
        eta: SHOP.str(c.eta, "المدة", { max: 60 }),
        cost: SHOP.num(c.cost, "تكلفة الشحن", { max: 10000 }),
        active: SHOP.bool(c.active),
      }));
    }
    if (Array.isArray(body.gateways)) {
      next.gateways = body.gateways.slice(0, 12).map((g) => ({
        id: SHOP.str(g.id, "معرّف الدفع", { required: true, max: 30 }),
        name: SHOP.str(g.name, "اسم الوسيلة", { required: true, max: 60 }),
        note: SHOP.str(g.note, "الوصف", { max: 120 }),
        logo: SHOP.str(g.logo, "الشعار", { max: 30 }),
        active: SHOP.bool(g.active),
      }));
      if (!next.gateways.some((g) => g.active)) throw H.bad("أبقِ وسيلة دفع واحدة على الأقل");
    }
    if (next.vatEnabled && !ZATCA.isValidVatNumber(next.vatNumber) && next.vatNumber) {
      throw H.bad("الرقم الضريبي يجب أن يكون 15 خانة تبدأ بـ3 وتنتهي بـ3");
    }
    saved = next;
    return next;
  });
  H.sendJson(res, 200, { settings: saved });
});

router.get("/api/admin/export", async (req, res) => {
  requireAdmin(req);
  const snap = store.snapshot(["products", "orders", "settings", "invoices", "counters"]);
  H.sendJson(res, 200, snap, {
    "Content-Disposition": `attachment; filename="naseej-backup-${new Date().toISOString().slice(0, 10)}.json"`,
  });
});

router.post("/api/admin/import", async (req, res) => {
  requireAdmin(req);
  const body = await H.readJson(req, 40 * 1024 * 1024);
  if (!Array.isArray(body.products)) throw H.bad("ملف غير صالح: لا يحتوي منتجات");

  // نمرّر كل منتج على التطبيع حتى لا يدخل ملف خارجي بيانات غير صالحة
  const clean = [];
  for (const raw of body.products) {
    clean.push(SHOP.normalizeProduct(raw, Object.assign({}, raw, { id: raw.id }), clean));
  }
  await store.mutate("products", [], () => clean);
  if (Array.isArray(body.orders)) await store.mutate("orders", [], () => body.orders);
  if (body.settings) await store.mutate("settings", {}, (cur) => Object.assign({}, cur, body.settings));
  H.sendJson(res, 200, { ok: true, products: clean.length });
});

/* ---------------------------------------------------------- الخادم */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, config.publicUrl);
  try {
    if (!H.applyCors(req, res, config.allowedOrigins)) return;

    const hit = router.match(req.method, url.pathname);
    if (hit) {
      req.params = hit.params;
      await hit.handler(req, res, url);
      return;
    }

    // ملفات المتجر الثابتة + الملفات المرفوعة
    if (req.method === "GET" || req.method === "HEAD") {
      if (url.pathname.startsWith("/uploads/")) {
        if (await H.serveStatic(req, res, config.dataDir, url.pathname, { cache: "public, max-age=31536000, immutable", allowAll: true })) return;
      }
      if (await H.serveStatic(req, res, config.staticDir, url.pathname === "/" ? "/index.html" : url.pathname)) return;
    }

    if (url.pathname.startsWith("/api/")) throw H.notFound("مسار غير معروف");
    throw H.notFound("الصفحة غير موجودة");
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error("[خطأ]", req.method, url.pathname, "-", e.stack || e.message);
    if (res.headersSent) return res.end();
    const payload = { error: status >= 500 ? "حدث خطأ في الخادم. حاول مرة أخرى." : e.message };
    if (e.code) payload.code = e.code;
    H.sendJson(res, status, payload);
  }
});

/* ------------------------------------------------------------ الإقلاع */

async function main() {
  for (const c of COLLECTIONS) store.read(c, c === "settings" || c === "counters" ? {} : []);

  const seeded = await auth.ensureSeedAdmin();
  await auth.sweep();
  setInterval(() => auth.sweep().catch(() => {}), 6 * 3600 * 1000).unref();
  await sweepReservations();
  setInterval(() => sweepReservations().catch((e) => console.error("[حجز]", e.message)), 5 * 60 * 1000).unref();

  const payAdapter = PAY.ADAPTERS[config.paymentProvider];
  const warnings = CONFIG.auditProduction(config, secrets, payAdapter);

  server.listen(config.port, config.host, () => {
    const line = "─".repeat(58);
    console.log(line);
    console.log(`  متجر نسيج — يعمل على ${config.publicUrl}`);
    console.log(`  الوضع: ${config.env} · الدفع: ${config.paymentProvider} · الشحن: ${config.shippingProvider}`);
    console.log(`  البيانات: ${config.dataDir}`);
    if (seeded) {
      console.log(line);
      console.log("  أُنشئ حساب المدير الأول:");
      console.log("     المستخدم: admin");
      console.log(`     كلمة المرور: ${seeded}`);
      console.log("  تظهر هذه المرة الوحيدة. غيّرها من اللوحة بعد الدخول.");
    }
    if (warnings.length) {
      console.log(line);
      warnings.forEach((w) => console.log("  ⚠  " + w));
    }
    console.log(line);
  });
}

if (require.main === module) {
  main().catch((e) => {
    console.error("تعذّر إقلاع الخادم:", e);
    process.exit(1);
  });
}

module.exports = { server, store, auth, config, confirmOrder };
