/* ======================================================================
   بوابة تجريبية — للتطوير والعرض فقط
   لا تتصل بأي جهة ولا تحرّك مالًا. تحاكي رحلة الدفع كاملة حتى
   يُختبر المتجر من طرف إلى طرف قبل وصول مفاتيح البوابة الحقيقية.
   يرفض العمل إذا كان الخادم في وضع الإنتاج.
   ====================================================================== */

"use strict";

const crypto = require("node:crypto");

const configured = () => true;

async function createPayment(order, ctx) {
  if (ctx.config.env === "production") {
    throw new Error("البوابة التجريبية لا تعمل في وضع الإنتاج. اضبط PAYMENT_PROVIDER على بوابة حقيقية.");
  }
  const reference = "DEMO" + crypto.randomBytes(5).toString("hex").toUpperCase();
  // صفحة محاكاة داخل الخادم نفسه: تعرض زرّي «نجح» و«فشل»
  const redirectUrl = `${ctx.config.publicUrl}/pay/demo?ref=${encodeURIComponent(reference)}&order=${encodeURIComponent(order.id)}`;
  return { redirectUrl, reference };
}

/* في الوضع التجريبي تُستدعى من صفحة المحاكاة، لا من جهة خارجية */
async function verifyWebhook(req, raw, ctx) {
  let body = {};
  try { body = JSON.parse(raw.toString("utf8") || "{}"); } catch { /* تجاهل */ }
  if (ctx.config.env === "production") throw new Error("مرفوض في وضع الإنتاج");
  return {
    reference: String(body.reference || ""),
    orderId: String(body.orderId || ""),
    status: body.status === "paid" ? "paid" : "failed",
    amount: Number(body.amount) || null,
  };
}

module.exports = { configured, createPayment, verifyWebhook, label: "تجريبية (بلا دفع حقيقي)" };
