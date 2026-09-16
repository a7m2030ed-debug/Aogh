#!/usr/bin/env node
/* ======================================================================
   نظام إدارة الموظفين وتحليل بياناتهم — الخادم
   ----------------------------------------------------------------------
   التشغيل:   node server.js          (بلا npm install ولا مرحلة بناء)

   كل مسار تحت /api محمي بجلسة، وكل كتابة تمرّ بثلاثة فحوص:
     ١. جلسة سارية (كوكي HttpOnly + مهلة خمول).
     ٢. رأس X-CSRF-Token يطابق الجلسة.
     ٣. صلاحية الدور على هذا الإجراء بعينه.
   ثم تُسجَّل في سجل التدقيق داخل معاملة التغيير نفسها.
   ====================================================================== */

"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const H = require("./lib/http");
const CONFIG = require("./config");
const DB = require("./lib/db");
const A = require("./lib/auth");
const audit = require("./lib/audit");
const EMP = require("./lib/employees");
const MOV = require("./lib/movements");
const ATT = require("./lib/attendance");
const LV = require("./lib/leaves");
const DIS = require("./lib/discipline");
const R = require("./lib/reports");
const LK = require("./lib/lookups");
const USERS = require("./lib/users");
const FILES = require("./lib/files");
const BACKUP = require("./lib/backup");
const IMPORT = require("./lib/importer");
const EXPORTS = require("./lib/exports");
const HIST = require("./lib/history");

const ROOT = __dirname;
const config = CONFIG.build(ROOT);
const db = DB.open(config);

const SESSION_COOKIE = "staff_session";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/* ------------------------------------------------------------ أدوات */

function clientIp(req) {
  if (config.trustProxy) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || "unknown";
}

function queryOf(url) {
  const out = {};
  for (const [k, v] of url.searchParams) out[k] = v;
  return out;
}

const xlsxFile = (buffer, name) => ({
  __file: true, buffer, filename: name, type: XLSX_MIME,
});

/* ------------------------------------------------------------ المسارات */

const router = new H.Router();

/* ---- الصحة والإقلاع ---- */

router.get("/api/health", () => ({
  ok: true, at: DB.nowIso(), version: DB.SCHEMA_VERSION, env: config.env,
}));

/* ---- المصادقة ---- */

router.post("/api/auth/login", async (c) => {
  const user = A.login(db, {
    username: c.body.username, password: c.body.password,
    ip: c.ip, ua: c.req.headers["user-agent"], config,
  });
  const { token, csrf } = A.createSession(db, user, { ip: c.ip, ua: c.req.headers["user-agent"], config });
  c.res.setHeader("Set-Cookie", H.cookie(SESSION_COOKIE, token, {
    secure: config.secureCookies, sameSite: "Strict", maxAge: config.sessionMaxHours * 3600,
  }));
  const settings = db.settings();
  return { user: A.publicUser(user, settings), csrf };
});

router.post("/api/auth/logout", (c) => {
  A.revokeSession(db, c.token);
  c.res.setHeader("Set-Cookie", H.cookie(SESSION_COOKIE, "", { secure: config.secureCookies, maxAge: 0 }));
  return { ok: true };
});

router.get("/api/auth/me", (c) => {
  requireUser(c);
  return { user: A.publicUser(c.rawUser, db.settings()), csrf: c.session.csrf };
});

router.post("/api/auth/password", (c) => {
  requireUser(c);
  return USERS.changeOwnPassword(db, c, c.body);
});

/* ---- بيانات الإقلاع للواجهة ---- */

router.get("/api/bootstrap", (c) => {
  requireUser(c);
  const s = db.settings();
  return {
    user: A.publicUser(c.rawUser, s),
    csrf: c.session.csrf,
    lookups: LK.all(db),
    settings: {
      orgNameAr: s.orgNameAr, orgNameEn: s.orgNameEn, defaultLanguage: s.defaultLanguage,
      workDays: s.workDays, leaveDaysBasis: s.leaveDaysBasis, scheduledStartTime: s.scheduledStartTime,
      lateGraceMinutes: s.lateGraceMinutes, probationDays: s.probationDays,
      correctiveDueSoonDays: s.correctiveDueSoonDays, nationalIdDigits: s.nationalIdDigits,
      sessionIdleMinutes: config.sessionIdleMinutes,
    },
    enums: {
      employmentStatuses: EMP.STATUSES,
      manualStatuses: EMP.MANUAL_STATUSES,
      employmentTypes: EMP.EMPLOYMENT_TYPES,
      genders: EMP.GENDERS,
      attendanceStatuses: ATT.STATUSES,
      leaveApprovals: LV.APPROVALS,
      actionTypes: DIS.ACTION_TYPES,
      actionStatuses: DIS.ACTION_STATUS,
      correctiveStatuses: DIS.CA_STATUS,
      separationKinds: MOV.KINDS,
      roles: USERS.ROLES,
      refTypes: FILES.REF_TYPES,
    },
    today: DB.today(),
  };
});

