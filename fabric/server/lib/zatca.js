/* ======================================================================
   الفاتورة الضريبية المبسّطة — هيئة الزكاة والضريبة والجمارك
   ----------------------------------------------------------------------
   ما يفعله هذا الملف (وأتحقق منه باختبارات):
     · ترميز TLV ثم Base64 لحمولة رمز الاستجابة السريعة، بالحقول الخمسة
       المطلوبة للفاتورة المبسّطة: اسم البائع، الرقم الضريبي، الطابع
       الزمني، الإجمالي شامل الضريبة، ومقدار الضريبة.
     · بناء مستند الفاتورة بترقيم متسلسل لا ينكسر.

   ما لا يفعله ويحتاج تسجيلك لدى الهيئة (المرحلة الثانية / الربط):
     · إصدار شهادة التوقيع (CSID) عبر بوابة فاتورة.
     · ختم الفاتورة تشفيريًا وتسلسل التجزئة (PIH) بين الفواتير.
     · إرسال الفاتورة للهيئة للإجازة أو الإبلاغ.
   هذه الثلاثة تحتاج بيانات اعتمادك، فتُنفَّذ بعد تسجيلك. راجع
   fabric/server/README.md § الفاتورة الضريبية.

   وقبل الاعتماد على الفاتورة رسميًا: تحقّق من المتطلبات السارية وقت
   التطبيق، فهي تتغيّر، واعرض نموذجًا على محاسبك.
   ====================================================================== */

"use strict";

/* حقل TLV واحد: وسم بايت، ثم الطول بايت، ثم القيمة بترميز UTF-8 */
function tlv(tag, value) {
  const val = Buffer.from(String(value), "utf8");
  if (val.length > 255) throw new Error(`قيمة الوسم ${tag} أطول من 255 بايت`);
  return Buffer.concat([Buffer.from([tag, val.length]), val]);
}

/* المبالغ في الحمولة نصّ بخانتين عشريتين وبأرقام لاتينية */
const money = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);

/**
 * حمولة رمز الاستجابة السريعة للفاتورة المبسّطة، مُرمّزة Base64.
 * @param {{sellerName:string, vatNumber:string, timestamp:Date|number|string,
 *          total:number, vatTotal:number}} inv
 */
function qrPayload(inv) {
  const ts = new Date(inv.timestamp || Date.now());
  if (Number.isNaN(ts.getTime())) throw new Error("طابع زمني غير صالح");
  const buf = Buffer.concat([
    tlv(1, String(inv.sellerName || "").trim()),
    tlv(2, String(inv.vatNumber || "").trim()),
    tlv(3, ts.toISOString().replace(/\.\d{3}Z$/, "Z")),
    tlv(4, money(inv.total)),
    tlv(5, money(inv.vatTotal)),
  ]);
  return buf.toString("base64");
}

/* فكّ الحمولة — للاختبار وللتشخيص */
function parseQrPayload(b64) {
  const buf = Buffer.from(b64, "base64");
  const out = {};
  let i = 0;
  while (i + 2 <= buf.length) {
    const tag = buf[i];
    const len = buf[i + 1];
    if (i + 2 + len > buf.length) throw new Error("حمولة مبتورة");
    out[tag] = buf.slice(i + 2, i + 2 + len).toString("utf8");
    i += 2 + len;
  }
  return out;
}

/* الرقم الضريبي السعودي: خمس عشرة خانة، تبدأ بـ3 وتنتهي بـ3 */
function isValidVatNumber(v) {
  return /^3\d{13}3$/.test(String(v || "").trim());
}

/**
 * يبني مستند الفاتورة من الطلب. الأرقام تُؤخذ من إجماليات الطلب
 * المحسوبة على الخادم، لا من العميل.
 */
function buildInvoice(order, settings, seq) {
  const vatRate = settings.vatEnabled ? settings.vatRate || 0.15 : 0;
  const grand = order.totals.grand;
  const vat = settings.vatEnabled ? order.totals.vat : 0;
  const net = Math.round((grand - vat) * 100) / 100;
  const issuedAt = Date.now();

  const inv = {
    number: "INV-" + String(seq).padStart(6, "0"),
    orderNumber: order.number,
    orderId: order.id,
    issuedAt,
    type: "simplified",               // فاتورة مبسّطة: بيع للمستهلك
    seller: {
      name: settings.legalName || settings.storeName || "",
      vatNumber: settings.vatNumber || "",
      crNumber: settings.crNumber || "",
      address: settings.address || "",
    },
    buyer: { name: order.customer.name, phone: order.customer.phone },
    lines: order.items.map((it) => {
      const lineGross = it.lineTotal;
      const lineVat = settings.vatEnabled && settings.vatIncluded
        ? Math.round((lineGross - lineGross / (1 + vatRate)) * 100) / 100
        : Math.round(lineGross * vatRate * 100) / 100;
      return {
        name: it.name,
        sku: it.sku,
        qty: it.qty,
        unit: it.mode === "meter" ? "متر" : "طاقة",
        unitPrice: it.unitPrice,
        net: Math.round((lineGross - lineVat) * 100) / 100,
        vat: lineVat,
        total: lineGross,
      };
    }),
    shipping: order.totals.shipping,
    totals: { net, vat, grand, vatRate },
    vatApplied: !!settings.vatEnabled,
    warnings: [],
  };

  if (settings.vatEnabled && !isValidVatNumber(settings.vatNumber)) {
    inv.warnings.push("الرقم الضريبي غير مكتمل أو غير صحيح — تُطبع الفاتورة، ولا تصلح ضريبيًا حتى يُضبط من الإعدادات.");
  }
  if (settings.vatEnabled && !inv.seller.name) {
    inv.warnings.push("الاسم النظامي للمنشأة غير محدد في الإعدادات.");
  }

  inv.qr = qrPayload({
    sellerName: inv.seller.name,
    vatNumber: inv.seller.vatNumber,
    timestamp: issuedAt,
    total: grand,
    vatTotal: vat,
  });

  return inv;
}

module.exports = { tlv, qrPayload, parseQrPayload, buildInvoice, isValidVatNumber, money };
