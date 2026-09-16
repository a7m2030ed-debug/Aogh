/* ======================================================================
   النسخ الاحتياطي
   ----------------------------------------------------------------------
   النسخة تُؤخذ بـVACUUM INTO: SQLite يكتب نسخة **متّسقة** من القاعدة
   وهي تعمل، بلا إيقاف ولا خطر التقاط ملف نصفه مكتوب.

   ثلاث طبقات:
     ١. نسخة يومية تلقائية في الساعة المضبوطة (BACKUP_HOUR).
     ٢. نسخة يدوية من لوحة الإعدادات أو `npm run backup`.
     ٣. تنزيل النسخة من المتصفح لتُحفَظ خارج الخادم.

   والاحتفاظ محدود بعدد الأيام في BACKUP_RETENTION_DAYS، ويُنبَّه في
   الإقلاع إن كان مجلد النسخ داخل مجلد البيانات — نسخة بجانب أصلها
   تضيع معه.
   ====================================================================== */

"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { nowIso } = require("./db");
const audit = require("./audit");

const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

function run(db, config, ctx, { reason = "manual", withUploads = false } = {}) {
  fs.mkdirSync(config.backupDir, { recursive: true });
  const name = `staff-${stamp()}.db`;
  const target = path.join(config.backupDir, name);

  // VACUUM INTO لا يقبل معاملًا مربوطًا، والمسار من إعدادنا لا من المستخدم
  db.raw.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const size = fs.statSync(target).size;

  let uploads = 0;
  if (withUploads) uploads = copyUploads(config, path.join(config.backupDir, `uploads-${stamp()}`));

  const pruned = prune(config);
  if (ctx) {
    audit.record(db, ctx, {
      action: "backup", entity: "system", entityId: name,
      summary: `نسخة احتياطية (${Math.round(size / 1024)} ك.ب)${pruned ? ` · حُذفت ${pruned} نسخة قديمة` : ""}`,
      after: { file: name, size, reason },
    });
  }
  return { file: name, size, at: nowIso(), pruned, uploads };
}

function copyUploads(config, target) {
  const src = path.join(config.dataDir, "uploads");
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(target, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, f), path.join(target, f));
    n++;
  }
  return n;
}

function prune(config) {
  const days = Number(config.backupRetentionDays) || 0;
  if (!days || !fs.existsSync(config.backupDir)) return 0;
  const cutoff = Date.now() - days * 86400000;
  let n = 0;
  for (const f of fs.readdirSync(config.backupDir)) {
    if (!/^staff-\d{8}-\d{6}\.db$/.test(f)) continue;
    const full = path.join(config.backupDir, f);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) { fs.unlinkSync(full); n++; }
    } catch { /* حُذف بالتوازي */ }
  }
  return n;
}

function list(config) {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs.readdirSync(config.backupDir)
    .filter((f) => /^staff-\d{8}-\d{6}\.db$/.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(config.backupDir, f));
      return { file: f, size: st.size, at: new Date(st.mtimeMs).toISOString() };
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

function locate(config, file) {
  const safe = path.basename(String(file || ""));
  if (!/^staff-\d{8}-\d{6}\.db$/.test(safe)) return null;
  const full = path.join(config.backupDir, safe);
  return fs.existsSync(full) ? full : null;
}

/* المجدول: يفحص كل ربع ساعة، وينسخ مرة واحدة في اليوم عند الساعة المضبوطة */
function schedule(db, config, onDone) {
  if (config.backupHour < 0 || config.backupHour > 23) return null;
  let lastDay = null;
  const tick = () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (day === lastDay || now.getHours() !== config.backupHour) return;
    lastDay = day;
    try {
      const info = run(db, config, null, { reason: "scheduled", withUploads: true });
      if (onDone) onDone(null, info);
    } catch (e) {
      if (onDone) onDone(e);
    }
  };
  const timer = setInterval(tick, 15 * 60 * 1000);
  timer.unref();
  return timer;
}

/* استعادة نسخة: لا تتم من الواجهة إطلاقًا — خطوة يدوية واعية.
   تُستدعى من tools/restore.js بعد إيقاف الخادم. */
async function restore(config, file) {
  const src = locate(config, file);
  if (!src) throw new Error("لا توجد نسخة بهذا الاسم");
  const target = path.join(config.dataDir, "staff.db");
  const keep = `${target}.before-restore-${stamp()}`;
  if (fs.existsSync(target)) await fsp.rename(target, keep);
  for (const suffix of ["-wal", "-shm"]) {
    const f = target + suffix;
    if (fs.existsSync(f)) await fsp.unlink(f);
  }
  await fsp.copyFile(src, target);
  return { restored: path.basename(src), previous: path.basename(keep) };
}

module.exports = { run, list, locate, prune, schedule, restore, copyUploads };
