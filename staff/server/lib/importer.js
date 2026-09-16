/* ======================================================================
   الاستيراد من إكسل
   ----------------------------------------------------------------------
   المسار خطوتان لا خطوة: **معاينة** تُظهر كل خطأ بسطره قبل أن يُكتب أي
   شيء، ثم **تنفيذ** بعد رضا المستخدم. والتنفيذ في معاملة واحدة: إما أن
   يدخل الملف كله أو لا يدخل منه شيء، فلا يبقى نصف استيراد.
   ====================================================================== */

"use strict";

const X = require("./xlsx");
const D = require("./dates");
const V = require("./validate");
const EMP = require("./employees");
const { bad } = require("./http");
const { nowIso } = require("./db");
const audit = require("./audit");

/* الحقول وأسماء أعمدتها المحتملة — بالعربية والإنجليزية */
const FIELDS = [
  { key: "employeeNo", label: "الرقم الوظيفي", labelEn: "Employee ID", required: true,
    aliases: ["employee id", "employee no", "emp id", "empno", "staff id", "الرقم الوظيفي", "رقم الموظف"] },
  { key: "nationalId", label: "رقم الهوية", labelEn: "National ID", required: true,
    aliases: ["national id", "iqama", "id number", "nid", "رقم الهوية", "الهوية", "رقم الاقامة", "رقم الإقامة"] },
  { key: "fullNameAr", label: "الاسم", labelEn: "Name", required: true,
    aliases: ["name", "full name", "employee name", "arabic name", "الاسم", "اسم الموظف", "الاسم بالعربي"] },
  { key: "fullNameEn", label: "الاسم بالإنجليزية", labelEn: "English Name",
    aliases: ["english name", "name en", "الاسم بالانجليزي", "الاسم بالإنجليزية"] },
  { key: "gender", label: "الجنس", labelEn: "Gender", aliases: ["gender", "sex", "الجنس"] },
  { key: "mobile", label: "الجوال", labelEn: "Mobile", aliases: ["mobile", "phone", "cell", "الجوال", "الهاتف"] },
  { key: "email", label: "البريد", labelEn: "Email", aliases: ["email", "e-mail", "mail", "البريد", "الايميل", "البريد الإلكتروني"] },
  { key: "dob", label: "تاريخ الميلاد", labelEn: "Date of Birth",
    aliases: ["dob", "date of birth", "birth date", "تاريخ الميلاد", "الميلاد"] },
  { key: "nationality", label: "الجنسية", labelEn: "Nationality", aliases: ["nationality", "الجنسية"] },
  { key: "originalJoiningDate", label: "تاريخ المباشرة", labelEn: "Joining Date", required: true,
    aliases: ["joining date", "hire date", "date of joining", "doj", "start date", "تاريخ المباشرة", "تاريخ التعيين", "تاريخ الالتحاق"] },
  { key: "branch", label: "الفرع", labelEn: "Branch", required: true,
    aliases: ["branch", "site", "location", "center", "الفرع", "المركز"] },
  { key: "department", label: "القسم", labelEn: "Department",
    aliases: ["department", "dept", "القسم", "الإدارة"] },
  { key: "jobTitle", label: "المسمى الوظيفي", labelEn: "Job Title",
    aliases: ["job title", "position", "designation", "title", "المسمى", "المسمى الوظيفي", "الوظيفة"] },
  { key: "employmentType", label: "نوع التوظيف", labelEn: "Employment Type",
    aliases: ["employment type", "contract type", "type", "نوع التوظيف", "نوع العقد"] },
  { key: "employeeCategory", label: "فئة الموظف", labelEn: "Employee Category",
    aliases: ["category", "employee category", "الفئة", "فئة الموظف"] },
  { key: "managerNo", label: "الرقم الوظيفي للمدير", labelEn: "Manager Employee ID",
    aliases: ["manager", "direct manager", "manager id", "supervisor", "المدير", "المدير المباشر"] },
  { key: "status", label: "الحالة", labelEn: "Status", aliases: ["status", "employment status", "الحالة"] },
  { key: "notes", label: "ملاحظات", labelEn: "Notes", aliases: ["notes", "remarks", "ملاحظات"] },
];