/* ---- الموظفون ---- */

router.get("/api/employees", (c) => {
  can(c, "employees.view");
  return EMP.list(db, c, c.query);
});

router.get("/api/employees/lookup", (c) => {
  can(c, "employees.view");
  const found = EMP.lookup(db, c, { nationalId: c.query.nationalId, employeeNo: c.query.employeeNo });
  return { found: !!found, employee: found };
});

router.post("/api/employees", (c) => {
  can(c, "employees.create");
  return EMP.create(db, c, c.body);
});

router.get("/api/employees/:id", (c) => {
  can(c, "employees.view");
  return EMP.profile(db, c, c.params.id);
});

router.patch("/api/employees/:id", (c) => {
  can(c, "employees.edit");
  return EMP.update(db, c, c.params.id, c.body);
});

router.delete("/api/employees/:id", (c) => {
  can(c, "employees.delete");
  return EMP.remove(db, c, c.params.id, c.body.reason || c.query.reason);
});

router.post("/api/employees/:id/archive", (c) => {
  can(c, "employees.archive");
  return EMP.archive(db, c, c.params.id, c.body.archived !== false, c.body.reason);
});

router.get("/api/employees/:id/timeline", (c) => {
  can(c, "employees.view");
  return { events: EMP.timeline(db, c, c.params.id) };
});

router.get("/api/employees/:id/stats", (c) => {
  can(c, "employees.view");
  EMP.byId(db, c, c.params.id);
  return EMP.statistics(db, c.params.id, { from: c.query.from, to: c.query.to });
});

router.post("/api/employees/:id/transfer", (c) => {
  can(c, "movements.manage");
  return MOV.transfer(db, c, c.params.id, c.body);
});

router.post("/api/employees/:id/resignation", (c) => {
  can(c, "movements.manage");
  return MOV.separate(db, c, c.params.id, "resignation", c.body);
});

router.post("/api/employees/:id/termination", (c) => {
  can(c, "movements.manage");
  return MOV.separate(db, c, c.params.id, "termination", c.body);
});

router.post("/api/employees/:id/retirement", (c) => {
  can(c, "movements.manage");
  return MOV.separate(db, c, c.params.id, "retirement", c.body);
});

router.post("/api/employees/:id/rehire", (c) => {
  can(c, "movements.manage");
  return MOV.rehire(db, c, c.params.id, c.body);
});

/* ---- الحركات ---- */

router.get("/api/transfers", (c) => { can(c, "employees.view"); return MOV.listTransfers(db, c, c.query); });
router.get("/api/separations", (c) => { can(c, "employees.view"); return MOV.listSeparations(db, c, c.query); });
router.patch("/api/separations/:id", (c) => { can(c, "movements.manage"); return MOV.updateSeparation(db, c, c.params.id, c.body); });
router.delete("/api/separations/:id", (c) => {
  can(c, "movements.manage");
  return MOV.cancelSeparation(db, c, c.params.id, c.body.reason || c.query.reason);
});

/* ---- الحضور ---- */

router.get("/api/attendance", (c) => { can(c, "attendance.view"); return ATT.list(db, c, c.query); });
router.post("/api/attendance", (c) => { can(c, "attendance.manage"); return ATT.create(db, c, c.body, { upsert: !!c.body.upsert }); });
router.post("/api/attendance/bulk", (c) => { can(c, "attendance.manage"); return ATT.bulk(db, c, c.body); });
router.patch("/api/attendance/:id", (c) => { can(c, "attendance.manage"); return ATT.update(db, c, c.params.id, c.body); });
router.delete("/api/attendance/:id", (c) => { can(c, "attendance.manage"); return ATT.remove(db, c, c.params.id); });

