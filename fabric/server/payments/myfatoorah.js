/* ======================================================================
   MyFatoorah
   ----------------------------------------------------------------------
   مبني على الصيغة المنشورة لواجهة MyFatoorah v2 (SendPayment).
   تحقّق من أسماء الحقول وآلية التوقيع في وثائق البوابة وقت التنفيذ.
   نطاق الاختبار غير نطاق الإنتاج — اضبطه في MYFATOORAH_ENDPOINT.

   المفاتيح:
     MYFATOORAH_TOKEN · MYFATOORAH_WEBHOOK_SECRET · MYFATOORAH_ENDPOINT
   ====================================================================== */

"use strict";

const crypto = require("node:crypto");
const { postJson } = require("../lib/fetch");

const ENDPOINT_DEFAULT = "https://api.myfatoorah.com";

const configured = (ctx) => !!ctx.secrets.MYFATOORAH_TOKEN;

function endpoint(ctx) {
  return (ctx.secrets.MYFATOORAH_ENDPOINT || ENDPOINT_DEFAULT).replace(/\/+$/, "");
}

async function createPayment(order, ctx) {
  if (!configured(ctx)) throw new Error("مفتاح MyFatoorah غير مضبوط");

  const body = {
    NotificationOption: "LNK",
    CustomerName: order.customer.name,
    DisplayCurrencyIso: ctx.settings.currency || "SAR",
    MobileCountryCode: "+966",
    CustomerMobile: order.customer.phone.replace(/^0/, ""),
    CustomerEmail: order.customer.email || undefined,
    InvoiceValue: Number(order.totals.grand.toFixed(2)),
    CallBackUrl: `${ctx.config.publicUrl}/pay/return?order=${encodeURIComponent(order.id)}`,
    ErrorUrl: `${ctx.config.publicUrl}/pay/return?order=${encodeURIComponent(order.id)}&failed=1`,
    Language: "AR",
    CustomerReference: order.number,
    InvoiceItems: order.items.map((it) => ({
      ItemName: `${it.name} (${it.qty} ${it.mode === "meter" ? "م" : "طاقة"})`,
      Quantity: 1,
      UnitPrice: Number(it.lineTotal.toFixed(2)),
    })),
  };

  const res = await postJson(`${endpoint(ctx)}/v2/SendPayment`, body, {
    Authorization: "Bearer " + ctx.secrets.MYFATOORAH_TOKEN,
  });

  const data = res.json && res.json.Data;
  if (!data || !data.InvoiceURL) {
    throw new Error("ردّ MyFatoorah بلا رابط دفع: " + (res.text || "").slice(0, 300));
  }
  return { redirectUrl: data.InvoiceURL, reference: String(data.InvoiceId) };
}

/* التوقيع: HMAC-SHA256 بترميز Base64 على الحقول المرتّبة، في ترويسة
   MyFatoorah-Signature. الترتيب مذكور في وثائق البوابة — راجعه. */
async function verifyWebhook(req, raw, ctx) {
  const secret = ctx.secrets.MYFATOORAH_WEBHOOK_SECRET;
  const body = JSON.parse(raw.toString("utf8"));
  const d = body.Data || {};

  if (secret) {
    const ordered = [
      ["Invoice.Id", d.InvoiceId],
      ["InvoiceReference", d.InvoiceReference],
      ["CustomerReference", d.CustomerReference],
      ["TransactionStatus", d.TransactionStatus],
      ["PaymentMethod", d.PaymentMethod],
      ["UserDefinedField", d.UserDefinedField],
      ["ReferenceId", d.ReferenceId],
      ["TrackId", d.TrackId],
    ]
      .map(([k, v]) => `${k}=${v == null ? "" : v}`)
      .join(",");
    const expected = crypto.createHmac("sha256", secret).update(ordered, "utf8").digest("base64");
    const got = String(req.headers["myfatoorah-signature"] || "");
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error("توقيع MyFatoorah غير مطابق");
    }
  } else if (ctx.config.env === "production") {
    throw new Error("MYFATOORAH_WEBHOOK_SECRET مطلوب في الإنتاج");
  }

  const ok = String(d.TransactionStatus || "").toUpperCase() === "SUCCESS";
  return {
    reference: String(d.InvoiceId || ""),
    orderNumber: String(d.CustomerReference || ""),
    status: ok ? "paid" : "failed",
    amount: Number(d.InvoiceValue) || null,
    raw: body,
  };
}

module.exports = { configured, createPayment, verifyWebhook, label: "MyFatoorah" };
