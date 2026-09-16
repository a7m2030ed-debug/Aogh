/* ======================================================================
   قاعدة البيانات — SQLite عبر node:sqlite، بلا أي اعتمادية
   ----------------------------------------------------------------------
   قاعدة علائقية حقيقية بمفاتيح أجنبية وفهارس ومعاملات، في ملف واحد
   يسهل نسخه احتياطيًا. الاستعلامات كلها **مُعامَلات مربوطة**
   (prepared statements) فلا مكان لحقن SQL.

   الانتقال إلى PostgreSQL لاحقًا: المخطط في schema.sql قياسي، وبقية
   الخادم لا تنادي SQLite مباشرة بل تمرّ على هذا الملف وحده.
   ====================================================================== */

"use strict";

/* تحذير «SQLite تجريبية» يُطبع مرة عند التحميل ولا يفيد مشغّل النظام،
   ويخفي رسائل الإقلاع المهمة. نكتمه وحده ونُبقي بقية التحذيرات. */
const _emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  if (String(warning).includes("SQLite is an experimental feature")) return;
  return _emitWarning.call(process, warning, ...rest);
};

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA_VERSION = 1;

const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/* اليوم بتوقيت الخادم المحلي — لا UTC: «اليوم» في التقارير هو يوم
   المستخدم لا يوم غرينتش. */
function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ------------------------------------------------------ القيم الافتراضية */

const DEFAULT_BRANCHES = [
  { code: "RWD", name_ar: "الروضة", name_en: "Rawdah" },
  { code: "KHR", name_ar: "خريص", name_en: "Khurais" },
  { code: "WRD", name_ar: "الورود", name_en: "Wurood" },
  { code: "QRW", name_ar: "القيروان", name_en: "Qirawan" },
  { code: "SWD", name_ar: "السويدي", name_en: "Sweidi" },
];

const DEFAULT_DEPARTMENTS = [
  { code: "PA", name_ar: "استقبال المرضى", name_en: "Patient Access" },
  { code: "NUR", name_ar: "التمريض", name_en: "Nursing" },
  { code: "PHY", name_ar: "الأطباء", name_en: "Physicians" },
  { code: "DEN", name_ar: "الأسنان", name_en: "Dental" },
  { code: "LAB", name_ar: "المختبر", name_en: "Laboratory" },
  { code: "RAD", name_ar: "الأشعة", name_en: "Radiology" },
  { code: "ADM", name_ar: "الإدارة", name_en: "Administration" },
  { code: "FIN", name_ar: "المالية", name_en: "Finance" },
  { code: "HR", name_ar: "الموارد البشرية", name_en: "HR" },
  { code: "IT", name_ar: "تقنية المعلومات", name_en: "IT" },
  { code: "OTH", name_ar: "أخرى", name_en: "Other" },
];

const DEFAULT_JOB_TITLES = [
  { code: "PAM", name_ar: "مدير استقبال المرضى", name_en: "Patient Access Manager" },
  { code: "PAS", name_ar: "مشرف استقبال المرضى", name_en: "Patient Access Supervisor" },
  { code: "REC", name_ar: "موظف استقبال", name_en: "Receptionist" },
  { code: "NRS", name_ar: "ممرض/ممرضة", name_en: "Nurse" },
  { code: "PHYS", name_ar: "طبيب", name_en: "Physician" },
  { code: "DENT", name_ar: "طبيب أسنان", name_en: "Dentist" },
  { code: "LABT", name_ar: "فني مختبر", name_en: "Lab Technician" },
  { code: "RADT", name_ar: "فني أشعة", name_en: "Radiology Technician" },
  { code: "ACC", name_ar: "محاسب", name_en: "Accountant" },
  { code: "HRO", name_ar: "أخصائي موارد بشرية", name_en: "HR Officer" },
];

const DEFAULT_LEAVE_TYPES = [
  { code: "sick", name_ar: "إجازة مرضية", name_en: "Sick Leave", requires_attachment: 1, attendance_status: "sick_leave" },
  { code: "annual", name_ar: "إجازة سنوية", name_en: "Annual Leave", attendance_status: "annual_leave" },
  { code: "emergency", name_ar: "إجازة اضطرارية", name_en: "Emergency Leave", attendance_status: "emergency_leave" },
  { code: "unpaid", name_ar: "إجازة بلا راتب", name_en: "Unpaid Leave", is_paid: 0, attendance_status: "other_leave" },
  { code: "maternity", name_ar: "إجازة وضع", name_en: "Maternity Leave", attendance_status: "other_leave" },
  { code: "hajj", name_ar: "إجازة حج", name_en: "Hajj Leave", attendance_status: "other_leave" },
  { code: "mission", name_ar: "مهمة عمل", name_en: "Official Mission", attendance_status: "official_mission" },
  { code: "permission", name_ar: "استئذان", name_en: "Permission", attendance_status: "permission" },
];