/* ---- الإجازات ---- */

router.get("/api/leaves", (c) => { can(c, "leaves.view"); return LV.list(db, c, c.query); });
router.post("/api/leaves", (c) => { can(c, "leaves.manage"); return LV.create(db, c, c.body); });
router.patch("/api/leaves/:id", (c) => { can(c, "leaves.manage"); return LV.update(db, c, c.params.id, c.body); });
router.delete("/api/leaves/:id", (c) => { can(c, "leaves.manage"); return LV.remove(db, c, c.params.id); });

/* ---- الإجراءات الانضباطية ---- */

router.get("/api/disciplinary", (c) => { can(c, "discipline.view"); return DIS.listActions(db, c, c.query); });
router.post("/api/disciplinary", (c) => { can(c, "discipline.manage"); return DIS.createAction(db, c, c.body); });
router.patch("/api/disciplinary/:id", (c) => { can(c, "discipline.manage"); return DIS.updateAction(db, c, c.params.id, c.body); });
router.delete("/api/disciplinary/:id", (c) => { can(c, "discipline.manage"); return DIS.removeAction(db, c, c.params.id); });

router.get("/api/corrective", (c) => { can(c, "discipline.view"); return DIS.listCorrective(db, c, c.query); });
router.post("/api/corrective", (c) => { can(c, "discipline.manage"); return DIS.createCorrective(db, c, c.body); });
router.patch("/api/corrective/:id", (c) => { can(c, "discipline.manage"); return DIS.updateCorrective(db, c, c.params.id, c.body); });
router.delete("/api/corrective/:id", (c) => { can(c, "discipline.manage"); return DIS.removeCorrective(db, c, c.params.id); });

/* ---- المرفقات ---- */

router.get("/api/attachments", (c) => { can(c, "employees.view"); return { rows: FILES.list(db, c, c.query) }; });

router.post("/api/attachments", async (c) => {
  can(c, "attachments.upload");
  const { fields, files } = c.multipart;
  if (!files.length) throw H.bad("لم يصل أي ملف");
  return FILES.save(db, c, config, {
    file: files[0], employeeId: fields.employeeId, refType: fields.refType, refId: fields.refId,
  });
});

router.get("/api/attachments/:id/download", async (c) => {
  can(c, "employees.view");
  const { row, path: full } = FILES.locate(db, c, config, c.params.id);
  const fs = require("node:fs");
  const buf = fs.readFileSync(full);
  return {
    __file: true, buffer: buf, filename: row.file_name,
    type: row.mime || "application/octet-stream",
  };
});

router.delete("/api/attachments/:id", (c) => { can(c, "attachments.delete"); return FILES.remove(db, c, config, c.params.id); });

/* ---- التقارير ---- */

router.get("/api/reports/dashboard", (c) => { can(c, "reports.view"); return R.dashboard(db, c, c.query); });
router.get("/api/reports/period", (c) => { can(c, "reports.view"); return R.periodReport(db, c, c.query); });
router.get("/api/reports/monthly", (c) => { can(c, "reports.view"); return R.monthly(db, c, c.query); });
router.get("/api/reports/annual", (c) => { can(c, "reports.view"); return R.annual(db, c, c.query); });
router.get("/api/reports/by-dimension", (c) => { can(c, "reports.view"); return R.byDimension(db, c, c.query); });

router.get("/api/reports/trend", (c) => {
  can(c, "reports.view");
  const range = R.range(c.query);
  return { rows: R.monthlySeries(db, range, R.normalizeFilters(c.query, c)) };
});

router.get("/api/reports/headcount", (c) => {
  can(c, "reports.view");
  const date = c.query.date || DB.today();
  const f = R.normalizeFilters(c.query, c);
  const rows = R.activeEmployees(db, date, f, Math.min(Number(c.query.size) || 500, 5000));
  return {
    date, total: R.headcountAt(db, date, f),
    rows: rows.map((e) => ({
      id: e.id, employeeNo: e.employee_no, fullNameAr: e.full_name_ar, fullNameEn: e.full_name_en,
      branchId: e.branch_id, departmentId: e.department_id, jobTitleId: e.job_title_id,
      startDate: e.start_date, employmentStatus: e.employment_status,
    })),
  };
});

