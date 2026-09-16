/* ======================================================================
   تاريخ الموظف — الفترات والإسنادات والحالات
   ----------------------------------------------------------------------
   هنا يُحفظ المبدأ الذي يقوم عليه النظام كله: **لا شيء يُستبدل**.
   نقل الموظف لا يُعدّل فرعه، بل يُغلق إسنادًا ويفتح آخر. والاستقالة لا
   تمحو شيئًا، بل تُغلق فترة التوظيف وتفتح حالة جديدة بتاريخها.

   وحقول الفرع والقسم والمسمى في جدول employees ليست مصدر الحقيقة، بل
   **لقطة محسوبة** من هذا التاريخ تُسرّع البحث — تُعاد حسابها كلما تغيّر
   التاريخ، ومرة كل يوم ليُطبَّق ما كان مؤجَّلًا لتاريخ قادم.
   ====================================================================== */

"use strict";

const { uuid, nowIso, today } = require("./db");
const D = require("./dates");

/* ------------------------------------------------------------- الفترات */

function currentPeriod(db, employeeId) {
  return db.get(
    `SELECT * FROM employment_periods WHERE employee_id = :e
     ORDER BY (end_date IS NULL) DESC, start_date DESC, seq DESC LIMIT 1`,
    { e: employeeId }
  );
}

function openPeriod(db, ctx, { employeeId, startDate, reason }) {
  const prev = db.get("SELECT MAX(seq) AS m FROM employment_periods WHERE employee_id = :e", { e: employeeId });
  const seq = (prev && prev.m ? prev.m : 0) + 1;
  const id = uuid();
  const t = nowIso();
  db.run(
    `INSERT INTO employment_periods(id, employee_id, seq, start_date, start_reason, created_at, created_by, updated_at, updated_by)
     VALUES(:id, :e, :seq, :s, :r, :t, :u, :t, :u)`,
    { id, e: employeeId, seq, s: startDate, r: reason || (seq === 1 ? "hire" : "rehire"), t, u: userId(ctx) }
  );
  return db.get("SELECT * FROM employment_periods WHERE id = :id", { id });
}

function closePeriod(db, ctx, { periodId, endDate, kind, reason }) {
  db.run(
    `UPDATE employment_periods SET end_date = :d, end_kind = :k, end_reason = :r, updated_at = :t, updated_by = :u
     WHERE id = :id`,
    { d: endDate, k: kind, r: reason || null, t: nowIso(), u: userId(ctx), id: periodId }
  );
}

const userId = (ctx) => (ctx && ctx.user && ctx.user.id) || null;

/* ---------------------------------------------------------- الإسنادات */

/* الإسناد الساري في تاريخ معيّن — هذا ما تعتمد عليه التقارير التاريخية */
function assignmentAsOf(db, employeeId, date) {
  return db.get(
    `SELECT * FROM assignments
     WHERE employee_id = :e AND effective_from <= :d AND (effective_to IS NULL OR effective_to >= :d)
     ORDER BY effective_from DESC, created_at DESC LIMIT 1`,
    { e: employeeId, d: date }
  );
}

function latestAssignment(db, employeeId) {
  return db.get(
    `SELECT * FROM assignments WHERE employee_id = :e ORDER BY effective_from DESC, created_at DESC LIMIT 1`,
    { e: employeeId }
  );
}

/* فتح إسناد جديد من تاريخ، وإغلاق ما قبله في اليوم السابق له.
   الفترات متلاصقة ولا تتداخل، فلكل يوم إسناد واحد لا غير. */
