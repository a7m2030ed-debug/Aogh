/* ======================================================================
   أرامكس
   ----------------------------------------------------------------------
   أرامكس تنشر واجهتين: SOAP الأقدم، وREST الأحدث. الحقول والنطاقات
   تختلف بين الحسابات والمناطق، وتصل مع عقدك بيانات الاعتماد ودليل
   الربط. لذلك هذا المحوّل يُفعَّل بمفاتيحك، وإلى أن تصل يعمل المحوّل
   اليدوي فلا يتعطّل المتجر.

   المفاتيح:
     ARAMEX_USERNAME · ARAMEX_PASSWORD · ARAMEX_ACCOUNT_NUMBER
     ARAMEX_ACCOUNT_PIN · ARAMEX_ACCOUNT_ENTITY · ARAMEX_ENDPOINT
   ====================================================================== */

"use strict";

const manual = require("./manual");

const KEYS = ["ARAMEX_USERNAME", "ARAMEX_PASSWORD", "ARAMEX_ACCOUNT_NUMBER", "ARAMEX_ACCOUNT_PIN", "ARAMEX_ENDPOINT"];

const configured = (ctx) => KEYS.every((k) => !!ctx.secrets[k]);

function missing(ctx) {
  return KEYS.filter((k) => !ctx.secrets[k]);
}

async function quote(order, ctx) {
  if (!configured(ctx)) return null;
  // احتساب السعر من الوزن والمدينة يتم عبر خدمة CalculateRate لدى أرامكس.
  // يُنفَّذ بدليل الربط الذي يصلك مع العقد، لأن أسماء الحقول تختلف
  // باختلاف نوع الحساب. حتى ذلك يُستعمل السعر الثابت من الإعدادات.
  return null;
}

async function createWaybill(order, ctx) {
  if (!configured(ctx)) {
    const e = new Error("بيانات حساب أرامكس ناقصة: " + missing(ctx).join("، "));
    e.code = "carrier_not_configured";
    throw e;
  }
  // نقطة التنفيذ: نداء CreateShipments ثم قراءة رقم البوليصة والملصق.
  // يُكتب بدليل الربط الخاص بحسابك.
  const e = new Error("ربط أرامكس لم يُنفَّذ بعد. استعمل الإصدار اليدوي حتى يكتمل.");
  e.code = "carrier_not_implemented";
  throw e;
}

async function track(awb, ctx) {
  if (!configured(ctx)) return manual.track(awb);
  return { status: "unknown", events: [], note: "يُنفَّذ مع ربط الحساب." };
}

module.exports = { configured, quote, createWaybill, track, missing, label: "أرامكس" };
