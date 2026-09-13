/* ======================================================================
   بوابات الدفع — واجهة واحدة، ومحوّل لكل بوابة
   ----------------------------------------------------------------------
   كل محوّل يصدّر:
     createPayment(order, ctx)    → { redirectUrl, reference }
     verifyWebhook(req, raw, ctx) → { reference, status, orderNumber?, amount? }
     configured(ctx)              → هل المفاتيح موجودة؟

   قاعدة ثابتة: الطلب لا يُعتمد من رجوع المتصفح. الاعتماد يقع في معالج
   الـwebhook وحده، بعد التحقق من التوقيع ومطابقة المبلغ. رجوع المتصفح
   يعرض الحالة فقط.
   ====================================================================== */

"use strict";

const ADAPTERS = {
  demo: require("./demo"),
  paytabs: require("./paytabs"),
  myfatoorah: require("./myfatoorah"),
  tap: require("./tap"),
};

function adapter(name) {
  const a = ADAPTERS[name];
  if (!a) throw new Error(`بوابة غير معروفة: ${name}`);
  return a;
}

module.exports = { adapter, ADAPTERS };
