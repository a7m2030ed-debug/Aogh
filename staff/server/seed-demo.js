#!/usr/bin/env node
/* ======================================================================
   بيانات تجريبية — لتجربة الواجهة والتقارير قبل إدخال البيانات الحقيقية
   ----------------------------------------------------------------------
   التشغيل:  node seed-demo.js            (يضيف إلى القاعدة الحالية)
             node seed-demo.js --reset    (يمسح البيانات أولًا)

   لا تُشغَّل على قاعدة فيها بيانات حقيقية.
   ====================================================================== */

"use strict";

const path = require("node:path");
const CONFIG = require("./config");
const DB = require("./lib/db");
const EMP = require("./lib/employees");
const MOV = require("./lib/movements");
const ATT = require("./lib/attendance");
const LV = require("./lib/leaves");
const DIS = require("./lib/discipline");
const D = require("./lib/dates");

const config = CONFIG.build(__dirname);
const db = DB.open(config);
const ctx = { user: { id: null, fullName: "بيانات تجريبية", role: "super_admin" }, permissions: [], ip: "seed" };

const NAMES_M = ["أحمد محمد", "سالم عبدالله", "فهد ناصر", "خالد سعد", "عمر يوسف", "ماجد صالح",
  "بندر علي", "طارق حسن", "زياد إبراهيم", "راكان مشعل", "نواف فيصل", "سلطان راشد"];
const NAMES_F = ["نورة سعود", "ريم عبدالعزيز", "سارة خالد", "مها فهد", "لمى تركي", "هند وليد",
  "شهد ماجد", "دانة سامي", "أمل بدر", "جواهر منصور"];
const NAT = ["سعودي", "سعودي", "سعودي", "مصري", "هندي", "فلبيني", "سوداني", "أردني"];

const pick = (a, i) => a[i % a.length];
const rnd = (n) => Math.floor(Math.random() * n);

function reset() {
  for (const t of ["attendance", "leaves", "disciplinary_actions", "corrective_actions", "separations",
    "transfers", "assignments", "status_history", "employment_periods", "attachments", "employees", "audit_logs"]) {
    db.run(`DELETE FROM ${t}`);
  }
  console.log("  مُسحت البيانات السابقة");
}

