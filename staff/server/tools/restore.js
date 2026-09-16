#!/usr/bin/env node
/* ======================================================================
   استعادة نسخة احتياطية — خطوة يدوية واعية، لا زر في الواجهة
   ----------------------------------------------------------------------
   أوقف الخادم أولًا، ثم:
       node tools/restore.js                 يعرض النسخ المتاحة
       node tools/restore.js staff-2026….db  يستعيد نسخة بعينها

   القاعدة الحالية لا تُمسح: تُعاد تسميتها بلاحقة before-restore.
   ====================================================================== */

"use strict";

const path = require("node:path");
const CONFIG = require("../config");
const BACKUP = require("../lib/backup");

const config = CONFIG.build(path.join(__dirname, ".."));
const file = process.argv[2];

(async () => {
  const list = BACKUP.list(config);
  if (!file) {
    if (!list.length) {
      console.log("لا توجد نسخ احتياطية في " + config.backupDir);
      return;
    }
    console.log("النسخ المتاحة في " + config.backupDir + ":\n");
    for (const r of list) {
      console.log(`  ${r.file}   ${String(Math.round(r.size / 1024)).padStart(8)} ك.ب   ${r.at.slice(0, 16).replace("T", " ")}`);
    }
    console.log("\nللاستعادة:  node tools/restore.js " + list[0].file);
    return;
  }

  const out = await BACKUP.restore(config, file);
  console.log(`استُعيدت ${out.restored}`);
  console.log(`القاعدة السابقة محفوظة باسم ${out.previous}`);
  console.log("شغّل الخادم الآن: node server.js");
})().catch((e) => {
  console.error("تعذّرت الاستعادة: " + e.message);
  process.exit(1);
});
