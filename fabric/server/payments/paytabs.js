/* ======================================================================
   PayTabs
   ----------------------------------------------------------------------
   مبني على الصيغة المنشورة لواجهة PayTabs (Managed/Hosted Payment Page).
   تحقّق من أسماء الحقول وآلية التوقيع في وثائق البوابة وقت التنفيذ،
   فالواجهات تتغيّر، وتحقّق من نطاق منطقتك (secure.paytabs.sa للسعودية).

   المفاتيح من متغيّرات البيئة:
     PAYTABS_PROFILE_ID · PAYTABS_SERVER_KEY · PAYTABS_ENDPOINT (اختياري)
   ====================================================================== */

"use strict";

const crypto = require("node:crypto");
const { postJson } = require("../lib/fetch");

const ENDPOINT_DEFAULT = "https://secure.paytabs.sa";

const configured = (ctx) => !!(ctx.secrets.PAYTABS_PROFILE_ID && ctx.secrets.PAYTABS_SERVER_KEY);

function endpoint(ctx) {
  return (ctx.secrets.PAYTABS_ENDPOINT || ENDPOINT_DEFAULT).replace(/\/+$/, "");
}

async function createPayment(order, ctx) {
  if (!configured(ctx)) throw new Error("مفاتيح PayTabs غير مضبوطة");

  const body = {
    profile_id: Number(ctx.secrets.PAYTABS_PROFILE_ID),
    tran_type: "sale",
    tran_class: "ecom",
    cart_id: order.number,
    cart_description: `طلب ${order.number} من ${ctx.settings.storeName}`,
    cart_currency: ctx.settings.currency || "SAR",
    cart_amount: Number(order.totals.grand.toFixed(2)),
    customer_details: {
      name: order.customer.name,
      email: order.customer.email || undefined,
      phone: order.customer.phone,
      street1: order.shipping.address || undefined,
      city: order.shipping.city || undefined,
      country: "SA",
    },
    hide_shipping: true,
    return: `${ctx.config.publicUrl}/pay/return?order=${encodeURIComponent(order.id)}`,
    callback: `${ctx.config.publicUrl}/api/payments/webhook/paytabs`,
  };

  const res = await postJson(`${endpoint(ctx)}/payment/request`, body, {
    authorization: ctx.secrets.PAYTABS_SERVER_KEY,
  });

  const url = res.json && (res.json.redirect_url || res.json.payment_url);
  const ref = res.json && (res.json.tran_ref || res.json.cart_id);
  if (!url || !ref) {
    throw new Error("ردّ PayTabs بلا رابط دفع: " + (res.text || "").slice(0, 300));
  }
  return { redirectUrl: url, reference: String(ref) };
}

/* التوقيع: HMAC-SHA256 على الجسم الخام بمفتاح الخادم، في ترويسة signature */
async function verifyWebhook(req, raw, ctx) {
  const sig = String(req.headers.signature || "");
  const expected = crypto.createHmac("sha256", ctx.secrets.PAYTABS_SERVER_KEY).update(raw).digest("hex");
  const a = Buffer.from(sig.toLowerCase());
  const b = Buffer.from(expected.toLowerCase());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("توقيع PayTabs غير مطابق");
  }

  const body = JSON.parse(raw.toString("utf8"));
  const result = body.payment_result || {};
  const status = String(result.response_status || "").toUpperCase() === "A" ? "paid" : "failed";
  return {
    reference: String(body.tran_ref || ""),
    orderNumber: String(body.cart_id || ""),
    status,
    amount: Number(body.cart_amount) || null,
    raw: body,
  };
}

module.exports = { configured, createPayment, verifyWebhook, label: "PayTabs" };
