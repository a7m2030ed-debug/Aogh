/* ======================================================================
   طلب HTTPS بصيغة JSON — بلا اعتماديات
   مستقل عن payments/index.js حتى لا ينشأ استيراد دائري يجعل الدالة
   undefined وقت تحميل المحوّلات.
   ====================================================================== */

"use strict";

const https = require("node:https");
const { URL } = require("node:url");

function postJson(url, body, headers = {}, timeoutMs = 20000) {
  const u = new URL(url);
  if (u.protocol !== "https:") return Promise.reject(new Error("بوابات الدفع تُنادى عبر https فقط"));
  const payload = Buffer.from(JSON.stringify(body), "utf8");

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "POST",
        headers: Object.assign(
          { "Content-Type": "application/json", "Content-Length": payload.length, Accept: "application/json" },
          headers
        ),
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size > 2 * 1024 * 1024) { req.destroy(new Error("ردّ البوابة أكبر من المتوقع")); return; }
          chunks.push(c);
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { /* قد تردّ نصًا عند الخطأ */ }
          resolve({ status: res.statusCode, json, text });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("انتهت مهلة الاتصال ببوابة الدفع")));
    req.on("error", reject);
    req.end(payload);
  });
}

module.exports = { postJson };
