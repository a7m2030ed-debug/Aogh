/* ======================================================================
   سمسا SMSA
   ----------------------------------------------------------------------
   بيانات الاعتماد ودليل الربط يصلانك مع عقدك، وتختلف الحقول باختلاف
   نوع الحساب. لذلك يُفعَّل هذا المحوّل بمفاتيحك، وإلى أن تصل يعمل
   المحوّل اليدوي فلا يتعطّل المتجر.

   المفاتيح:
     SMSA_USERNAME · SMSA_PASSWORD · SMSA_ACCOUNT_NUMBER
     SMSA_ACCOUNT_PIN · SMSA_ENDPOINT
   ====================================================================== */

"use strict";

const manual = require("./manual");

const KEYS = ["SMSA_USERNAME", "SMSA_PASSWORD", "SMSA_ACCOUNT_NUMBER", "SMSA_ACCOUNT_PIN", "SMSA_ENDPOINT"];

const configured = (ctx) => KEYS.every((k) => !!ctx.secrets[k]);

function missing(ctx) {
  return KEYS.filter((k) => !ctx.secrets[k]);
}

async function quote(order, ctx) {
  if (!configured(ctx)) return null;
  // احتساب السعر من الوزن والمدينة يُنفَّذ بدليل الربط الذي يصلك مع
  // العقد. حتى ذلك يُستعمل السعر الثابت من الإعدادات.
  return null;
}

async function createWaybill(order, ctx) {
  if (!configured(ctx)) {
    const e = new Error("بيانات حساب سمسا ناقصة: " + missing(ctx).join("، "));
    e.code = "carrier_not_configured";
    throw e;
  }
  // نقطة التنفيذ: إنشاء الشحنة ثم قراءة رقم البوليصة والملصق،
  // بدليل الربط الخاص بحسابك.
  const e = new Error("ربط سمسا لم يُنفَّذ بعد. استعمل الإصدار اليدوي حتى يكتمل.");
  e.code = "carrier_not_implemented";
  throw e;
}

async function track(awb, ctx) {
  if (!configured(ctx)) return manual.track(awb);
  return { status: "unknown", events: [], note: "يُنفَّذ مع ربط الحساب." };
}

module.exports = { configured, quote, createWaybill, track, missing, label: "سمسا" };