router.get("/api/notifications", (c) => {
  requireUser(c);
  return { rows: R.alerts(db, c, R.normalizeFilters({}, c)) };
});

/* ---- التصدير ---- */

const exportRoutes = {
  "employees.xlsx": [EXPORTS.employees, "employees.view"],
  "attendance.xlsx": [EXPORTS.attendance, "attendance.view"],
  "leaves.xlsx": [EXPORTS.leaves, "leaves.view"],
  "discipline.xlsx": [EXPORTS.discipline, "discipline.view"],
  "movements.xlsx": [EXPORTS.movements, "employees.view"],
  "report.xlsx": [EXPORTS.report, "reports.view"],
  "headcount.xlsx": [EXPORTS.headcountDetail, "reports.view"],
  "audit.xlsx": [EXPORTS.auditLog, "audit.view"],
};

router.get("/api/export/:name", (c) => {
  const entry = exportRoutes[c.params.name];
  if (!entry) throw H.notFound("تصدير غير معروف");
  const [fn, perm] = entry;
  can(c, perm);
  can(c, "reports.export");
  const lang = c.query.lang === "en" ? "en" : "ar";
  const buf = fn(db, c, c.query, lang);
  audit.record(db, c, {
    action: "export", entity: c.params.name, entityId: null,
    summary: `تصدير ${c.params.name}` + (c.query.from ? ` · ${c.query.from} — ${c.query.to || ""}` : ""),
  });
  return xlsxFile(buf, `${c.params.name.replace(".xlsx", "")}-${DB.today()}.xlsx`);
});

router.get("/api/import/template.xlsx", (c) => {
  can(c, "import.run");
  return xlsxFile(IMPORT.template(db), "staff-import-template.xlsx");
});

/* ---- الاستيراد ---- */

router.post("/api/import/employees/preview", async (c) => {
  can(c, "import.run");
  const { files, fields } = c.multipart;
  if (!files.length) throw H.bad("لم يصل أي ملف");
  const parsed = IMPORT.parseUpload(files[0].data, files[0].filename);
  const options = { createMissing: fields.createMissing === "1", updateExisting: fields.updateExisting !== "0" };
  const analysis = IMPORT.analyze(db, c, { rows: parsed.rows, mapping: parsed.mapping }, options);
  return {
    fileName: files[0].filename,
    header: parsed.header, mapping: parsed.mapping, fields: IMPORT.FIELDS,
    rows: parsed.rows.slice(0, 2000),
    analysis,
  };
});

router.post("/api/import/employees/analyze", (c) => {
  can(c, "import.run");
  return IMPORT.analyze(db, c, { rows: c.body.rows || [], mapping: c.body.mapping || {} }, c.body.options || {});
});

router.post("/api/import/employees/commit", (c) => {
  can(c, "import.run");
  return IMPORT.commit(db, c, c.body);
});

/* ---- القوائم ---- */

router.get("/api/lookups", (c) => { requireUser(c); return LK.all(db); });
router.get("/api/lookups/:kind", (c) => { requireUser(c); return { rows: LK.list(db, c.params.kind) }; });
router.post("/api/lookups/:kind", (c) => { can(c, "lookups.manage"); return LK.create(db, c, c.params.kind, c.body); });
router.patch("/api/lookups/:kind/:id", (c) => { can(c, "lookups.manage"); return LK.update(db, c, c.params.kind, c.params.id, c.body); });
router.delete("/api/lookups/:kind/:id", (c) => { can(c, "lookups.manage"); return LK.remove(db, c, c.params.kind, c.params.id); });

/* ---- المستخدمون والأمن ---- */

router.get("/api/users", (c) => { can(c, "users.manage"); return { rows: USERS.list(db, { includeInactive: true }) }; });
router.post("/api/users", (c) => { can(c, "users.manage"); return USERS.create(db, c, c.body); });
router.patch("/api/users/:id", (c) => { can(c, "users.manage"); return USERS.update(db, c, c.params.id, c.body); });
router.post("/api/users/:id/password", (c) => { can(c, "users.manage"); return USERS.setPassword(db, c, c.params.id, c.body.password); });

router.get("/api/sessions", (c) => { can(c, "users.manage"); return { rows: USERS.sessions(db, c, c.query.userId) }; });
router.delete("/api/sessions/:id", (c) => { can(c, "users.manage"); return USERS.revokeSession(db, c, c.params.id); });
router.get("/api/login-log", (c) => { can(c, "audit.view"); return { rows: USERS.loginLog(db, c.query) }; });

