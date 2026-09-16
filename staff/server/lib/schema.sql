-- =====================================================================
--  مخطط قاعدة البيانات — نظام إدارة الموظفين
--  ---------------------------------------------------------------------
--  مبدآن يحكمان المخطط كله:
--
--  ١. لا يُحذف موظف. الاستقالة وإنهاء الخدمة والنقل كلها **سجلات
--     مستقلة بتواريخها**، وحالة الموظف الحالية مجرد خلاصة لها.
--  ٢. لكل جدول تاريخ حدث (event date) منفصل عن تاريخ الإدخال
--     (created_at)، فتقارير سبتمبر لا تتأثر بكون الإدخال في نوفمبر.
--
--  التواريخ نصّ 'YYYY-MM-DD'، والطوابع الزمنية نصّ ISO-8601 بتوقيت UTC.
--  كلاهما يترتّب أبجديًا ترتيبًا زمنيًا صحيحًا في SQLite.
-- =====================================================================

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ------------------------------------------------- المستخدمون والجلسات

CREATE TABLE IF NOT EXISTS users (
  id                   TEXT PRIMARY KEY,
  username             TEXT NOT NULL UNIQUE,
  full_name            TEXT NOT NULL,
  email                TEXT,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL,              -- super_admin | hr_admin | manager | viewer
  branch_scope         TEXT,                       -- JSON: أرقام الفروع المسموح بها، NULL = الكل
  is_active            INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at        TEXT,
  failed_attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  created_at           TEXT NOT NULL,
  created_by           TEXT,
  updated_at           TEXT NOT NULL,
  updated_by           TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,                   -- sha256 للرمز، لا الرمز نفسه
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,                      -- الحد الأقصى المطلق لعمر الجلسة
  ip           TEXT,
  user_agent   TEXT,
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_logs (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  username   TEXT,
  user_id    TEXT,
  success    INTEGER NOT NULL,
  reason     TEXT,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS ix_login_at ON login_logs(at);

-- ------------------------------------------------------------ القوائم

CREATE TABLE IF NOT EXISTS branches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT UNIQUE,
  name_ar    TEXT NOT NULL,
  name_en    TEXT,
  city       TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT
);

CREATE TABLE IF NOT EXISTS departments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT UNIQUE,
  name_ar    TEXT NOT NULL,
  name_en    TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT
);

CREATE TABLE IF NOT EXISTS job_titles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT UNIQUE,
  name_ar    TEXT NOT NULL,
  name_en    TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT
);

CREATE TABLE IF NOT EXISTS leave_types (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  code                TEXT UNIQUE,                 -- sick | annual | emergency | unpaid | ...
  name_ar             TEXT NOT NULL,
  name_en             TEXT,
  is_paid             INTEGER NOT NULL DEFAULT 1,
  requires_attachment INTEGER NOT NULL DEFAULT 0,  -- شهادة مرضية مثلًا
  attendance_status   TEXT,                        -- حالة الحضور التي تُسقط على أيام الإجازة
  is_active           INTEGER NOT NULL DEFAULT 1,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT
);

-- ----------------------------------------------------------- الموظفون

