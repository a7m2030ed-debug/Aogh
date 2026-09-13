/* ======================================================================
   Tap Payments
   ----------------------------------------------------------------------
   مبني على الصيغة المنشورة لواجهة Tap (Charges API).
   تحقّق من أسماء الحقول وآلية التوقيع في وثائق البوابة وقت التنفيذ.

   المفاتيح:
     TAP_SECRET_KEY (sk_live_… أو sk_test_…)
   ====================================================================== */

"use strict";

const crypto = require("node:crypto");
const { postJson } = require("../lib/fetch");

const ENDPOINT = "https://api.tap.company/v2/charges";

const configured = (ctx) => !!ctx.secrets.TAP_SECRET_KEY;

async function createPayment(order, ctx) {
  if (!configured(ctx)) throw new Error("مفتاح Tap غير مضبوط");

  const [first, ...rest] = order.customer.name.split(/\s+/);
  const body = {
    amount: Number(order.totals.grand.toFixed(2)),
    currency: ctx.settings.currency || "SAR",
    threeDSecure: true,
    description: `طلب ${order.number}`,
    reference: { transaction: order.number, order: order.id },
    receipt: { email: !!order.customer.email, sms: true },
    customer: {
      first_name: first || order.customer.name,
      last_name: rest.join(" ") || undefined,
      email: order.customer.email || undefined,
      phone: { country_code: "966", number: order.customer.phone.replace(/^0/, "") },
    },
    source: { id: "src_all" },
    post: { url: `${ctx.config.publicUrl}/api/payments/webhook/tap` },
    redirect: { url: `${ctx.config.publicUrl}/pay/return?order=${encodeURIComponent(order.id)}` },
  };

  const res = await postJson(ENDPOINT, body, {
    Authorization: "Bearer " + ctx.secrets.TAP_SECRET_KEY,
  });

  const url = res.json && res.json.transaction && res.json.transaction.url;
  const id = res.json && res.json.id;
  if (!url || !id) throw new Error("ردّ Tap بلا رابط دفع: " + (res.text || "").slice(0, 300));
  return { redirectUrl: url, reference: String(id) };
}

/* التوقيع: HMAC-SHA256 على سلسلة الحقول المحددة، في ترويسة hashstring */
async function verifyWebhook(req, raw, ctx) {
  const body = JSON.parse(raw.toString("utf8"));
  const secret = ctx.secrets.TAP_SECRET_KEY;
  const got = String(req.headers.hashstring || "");

  if (got) {
    const amount = Number(body.amount || 0).toFixed(3);
    const toHash =
      `x_id${body.id}` +
      `x_amount${amount}` +
      `x_currency${body.currency}` +
      `x_gateway_reference${(body.reference || {}).gateway || ""}` +
      `x_payment_reference${(body.reference || {}).payment || ""}` +
      `x_status${body.status}` +
      `x_created${body.transaction ? body.transaction.created : ""}`;
    const expected = crypto.createHmac("sha256", secret).update(toHash, "utf8").digest("hex");
    const a = Buffer.from(got.toLowerCase());
    const b = Buffer.from(expected.toLowerCase());
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error("توقيع Tap غير مطابق");
    }
  } else if (ctx.config.env === "production") {
    throw new Error("ترويسة hashstring مفقودة");
  }

  return {
    reference: String(body.id || ""),
    orderNumber: String((body.reference || {}).transaction || ""),
    status: String(body.status || "").toUpperCase() === "CAPTURED" ? "paid" : "failed",
    amount: Number(body.amount) || null,
    raw: body,
  };
}

module.exports = { configured, createPayment, verifyWebhook, label: "Tap Payments" };