function openAssignment(db, ctx, a) {
  const from = a.effectiveFrom;
  const prev = db.get(
    `SELECT * FROM assignments WHERE employee_id = :e AND effective_from <= :d
     ORDER BY effective_from DESC, created_at DESC LIMIT 1`,
    { e: a.employeeId, d: from }
  );
  if (prev && (prev.effective_to === null || prev.effective_to >= from)) {
    const to = D.addDays(from, -1);
    if (D.cmp(to, prev.effective_from) < 0) {
      // إسنادان في اليوم نفسه: الأخير يحلّ محلّ الأول بدل أن يُنشأ فراغ
      db.run("DELETE FROM assignments WHERE id = :id", { id: prev.id });
    } else {
      db.run("UPDATE assignments SET effective_to = :to WHERE id = :id", { to, id: prev.id });
    }
  }
  // إسناد لاحق موجود (إدخال بأثر رجعي): يُغلق الجديد قبل بدايته
  const next = db.get(
    `SELECT * FROM assignments WHERE employee_id = :e AND effective_from > :d
     ORDER BY effective_from ASC LIMIT 1`,
    { e: a.employeeId, d: from }
  );
  const id = uuid();
  db.run(
    `INSERT INTO assignments(id, employee_id, period_id, branch_id, department_id, job_title_id,
                             manager_id, employment_type, effective_from, effective_to, reason,
                             ref_type, ref_id, created_at, created_by)
     VALUES(:id, :e, :p, :b, :dep, :j, :m, :et, :from, :to, :reason, :rt, :ri, :t, :u)`,
    {
      id, e: a.employeeId, p: a.periodId || null, b: a.branchId || null, dep: a.departmentId || null,
      j: a.jobTitleId || null, m: a.managerId || null, et: a.employmentType || null,
      from, to: next ? D.addDays(next.effective_from, -1) : null,
      reason: a.reason || null, rt: a.refType || null, ri: a.refId || null,
      t: nowIso(), u: userId(ctx),
    }
  );
  return db.get("SELECT * FROM assignments WHERE id = :id", { id });
}

/* تصحيح الإسناد الحالي دون إنشاء نقل — لخطأ إدخال لا لحركة حقيقية.
   يبقى أثره في سجل التدقيق. */
function correctCurrentAssignment(db, ctx, employeeId, patch) {
  const cur = latestAssignment(db, employeeId);
  if (!cur) return null;
  const next = {
    b: "branchId" in patch ? patch.branchId : cur.branch_id,
    dep: "departmentId" in patch ? patch.departmentId : cur.department_id,
    j: "jobTitleId" in patch ? patch.jobTitleId : cur.job_title_id,
    m: "managerId" in patch ? patch.managerId : cur.manager_id,
    et: "employmentType" in patch ? patch.employmentType : cur.employment_type,
  };
  db.run(
    `UPDATE assignments SET branch_id = :b, department_id = :dep, job_title_id = :j,
            manager_id = :m, employment_type = :et WHERE id = :id`,
    Object.assign({ id: cur.id }, next)
  );
  return cur;
}

/* ------------------------------------------------------------ الحالات */

function setStatus(db, ctx, { employeeId, status, from, reason, refType, refId }) {
  const prev = db.get(
    `SELECT * FROM status_history WHERE employee_id = :e AND effective_to IS NULL
     ORDER BY effective_from DESC LIMIT 1`, { e: employeeId }
  );
  let to = null;
  if (prev) {
    if (prev.status === status && prev.effective_from === from) return prev;
    const c = D.cmp(prev.effective_from, from);
    if (c > 0) {
      // الحالة الجديدة أسبق من القائمة (إدخال بأثر رجعي): تُغلق قبلها ولا تُلغيها
      to = D.addDays(prev.effective_from, -1);
    } else if (c === 0) {
      // تغييران في اليوم نفسه: الثاني تصحيح للأول لا حالة تسبقه بيوم،
      // فلو أُغلق الأول بتاريخ يومه لبقي «ساريًا» في استعلامات ذلك اليوم
      db.run("DELETE FROM status_history WHERE id = :id", { id: prev.id });
    } else {
      db.run("UPDATE status_history SET effective_to = :to WHERE id = :id",
        { to: D.addDays(from, -1), id: prev.id });
    }
  }
  const id = uuid();
  db.run(
    `INSERT INTO status_history(id, employee_id, status, effective_from, effective_to, reason, ref_type, ref_id, created_at, created_by)
     VALUES(:id, :e, :s, :from, :to, :r, :rt, :ri, :t, :u)`,
    { id, e: employeeId, s: status, from, to, r: reason || null, rt: refType || null, ri: refId || null,
      t: nowIso(), u: userId(ctx) }
  );
  return db.get("SELECT * FROM status_history WHERE id = :id", { id });
}

function statusAsOf(db, employeeId, date) {
  const row = db.get(
    `SELECT * FROM status_history WHERE employee_id = :e AND effective_from <= :d
     ORDER BY effective_from DESC, created_at DESC LIMIT 1`, { e: employeeId, d: date }
  );
  return row ? row.status : null;
}