const TYPE_WORDS = {
  full_time: ["full time", "fulltime", "full-time", "دوام كامل", "كامل"],
  part_time: ["part time", "parttime", "part-time", "دوام جزئي", "جزئي"],
  contract: ["contract", "عقد", "متعاقد"],
  temporary: ["temporary", "temp", "مؤقت"],
  intern: ["intern", "internship", "متدرب", "تدريب"],
  locum: ["locum", "زائر", "بديل"],
};
const GENDER_WORDS = { male: ["male", "m", "ذكر"], female: ["female", "f", "أنثى", "انثى"] };

const norm = (s) => String(s === null || s === undefined ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");

/* ------------------------------------------------- قراءة الملف والربط */

function parseUpload(buffer, filename) {
  const name = String(filename || "").toLowerCase();
  let rows;
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    rows = X.parseCsv(buffer.toString("utf8"));
  } else {
    const sheets = X.parse(buffer);
    if (!sheets.length) throw bad("لم يُعثر على أي ورقة في الملف");
    // ورقة الموظفين: أكثر ورقة تطابق عناوينها حقولنا
    let best = sheets[0], bestScore = -1;
    for (const s of sheets) {
      const h = detectHeader(s.rows);
      const score = h ? h.score : -1;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    rows = best.rows;
  }
  const head = detectHeader(rows);
  if (!head) throw bad("لم يُعثر على سطر العناوين في الملف. تأكد أن الملف يحوي أعمدة مثل «الرقم الوظيفي» و«الاسم».");
  return {
    headerRow: head.index,
    header: (rows[head.index] || []).map((c) => (c === null || c === undefined ? "" : String(c))),
    rows: rows.slice(head.index + 1).filter((r) => r && r.some((c) => c !== null && c !== undefined && String(c).trim() !== "")),
    mapping: suggestMapping(rows[head.index] || []),
  };
}

/* سطر العناوين ليس بالضرورة الأول: التصدير كثيرًا ما يسبقه عنوان وتاريخ */
function detectHeader(rows) {
  let best = null;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] || [];
    let score = 0;
    for (const cell of row) {
      const n = norm(cell);
      if (!n) continue;
      if (FIELDS.some((f) => f.aliases.includes(n) || norm(f.label) === n || norm(f.labelEn) === n)) score++;
    }
    if (score >= 2 && (!best || score > best.score)) best = { index: i, score };
  }
  return best;
}

function suggestMapping(header) {
  const map = {};
  (header || []).forEach((cell, i) => {
    const n = norm(cell);
    if (!n) return;
    for (const f of FIELDS) {
      if (map[f.key] !== undefined) continue;
      if (f.aliases.includes(n) || norm(f.label) === n || norm(f.labelEn) === n) { map[f.key] = i; return; }
    }
  });
  return map;
}

/* ------------------------------------------------------- الفحص والتنفيذ */

function lookupByName(db, table, value) {
  if (!value) return null;
  const v = String(value).trim();
  return db.get(
    `SELECT id FROM ${table} WHERE lower(code) = lower(:v) OR lower(name_ar) = lower(:v) OR lower(name_en) = lower(:v) LIMIT 1`,
    { v }
  );
}

function matchWord(dict, value) {
  const n = norm(value);
  if (!n) return null;
  for (const [key, words] of Object.entries(dict)) {
    if (key === n || words.includes(n)) return key;
  }
  return null;
}