router.get("/api/permissions", (c) => { can(c, "users.manage"); return USERS.permissionMatrix(db); });
router.put("/api/permissions", (c) => { can(c, "settings.manage"); return USERS.savePermissionMatrix(db, c, c.body.matrix); });

router.get("/api/audit", (c) => { can(c, "audit.view"); return audit.list(db, c.query); });

router.get("/api/settings", (c) => { can(c, "settings.manage"); return db.settings(); });

router.patch("/api/settings", (c) => {
  can(c, "settings.manage");
  const before = db.settings();
  const next = Object.assign({}, before);
  const allowed = ["orgNameAr", "orgNameEn", "defaultLanguage", "workDays", "leaveDaysBasis",
    "scheduledStartTime", "lateGraceMinutes", "probationDays", "correctiveDueSoonDays",
    "nationalIdDigits", "employeeNoPattern"];
  for (const k of allowed) if (c.body[k] !== undefined) next[k] = c.body[k];
  if (next.nationalIdDigits) next.nationalIdDigits = Math.min(Math.max(Number(next.nationalIdDigits) || 10, 5), 20);
  if (next.probationDays !== undefined) next.probationDays = Math.min(Math.max(Number(next.probationDays) || 0, 0), 730);
  if (next.lateGraceMinutes !== undefined) next.lateGraceMinutes = Math.min(Math.max(Number(next.lateGraceMinutes) || 0, 0), 240);
  if (!Array.isArray(next.workDays)) next.workDays = before.workDays;
  next.workDays = next.workDays.map(Number).filter((n) => n >= 0 && n <= 6);

  const saved = db.saveSettings(next, c.user && c.user.id);
  audit.record(db, c, {
    action: "update", entity: "settings", entityId: "system", summary: "تعديل إعدادات النظام",
    before: flatten(before), after: flatten(saved),
  });
  return saved;
});

function flatten(s) {
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "permissions") continue;
    out[k] = Array.isArray(v) ? v.join(",") : v;
  }
  return out;
}

/* ---- النسخ الاحتياطي ---- */

router.get("/api/backups", (c) => {
  can(c, "backup.manage");
  return { rows: BACKUP.list(config), dir: config.backupDir, retentionDays: config.backupRetentionDays, hour: config.backupHour };
});

router.post("/api/backups", (c) => {
  can(c, "backup.manage");
  return BACKUP.run(db, config, c, { reason: "manual", withUploads: c.body.withUploads !== false });
});

router.get("/api/backups/:file", (c) => {
  can(c, "backup.manage");
  const full = BACKUP.locate(config, c.params.file);
  if (!full) throw H.notFound("لا توجد نسخة بهذا الاسم");
  const fs = require("node:fs");
  audit.record(db, c, { action: "export", entity: "backup", entityId: c.params.file, summary: `تنزيل نسخة احتياطية ${c.params.file}` });
  return { __file: true, buffer: fs.readFileSync(full), filename: c.params.file, type: "application/octet-stream" };
});

router.post("/api/maintenance/refresh", (c) => {
  can(c, "settings.manage");
  const n = HIST.refreshAll(db);
  audit.record(db, c, { action: "maintenance", entity: "system", summary: `إعادة حساب حالة ${n} موظفًا من سجلاتهم` });
  return { refreshed: n };
});

/* ------------------------------------------------------ فحوص الحماية */

function requireUser(c) {
  if (!c.user) throw H.unauthorized();
  return c.user;
}

/* التحقق من الصلاحية. الوسيط الثالث يجعلها «تحذيرية» لمسارات التصدير
   التي تحتاج صلاحية العرض أصلًا. */
function can(c, permission, soft) {
  requireUser(c);
  if (c.permissions.includes(permission)) return true;
  if (soft) return false;
  throw H.forbidden(`هذا الإجراء يحتاج صلاحية «${permission}»`);
}

const OPEN_PATHS = new Set(["/api/health", "/api/auth/login", "/api/auth/logout"]);
const PASSWORD_CHANGE_PATHS = new Set(["/api/auth/me", "/api/auth/password", "/api/auth/logout", "/api/bootstrap", "/api/health"]);

/* ------------------------------------------------------------ الخادم */

