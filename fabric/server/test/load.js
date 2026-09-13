#!/usr/bin/env node
/* ======================================================================
   قياس الحِمل — كم يحتمل الخادم فعلًا
   ----------------------------------------------------------------------
       node test/load.js [العنوان] [عدد المتزامنين] [ثواني]

   يقيس على مسارات الزائر الحقيقية: الكتالوج، وملفات الواجهة، والتسعير.
   يطبع الإنتاجية وزمن الاستجابة عند المئين 50 و95 و99، وحجم النقل،
   وذاكرة العملية. الأرقام هنا مقاسة لا مقدَّرة.
   ====================================================================== */

"use strict";

const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

const BASE = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/+$/, "");
const CONCURRENCY = Number(process.argv[3] || 50);
const SECONDS = Number(process.argv[4] || 10);

const lib = BASE.startsWith("https:") ? https : http;
const agent = new lib.Agent({ keepAlive: true, maxSockets: CONCURRENCY * 2 });

/* مزيج يشبه زائرًا حقيقيًا: يفتح الصفحة، يحمّل ملفاتها، يتصفّح */
const MIX = [
  { path: "/", weight: 3 },
  { path: "/assets/styles.css", weight: 2 },
  { path: "/assets/data.js", weight: 2 },
  { path: "/assets/shop.js", weight: 2 },
  { path: "/api/catalog", weight: 6 },
];

const plan = [];
MIX.forEach((m) => { for (let i = 0; i < m.weight; i++) plan.push(m.path); });

const stats = new Map();
function record(path, ms, bytes, status) {
  let s = stats.get(path);
  if (!s) { s = { n: 0, bytes: 0, errors: 0, lat: [] }; stats.set(path, s); }
  s.n++;
  s.bytes += bytes;
  if (status >= 400 || status === 0) s.errors++;
  s.lat.push(ms);
}

function hit(path) {
  return new Promise((resolve) => {
    const u = new URL(BASE + path);
    const t0 = process.hrtime.bigint();
    const req = lib.request(
      {
        hostname: u.hostname, port: u.port, path: u.pathname + u.search,
        method: "GET", agent,
        headers: { "Accept-Encoding": "gzip, br", Connection: "keep-alive" },
      },
      (res) => {
        let bytes = 0;
        res.on("data", (c) => (bytes += c.length));
        res.on("end", () => {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          record(path, ms, bytes, res.statusCode);
          resolve();
        });
      }
    );
    req.on("error", () => {
      record(path, Number(process.hrtime.bigint() - t0) / 1e6, 0, 0);
      resolve();
    });
    req.setTimeout(15000, () => req.destroy());
    req.end();
  });
}

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
};

const fmtBytes = (b) =>
  b > 1e9 ? (b / 1e9).toFixed(2) + " غ" : b > 1e6 ? (b / 1e6).toFixed(1) + " م" : (b / 1e3).toFixed(0) + " ك";

async function main() {
  console.log(`\nقياس الحِمل — ${BASE}`);
  console.log(`${CONCURRENCY} متزامنًا لمدة ${SECONDS} ثانية\n${"─".repeat(64)}`);

  // إحماء
  for (const p of new Set(plan)) await hit(p).catch(() => {});
  stats.clear();

  const until = Date.now() + SECONDS * 1000;
  let i = 0;
  const worker = async () => {
    while (Date.now() < until) {
      await hit(plan[i++ % plan.length]);
    }
  };
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const elapsed = (Date.now() - t0) / 1000;

  let total = 0, bytes = 0, errors = 0;
  const all = [];
  console.log("  المسار                  طلبات   متوسط   p95    p99   الحجم/طلب  أخطاء");
  console.log("  " + "─".repeat(62));
  for (const [path, s] of stats) {
    total += s.n; bytes += s.bytes; errors += s.errors;
    all.push(...s.lat);
    const avg = s.lat.reduce((a, b) => a + b, 0) / s.lat.length;
    console.log(
      "  " + path.padEnd(22) +
      String(s.n).padStart(6) +
      (avg.toFixed(0) + "م").padStart(8) +
      (pct(s.lat, 95).toFixed(0) + "م").padStart(7) +
      (pct(s.lat, 99).toFixed(0) + "م").padStart(7) +
      fmtBytes(s.bytes / s.n).padStart(11) +
      String(s.errors).padStart(7)
    );
  }

  const rps = total / elapsed;
  console.log("  " + "─".repeat(62));
  console.log(`\n  الإنتاجية:      ${rps.toFixed(0)} طلب/ثانية`);
  console.log(`  زمن الاستجابة:  متوسط ${(all.reduce((a, b) => a + b, 0) / all.length).toFixed(0)}م · p95 ${pct(all, 95).toFixed(0)}م · p99 ${pct(all, 99).toFixed(0)}م`);
  console.log(`  النقل:          ${fmtBytes(bytes)} في ${elapsed.toFixed(1)} ثانية  (${fmtBytes(bytes / elapsed)}/ث)`);
  console.log(`  الأخطاء:        ${errors}`);

  /* ترجمة الأرقام إلى زوّار: زائر واحد ≈ رحلة كاملة من المزيج أعلاه */
  const perVisitor = plan.length;
  const visitorsPerSec = rps / perVisitor;
  const bytesPerVisitor = (bytes / total) * perVisitor;
  console.log(`\n  ${"─".repeat(62)}`);
  console.log(`  زائر واحد ≈ ${perVisitor} طلبات و${fmtBytes(bytesPerVisitor)}`);
  console.log(`  الطاقة:      ~${visitorsPerSec.toFixed(0)} زائر/ثانية  ·  ~${(visitorsPerSec * 3600).toFixed(0)} زائر/ساعة`);
  console.log(`  50 ألف زائر: ${fmtBytes(bytesPerVisitor * 50000)} نقلًا، وتستغرق ${(50000 / visitorsPerSec / 60).toFixed(1)} دقيقة بأقصى طاقة`);
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
