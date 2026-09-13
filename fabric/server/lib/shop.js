/* ======================================================================
   قواعد المتجر على الخادم
   ----------------------------------------------------------------------
   قاعدة واحدة تحكم هذا الملف: لا يُصدَّق العميل في شيء يمسّ المال أو
   المخزون. المتصفح يرسل «أي منتج، وأي وسيلة بيع، وكم» فقط. السعر
   والضريبة والشحن والإجمالي تُحسب هنا من الكتالوج، والمخزون يُتحقق منه
   ويُخصم هنا. أي مبلغ يصل من العميل يُهمل.
   ====================================================================== */

"use strict";

const { bad, conflict, notFound } = require("./http");

const WIQFA_IDS = ["taye7", "rub3", "nisf", "waqif"];
const CATEGORY_IDS = ["summer", "winter", "bolts"];
const ORDER_STATUSES = ["pending_payment", "new", "processing", "shipped", "delivered", "cancelled"];
const PAY_STATUSES = ["pending", "paid", "failed", "refunded"];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const DEFAULT_SETTINGS = {
  storeName: "نسيج",
  tagline: "أقمشة رجالية",
  currency: "SAR",
  vatEnabled: true,
  vatRate: 0.15,
  vatIncluded: true,
  freeShipOver: 800,
  thobeMetersMin: 3,
  thobeMetersMax: 4,
  meterStep: 0.5,
  minMeters: 1,
  maxMetersPerLine: 200,
  lowStockMeters: 30,
  lowStockBolts: 2,
  whatsapp: "",
  // بيانات المنشأة — تظهر في الفاتورة الضريبية
  legalName: "",
  vatNumber: "",
  crNumber: "",
  address: "",
  carriers: [
    { id: "smsa", name: "سمسا SMSA", eta: "1 – 3 أيام عمل", cost: 25, active: true },
    { id: "aramex", name: "أرامكس Aramex", eta: "2 – 4 أيام عمل", cost: 22, active: true },
    { id: "pickup", name: "استلام من المعرض", eta: "جاهز خلال ساعتين", cost: 0, active: true },
  ],
  gateways: [
    { id: "mada", name: "مدى", note: "بطاقة الصراف الآلي السعودية", logo: "mada", active: true },
    { id: "applepay", name: "Apple Pay", note: "الدفع من محفظة الجهاز", logo: "applepay", active: true },
    { id: "card", name: "بطاقة ائتمانية", note: "فيزا · ماستركارد", logo: "visa", active: true },
    { id: "cod", name: "الدفع عند الاستلام", note: "تُحصَّل عند التسليم", logo: "cod", active: false },
  ],
};

/* ------------------------------------------------------------- أدوات */

function str(v, field, { max = 400, min = 0, required = false } = {}) {
  const s = String(v == null ? "" : v).trim();
  if (required && !s) throw bad(`${field} مطلوب`);
  if (s.length < min) throw bad(`${field} أقصر من ${min} محارف`);
  if (s.length > max) throw bad(`${field} أطول من ${max} محرفًا`);
  return s;
}

function num(v, field, { min = 0, max = 1e9, required = false } = {}) {
  if (v === "" || v == null) {
    if (required) throw bad(`${field} مطلوب`);
    return 0;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw bad(`${field} ليس رقمًا`);
  if (n < min) throw bad(`${field} أقل من ${min}`);
  if (n > max) throw bad(`${field} أكبر من ${max}`);
  return round2(n);
}

const bool = (v) => v === true || v === "true" || v === 1 || v === "1";

/* الصور: نقبل data URI لصورة، أو مسارًا داخل uploads/ — لا روابط خارجية */
function mediaSrc(v, field) {
  const s = String(v || "");
  if (/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);/i.test(s)) return s;
  if (/^data:video\/(mp4|webm);/i.test(s)) return s;
  if (/^uploads\/[A-Za-z0-9_.-]+$/.test(s)) return s;
  throw bad(`${field} يجب أن يكون صورة مرفوعة أو data URI`);
}

/* ------------------------------------------------------ تطبيع المنتج */

