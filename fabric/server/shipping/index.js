/* ======================================================================
   شركات الشحن — واجهة واحدة، ومحوّل لكل شركة
   ----------------------------------------------------------------------
   كل محوّل يصدّر:
     quote(order, ctx)        → { cost } أو null لاستعمال السعر الثابت
     createWaybill(order, ctx)→ { awb, labelUrl?, labelPdfBase64? }
     track(awb, ctx)          → { status, events[] }
     configured(ctx)          → هل بيانات الحساب موجودة؟

   بلا حساب لدى الشركة يعمل المحوّل «اليدوي»: يولّد رقمًا داخليًا
   ويطبع بوليصة بلا باركود معتمد، وتُدخِل أنت رقم البوليصة الرسمي بعد
   إصداره من موقع الشركة. هذا يشغّل المتجر من اليوم الأول.
   ====================================================================== */

"use strict";

const manual = require("./manual");
const aramex = require("./aramex");
const smsa = require("./smsa");

const ADAPTERS = { manual, aramex, smsa, pickup: manual };

function adapter(name) {
  return ADAPTERS[name] || manual;
}

module.exports = { adapter, ADAPTERS };