/* مصفوفة الصلاحيات الافتراضية — قابلة للتعديل من الإعدادات */
const ALL_PERMISSIONS = [
  "employees.view", "employees.create", "employees.edit", "employees.archive", "employees.delete",
  "pii.national_id",
  "movements.manage",
  "attendance.view", "attendance.manage",
  "leaves.view", "leaves.manage",
  "discipline.view", "discipline.manage",
  "attachments.upload", "attachments.delete",
  "reports.view", "reports.export",
  "import.run",
  "lookups.manage", "users.manage", "settings.manage", "audit.view", "backup.manage",
];

const DEFAULT_PERMISSIONS = {
  super_admin: ALL_PERMISSIONS.slice(),
  hr_admin: [
    "employees.view", "employees.create", "employees.edit", "employees.archive",
    "pii.national_id", "movements.manage",
    "attendance.view", "attendance.manage", "leaves.view", "leaves.manage",
    "discipline.view", "discipline.manage", "attachments.upload", "attachments.delete",
    "reports.view", "reports.export", "import.run", "lookups.manage",
  ],
  manager: [
    "employees.view", "attendance.view", "attendance.manage",
    "leaves.view", "leaves.manage", "discipline.view", "reports.view", "reports.export",
  ],
  viewer: ["employees.view", "attendance.view", "leaves.view", "discipline.view", "reports.view"],
};

const DEFAULT_SETTINGS = {
  orgNameAr: "مجمع العيادات",
  orgNameEn: "Clinic Complex",
  defaultLanguage: "ar",
  /* أيام العمل: 0 الأحد … 6 السبت. تُستعمل لعدّ أيام الإجازة إن اختير
     العدّ بأيام العمل، ولاقتراح أيام الغياب. */
  workDays: [0, 1, 2, 3, 4],
  leaveDaysBasis: "calendar",      // calendar = أيام تقويمية · workdays = أيام عمل
  scheduledStartTime: "08:00",
  lateGraceMinutes: 0,
  probationDays: 90,
  correctiveDueSoonDays: 7,
  nationalIdDigits: 10,
  employeeNoPattern: "",           // تعبير نمطي اختياري للرقم الوظيفي
  permissions: DEFAULT_PERMISSIONS,
};

/* ------------------------------------------------------------ الفتح */

function open(config) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(path.join(config.dataDir, "uploads"), { recursive: true });

  const file = path.join(config.dataDir, "staff.db");
  const raw = new DatabaseSync(file);

  raw.exec("PRAGMA journal_mode = WAL;");        // قراءة أثناء الكتابة، ومتانة عند الانقطاع
  raw.exec("PRAGMA foreign_keys = ON;");         // العلاقات تُفرض في القاعدة نفسها
  raw.exec("PRAGMA busy_timeout = 5000;");
  raw.exec("PRAGMA synchronous = FULL;");        // بيانات موظفين: لا نقايض المتانة بالسرعة

  raw.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

  const db = new Db(raw, file);
  db.migrate();
  db.seedLookups();
  return db;
}

class Db {
  constructor(raw, file) {
    this.raw = raw;
    this.file = file;
    this.cache = new Map();
    this.depth = 0;
  }