function normalizeProduct(input, existing, products) {
  const p = existing ? JSON.parse(JSON.stringify(existing)) : {};

  p.id = existing ? existing.id : "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  p.name = str(input.name, "اسم القماش", { required: true, max: 120 });
  p.sku = str(input.sku, "رمز القماش", { required: true, max: 40 });

  const dup = products.find((x) => x.sku.toLowerCase() === p.sku.toLowerCase() && x.id !== p.id);
  if (dup) throw conflict(`الرمز «${p.sku}» مستخدم في قماش آخر`, "sku_taken");

  p.category = str(input.category, "القسم", { required: true });
  if (!CATEGORY_IDS.includes(p.category)) throw bad("قسم غير معروف");

  const w = str(input.wiqfa, "الوقفة");
  if (w && !WIQFA_IDS.includes(w)) throw bad("نوع وقفة غير معروف");
  if (p.category === "summer" && !w) throw bad("القماش الصيفي يحتاج تحديد الوقفة");
  p.wiqfa = p.category === "winter" ? null : w || null;

  p.color = /^#[0-9a-fA-F]{6}$/.test(String(input.color || "")) ? input.color : "#f0ece1";
  p.colorName = str(input.colorName, "اسم اللون", { max: 60 });
  p.blurb = str(input.blurb, "الوصف", { max: 600 });

  const imgs = Array.isArray(input.images) ? input.images : [];
  if (!imgs.length) throw bad("أضف صورة واحدة على الأقل");
  if (imgs.length > 8) throw bad("أقصى عدد للصور ثماني صور");
  p.images = imgs.map((s, i) => mediaSrc(s, `الصورة ${i + 1}`));

  if (input.video && input.video.kind === "file" && input.video.src) {
    p.video = { kind: "file", src: mediaSrc(input.video.src, "الفيديو") };
  } else {
    p.video = { kind: "generated" };
  }

  const sp = input.specs || {};
  p.specs = {
    origin: str(sp.origin, "الصناعة", { max: 60 }),
    composition: str(sp.composition, "التركيب", { max: 160 }),
    weight: str(sp.weight, "الوزن", { max: 40 }),
    width: num(sp.width, "العرض", { min: 20, max: 400 }) || 150,
    season: p.category === "winter" ? "شتوي" : p.category === "summer" ? "صيفي" : "كل المواسم",
    care: str(sp.care, "العناية", { max: 160 }) || "غسيل جاف · كي على حرارة متوسطة",
  };

  const m = input.meter || {};
  const b = input.bolt || {};
  p.meter = {
    enabled: bool(m.enabled),
    price: num(m.price, "سعر المتر", { max: 100000 }),
    stock: num(m.stock, "مخزون الأمتار", { max: 1e6 }),
    low: num(m.low, "حد تنبيه الأمتار", { max: 1e6 }),
  };
  p.bolt = {
    enabled: bool(b.enabled),
    price: num(b.price, "سعر الطاقة", { max: 1e6 }),
    stock: Math.floor(num(b.stock, "عدد الطاقات", { max: 100000 })),
    metersPer: Math.floor(num(b.metersPer, "أمتار الطاقة", { min: 1, max: 1000 })) || 50,
    low: Math.floor(num(b.low, "حد تنبيه الطاقات", { max: 10000 })),
  };

  if (!p.meter.enabled && !p.bolt.enabled) throw bad("فعّل البيع بالمتر أو بالطاقة");
  if (p.meter.enabled && p.meter.price <= 0) throw bad("سعر المتر يجب أن يكون أكبر من صفر");
  if (p.bolt.enabled && p.bolt.price <= 0) throw bad("سعر الطاقة يجب أن يكون أكبر من صفر");

  p.featured = bool(input.featured);
  p.bestseller = bool(input.bestseller);
  p.active = input.active === undefined ? true : bool(input.active);
  p.sold = existing ? existing.sold || 0 : 0;
  p.createdAt = existing ? existing.createdAt : Date.now();
  p.updatedAt = Date.now();
  return p;
}

/* --------------------------------------------- تسعير الطلب على الخادم */

