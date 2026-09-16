#!/usr/bin/env node
/* ======================================================================
   اختبارات القبول — على خادم حقيقي من طرف إلى طرف
   التشغيل:  node test/run.js
   ----------------------------------------------------------------------
   تغطي سيناريوهات القبول العشرة في وثيقة المتطلبات، ومعها ما يمسّ
   سلامة الأرقام: مطابقة العدد الافتتاحي بالختامي، وتاريخية الفرع،
   وفصل تاريخ الحدث عن تاريخ الإدخال، والصلاحيات.
   ====================================================================== */

"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert");

const PORT = 3477;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "staff-test-"));
const BACKUPS = fs.mkdtempSync(path.join(os.tmpdir(), "staff-bak-"));
const ROOT = path.join(__dirname, "..");
const ADMIN_PASSWORD = "Test-admin-2026";

let pass = 0, fail = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    pass++;
    results.push("  ✓ " + name);
  } catch (e) {
    fail++;
    results.push("  ✗ " + name + "\n      " + String(e.message || e).split("\n").slice(0, 3).join("\n      "));
  }
}

let cookie = "";
let csrf = "";

async function api(method, url, body, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (body !== undefined && !opts.raw) headers["Content-Type"] = "application/json";
  if (cookie && !opts.noCookie) headers.Cookie = cookie;
  if (csrf && !opts.noCsrf && method !== "GET") headers["X-CSRF-Token"] = csrf;
  const res = await fetch(BASE + url, {
    method, headers,
    body: body === undefined ? undefined : opts.raw ? body : JSON.stringify(body),
    redirect: "manual",
  });
  const sc = res.headers.get("set-cookie");
  if (sc && !opts.noCookie) cookie = sc.split(";")[0];
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buf.toString("utf8")); } catch { /* ملف أو HTML */ }
  return { status: res.status, json, buffer: buf, headers: res.headers };
}