function main() {
  if (process.argv.includes("--reset")) reset();

  const branches = db.all("SELECT id, code FROM branches ORDER BY id");
  const departments = db.all("SELECT id, code FROM departments ORDER BY id");
  const titles = db.all("SELECT id, code FROM job_titles ORDER BY id");
  const leaveTypes = Object.fromEntries(db.all("SELECT id, code FROM leave_types").map((r) => [r.code, r.id]));
  const year = Number(DB.today().slice(0, 4));

  const made = [];
  let no = 1001;
  for (let i = 0; i < 46; i++) {
    const female = i % 3 === 2;
    const name = female ? pick(NAMES_F, i) : pick(NAMES_M, i);
    const joinMonth = i < 30 ? 1 : 1 + rnd(8);         // ثلثاهم من بداية السنة
    const joinYear = i < 22 ? year - 1 - rnd(3) : year;
    const joining = `${joinYear}-${String(joinMonth).padStart(2, "0")}-${String(1 + rnd(27)).padStart(2, "0")}`;
    try {
      const e = EMP.create(db, ctx, {
        employeeNo: String(no++),
        nationalId: String(1000000000 + i * 7919 + 13),
        fullNameAr: `${name} ${pick(["الحربي", "القحطاني", "الدوسري", "العتيبي", "الشمري", "الزهراني"], i)}`,
        fullNameEn: `Employee ${i + 1}`,
        gender: female ? "female" : "male",
        mobile: "05" + String(10000000 + rnd(89999999)),
        email: `emp${i + 1}@clinic.example`,
        dob: `${1980 + rnd(20)}-${String(1 + rnd(12)).padStart(2, "0")}-${String(1 + rnd(27)).padStart(2, "0")}`,
        nationality: pick(NAT, i),
        originalJoiningDate: joining,
        branchId: pick(branches, i).id,
        departmentId: pick(departments, i * 3 + 1).id,
        jobTitleId: pick(titles, i * 5).id,
        employmentType: i % 9 === 0 ? "part_time" : i % 13 === 0 ? "contract" : "full_time",
      });
      made.push(e);
    } catch (err) {
      console.error("  تعذّر إنشاء موظف:", err.message);
    }
  }
  console.log(`  ${made.length} موظفًا`);

  /* نقل بين الفروع */
  let transfers = 0;
  for (let i = 0; i < made.length; i += 7) {
    const e = made[i];
    const to = branches[(i + 2) % branches.length];
    const date = `${year}-0${1 + (i % 8)}-15`.replace(/-0(\d\d)-/, "-$1-");
    if (D.cmp(date, e.originalJoiningDate) <= 0) continue;
    try {
      MOV.transfer(db, ctx, e.id, {
        transferDate: date, toBranchId: to.id, reason: "إعادة توزيع الكادر", approvedBy: "إدارة العمليات",
      });
      transfers++;
    } catch { /* نفس الفرع أو تاريخ غير صالح */ }
  }
  console.log(`  ${transfers} حركة نقل`);

  /* استقالات وإنهاء خدمة */
  let seps = 0;
  for (let i = 3; i < made.length; i += 11) {
    const e = made[i];
    const month = 2 + (i % 7);
    const eventDate = `${year}-${String(month).padStart(2, "0")}-${String(5 + rnd(20)).padStart(2, "0")}`;
    if (D.cmp(eventDate, e.originalJoiningDate) <= 0) continue;
    const lwd = D.addDays(eventDate, 30);
    if (D.cmp(lwd, DB.today()) > 0) continue;
    try {
      MOV.separate(db, ctx, e.id, i % 22 === 3 ? "termination" : "resignation", {
        eventDate, lastWorkingDate: lwd,
        subType: i % 22 === 3 ? "إنهاء في فترة التجربة" : "استقالة بإشعار",
        reason: i % 22 === 3 ? "عدم اجتياز فترة التجربة" : "فرصة وظيفية أخرى",
        noticePeriodDays: 30, approvedBy: "مدير الموارد البشرية",
      });
      seps++;
    } catch { /* فترة مغلقة */ }
  }
  console.log(`  ${seps} نهاية خدمة`);

  /* إعادة توظيف واحد */
  const rehired = made.find((e) => {
    const p = db.get("SELECT * FROM employment_periods WHERE employee_id = :e ORDER BY seq DESC LIMIT 1", { e: e.id });
    return p && p.end_date && D.cmp(D.addDays(p.end_date, 20), DB.today()) < 0;
  });
  if (rehired) {
    const p = db.get("SELECT * FROM employment_periods WHERE employee_id = :e ORDER BY seq DESC LIMIT 1", { e: rehired.id });
    try {
      MOV.rehire(db, ctx, rehired.id, { rehireDate: D.addDays(p.end_date, 20), branchId: branches[0].id });
      console.log("  إعادة توظيف واحدة");
    } catch (e) { /* التاريخ غير مناسب */ }
  }

  /* حضور وغياب وتأخير على مدى الستين يومًا الماضية */
  let att = 0;
  const today = DB.today();
  for (let d = 60; d >= 1; d--) {
    const date = D.addDays(today, -d);
    const dow = new Date(date + "T00:00:00Z").getUTCDay();
    if (dow === 5 || dow === 6) continue;            // الجمعة والسبت
    for (const e of made) {
      const r = Math.random();
      let payload = null;
      if (r < 0.035) payload = { status: "absent", approved: Math.random() < 0.4, reason: "بلا إشعار" };
      else if (r < 0.10) {
        const late = 5 + rnd(50);
        payload = { status: "late", scheduledTime: "08:00",
          checkIn: `08:${String(Math.min(late, 59)).padStart(2, "0")}`, reason: "زحام الطريق" };
      } else if (r < 0.14) payload = null;           // بلا سجل
      else payload = { status: "present", scheduledTime: "08:00", checkIn: "07:5" + rnd(9), checkOut: "16:0" + rnd(9) };
      if (!payload) continue;
      try {
        ATT.create(db, ctx, Object.assign({ employeeId: e.id, date }, payload), { upsert: true });
        att++;
      } catch { /* خارج فترة العمل */ }
    }
  }
  console.log(`  ${att} سجل حضور`);

  /* إجازات */
  let lv = 0;
  for (let i = 0; i < made.length; i += 3) {
    const e = made[i];
    const code = i % 2 ? "sick" : "annual";
    // بعضها في الشهر الجاري وبعضها قادم، ليظهر أثرها في لوحة اليوم
    const start = i % 3 === 0 ? D.addDays(today, -rnd(12)) : D.addDays(today, -(10 + rnd(120)));
    const days = code === "sick" ? 1 + rnd(3) : 3 + rnd(10);
    try {
      LV.create(db, ctx, {
        employeeId: e.id, leaveTypeId: leaveTypes[code],
        startDate: start, endDate: D.addDays(start, days - 1),
        approvalStatus: i % 9 === 0 ? "pending" : "approved",
        medicalCertificate: code === "sick",
        reason: code === "sick" ? "وعكة صحية" : "إجازة سنوية",
      });
      lv++;
    } catch { /* تداخل أو خارج الفترة */ }
  }
  console.log(`  ${lv} إجازة`);

  /* إجراءات انضباطية وتصحيحية */
  let dis = 0;
  for (let i = 2; i < made.length; i += 6) {
    const e = made[i];
    const date = D.addDays(today, -(20 + rnd(150)));
    try {
      DIS.createAction(db, ctx, {
        employeeId: e.id, actionDate: date,
        actionType: i % 12 === 2 ? "final_warning" : i % 4 === 0 ? "verbal_warning" : "warning_letter",
        reason: "تكرار التأخير", description: "بعد تنبيه شفهي سابق",
        actionTaken: "خصم يوم", issuedBy: "مدير الفرع",
      });
      dis++;
    } catch { /* خارج فترة العمل */ }
  }
  let ca = 0;
  for (let i = 1; i < made.length; i += 9) {
    const e = made[i];
    const opened = D.addDays(today, -(10 + rnd(60)));
    const closed = i % 3 === 1;
    try {
      DIS.createCorrective(db, ctx, {
        employeeId: e.id, dateOpened: opened, dueDate: D.addDays(opened, 14),
        reason: "أخطاء في إدخال بيانات المرضى", correctiveAction: "إعادة تدريب على النظام",
        responsiblePerson: "مشرف القسم",
        status: closed ? "closed" : i % 2 ? "in_progress" : "open",
        dateClosed: closed ? D.addDays(opened, 10) : null,
        closureNotes: closed ? "حضر التدريب واجتاز الاختبار" : null,
      });
      ca++;
    } catch { /* خارج فترة العمل */ }
  }
  console.log(`  ${dis} إجراء انضباطي · ${ca} إجراء تصحيحي`);

  const active = db.get("SELECT COUNT(*) AS c FROM employees WHERE employment_status = 'active'").c;
  console.log(`\n  تمّ. على رأس العمل الآن: ${active}\n`);
  db.close();
}

main();