const handler = async (req, res) => {
  const started = Date.now();
  res.baseHeaders = H.securityHeaders(config.secureCookies);
  let url;
  try {
    url = new URL(req.url, config.publicUrl);
  } catch {
    return H.send(res, 400, "bad request");
  }

  if (!H.applyCors(req, res, config.allowedOrigins)) return;

  const pathname = url.pathname;
  if (!pathname.startsWith("/api/")) {
    // الواجهة: ملفات ثابتة من مجلد staff، وكل مسار غير معروف يفتح index.html
    try {
      if (await H.serveStatic(req, res, config.staticDir, pathname)) return;
      if (await H.serveStatic(req, res, config.staticDir, "/index.html")) return;
    } catch { /* يسقط إلى 404 */ }
    return H.send(res, 404, "not found");
  }

  try {
    const match = router.match(req.method, pathname);
    if (!match) throw H.notFound("مسار غير معروف");

    const cookies = H.parseCookies(req);
    const token = cookies[SESSION_COOKIE];
    const resolved = A.resolveSession(db, token, config);
    const settings = db.settings();

    const c = {
      req, res, params: match.params, query: queryOf(url), ip: clientIp(req),
      token, config, db,
      session: resolved ? resolved.session : null,
      rawUser: resolved ? resolved.user : null,
      user: resolved ? Object.assign(A.publicUser(resolved.user, settings), { id: resolved.user.id }) : null,
      permissions: resolved ? A.permissionsFor(resolved.user, settings) : [],
      body: {}, multipart: null,
    };

    const writing = req.method !== "GET" && req.method !== "HEAD";
    if (writing) {
      const type = String(req.headers["content-type"] || "");
      if (type.startsWith("multipart/form-data")) {
        const buf = await H.readBody(req, (config.maxUploadMb + 2) * 1024 * 1024);
        c.multipart = H.parseMultipart(buf, type);
        c.body = c.multipart.fields;
      } else {
        c.body = await H.readJson(req, 8 * 1024 * 1024);
      }
    }

    if (!OPEN_PATHS.has(pathname)) {
      if (!c.user) throw H.unauthorized();
      if (writing) {
        const sent = req.headers["x-csrf-token"];
        if (!sent || sent !== c.session.csrf) throw H.forbidden("رمز الحماية (CSRF) غير صحيح — حدّث الصفحة وأعد المحاولة");
      }
      if (c.rawUser.must_change_password && !PASSWORD_CHANGE_PATHS.has(pathname)) {
        throw new H.HttpError(403, "يجب تغيير كلمة المرور قبل استخدام النظام", "must_change_password");
      }
    }

    const out = await match.handler(c);

    if (out && out.__file) {
      const name = encodeURIComponent(out.filename || "download");
      return H.send(res, 200, out.buffer, {
        "Content-Type": out.type || "application/octet-stream",
        "Content-Length": out.buffer.length,
        "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${name}`,
        "Cache-Control": "no-store",
      });
    }
    return H.sendJson(res, out && out.__status ? out.__status : 200, out === undefined ? { ok: true } : out);
  } catch (e) {
    const status = e instanceof H.HttpError ? e.status : 500;
    if (status >= 500) {
      console.error(`[خطأ] ${req.method} ${pathname} (${Date.now() - started}ms)`, e);
    }
    return H.sendJson(res, status, {
      error: status >= 500 ? "خطأ غير متوقع في الخادم" : e.message,
      code: e.code || null,
      details: e.extra || null,
    });
  }
};

/* خادم عادي، أو مشفَّر إن أُعطيت شهادة — ولو كانت محلية موقَّعة ذاتيًا */
const server = config.tls
  ? require("node:https").createServer(
    { cert: require("node:fs").readFileSync(config.tls.cert), key: require("node:fs").readFileSync(config.tls.key) },
    handler)
  : http.createServer(handler);

/* ------------------------------------------------------------ الإقلاع */