/* فحص الملف كله: صفًّا صفًّا، بلا كتابة */
function analyze(db, ctx, { rows, mapping }, options = {}) {
  const settings = db.settings();
  const out = [];
  const seenNid = new Map();
  const seenNo = new Map();
  const missing = { branch: new Set(), department: new Set(), jobTitle: new Set() };

  const get = (row, key) => {
    const i = mapping[key];
    if (i === undefined || i === null) return null;
    const v = row[i];
    return v === null || v === undefined ? null : String(v).trim();
  };

  rows.forEach((row, index) => {
    const line = index + 1;
    const errors = [];
    const warnings = [];
    const rec = {};

    const push = (field, message) => errors.push({ field, message });

    try { rec.employeeNo = V.employeeNo(get(row, "employeeNo"), settings); }
    catch (e) { push("employeeNo", e.message); }
    try { rec.nationalId = V.nationalId(get(row, "nationalId"), settings); }
    catch (e) { push("nationalId", e.message); }
    rec.fullNameAr = get(row, "fullNameAr");
    if (!rec.fullNameAr) push("fullNameAr", "الاسم مطلوب");

    const joining = D.parseLoose(get(row, "originalJoiningDate"));
    if (!joining) push("originalJoiningDate", "تاريخ المباشرة مفقود أو غير مفهوم");
    else rec.originalJoiningDate = joining;

    const dobRaw = get(row, "dob");
    if (dobRaw) {
      const dob = D.parseLoose(dobRaw);
      if (!dob) warnings.push({ field: "dob", message: "تاريخ الميلاد غير مفهوم وسيُترك فارغًا" });
      else rec.dob = dob;
    }

    for (const [key, table, label] of [["branch", "branches", "الفرع"], ["department", "departments", "القسم"], ["jobTitle", "job_titles", "المسمى الوظيفي"]]) {
      const raw = get(row, key);
      if (!raw) {
        if (key === "branch") push("branch", "الفرع مطلوب");
        continue;
      }
      const found = lookupByName(db, table, raw);
      if (found) rec[key + "Id"] = found.id;
      else {
        missing[key].add(raw);
        if (options.createMissing) warnings.push({ field: key, message: `سيُنشأ ${label} جديد: ${raw}` });
        else push(key, `${label} «${raw}» غير موجود في القوائم`);
      }
    }

    const mob = get(row, "mobile");
    if (mob) { try { rec.mobile = V.mobile(mob); } catch { warnings.push({ field: "mobile", message: "رقم الجوال غير صحيح وسيُترك فارغًا" }); } }
    const mail = get(row, "email");
    if (mail) { try { rec.email = V.email(mail); } catch { warnings.push({ field: "email", message: "البريد غير صحيح وسيُترك فارغًا" }); } }

    rec.fullNameEn = get(row, "fullNameEn") || null;
    rec.nationality = get(row, "nationality") || null;
    rec.employeeCategory = get(row, "employeeCategory") || null;
    rec.notes = get(row, "notes") || null;
    rec.gender = matchWord(GENDER_WORDS, get(row, "gender"));
    rec.employmentType = matchWord(TYPE_WORDS, get(row, "employmentType"));
    if (get(row, "employmentType") && !rec.employmentType) {
      warnings.push({ field: "employmentType", message: "نوع التوظيف غير معروف وسيُترك فارغًا" });
    }
    rec.managerNo = get(row, "managerNo") || null;

    const status = norm(get(row, "status"));
    if (status && !["active", "نشط", "على رأس العمل", ""].includes(status)) {
      warnings.push({
        field: "status",
        message: "الاستقالة وإنهاء الخدمة تُسجَّلان من شاشتيهما بتاريخهما — سيُستورد الموظف نشطًا",
      });
    }

    // تكرار داخل الملف نفسه
    if (rec.nationalId) {
      if (seenNid.has(rec.nationalId)) push("nationalId", `مكرر داخل الملف مع السطر ${seenNid.get(rec.nationalId)}`);
      else seenNid.set(rec.nationalId, line);
    }
    if (rec.employeeNo) {
      if (seenNo.has(rec.employeeNo)) push("employeeNo", `مكرر داخل الملف مع السطر ${seenNo.get(rec.employeeNo)}`);
      else seenNo.set(rec.employeeNo, line);
    }

    // موجود في القاعدة؟ تحديث لا تكرار
    let action = "create";
    let existingId = null;
    if (rec.nationalId || rec.employeeNo) {
      const byNid = rec.nationalId ? db.get("SELECT id, employee_no FROM employees WHERE national_id = :n", { n: rec.nationalId }) : null;
      const byNo = rec.employeeNo ? db.get("SELECT id, national_id FROM employees WHERE employee_no = :n", { n: rec.employeeNo }) : null;
      if (byNid && byNo && byNid.id !== byNo.id) {
        push("nationalId", "رقم الهوية والرقم الوظيفي يخصّان موظفين مختلفين في النظام");
      } else if (byNid || byNo) {
        existingId = (byNid || byNo).id;
        action = options.updateExisting === false ? "skip" : "update";
        if (action === "update") warnings.push({ field: "employeeNo", message: "مسجَّل مسبقًا — ستُحدَّث بياناته" });
        else warnings.push({ field: "employeeNo", message: "مسجَّل مسبقًا — سيُتجاوز" });
      }
    }

    out.push({
      line, action: errors.length ? "error" : action, existingId,
      employeeNo: rec.employeeNo || get(row, "employeeNo"),
      name: rec.fullNameAr || "",
      record: rec, errors, warnings,
    });
  });

  const summary = {
    total: out.length,
    create: out.filter((r) => r.action === "create").length,
    update: out.filter((r) => r.action === "update").length,
    skip: out.filter((r) => r.action === "skip").length,
    errors: out.filter((r) => r.action === "error").length,
    missingLookups: {
      branch: [...missing.branch], department: [...missing.department], jobTitle: [...missing.jobTitle],
    },
  };
  return { summary, rows: out };
}

