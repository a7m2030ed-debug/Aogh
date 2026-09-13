/* ======================================================================
   شحن يدوي — بلا ربط بواجهة شركة
   يولّد رقم تتبّع داخليًا، ويترك خانة رقم البوليصة الرسمي لتُدخلها من
   لوحة التحكم بعد إصدارها من موقع الشركة. صالح للتشغيل الفعلي، وليس
   محاكاة: الطلب حقيقي والشحنة حقيقية، والأتمتة وحدها هي الناقصة.
   ====================================================================== */

"use strict";

const crypto = require("node:crypto");

const configured = () => true;

async function quote() {
  return null; // استعمل السعر الثابت من الإعدادات
}

async function createWaybill(order) {
  const seq = crypto.randomBytes(4).readUInt32BE(0) % 100000000;
  return {
    awb: "NSJ" + String(seq).padStart(8, "0"),
    official: false,
    note: "رقم داخلي. أدخِل رقم البوليصة الرسمي من لوحة التحكم بعد إصداره من موقع شركة الشحن.",
  };
}

async function track(awb) {
  return { status: "unknown", events: [], note: "التتبّع الآلي يحتاج ربط حساب شركة الشحن." };
}

module.exports = { configured, quote, createWaybill, track, label: "يدوي" };