/* ------------------------------------------------------ اللقطة الحالية

   تُشتق الحالة من السجلات لا من إدخال يدوي:
     · انتهت الفترة ومضى آخر يوم عمل      → resigned / terminated / retired
     · سُجِّلت استقالة وحلّ تاريخها        → resigned (وإن بقي يعمل حتى آخر يوم)
     · إجازة معتمدة تغطّي اليوم            → on_leave
     · خلاف ذلك                            → active، أو ما ضُبط يدويًا (suspended…)
*/
const SEP_STATUS = { resignation: "resigned", termination: "terminated", retirement: "retired" };

function computeStatus(db, employeeId, at) {
  const day = at || today();
  const period = currentPeriod(db, employeeId);
  if (!period) return "active";

  if (period.end_date && D.cmp(day, period.end_date) > 0) {
    return SEP_STATUS[period.end_kind] || "terminated";
  }

  const sep = db.get(
    `SELECT * FROM separations WHERE employee_id = :e AND event_date <= :d
     ORDER BY event_date DESC, created_at DESC LIMIT 1`, { e: employeeId, d: day }
  );
  if (sep && (!period.end_date || sep.last_working_date >= day) && period.id === sep.period_id) {
    return SEP_STATUS[sep.kind] || "resigned";
  }

  const manual = db.get(
    `SELECT * FROM status_history WHERE employee_id = :e AND effective_from <= :d
       AND status IN ('suspended','transferred')
       AND (effective_to IS NULL OR effective_to >= :d)
     ORDER BY effective_from DESC LIMIT 1`, { e: employeeId, d: day }
  );
  if (manual) return manual.status;

  const onLeave = db.get(
    `SELECT id FROM leaves WHERE employee_id = :e AND approval_status = 'approved'
       AND start_date <= :d AND end_date >= :d LIMIT 1`, { e: employeeId, d: day }
  );
  if (onLeave) return "on_leave";

  return "active";
}

/* إعادة حساب حقول employees من التاريخ. تُنادى بعد كل تغيير، ومرة كل يوم
   لتُطبَّق الحركات المؤجَّلة لتاريخ حلّ اليوم (نقل مسجَّل مسبقًا مثلًا). */
function refreshSnapshot(db, ctx, employeeId) {
  const day = today();
  const asg = assignmentAsOf(db, employeeId, day) || latestAssignment(db, employeeId);
  const status = computeStatus(db, employeeId, day);

  const branchStart = asg ? firstOfRun(db, employeeId, asg, "branch_id") : null;
  const posStart = asg ? firstOfRun(db, employeeId, asg, "job_title_id") : null;

  db.run(
    `UPDATE employees SET branch_id = :b, department_id = :dep, job_title_id = :j, manager_id = :m,
            employment_type = COALESCE(:et, employment_type), employment_status = :s,
            branch_start_date = :bs, position_start_date = :ps
     WHERE id = :id`,
    {
      b: asg ? asg.branch_id : null, dep: asg ? asg.department_id : null,
      j: asg ? asg.job_title_id : null, m: asg ? asg.manager_id : null,
      et: asg ? asg.employment_type : null, s: status,
      bs: branchStart, ps: posStart, id: employeeId,
    }
  );

  const current = db.get("SELECT status FROM status_history WHERE employee_id = :e AND effective_to IS NULL ORDER BY effective_from DESC LIMIT 1", { e: employeeId });
  if (!current || current.status !== status) {
    setStatus(db, ctx, { employeeId, status, from: day, reason: "محسوبة من السجلات" });
  }
  return status;
}

/* بداية آخر تتابع لنفس القيمة: «منذ متى وهو في هذا الفرع» */
function firstOfRun(db, employeeId, asg, field) {
  const rows = db.all(
    `SELECT effective_from, ${field} AS v FROM assignments WHERE employee_id = :e
     ORDER BY effective_from DESC, created_at DESC`, { e: employeeId }
  );
  let start = asg.effective_from;
  let seen = false;
  for (const r of rows) {
    if (!seen) {
      if (r.effective_from === asg.effective_from) seen = true;
      else continue;
    }
    if (String(r.v) === String(asg[field])) start = r.effective_from;
    else break;
  }
  return start;
}

function refreshAll(db) {
  const rows = db.all("SELECT id FROM employees");
  db.tx(() => { for (const r of rows) refreshSnapshot(db, null, r.id); });
  return rows.length;
}

module.exports = {
  currentPeriod, openPeriod, closePeriod,
  assignmentAsOf, latestAssignment, openAssignment, correctCurrentAssignment,
  setStatus, statusAsOf, computeStatus, refreshSnapshot, refreshAll, SEP_STATUS,
};