  stmt(sql) {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  all(sql, params) {
    return params === undefined ? this.stmt(sql).all() : this.stmt(sql).all(params);
  }

  get(sql, params) {
    const r = params === undefined ? this.stmt(sql).get() : this.stmt(sql).get(params);
    return r === undefined ? null : r;
  }

  run(sql, params) {
    return params === undefined ? this.stmt(sql).run() : this.stmt(sql).run(params);
  }

  /* معاملة: إما أن يُكتب كل شيء أو لا شيء. متداخلة عبر SAVEPOINT حتى
     تستطيع عملية مركّبة أن تنادي عملية أبسط دون كسر الذرّية. */
  tx(fn) {
    const name = `sp_${this.depth}`;
    if (this.depth === 0) this.raw.exec("BEGIN IMMEDIATE");
    else this.raw.exec(`SAVEPOINT ${name}`);
    this.depth++;
    try {
      const out = fn();
      this.depth--;
      if (this.depth === 0) this.raw.exec("COMMIT");
      else this.raw.exec(`RELEASE ${name}`);
      return out;
    } catch (e) {
      this.depth--;
      try {
        if (this.depth === 0) this.raw.exec("ROLLBACK");
        else this.raw.exec(`ROLLBACK TO ${name}`), this.raw.exec(`RELEASE ${name}`);
      } catch { /* القاعدة قد تكون أغلقت المعاملة بنفسها */ }
      throw e;
    }
  }

  close() {
    try { this.raw.close(); } catch { /* مغلقة أصلًا */ }
  }

  /* ------------------------------------------------------- الترقية */

  migrate() {
    const row = this.get("SELECT value FROM meta WHERE key = 'schema_version'");
    const cur = row ? Number(row.value) : 0;
    if (cur === 0) {
      this.run("INSERT INTO meta(key, value) VALUES('schema_version', :v)", { v: String(SCHEMA_VERSION) });
      this.run("INSERT OR IGNORE INTO meta(key, value) VALUES('created_at', :v)", { v: nowIso() });
    } else if (cur < SCHEMA_VERSION) {
      // ترقيات مستقبلية تُضاف هنا خطوة خطوة
      this.run("UPDATE meta SET value = :v WHERE key = 'schema_version'", { v: String(SCHEMA_VERSION) });
    } else if (cur > SCHEMA_VERSION) {
      throw new Error(`قاعدة البيانات أحدث من الكود (نسخة ${cur} مقابل ${SCHEMA_VERSION}).`);
    }
  }

  /* --------------------------------------------- القوائم الافتراضية */

  seedLookups() {
    const t = nowIso();
    const seed = (table, rows, extra = () => ({})) => {
      const n = this.get(`SELECT COUNT(*) AS c FROM ${table}`).c;
      if (n > 0) return;
      rows.forEach((r, i) => {
        const cols = Object.assign(
          { code: r.code, name_ar: r.name_ar, name_en: r.name_en, sort_order: i + 1,
            created_at: t, created_by: null, updated_at: t, updated_by: null },
          extra(r)
        );
        const keys = Object.keys(cols);
        this.run(
          `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map((k) => ":" + k).join(",")})`,
          cols
        );
      });
    };

    seed("branches", DEFAULT_BRANCHES);
    seed("departments", DEFAULT_DEPARTMENTS);
    seed("job_titles", DEFAULT_JOB_TITLES);
    seed("leave_types", DEFAULT_LEAVE_TYPES, (r) => ({
      is_paid: r.is_paid === undefined ? 1 : r.is_paid,
      requires_attachment: r.requires_attachment || 0,
      attendance_status: r.attendance_status || "other_leave",
    }));

    if (!this.get("SELECT key FROM settings WHERE key = 'system'")) {
      this.run("INSERT INTO settings(key, value, updated_at) VALUES('system', :v, :t)",
        { v: JSON.stringify(DEFAULT_SETTINGS), t: t });
    }
  }

  /* -------------------------------------------------------- الإعدادات */

  settings() {
    const row = this.get("SELECT value FROM settings WHERE key = 'system'");
    let stored = {};
    try { stored = row ? JSON.parse(row.value) : {}; } catch { stored = {}; }
    const merged = Object.assign({}, DEFAULT_SETTINGS, stored);
    merged.permissions = Object.assign({}, DEFAULT_PERMISSIONS, stored.permissions || {});
    return merged;
  }

  saveSettings(next, userId) {
    this.run(
      "INSERT INTO settings(key, value, updated_at, updated_by) VALUES('system', :v, :t, :u)" +
      " ON CONFLICT(key) DO UPDATE SET value = :v, updated_at = :t, updated_by = :u",
      { v: JSON.stringify(next), t: nowIso(), u: userId || null }
    );
    return this.settings();
  }
}

module.exports = {
  open, Db, uuid, nowIso, today,
  SCHEMA_VERSION, ALL_PERMISSIONS, DEFAULT_PERMISSIONS, DEFAULT_SETTINGS,
  DEFAULT_BRANCHES, DEFAULT_DEPARTMENTS, DEFAULT_JOB_TITLES, DEFAULT_LEAVE_TYPES,
};