function boot() {
  const problems = CONFIG.auditProduction(config);
  if (problems.length) {
    console.error("\n  لا يمكن تشغيل الإنتاج بهذا الإعداد:\n" + problems.map((p) => "   · " + p).join("\n") + "\n");
    process.exit(1);
  }

  const seeded = A.ensureSeedAdmin(db, config);
  if (seeded) {
    console.log("\n  ── الحساب الأول ──────────────────────────────");
    console.log(`  المستخدم: ${seeded.username}`);
    console.log(`  كلمة المرور: ${seeded.password}`);
    console.log(seeded.generated ? "  (مولَّدة عشوائيًا، ويُطلب تغييرها عند أول دخول)" : "  (من ملف .env)");
    console.log("  ─────────────────────────────────────────────");

    /* تُحفظ أيضًا في ملف: من يفتح النظام بنقرة مزدوجة قد تُغلق نافذته
       قبل أن يقرأها، وبلا كلمة المرور لا مدخل للنظام أصلًا. */
    if (seeded.generated) {
      try {
        const file = path.join(ROOT, "كلمة-المرور-الأولى.txt");
        fs.writeFileSync(file,
          `نظام إدارة الموظفين — بيانات أول دخول\r\n\r\n` +
          `اسم المستخدم: ${seeded.username}\r\n` +
          `كلمة المرور: ${seeded.password}\r\n\r\n` +
          `سيطلب النظام تغييرها عند أول دخول.\r\n` +
          `احذف هذا الملف بعد الدخول وتغيير كلمة المرور.\r\n`,
          { mode: 0o600 });
        console.log(`  وحُفظت في: ${file}`);
        console.log("  احذف الملف بعد أول دخول.\n");
      } catch { console.log(""); }
    } else {
      console.log("");
    }
  }

  A.purgeSessions(db);
  HIST.refreshAll(db);       // تُطبَّق الحركات التي حلّ تاريخها أثناء توقف الخادم

  BACKUP.schedule(db, config, (err, info) => {
    if (err) console.error("[نسخ احتياطي] فشل:", err.message);
    else console.log(`[نسخ احتياطي] ${info.file} · ${Math.round(info.size / 1024)} ك.ب`);
  });

  // صيانة يومية: إعادة حساب الحالات وتنظيف الجلسات المنتهية
  const daily = setInterval(() => {
    try { A.purgeSessions(db); HIST.refreshAll(db); } catch (e) { console.error("[صيانة]", e.message); }
  }, 6 * 3600 * 1000);
  daily.unref();

  server.listen(config.port, config.host, () => {
    const scheme = config.tls ? "https" : "http";
    const line = "  " + "─".repeat(58);
    console.log(`\n  نظام إدارة الموظفين${config.lan ? " — شبكة محلية" : ` — ${config.env}`}`);
    console.log(line);
    console.log(`  على هذا الجهاز:   ${scheme}://localhost:${config.port}`);

    // عناوين الشبكة: يكتبها الموظفون في جوالاتهم وأجهزتهم
    const addrs = CONFIG.localAddresses();
    if (addrs.length && config.host !== "127.0.0.1") {
      addrs.forEach((ip, i) => {
        console.log(`  ${i ? "               " : "من أي جهاز:    "}   ${scheme}://${ip}:${config.port}`);
      });
    }
    console.log(line);
    console.log(`  البيانات: ${config.dataDir}`);
    console.log(`  النسخ الاحتياطية: ${config.backupDir}` +
      (config.backupHour >= 0 ? ` (يوميًا الساعة ${config.backupHour})` : " (تلقائي مُطفأ)"));

    const warn = CONFIG.warnings(config);
    if (warn.length) console.log("\n" + warn.map((w) => "  ! " + w).join("\n"));
    console.log("\n  لإيقاف النظام: أغلق هذه النافذة أو اضغط Ctrl+C\n");
  });
}

/* أشيع خطأ عند من يفتح النظام بنقرة مزدوجة: نسخة تعمل أصلًا على المنفذ */
server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n  المنفذ ${config.port} مستعمل — يبدو أن النظام يعمل بالفعل.`);
    console.error(`  افتحه من المتصفح: http://localhost:${config.port}`);
    console.error("  أو أغلق النافذة التي تشغّله، أو غيّر PORT في server/.env\n");
  } else if (e.code === "EACCES") {
    console.error(`\n  لا صلاحية للاستماع على المنفذ ${config.port}. اختر منفذًا فوق 1024 في server/.env\n`);
  } else {
    console.error("\n  تعذّر تشغيل الخادم:", e.message, "\n");
  }
  process.exit(1);
});

function shutdown(signal) {
  console.log(`\n  إيقاف (${signal})…`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

if (require.main === module) boot();

module.exports = { server, db, config, router, boot };