function priceOrder(rawItems, products, settings, carrierId) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw bad("السلة فارغة");
  if (rawItems.length > 40) throw bad("عدد الأصناف أكبر من المسموح");

  const step = settings.meterStep || 0.5;
  const seen = new Set();
  const items = [];

  for (const raw of rawItems) {
    const id = str(raw.productId, "المنتج", { required: true, max: 60 });
    const mode = raw.mode === "bolt" ? "bolt" : "meter";
    const key = id + "|" + mode;
    if (seen.has(key)) throw bad("الصنف مكرر في السلة");
    seen.add(key);

    const p = products.find((x) => x.id === id);
    if (!p || p.active === false) throw notFound("أحد الأقمشة لم يعد معروضًا");

    const unit = mode === "meter" ? p.meter : p.bolt;
    if (!unit.enabled) throw bad(`«${p.name}» لا يُباع ${mode === "meter" ? "بالمتر" : "بالطاقة"}`);

    let qty = Number(raw.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw bad("كمية غير صحيحة");

    if (mode === "meter") {
      // الكمية مضاعف صحيح لوحدة الزيادة، وضمن الحد الأدنى والأعلى
      const units = Math.round(qty / step);
      if (Math.abs(units * step - qty) > 1e-9) throw bad(`الكمية تُطلب بمضاعفات ${step} متر`);
      qty = round2(units * step);
      if (qty < (settings.minMeters || 1)) throw bad(`أقل كمية ${settings.minMeters || 1} متر`);
      if (qty > (settings.maxMetersPerLine || 200)) throw bad("الكمية أكبر من المسموح لصنف واحد");
    } else {
      if (!Number.isInteger(qty)) throw bad("عدد الطاقات يجب أن يكون صحيحًا");
      if (qty > 500) throw bad("عدد الطاقات أكبر من المسموح");
    }

    // المتاح = المخزون ناقص المحجوز لطلبات لم يُبتّ دفعها بعد
    const free = available(unit);
    if (qty > free) {
      throw conflict(
        free <= 0
          ? `نفدت كمية «${p.name}»`
          : `المتاح من «${p.name}» ${mode === "meter" ? free + " م" : free + " طاقة"} فقط`,
        "out_of_stock"
      );
    }

    items.push({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      mode,
      qty,
      unitPrice: unit.price,              // من الكتالوج، لا من العميل
      lineTotal: round2(unit.price * qty),
      image: p.images[0],
      meters: mode === "meter" ? qty : round2(qty * (p.bolt.metersPer || 50)),
    });
  }

  const subtotal = round2(items.reduce((a, l) => a + l.lineTotal, 0));

  const carrier = (settings.carriers || []).find((c) => c.id === carrierId && c.active);
  if (!carrier) throw bad("اختر طريقة شحن متاحة");
  let shipping = round2(carrier.cost);
  const freeShip = !!(carrier.cost > 0 && settings.freeShipOver && subtotal >= settings.freeShipOver);
  if (freeShip) shipping = 0;

  const gross = round2(subtotal + shipping);
  let vat = 0;
  let grand = gross;
  if (settings.vatEnabled) {
    const rate = settings.vatRate || 0.15;
    if (settings.vatIncluded) vat = round2(gross - gross / (1 + rate));
    else { vat = round2(gross * rate); grand = round2(gross + vat); }
  }

  return {
    items,
    carrier,
    totals: { subtotal, shipping, shippingFree: freeShip, vat, grand },
  };
}

/* ------------------------------------------------------------ الحجز

   بين إنشاء الطلب وتأكيد دفعه يمرّ الزبون على صفحة البوابة. لو اكتفينا
   بالفحص عند الإنشاء وبالخصم عند التأكيد، لمرّ طلبان متزامنان على نفس
   القطعة فيُباع ما لا يوجد. لذلك يُحجز المقدار لحظة إنشاء الطلب، ولا
   يُعرض المحجوز على غيره، ثم عند تأكيد الدفع يتحول الحجز إلى خصم.
   والحجز المعلّق أكثر من مهلة يُفرَج عنه تلقائيًا.                       */

const RESERVE_TTL_MS = 45 * 60 * 1000;

function unitOf(p, mode) {
  return mode === "meter" ? p.meter : p.bolt;
}

function available(unit) {
  return round2(Math.max(0, unit.stock - (unit.reserved || 0)));
}