-- id مُعرّف داخلي ثابت (UUID) لا يتغيّر أبدًا، والرقم الوظيفي حقل قابل
-- للتغيير — فتغييره لا يقطع أي علاقة تاريخية.
CREATE TABLE IF NOT EXISTS employees (
  id                    TEXT PRIMARY KEY,
  employee_no           TEXT NOT NULL UNIQUE,
  national_id           TEXT NOT NULL UNIQUE,
  full_name_ar          TEXT NOT NULL,
  full_name_en          TEXT,
  gender                TEXT,
  mobile                TEXT,
  email                 TEXT,
  dob                   TEXT,
  nationality           TEXT,
  original_joining_date TEXT NOT NULL,             -- لا يتغيّر بنقل ولا بترقية ولا بإعادة توظيف
  employment_status     TEXT NOT NULL DEFAULT 'active',
  employment_type       TEXT,
  employee_category     TEXT,
  branch_id             INTEGER REFERENCES branches(id),
  department_id         INTEGER REFERENCES departments(id),
  job_title_id          INTEGER REFERENCES job_titles(id),
  manager_id            TEXT REFERENCES employees(id),
  position_start_date   TEXT,                      -- بداية المسمى الحالي
  branch_start_date     TEXT,                      -- بداية الفرع الحالي
  probation_end_date    TEXT,
  notes                 TEXT,
  is_archived           INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_emp_no       ON employees(employee_no);
CREATE INDEX IF NOT EXISTS ix_emp_nid      ON employees(national_id);
CREATE INDEX IF NOT EXISTS ix_emp_branch   ON employees(branch_id);
CREATE INDEX IF NOT EXISTS ix_emp_dept     ON employees(department_id);
CREATE INDEX IF NOT EXISTS ix_emp_status   ON employees(employment_status);
CREATE INDEX IF NOT EXISTS ix_emp_name     ON employees(full_name_ar);

-- فترة توظيف واحدة لكل التحاق. إعادة التوظيف تفتح فترة جديدة ولا تلمس
-- الفترة القديمة ولا original_joining_date.
CREATE TABLE IF NOT EXISTS employment_periods (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  start_date   TEXT NOT NULL,                      -- تاريخ المباشرة أو إعادة التوظيف
  start_reason TEXT NOT NULL DEFAULT 'hire',       -- hire | rehire
  end_date     TEXT,                               -- آخر يوم عمل، NULL = على رأس العمل
  end_kind     TEXT,                               -- resignation | termination | retirement
  end_reason   TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT,
  UNIQUE(employee_id, seq)
);
CREATE INDEX IF NOT EXISTS ix_period_emp   ON employment_periods(employee_id);
CREATE INDEX IF NOT EXISTS ix_period_start ON employment_periods(start_date);
CREATE INDEX IF NOT EXISTS ix_period_end   ON employment_periods(end_date);

-- تاريخ الإسناد: أي فرع وقسم ومسمّى كان الموظف فيه، ومن أي تاريخ إلى أي
-- تاريخ. التقارير التاريخية تقرأ من هنا لا من حقل الفرع الحالي.
-- الفترات متلاصقة لا تتداخل: effective_to = اليوم السابق لبداية التالية.
CREATE TABLE IF NOT EXISTS assignments (
  id              TEXT PRIMARY KEY,
  employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_id       TEXT REFERENCES employment_periods(id) ON DELETE SET NULL,
  branch_id       INTEGER REFERENCES branches(id),
  department_id   INTEGER REFERENCES departments(id),
  job_title_id    INTEGER REFERENCES job_titles(id),
  manager_id      TEXT REFERENCES employees(id),
  employment_type TEXT,
  effective_from  TEXT NOT NULL,
  effective_to    TEXT,                            -- NULL = سارٍ الآن
  reason          TEXT,                            -- hire | transfer | rehire | correction
  ref_type        TEXT,
  ref_id          TEXT,
  created_at TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_asg_emp  ON assignments(employee_id, effective_from);
CREATE INDEX IF NOT EXISTS ix_asg_from ON assignments(effective_from);

CREATE TABLE IF NOT EXISTS status_history (
  id             TEXT PRIMARY KEY,
  employee_id    TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status         TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to   TEXT,
  reason         TEXT,
  ref_type       TEXT,
  ref_id         TEXT,
  created_at TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_sth_emp ON status_history(employee_id, effective_from);

-- ------------------------------------------------------------ الحركات

CREATE TABLE IF NOT EXISTS transfers (
  id                 TEXT PRIMARY KEY,
  employee_id        TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  transfer_date      TEXT NOT NULL,
  from_branch_id     INTEGER, to_branch_id     INTEGER,
  from_department_id INTEGER, to_department_id INTEGER,
  from_job_title_id  INTEGER, to_job_title_id  INTEGER,
  reason      TEXT,
  approved_by TEXT,
  notes       TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_trf_date ON transfers(transfer_date);
CREATE INDEX IF NOT EXISTS ix_trf_emp  ON transfers(employee_id);

-- الاستقالة وإنهاء الخدمة والتقاعد: بياناتها واحدة، ويميّزها kind.
-- event_date = تاريخ الاستقالة/القرار، last_working_date = آخر يوم عمل.
CREATE TABLE IF NOT EXISTS separations (
  id                 TEXT PRIMARY KEY,
  employee_id        TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_id          TEXT REFERENCES employment_periods(id) ON DELETE SET NULL,
  kind               TEXT NOT NULL,                -- resignation | termination | retirement
  event_date         TEXT NOT NULL,
  last_working_date  TEXT NOT NULL,
  sub_type           TEXT,
  reason             TEXT,
  notice_period_days INTEGER,
  approved_by        TEXT,
  notes              TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_sep_date ON separations(event_date);
CREATE INDEX IF NOT EXISTS ix_sep_lwd  ON separations(last_working_date);
CREATE INDEX IF NOT EXISTS ix_sep_emp  ON separations(employee_id);

-- ------------------------------------------------- الحضور والإجازات

CREATE TABLE IF NOT EXISTS attendance (
  id             TEXT PRIMARY KEY,
  employee_id    TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  branch_id      INTEGER,                          -- لقطة وقت الحدث
  department_id  INTEGER,
  status         TEXT NOT NULL,                    -- present | absent | late | sick_leave | ...
  check_in       TEXT, check_out TEXT, scheduled_time TEXT,
  late_minutes   INTEGER NOT NULL DEFAULT 0,
  approved       INTEGER,                          -- NULL غير محدَّد · 1 بعذر · 0 بلا عذر
  absence_type   TEXT,
  leave_id       TEXT REFERENCES leaves(id) ON DELETE SET NULL,
  reason         TEXT,
  notes          TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT,
  UNIQUE(employee_id, date)
);
CREATE INDEX IF NOT EXISTS ix_att_date   ON attendance(date);
CREATE INDEX IF NOT EXISTS ix_att_emp    ON attendance(employee_id, date);
CREATE INDEX IF NOT EXISTS ix_att_status ON attendance(status, date);

CREATE TABLE IF NOT EXISTS leaves (
  id                  TEXT PRIMARY KEY,
  employee_id         TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id       INTEGER REFERENCES leave_types(id),
  start_date          TEXT NOT NULL,
  end_date            TEXT NOT NULL,
  days                INTEGER NOT NULL,
  approval_status     TEXT NOT NULL DEFAULT 'approved', -- pending | approved | rejected | cancelled
  medical_certificate INTEGER NOT NULL DEFAULT 0,
  approved_by         TEXT,
  reason              TEXT,
  notes               TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_lv_emp   ON leaves(employee_id);
CREATE INDEX IF NOT EXISTS ix_lv_start ON leaves(start_date);
CREATE INDEX IF NOT EXISTS ix_lv_type  ON leaves(leave_type_id);

-- -------------------------------------------------- الإجراءات الانضباطية

CREATE TABLE IF NOT EXISTS disciplinary_actions (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  action_date  TEXT NOT NULL,
  action_type  TEXT NOT NULL,                      -- verbal_warning | warning_letter | written_warning | final_warning | corrective_action | other
  reason       TEXT,
  description  TEXT,
  action_taken TEXT,
  issued_by    TEXT,
  status       TEXT NOT NULL DEFAULT 'active',     -- active | revoked | closed
  notes        TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_da_date ON disciplinary_actions(action_date);
CREATE INDEX IF NOT EXISTS ix_da_emp  ON disciplinary_actions(employee_id);

CREATE TABLE IF NOT EXISTS corrective_actions (
  id                TEXT PRIMARY KEY,
  employee_id       TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date_opened       TEXT NOT NULL,
  reason            TEXT,
  description       TEXT,
  corrective_action TEXT,
  responsible_person TEXT,
  due_date          TEXT,
  status            TEXT NOT NULL DEFAULT 'open',  -- open | in_progress | closed
  date_closed       TEXT,
  closure_notes     TEXT,
  notes             TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_ca_opened ON corrective_actions(date_opened);
CREATE INDEX IF NOT EXISTS ix_ca_due    ON corrective_actions(due_date);
CREATE INDEX IF NOT EXISTS ix_ca_emp    ON corrective_actions(employee_id);

-- ------------------------------------------------------------ المرفقات

CREATE TABLE IF NOT EXISTS attachments (
  id          TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  ref_type    TEXT,                                -- separation | disciplinary | leave | ...
  ref_id      TEXT,
  file_name   TEXT NOT NULL,                       -- الاسم كما رفعه المستخدم
  stored_name TEXT NOT NULL,                       -- اسم عشوائي على القرص، بلا امتداد تنفيذي
  mime        TEXT,
  size        INTEGER,
  sha256      TEXT,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS ix_att_ref ON attachments(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS ix_att_emp2 ON attachments(employee_id);

-- ------------------------------------------------------- سجل التدقيق

-- لا يُحذف ولا يُعدَّل من الواجهة إطلاقًا: لا مسار كتابة عليه غير الإضافة.
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  at           TEXT NOT NULL,
  user_id      TEXT,
  user_name    TEXT,
  action       TEXT NOT NULL,                      -- create | update | delete | login | export | ...
  entity       TEXT NOT NULL,
  entity_id    TEXT,
  employee_id  TEXT,
  summary      TEXT,
  before_json  TEXT,
  after_json   TEXT,
  changes_json TEXT,                               -- [{field, before, after}]
  ip           TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_at     ON audit_logs(at);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_emp    ON audit_logs(employee_id);
CREATE INDEX IF NOT EXISTS ix_audit_user   ON audit_logs(user_id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT
);
