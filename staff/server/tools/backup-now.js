#!/usr/bin/env node
/* نسخة احتياطية فورية من سطر الأوامر — تصلح لمهمة cron خارجية.
   التشغيل:  node tools/backup-now.js   (أو: npm run backup) */

"use strict";

const path = require("node:path");
const CONFIG = require("../config");
const DB = require("../lib/db");
const BACKUP = require("../lib/backup");

const config = CONFIG.build(path.join(__dirname, ".."));
const db = DB.open(config);
try {
  const info = BACKUP.run(db, config, null, { reason: "cli", withUploads: true });
  console.log(`${path.join(config.backupDir, info.file)}  ·  ${Math.round(info.size / 1024)} ك.ب` +
    (info.uploads ? `  ·  ${info.uploads} مرفقًا` : "") +
    (info.pruned ? `  ·  حُذفت ${info.pruned} نسخة قديمة` : ""));
} finally {
  db.close();
}