function ensureLookup(db, ctx, table, name) {
  const found = lookupByName(db, table, name);
  if (found) return found.id;
  const t = nowIso();
  const r = db.run(
    `INSERT INTO ${table}(code, name_ar, name_en, is_active, sort_order, created_at, created_by, updated_at, updated_by)
     VALUES(NULL, :n, :n2, 1, 999, :t, :u, :t, :u)`,
    { n: String(name).trim(), n2: /[A-Za-z]/.test(String(name)) ? String(name).trim() : null,
      t, u: (ctx.user && ctx.user.id) || null }
  );
  return Number(r.lastInsertRowid);
}

function commit(db, ctx, payload) {
  const options = payload.options || {};
  const analysis = analyze(db, ctx, payload, options);
  const strict = options.stopOnError !== false;
  if (strict && analysis.summary.errors) {
    throw bad(`الملف فيه ${analysis.summary.errors} سطرًا بها أخطاء — صحّحها ثم أعد الرفع`, "import_errors",
      { rows: analysis.rows.filter((r) => r.action === "error").slice(0, 200) });
  }

  const result = { created: 0, updated: 0, skipped: 0, failed: [], lookupsCreated: [] };

  db.tx(() => {
    if (options.createMissing) {
      for (const [key, table] of [["branch", "branches"], ["department", "departments"], ["jobTitle", "job_titles"]]) {
        for (const name of analysis.summary.missingLookups[key]) {
          ensureLookup(db, ctx, table, name);
          result.lookupsCreated.push({ type: key, name });
        }
      }
    }

    for (const row of analysis.rows) {
      if (row.action === "skip") { result.skipped++; continue; }
      if (row.action === "error") { result.failed.push({ line: row.line, errors: row.errors }); continue; }

      const rec = row.record;
      // إعادة الربط بعد إنشاء القوائم الناقصة
      for (const [key, table] of [["branch", "branches"], ["department", "departments"], ["jobTitle", "job_titles"]]) {
        if (!rec[key + "Id"]) {
          const raw = valueOf(payload.rows[row.line - 1], payload.mapping, key);
          if (raw) {
            const f = lookupByName(db, table, raw);
            if (f) rec[key + "Id"] = f.id;
          }
        }
      }
      if (rec.managerNo) {
        const mgr = db.get("SELECT id FROM employees WHERE employee_no = :n", { n: rec.managerNo });
        if (mgr) rec.managerId = mgr.id;
      }

      const body = {
        employeeNo: rec.employeeNo, nationalId: rec.nationalId, fullNameAr: rec.fullNameAr,
        fullNameEn: rec.fullNameEn, gender: rec.gender, mobile: rec.mobile, email: rec.email,
        dob: rec.dob, nationality: rec.nationality, originalJoiningDate: rec.originalJoiningDate,
        employmentType: rec.employmentType, employeeCategory: rec.employeeCategory,
        branchId: rec.branchId, departmentId: rec.departmentId, jobTitleId: rec.jobTitleId,
        managerId: rec.managerId, notes: rec.notes,
      };
      try {
        if (row.action === "update" && row.existingId) {
          EMP.update(db, ctx, row.existingId, body);
          result.updated++;
        } else {
          EMP.create(db, ctx, body);
          result.created++;
        }
      } catch (e) {
        result.failed.push({ line: row.line, errors: [{ field: (e.extra && e.extra.field) || null, message: e.message }] });
        if (strict) throw e;
      }
    }

    audit.record(db, ctx, {
      action: "import", entity: "employees", entityId: null,
      summary: `استيراد موظفين من ملف: ${result.created} إضافة · ${result.updated} تحديث · ${result.skipped} تجاوز`,
      after: { created: result.created, updated: result.updated, skipped: result.skipped },
    });
  });

  return Object.assign(result, { summary: analysis.summary });
}