const ok = (r, msg) => {
  if (r.status >= 400) throw new Error(`${msg || "طلب"} → ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
};

/* ------------------------------------------------------------ الإقلاع */

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server.js"], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        NODE_ENV: "development",
        PORT: String(PORT),
        HOST: "127.0.0.1",
        DATA_DIR: DATA,
        BACKUP_DIR: BACKUPS,
        BACKUP_HOUR: "-1",
        ADMIN_USERNAME: "admin",
        ADMIN_PASSWORD,
        PUBLIC_URL: BASE,
      }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const done = setTimeout(() => reject(new Error("لم يُقلع الخادم:\n" + out)), 15000);
    child.stdout.on("data", (d) => {
      out += d.toString();
      if (out.includes("يستمع على")) { clearTimeout(done); resolve(child); }
    });
    child.stderr.on("data", (d) => { out += d.toString(); });
    child.on("exit", (code) => { clearTimeout(done); reject(new Error(`خرج الخادم (${code}):\n${out}`)); });
  });
}

/* -------------------------------------------------------- البيانات */

let BR = {};       // الفروع بالرمز
let DEP = {};      // الأقسام
let JOB = {};
let LEAVE = {};

async function loadLookups() {
  const b = ok(await api("GET", "/api/lookups"));
  for (const r of b.branches) BR[r.code] = r.id;
  for (const r of b.departments) DEP[r.code] = r.id;
  for (const r of b.jobTitles) JOB[r.code] = r.id;
  for (const r of b.leaveTypes) LEAVE[r.code] = r.id;
}

let seq = 1000;
async function addEmployee(over = {}) {
  seq++;
  const body = Object.assign({
    employeeNo: String(seq),
    nationalId: String(1000000000 + seq),
    fullNameAr: `موظف ${seq}`,
    fullNameEn: `Employee ${seq}`,
    originalJoiningDate: "2026-01-01",
    branchId: BR.RWD,
    departmentId: DEP.PA,
    jobTitleId: JOB.REC,
    employmentType: "full_time",
    gender: "male",
    mobile: "0501234567",
  }, over);
  return ok(await api("POST", "/api/employees", body), "إضافة موظف");
}

const period = (from, to, extra = "") => `/api/reports/period?from=${from}&to=${to}${extra}`;

/* -------------------------------------------------------- الاختبارات */

async function main() {
  const server = await startServer();
  try {
    await test("الصحة تستجيب قبل الدخول", async () => {
      const r = await api("GET", "/api/health");
      assert.equal(r.status, 200);
      assert.equal(r.json.ok, true);
    });

    await test("المسارات المحمية ترفض بلا جلسة", async () => {
      const r = await api("GET", "/api/employees", undefined, { noCookie: true });
      assert.equal(r.status, 401);
    });

    await test("كلمة مرور خاطئة تُرفض بلا تسريب اسم المستخدم", async () => {
      const r = await api("POST", "/api/auth/login", { username: "admin", password: "wrong-one-1" }, { noCookie: true });
      assert.equal(r.status, 401);
      assert.ok(!/admin/.test(String(r.json.error)));
    });

    await test("تسجيل الدخول ينجح ويعيد رمز CSRF", async () => {
      const r = await api("POST", "/api/auth/login", { username: "admin", password: ADMIN_PASSWORD });
      const j = ok(r, "دخول");
      csrf = j.csrf;
      assert.equal(j.user.role, "super_admin");
      assert.ok(csrf && csrf.length > 20);
      assert.ok(/HttpOnly/i.test(r.headers.get("set-cookie") || ""));
    });

    await test("الكتابة بلا رأس CSRF تُرفض", async () => {
      const r = await api("POST", "/api/employees", { employeeNo: "x" }, { noCsrf: true });
      assert.equal(r.status, 403);
    });

    await loadLookups();

    /* --------- Test 1: إضافة موظف يظهر في العدد والمباشرين --------- */
    let e1;
    await test("Test 1 — موظف جديد يظهر في المباشرين وفي العدد الحالي", async () => {
      const before = ok(await api("GET", period("2026-03-01", "2026-03-31")));
      e1 = await addEmployee({ originalJoiningDate: "2026-03-01", branchId: BR.RWD });
      const after = ok(await api("GET", period("2026-03-01", "2026-03-31")));
      assert.equal(after.movement.newJoiners, before.movement.newJoiners + 1);
      assert.equal(after.movement.closingHeadcount, before.movement.closingHeadcount + 1);
      assert.equal(e1.employmentStatus, "active");
      assert.equal(e1.branch.id, BR.RWD);
    });

    await test("حدث «إنشاء الموظف» مسجَّل باسم من أنشأه", async () => {
      const t = ok(await api("GET", `/api/employees/${e1.id}/timeline`));
      const created = t.events.find((x) => x.type === "record_created");
      assert.ok(created, "لا يوجد حدث إنشاء");
      assert.equal(created.details.by, "مدير النظام");
      assert.ok(t.events.find((x) => x.type === "joined" && x.date === "2026-03-01"));
    });

    /* --------- Test 10: منع تكرار الهوية والرقم الوظيفي --------- */
    await test("Test 10 — تكرار رقم الهوية مرفوض برسالة واضحة", async () => {
      const r = await api("POST", "/api/employees", {
        employeeNo: "999999", nationalId: e1.nationalId, fullNameAr: "مكرر",
        originalJoiningDate: "2026-03-01", branchId: BR.RWD,
      });
      assert.equal(r.status, 409);
      assert.equal(r.json.code, "duplicate_national_id");
      assert.equal(r.json.details.employeeNo, e1.employeeNo);
    });

    await test("تكرار الرقم الوظيفي مرفوض", async () => {
      const r = await api("POST", "/api/employees", {
        employeeNo: e1.employeeNo, nationalId: "1999999999", fullNameAr: "مكرر",
        originalJoiningDate: "2026-03-01", branchId: BR.RWD,
      });
      assert.equal(r.status, 409);
      assert.equal(r.json.code, "duplicate_employee_no");
    });

    /* --------- Test 2: النقل يحفظ التاريخ --------- */
    let e2;
    await test("Test 2 — النقل يُنشئ سجلًا ويُبقي الفرع القديم في التاريخ", async () => {
      e2 = await addEmployee({ originalJoiningDate: "2026-01-01", branchId: BR.RWD });
      const t = ok(await api("POST", `/api/employees/${e2.id}/transfer`, {
        transferDate: "2026-09-01", toBranchId: BR.SWD, reason: "احتياج تشغيلي", approvedBy: "مدير العمليات",
      }), "نقل");
      assert.equal(t.fromBranch.nameAr, "الروضة");
      assert.equal(t.toBranch.nameAr, "السويدي");

      const prof = ok(await api("GET", `/api/employees/${e2.id}`));
      assert.equal(prof.employee.branch.id, BR.SWD, "الفرع الحالي بعد النقل");
      assert.equal(prof.assignments.length, 2);
      assert.equal(prof.assignments[0].to, "2026-08-31", "الإسناد القديم يُغلق قبل يوم النقل");
      assert.equal(prof.assignments[1].from, "2026-09-01");
      assert.equal(prof.employee.branchStartDate, "2026-09-01");
      assert.equal(prof.employee.originalJoiningDate, "2026-01-01", "تاريخ المباشرة الأصلي لا يتغيّر");
    });

    await test("§52 — تقرير أغسطس على الفرع القديم وسبتمبر على الجديد", async () => {
      const aug = ok(await api("GET", period("2026-08-01", "2026-08-31", `&branchId=${BR.RWD}`)));
      const sep = ok(await api("GET", period("2026-09-01", "2026-09-30", `&branchId=${BR.SWD}`)));
      const augSwd = ok(await api("GET", period("2026-08-01", "2026-08-31", `&branchId=${BR.SWD}`)));
      assert.ok(aug.movement.closingHeadcount >= 1, "الروضة في أغسطس تضمّه");
      assert.equal(sep.movement.transfersIn, 1, "السويدي في سبتمبر: نقل داخل");
      assert.equal(aug.movement.transfersOut, 0, "أغسطس بلا نقل خارج — النقل في سبتمبر");
      const sepRwd = ok(await api("GET", period("2026-09-01", "2026-09-30", `&branchId=${BR.RWD}`)));
      assert.equal(sepRwd.movement.transfersOut, 1);
      assert.equal(augSwd.movement.closingHeadcount, 0, "السويدي في أغسطس لا يضمّه");
    });

    /* --------- Test 3: الاستقالة في الشهر الصحيح --------- */
    let e3;
    await test("Test 3 — الاستقالة تظهر في شهرها ولا يبقى الموظف نشطًا بعدها", async () => {
      e3 = await addEmployee({ originalJoiningDate: "2026-03-01", branchId: BR.WRD });
      ok(await api("POST", `/api/employees/${e3.id}/resignation`, {
        eventDate: "2026-09-15", lastWorkingDate: "2026-09-30", subType: "استقالة بإشعار",
        reason: "فرصة أفضل", noticePeriodDays: 30, approvedBy: "مدير الموارد البشرية",
      }), "استقالة");

      const mar = ok(await api("GET", period("2026-03-01", "2026-03-31")));
      const sep = ok(await api("GET", period("2026-09-01", "2026-09-30")));
      const aug = ok(await api("GET", period("2026-08-01", "2026-08-31")));
      assert.ok(mar.movement.newJoiners >= 1, "مارس: مباشرة");
      assert.equal(sep.movement.resignations, 1, "سبتمبر: استقالة واحدة");
      assert.equal(aug.movement.resignations, 0, "أغسطس: لا استقالات");

      const prof = ok(await api("GET", `/api/employees/${e3.id}`));
      assert.equal(prof.employee.employmentStatus, "resigned");
      assert.equal(prof.periods[0].endDate, "2026-09-30");

      const octActive = ok(await api("GET", "/api/reports/headcount?date=2026-10-31"));
      assert.ok(!octActive.rows.find((r) => r.id === e3.id), "لا يظهر نشطًا في أكتوبر");
      const sepStart = ok(await api("GET", "/api/reports/headcount?date=2026-09-01"));
      assert.ok(sepStart.rows.find((r) => r.id === e3.id), "يظهر نشطًا أول سبتمبر");
    });

    await test("§58 — من انتهت خدمته لا يُعدّ في العدد الختامي لآخر يوم عمل", async () => {
      const sep = ok(await api("GET", period("2026-09-01", "2026-09-30")));
      const oct = ok(await api("GET", period("2026-10-01", "2026-10-31")));
      assert.equal(sep.movement.closingHeadcount, oct.movement.openingHeadcount,
        "ختامي سبتمبر = افتتاحي أكتوبر");
      const rows = ok(await api("GET", "/api/reports/headcount?date=2026-09-30")).rows;
      assert.ok(!rows.find((r) => r.id === e3.id));
    });

    await test("المطابقة: افتتاحي + مباشرون − مغادرون = ختامي", async () => {
      const y = ok(await api("GET", period("2026-01-01", "2026-12-31")));
      assert.equal(y.movement.reconciliation.difference, 0, JSON.stringify(y.movement));
    });

    /* --------- Test 4: الإجازة المرضية --------- */
    await test("Test 4 — أيام الإجازة المرضية تُحسب تلقائيًا (١ إلى ٣ سبتمبر = ٣)", async () => {
      const lv = ok(await api("POST", "/api/leaves", {
        employeeId: e1.id, leaveTypeId: LEAVE.sick, startDate: "2026-09-01", endDate: "2026-09-03",
        medicalCertificate: true, approvalStatus: "approved",
      }), "إجازة مرضية");
      assert.equal(lv.days, 3);

      const rep = ok(await api("GET", period("2026-09-01", "2026-09-30")));
      assert.equal(rep.attendance.leaveDays.byCode.sick, 3);
      assert.equal(rep.attendance.sickLeaveDays, 3, "أيام المرضية في التقرير من سجل الإجازات");
      assert.equal(rep.attendance.fromAttendance.sickLeaveDays, 3, "وسجل الحضور يوافقه");
    });

    await test("الإجازة المعتمدة لا تُحسب غيابًا", async () => {
      const rep = ok(await api("GET", period("2026-09-01", "2026-09-03")));
      assert.equal(rep.attendance.absent, 0);
      const att = ok(await api("GET", `/api/attendance?employeeId=${e1.id}&from=2026-09-01&to=2026-09-03`));
      assert.equal(att.rows.length, 3);
      assert.ok(att.rows.every((r) => r.status === "sick_leave"));
    });

    await test("تداخل الإجازات مرفوض", async () => {
      const r = await api("POST", "/api/leaves", {
        employeeId: e1.id, leaveTypeId: LEAVE.annual, startDate: "2026-09-02", endDate: "2026-09-05",
      });
      assert.equal(r.status, 409);
      assert.equal(r.json.code, "leave_overlap");
    });

    /* --------- Test 5: التأخير --------- */
    await test("Test 5 — التأخير: عدد المرات ومجموع الدقائق ومتوسطها", async () => {
      ok(await api("POST", "/api/attendance", {
        employeeId: e2.id, date: "2026-09-07", status: "late",
        scheduledTime: "08:00", checkIn: "08:25", reason: "زحام",
      }), "تأخير ١");
      ok(await api("POST", "/api/attendance", {
        employeeId: e2.id, date: "2026-09-08", status: "late",
        scheduledTime: "08:00", checkIn: "08:15",
      }), "تأخير ٢");

      const rep = ok(await api("GET", period("2026-09-01", "2026-09-30")));
      assert.equal(rep.attendance.lateOccurrences, 2);
      assert.equal(rep.attendance.lateMinutes, 40);
      assert.equal(rep.attendance.lateAverage, 20);

      const st = ok(await api("GET", `/api/employees/${e2.id}/stats`));
      assert.equal(st.lateCount, 2);
      assert.equal(st.lateMinutes, 40);
    });

    await test("سجل حضور واحد لكل يوم — الإعادة تُرفض ما لم تُطلب الكتابة فوقه", async () => {
      const r = await api("POST", "/api/attendance", { employeeId: e2.id, date: "2026-09-07", status: "present" });
      assert.equal(r.status, 409);
      const r2 = ok(await api("POST", "/api/attendance",
        { employeeId: e2.id, date: "2026-09-07", status: "late", scheduledTime: "08:00", checkIn: "08:25", upsert: true }));
      assert.equal(r2.lateMinutes, 25);
    });

    await test("الغياب يُسجَّل ويظهر في التقرير", async () => {
      ok(await api("POST", "/api/attendance", {
        employeeId: e2.id, date: "2026-09-09", status: "absent", approved: false, reason: "بلا إشعار",
      }), "غياب");
      const rep = ok(await api("GET", period("2026-09-01", "2026-09-30")));
      assert.equal(rep.attendance.absent, 1);
      assert.equal(rep.attendance.absentUnapproved, 1);
    });

    /* --------- Test 6: الإنذار --------- */
    await test("Test 6 — الإنذار يظهر في تقرير الشهر والسنة", async () => {
      ok(await api("POST", "/api/disciplinary", {
        employeeId: e2.id, actionDate: "2026-06-01", actionType: "warning_letter",
        reason: "تكرار التأخير", description: "إنذار أول", issuedBy: "مدير الفرع",
      }), "إنذار");
      const jun = ok(await api("GET", period("2026-06-01", "2026-06-30")));
      const year = ok(await api("GET", "/api/reports/annual?year=2026"));
      const may = ok(await api("GET", period("2026-05-01", "2026-05-31")));
      assert.equal(jun.disciplinary.warningLetters, 1);
      assert.equal(year.disciplinary.warningLetters, 1);
      assert.equal(may.disciplinary.warningLetters, 0);
    });

    /* --------- Test 7: الإجراء التصحيحي --------- */
    let ca;
    await test("Test 7 — الإجراء التصحيحي يُفتح ثم يُغلق بتاريخه", async () => {
      ca = ok(await api("POST", "/api/corrective", {
        employeeId: e2.id, dateOpened: "2026-07-01", reason: "أخطاء في الإدخال",
        correctiveAction: "تدريب على النظام", responsiblePerson: "مشرف القسم", dueDate: "2026-07-15",
      }), "إجراء تصحيحي");
      assert.equal(ca.status, "open");
      assert.equal(ca.isOverdue, true, "تجاوز الاستحقاق فيظهر متأخرًا");
      assert.equal(ca.displayStatus, "overdue");

      const closed = ok(await api("PATCH", `/api/corrective/${ca.id}`, {
        status: "closed", dateClosed: "2026-07-20", closureNotes: "حضر التدريب",
      }), "إغلاق");
      assert.equal(closed.status, "closed");
      assert.equal(closed.dateClosed, "2026-07-20");
      assert.equal(closed.isOverdue, false);

      const jul = ok(await api("GET", period("2026-07-01", "2026-07-31")));
      assert.equal(jul.disciplinary.correctiveOpened, 1);
      assert.equal(jul.disciplinary.correctiveClosedInRange, 1);
    });

    /* --------- Test 8: تاريخ الحدث ≠ تاريخ الإدخال --------- */
    await test("Test 8 — إدخال متأخر يظهر في شهر الحدث لا شهر الإدخال", async () => {
      ok(await api("POST", "/api/disciplinary", {
        employeeId: e1.id, actionDate: "2026-04-10", actionType: "verbal_warning", reason: "تنبيه قديم",
      }), "إنذار قديم");
      const apr = ok(await api("GET", period("2026-04-01", "2026-04-30")));
      assert.equal(apr.disciplinary.verbalWarnings, 1);

      const t = ok(await api("GET", `/api/employees/${e1.id}/timeline`));
      const ev = t.events.find((x) => x.type === "disciplinary");
      assert.equal(ev.date, "2026-04-10", "تاريخ الحدث");
      assert.equal(String(ev.createdAt).slice(0, 4), String(new Date().getFullYear()), "تاريخ الإدخال اليوم");
      assert.notEqual(String(ev.createdAt).slice(0, 10), ev.date);
    });

    /* --------- Test 9: سجل التدقيق --------- */
    await test("Test 9 — التعديل يظهر في سجل التدقيق بقيمة قبل وبعد", async () => {
      ok(await api("PATCH", `/api/employees/${e1.id}`, { mobile: "0559876543" }), "تعديل");
      const log = ok(await api("GET", `/api/audit?employeeId=${e1.id}`));
      const row = log.rows.find((r) => r.action === "update" && r.entity === "employee");
      assert.ok(row, "لا يوجد سطر تعديل");
      const ch = row.changes.find((x) => x.field === "mobile");
      assert.equal(ch.before, "0501234567");
      assert.equal(ch.after, "0559876543");
      assert.equal(row.userName, "مدير النظام");
    });

    await test("سجل التدقيق لا يقبل حذفًا ولا تعديلًا من الواجهة", async () => {
      const r1 = await api("DELETE", "/api/audit");
      const r2 = await api("POST", "/api/audit", {});
      assert.ok([404, 405].includes(r1.status), `DELETE → ${r1.status}`);
      assert.ok([404, 405].includes(r2.status), `POST → ${r2.status}`);
    });

    /* --------- إعادة التوظيف --------- */
    await test("§17 — إعادة التوظيف تفتح فترة جديدة وتُبقي الملف والتاريخ الأصلي", async () => {
      const r = ok(await api("POST", `/api/employees/${e3.id}/rehire`, {
        rehireDate: "2026-11-01", branchId: BR.QRW, jobTitleId: JOB.PAS,
      }), "إعادة توظيف");
      assert.equal(r.periods.length, 2);
      assert.equal(r.periods[0].endDate, "2026-09-30");
      assert.equal(r.periods[1].startDate, "2026-11-01");
      assert.equal(r.periods[1].startReason, "rehire");
      assert.equal(r.employee.originalJoiningDate, "2026-03-01", "تاريخ المباشرة الأصلي كما هو");

      const oct = ok(await api("GET", "/api/reports/headcount?date=2026-10-15"));
      const nov = ok(await api("GET", "/api/reports/headcount?date=2026-11-15"));
      assert.ok(!oct.rows.find((x) => x.id === e3.id), "في أكتوبر خارج الخدمة");
      assert.ok(nov.rows.find((x) => x.id === e3.id), "في نوفمبر على رأس العمل");
      const novRep = ok(await api("GET", period("2026-11-01", "2026-11-30")));
      assert.equal(novRep.movement.rehires, 1);
    });

    /* --------- التقارير --------- */
    await test("التقرير السنوي يعطي جدولًا شهريًا متصلًا", async () => {
      const y = ok(await api("GET", "/api/reports/annual?year=2026"));
      assert.equal(y.months.length, 12);
      for (let i = 1; i < 12; i++) {
        assert.equal(y.months[i].opening, y.months[i - 1].closing,
          `افتتاحي ${y.months[i].label} = ختامي ${y.months[i - 1].label}`);
      }
      assert.equal(y.months[0].opening, y.movement.openingHeadcount);
      assert.equal(y.months[11].closing, y.movement.closingHeadcount);
    });

    await test("تقرير الفروع يعطي صفًّا لكل فرع بالمؤشرات كاملة", async () => {
      const r = ok(await api("GET", "/api/reports/by-dimension?dimension=branch&from=2026-09-01&to=2026-09-30"));
      const swd = r.rows.find((x) => x.id === BR.SWD);
      assert.ok(swd, "لا يوجد صف للسويدي");
      assert.equal(swd.transfersIn, 1);
      const rwd = r.rows.find((x) => x.id === BR.RWD);
      assert.equal(rwd.transfersOut, 1);
    });

    await test("لوحة المعلومات تجمع الحركة والحضور والانضباط والتنبيهات", async () => {
      const d = ok(await api("GET", "/api/reports/dashboard?from=2026-09-01&to=2026-09-30"));
      assert.ok(typeof d.currentActive === "number");
      assert.ok(Array.isArray(d.charts.headcountByBranch));
      assert.ok(Array.isArray(d.charts.monthly) && d.charts.monthly.length >= 6);
      assert.ok(Array.isArray(d.alerts));
    });

    await test("«أكثر فرع غيابًا» و«أكثر قسم تأخيرًا» يُجابان من السجلات", async () => {
      const d = ok(await api("GET", "/api/reports/dashboard?from=2026-09-01&to=2026-09-30"));
      assert.ok(d.charts.absenceByBranch.length >= 1);
      assert.ok(d.charts.lateByDepartment.length >= 1);
      assert.ok(d.charts.lateByDepartment[0].value >= 2);
    });

    /* --------- البحث --------- */
    await test("§5 — البحث بتطابق تام للهوية يعطي الموظف وحده", async () => {
      const r = ok(await api("GET", `/api/employees?q=${e1.nationalId}`));
      assert.equal(r.total, 1);
      assert.equal(r.rows[0].id, e1.id);
      const l = ok(await api("GET", `/api/employees/lookup?employeeNo=${e1.employeeNo}`));
      assert.equal(l.found, true);
      assert.equal(l.employee.id, e1.id);
    });

    await test("البحث المتقدم يجمع الشروط", async () => {
      const r = ok(await api("GET", `/api/employees?branchId=${BR.SWD}&status=active`));
      assert.ok(r.rows.every((x) => x.branch.id === BR.SWD && x.employmentStatus === "active"));
    });

    /* --------- التحقق من صحة البيانات --------- */
    await test("§44 — تاريخ الاستقالة قبل المباشرة مرفوض", async () => {
      const e = await addEmployee({ originalJoiningDate: "2026-05-01" });
      const r = await api("POST", `/api/employees/${e.id}/resignation`,
        { eventDate: "2026-04-01", lastWorkingDate: "2026-04-30" });
      assert.equal(r.status, 400);
      assert.equal(r.json.details.field, "eventDate");
    });

    await test("§44 — نهاية الإجازة قبل بدايتها مرفوضة، والهوية بغير عشرة أرقام مرفوضة", async () => {
      const r1 = await api("POST", "/api/leaves",
        { employeeId: e1.id, leaveTypeId: LEAVE.annual, startDate: "2026-06-10", endDate: "2026-06-01" });
      assert.equal(r1.status, 400);
      const r2 = await api("POST", "/api/employees", {
        employeeNo: "888888", nationalId: "123", fullNameAr: "قصير", originalJoiningDate: "2026-01-01", branchId: BR.RWD,
      });
      assert.equal(r2.status, 400);
      assert.equal(r2.json.details.field, "nationalId");
    });

    await test("الحالات التي لها سجلاتها لا تُضبط يدويًا", async () => {
      const r = await api("PATCH", `/api/employees/${e1.id}`, { employmentStatus: "resigned" });
      assert.equal(r.status, 400);
    });

    /* --------- الصلاحيات --------- */
    let viewerCookie = "";
    await test("مستخدم «مطّلع» لا يضيف موظفًا ولا يرى رقم الهوية كاملًا", async () => {
      ok(await api("POST", "/api/users", {
        username: "viewer1", fullName: "مطّلع", role: "viewer", password: "Viewer-pass-2026",
        mustChangePassword: false,
      }), "إنشاء مستخدم");

      const admin = { cookie, csrf };
      cookie = ""; csrf = "";
      const login = ok(await api("POST", "/api/auth/login", { username: "viewer1", password: "Viewer-pass-2026" }), "دخول المطّلع");
      csrf = login.csrf;
      viewerCookie = cookie;

      const create = await api("POST", "/api/employees", {
        employeeNo: "777777", nationalId: "1777777777", fullNameAr: "من مطّلع",
        originalJoiningDate: "2026-01-01", branchId: BR.RWD,
      });
      assert.equal(create.status, 403);

      const list = ok(await api("GET", "/api/employees"));
      assert.ok(list.rows[0].nationalIdMasked, "رقم الهوية يجب أن يكون مقنَّعًا");
      assert.ok(/•/.test(list.rows[0].nationalId));

      const exp = await api("GET", "/api/export/employees.xlsx");
      assert.equal(exp.status, 403, "التصدير يحتاج صلاحية");

      cookie = admin.cookie; csrf = admin.csrf;
    });

    await test("مدير مقيَّد بفروعه لا يرى غيرها", async () => {
      ok(await api("POST", "/api/users", {
        username: "mgr1", fullName: "مدير السويدي", role: "manager",
        password: "Manager-pass-2026", branchScope: [BR.SWD], mustChangePassword: false,
      }), "إنشاء مدير");
      const admin = { cookie, csrf };
      cookie = ""; csrf = "";
      const login = ok(await api("POST", "/api/auth/login", { username: "mgr1", password: "Manager-pass-2026" }));
      csrf = login.csrf;

      const list = ok(await api("GET", "/api/employees"));
      assert.ok(list.rows.every((r) => r.branch.id === BR.SWD), "لا يرى إلا السويدي");
      const other = await api("GET", `/api/employees/${e1.id}`);
      assert.equal(other.status, 403, "موظف خارج نطاقه");

      cookie = admin.cookie; csrf = admin.csrf;
    });

    /* --------- الاستيراد والتصدير --------- */
    await test("قالب الاستيراد يُبنى ويُقرأ", async () => {
      const r = await api("GET", "/api/import/template.xlsx");
      assert.equal(r.status, 200);
      const X = require("../lib/xlsx");
      const sheets = X.parse(r.buffer);
      assert.equal(sheets[0].name, "Employees");
      assert.ok(sheets[0].rows[0].includes("الرقم الوظيفي"));
    });

    await test("§38 — الاستيراد يفحص قبل الكتابة ويُبلّغ بالسطر", async () => {
      const X = require("../lib/xlsx");
      const buf = X.build([{
        name: "Employees",
        columns: [{ header: "الرقم الوظيفي" }, { header: "رقم الهوية" }, { header: "الاسم" },
          { header: "تاريخ المباشرة" }, { header: "الفرع" }, { header: "القسم" }],
        rows: [
          ["5001", "1500100001", "مستورد أول", "01/02/2026", "الروضة", "التمريض"],
          ["5002", "1500100002", "مستورد ثانٍ", "2026-02-15", "الورود", "التمريض"],
          [e1.employeeNo, "1500100003", "مكرر مع النظام", "2026-02-15", "الروضة", "التمريض"],
          ["5004", "123", "هوية خاطئة", "2026-02-15", "الروضة", "التمريض"],
        ],
      }]);

      const boundary = "----staffTest";
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="emp.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        buf, Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const r = await api("POST", "/api/import/employees/preview", body, {
        raw: true, headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      });
      const j = ok(r, "معاينة الاستيراد");
      assert.equal(j.analysis.summary.total, 4);
      assert.equal(j.analysis.summary.create, 2);
      assert.equal(j.analysis.summary.update, 1, "الموجود يُحدَّث لا يُكرَّر");
      assert.equal(j.analysis.summary.errors, 1);
      assert.equal(j.analysis.rows[3].errors[0].field, "nationalId");
      assert.equal(j.analysis.rows[0].record.originalJoiningDate, "2026-02-01", "DD/MM/YYYY تُفهم");

      const before = ok(await api("GET", "/api/employees?q=5001")).total;
      assert.equal(before, 0, "لم يُكتب شيء في المعاينة");

      const commit = ok(await api("POST", "/api/import/employees/commit", {
        rows: j.rows, mapping: j.mapping, options: { stopOnError: false },
      }), "تنفيذ الاستيراد");
      assert.equal(commit.created, 2);
      assert.equal(commit.updated, 1);
      assert.equal(commit.failed.length, 1);
      assert.equal(ok(await api("GET", "/api/employees?q=5001")).total, 1);
    });

    await test("§37 — تصدير العرض الحالي يحترم المرشّحات", async () => {
      const X = require("../lib/xlsx");
      const r = await api("GET", `/api/export/employees.xlsx?branchId=${BR.SWD}`);
      assert.equal(r.status, 200);
      assert.ok(/attachment/.test(r.headers.get("content-disposition") || ""));
      const sheets = X.parse(r.buffer);
      const rows = sheets[0].rows.slice(1);
      const list = ok(await api("GET", `/api/employees?branchId=${BR.SWD}`));
      assert.equal(rows.length, list.total);
    });

    await test("تصدير التقرير يحوي الملخص والجدول الشهري وحسب الفرع", async () => {
      const X = require("../lib/xlsx");
      const r = await api("GET", "/api/export/report.xlsx?from=2026-01-01&to=2026-12-31");
      const sheets = X.parse(r.buffer);
      assert.equal(sheets.length, 4);
      assert.equal(sheets[1].rows.length, 13, "١٢ شهرًا وسطر عناوين");
    });

    /* --------- المرفقات --------- */
    await test("§25 — المرفق يُرفع ويُنزَّل بمسار محمي، والنوع الخطر مرفوض", async () => {
      const boundary = "----staffAtt";
      const mk = (name, data, extra = "") => Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`),
        Buffer.from(data), Buffer.from(`\r\n${extra}--${boundary}--\r\n`),
      ]);
      const field = (k, v) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;

      const body = Buffer.concat([
        Buffer.from(field("employeeId", e1.id) + field("refType", "employee")),
        mk("خطاب.pdf", "%PDF-1.4 test"),
      ]);
      const up = ok(await api("POST", "/api/attachments", body, {
        raw: true, headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      }), "رفع مرفق");
      assert.equal(up.fileName, "خطاب.pdf");

      const dl = await api("GET", `/api/attachments/${up.id}/download`);
      assert.equal(dl.status, 200);
      assert.ok(dl.buffer.toString().startsWith("%PDF"));

      const bad = await api("POST", "/api/attachments", mk("shell.exe", "MZ"), {
        raw: true, headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      });
      assert.equal(bad.status, 400);
      assert.equal(bad.json.code, "bad_file_type");
    });

    /* --------- القوائم --------- */
    await test("§8 — الفرع ذو البيانات التاريخية لا يُحذف بل يُعطَّل", async () => {
      const r = await api("DELETE", `/api/lookups/branches/${BR.RWD}`);
      assert.equal(r.status, 409);
      assert.equal(r.json.code, "lookup_in_use");
      const off = ok(await api("PATCH", `/api/lookups/branches/${BR.RWD}`, { isActive: false }));
      assert.equal(off.isActive, false);
      ok(await api("PATCH", `/api/lookups/branches/${BR.RWD}`, { isActive: true }));

      const nw = ok(await api("POST", "/api/lookups/branches", { nameAr: "فرع تجريبي", nameEn: "Test Branch", code: "TST" }));
      ok(await api("DELETE", `/api/lookups/branches/${nw.id}`), "حذف فرع بلا بيانات");
    });

    /* --------- النسخ الاحتياطي --------- */
    await test("§43 — النسخة الاحتياطية تُؤخذ وتظهر في القائمة وتُنزَّل", async () => {
      const b = ok(await api("POST", "/api/backups", {}), "نسخة");
      assert.ok(b.size > 1000);
      const list = ok(await api("GET", "/api/backups"));
      assert.ok(list.rows.find((r) => r.file === b.file));
      const dl = await api("GET", `/api/backups/${b.file}`);
      assert.equal(dl.status, 200);
      assert.equal(dl.buffer.slice(0, 15).toString(), "SQLite format 3");
    });

    await test("النسخة الاحتياطية قاعدة كاملة تُقرأ وحدها", async () => {
      const list = ok(await api("GET", "/api/backups"));
      const file = path.join(BACKUPS, list.rows[0].file);
      const { DatabaseSync } = require("node:sqlite");
      const copy = new DatabaseSync(file);
      const n = copy.prepare("SELECT COUNT(*) AS c FROM employees").get().c;
      copy.close();
      assert.ok(n >= 5, `عدد الموظفين في النسخة: ${n}`);
    });

    /* --------- الجلسة --------- */
    await test("الخروج يُبطل الجلسة فورًا", async () => {
      const keep = { cookie, csrf };
      ok(await api("POST", "/api/auth/logout", {}));
      const after = await api("GET", "/api/employees", undefined, { headers: { Cookie: keep.cookie } });
      assert.equal(after.status, 401);
      cookie = ""; csrf = "";
      const login = ok(await api("POST", "/api/auth/login", { username: "admin", password: ADMIN_PASSWORD }));
      csrf = login.csrf;
    });

    await test("سجل الدخول يحفظ المحاولات الناجحة والفاشلة", async () => {
      const log = ok(await api("GET", "/api/login-log"));
      assert.ok(log.rows.some((r) => r.success === false));
      assert.ok(log.rows.some((r) => r.success === true));
    });

    await test("حقن SQL في البحث لا يكسر شيئًا", async () => {
      const r = ok(await api("GET", `/api/employees?q=${encodeURIComponent("'; DROP TABLE employees; --")}`));
      assert.equal(r.total, 0);
      const still = ok(await api("GET", "/api/employees"));
      assert.ok(still.total > 0, "الجدول ما زال موجودًا");
    });

    await test("الحذف النهائي يحتاج سببًا ويُسجَّل بنسخة كاملة", async () => {
      const victim = await addEmployee({ fullNameAr: "للحذف" });
      const noReason = await api("DELETE", `/api/employees/${victim.id}`, {});
      assert.equal(noReason.status, 400);
      ok(await api("DELETE", `/api/employees/${victim.id}`, { reason: "أُدخل بالخطأ مرتين" }), "حذف");
      const log = ok(await api("GET", `/api/audit?employeeId=${victim.id}`));
      const row = log.rows.find((r) => r.action === "delete");
      assert.ok(row, "لا يوجد سطر حذف في التدقيق");
      assert.ok(row.summary.includes("أُدخل بالخطأ"));
    });
  } finally {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* مؤقت */ }
    try { fs.rmSync(BACKUPS, { recursive: true, force: true }); } catch { /* مؤقت */ }
  }

  console.log("\n" + results.join("\n"));
  console.log(`\n  ${pass} ناجح · ${fail} فاشل\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