/* يحجز كل أصناف الطلب، أو لا يحجز شيئًا إن لم يكفِ أحدها */
function reserve(products, items) {
  for (const it of items) {
    const p = products.find((x) => x.id === it.productId);
    if (!p) throw notFound("أحد الأقمشة لم يعد موجودًا");
    const u = unitOf(p, it.mode);
    if (it.qty > available(u)) {
      const free = available(u);
      throw conflict(
        free <= 0 ? `نفدت كمية «${p.name}»` : `المتاح من «${p.name}» ${free} فقط`,
        "out_of_stock"
      );
    }
  }
  for (const it of items) {
    const u = unitOf(products.find((x) => x.id === it.productId), it.mode);
    u.reserved = round2((u.reserved || 0) + it.qty);
  }
}

function release(products, items) {
  for (const it of items) {
    const p = products.find((x) => x.id === it.productId);
    if (!p) continue;
    const u = unitOf(p, it.mode);
    u.reserved = round2(Math.max(0, (u.reserved || 0) - it.qty));
  }
}

/* تحويل الحجز إلى خصم فعلي. يُبلّغ عن أي نقص بدل أن يبتلعه بصمت:
   المبلغ حُصِّل، فالقرار لصاحب المتجر لا للكود. */
function commit(products, items) {
  const shortfalls = [];
  for (const it of items) {
    const p = products.find((x) => x.id === it.productId);
    if (!p) { shortfalls.push({ name: it.name, missing: it.qty }); continue; }
    const u = unitOf(p, it.mode);
    u.reserved = round2(Math.max(0, (u.reserved || 0) - it.qty));
    if (it.qty > u.stock) shortfalls.push({ name: p.name, missing: round2(it.qty - u.stock) });
    u.stock = round2(Math.max(0, u.stock - it.qty));
    p.sold = (p.sold || 0) + (it.mode === "meter" ? Math.round(it.qty) : it.qty * 10);
  }
  return shortfalls;
}

/* إرجاع كمية طلب مُخصوم (إلغاء بعد الدفع) */
function restore(products, items) {
  for (const it of items) {
    const p = products.find((x) => x.id === it.productId);
    if (!p) continue;
    const u = unitOf(p, it.mode);
    u.stock = round2(u.stock + it.qty);
  }
}

/* ------------------------------------------------- تطبيع بيانات العميل */

function normalizeCustomer(input) {
  const c = input || {};
  const name = str(c.name, "الاسم", { required: true, min: 3, max: 80 });
  const phoneRaw = str(c.phone, "الجوال", { required: true, max: 20 }).replace(/[\s-]/g, "");
  if (!/^(?:\+9665|009665|05)\d{8}$/.test(phoneRaw)) throw bad("رقم جوال سعودي غير صحيح");
  // توحيد الصيغة إلى 05XXXXXXXX
  const phone = phoneRaw.replace(/^(?:\+966|00966)/, "0");
  const email = str(c.email, "البريد", { max: 120 });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad("بريد إلكتروني غير صحيح");
  return { name, phone, email };
}

function normalizeShipping(input, settings) {
  const s = input || {};
  const carrierId = str(s.carrier, "شركة الشحن", { required: true, max: 30 });
  const carrier = (settings.carriers || []).find((c) => c.id === carrierId && c.active);
  if (!carrier) throw bad("طريقة شحن غير متاحة");
  const out = {
    carrier: carrierId,
    city: str(s.city, "المدينة", { required: true, max: 60 }),
    district: str(s.district, "الحي", { max: 80 }),
    notes: str(s.notes, "الملاحظات", { max: 300 }),
    address: "",
  };
  if (carrierId !== "pickup") {
    out.address = str(s.address, "العنوان", { required: true, min: 8, max: 300 });
  } else {
    out.address = str(s.address, "العنوان", { max: 300 });
  }
  return out;
}

module.exports = {
  DEFAULT_SETTINGS, WIQFA_IDS, CATEGORY_IDS, ORDER_STATUSES, PAY_STATUSES, RESERVE_TTL_MS,
  round2, str, num, bool, mediaSrc, available, unitOf,
  normalizeProduct, priceOrder, normalizeCustomer, normalizeShipping,
  reserve, release, commit, restore,
};