function valueOf(row, mapping, key) {
  if (!row) return null;
  const i = mapping[key];
  if (i === undefined || i === null) return null;
  const v = row[i];
  return v === null || v === undefined ? null : String(v).trim();
}

/* ------------------------------------------------------------ القالب */

function template(db) {
  const branches = db.all("SELECT name_ar FROM branches WHERE is_active = 1 ORDER BY sort_order").map((r) => r.name_ar);
  const departments = db.all("SELECT name_ar FROM departments WHERE is_active = 1 ORDER BY sort_order").map((r) => r.name_ar);
  const titles = db.all("SELECT name_ar FROM job_titles WHERE is_active = 1 ORDER BY sort_order").map((r) => r.name_ar);

  const columns = FIELDS.map((f) => ({ header: f.label, width: f.key === "fullNameAr" ? 28 : 18 }));
  const sample = [
    ["1001", "1012345678", "أحمد محمد سالم", "Ahmed M. Salem", "ذكر", "0501234567", "ahmed@example.com",
      "1990-05-12", "سعودي", "2026-01-01", branches[0] || "الروضة", departments[0] || "استقبال المرضى",
      titles[0] || "موظف استقبال", "دوام كامل", "", "", "نشط", ""],
  ];

  const guide = [
    ["الحقل", "مطلوب؟", "الصيغة المقبولة"],
    ["الرقم الوظيفي", "مطلوب", "نص أو رقم · فريد لا يتكرر"],
    ["رقم الهوية", "مطلوب", "عشرة أرقام · فريد لا يتكرر"],
    ["الاسم", "مطلوب", "نص"],
    ["تاريخ المباشرة", "مطلوب", "YYYY-MM-DD أو DD/MM/YYYY أو تاريخ إكسل"],
    ["الفرع", "مطلوب", branches.join(" · ") || "—"],
    ["القسم", "اختياري", departments.join(" · ") || "—"],
    ["المسمى الوظيفي", "اختياري", titles.join(" · ") || "—"],
    ["نوع التوظيف", "اختياري", "دوام كامل · دوام جزئي · عقد · مؤقت · متدرب"],
    ["الجنس", "اختياري", "ذكر · أنثى"],
    ["تاريخ الميلاد", "اختياري", "YYYY-MM-DD"],
    ["الجوال", "اختياري", "05XXXXXXXX"],
    ["الحالة", "اختياري", "نشط فقط — الاستقالة وإنهاء الخدمة تُسجَّلان من شاشتيهما بتاريخهما"],
  ];

  return X.build([
    { name: "Employees", columns, rows: sample },
    { name: "التعليمات", columns: guide[0].map((h) => ({ header: h, width: 40 })), rows: guide.slice(1) },
  ]);
}

module.exports = { parseUpload, suggestMapping, analyze, commit, template, FIELDS, detectHeader };
