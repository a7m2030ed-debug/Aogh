/* ======================================================================
   اللغة — عربي/إنجليزي، والاتجاه يتبعها
   ----------------------------------------------------------------------
   البيانات المُدخَلة لا تُترجَم: تبقى كما كُتبت. المترجَم هو واجهة
   النظام وقوائمه الثابتة. واختيار اللغة يُحفظ في المتصفح.
   ====================================================================== */

(function () {
  "use strict";

  const AR = {
    /* عام */
    appName: "نظام إدارة الموظفين",
    login: "دخول", logout: "خروج", username: "اسم المستخدم", password: "كلمة المرور",
    signInSub: "سجّل الدخول للمتابعة", loginFoot: "اتصال محمي · تُسجَّل محاولات الدخول",
    save: "حفظ", cancel: "إلغاء", close: "إغلاق", edit: "تعديل", add: "إضافة", delete: "حذف",
    search: "بحث", filter: "تصفية", reset: "مسح", apply: "تطبيق", export: "تصدير",
    exportExcel: "تصدير إكسل", print: "طباعة / PDF", confirm: "تأكيد", yes: "نعم", no: "لا",
    all: "الكل", none: "لا شيء", total: "الإجمالي", details: "تفاصيل", actions: "إجراءات",
    loading: "جارٍ التحميل…", noData: "لا توجد بيانات", saved: "تم الحفظ", deleted: "تم الحذف",
    required: "مطلوب", optional: "اختياري", back: "رجوع", next: "التالي", prev: "السابق",
    page: "صفحة", of: "من", rows: "سجل", showing: "المعروض", more: "المزيد", notes: "ملاحظات",
    reason: "السبب", attachment: "مرفق", attachments: "المرفقات", upload: "رفع",
    download: "تنزيل", from: "من", to: "إلى", date: "التاريخ", day: "يوم", days: "أيام",
    minutes: "دقيقة", times: "مرة", status: "الحالة", type: "النوع", createdAt: "تاريخ الإدخال",
    createdBy: "أدخله", updatedAt: "آخر تعديل", updatedBy: "عدّله", eventDate: "تاريخ الحدث",
    quickSearchPlaceholder: "ابحث برقم الهوية أو الرقم الوظيفي أو الاسم",
    sessionExpired: "انتهت الجلسة — سجّل الدخول من جديد",
    networkError: "تعذّر الاتصال بالخادم",
    serverRequired: "هذه الصفحة واجهة لنظام يعمل على خادم — شغّل الخادم (node server.js) ثم افتحها من عنوانه.",
    confirmDelete: "هل تريد الحذف؟ لا يمكن التراجع.",

    /* التنقل */
    navDashboard: "لوحة المعلومات", navEmployees: "الموظفون", navAttendance: "الحضور",
    navLeaves: "الإجازات", navDiscipline: "الإجراءات", navMovements: "الحركات",
    navReports: "التقارير", navImport: "استيراد", navAdmin: "الإدارة",

    /* اللوحة */
    dashboard: "لوحة المعلومات", today: "اليوم", thisWeek: "هذا الأسبوع", thisMonth: "هذا الشهر",
    thisYear: "هذه السنة", custom: "مدة مخصصة", period: "المدة",
    openingHeadcount: "العدد الافتتاحي", closingHeadcount: "العدد الختامي",
    currentActive: "على رأس العمل الآن", newJoiners: "مباشرون جدد", newHires: "تعيين جديد",
    rehires: "إعادة توظيف", resignations: "استقالات", terminations: "إنهاء خدمة",
    retirements: "تقاعد", transfersIn: "نقل داخل", transfersOut: "نقل خارج", transfers: "نقل",
    present: "حضور", absent: "غياب", late: "تأخير", lateOccurrences: "مرات التأخير",
    lateMinutes: "مجموع دقائق التأخير", lateAverage: "متوسط التأخير",
    sickLeave: "إجازة مرضية", sickLeaveDays: "أيام الإجازة المرضية",
    annualLeaveDays: "أيام الإجازة السنوية", otherLeaveDays: "أيام إجازات أخرى",
    permissions: "استئذان", missions: "مهام عمل", warningLetters: "إنذارات",
    correctiveActions: "إجراءات تصحيحية", correctiveOpen: "مفتوحة", correctiveOverdue: "متأخرة",
    disciplinaryTotal: "إجراءات انضباطية", headcount: "عدد الموظفين",
    headcountTrend: "تطوّر عدد الموظفين", joinersVsLeavers: "المباشرون مقابل المغادرين",
    headcountByBranch: "الموظفون حسب الفرع", headcountByDepartment: "الموظفون حسب القسم",
    absenceByBranch: "الغياب حسب الفرع", lateByDepartment: "التأخير حسب القسم",
    statusBreakdown: "توزيع الحالات", alerts: "تنبيهات تحتاج متابعة", noAlerts: "لا تنبيهات",
    reconciliation: "المطابقة", reconciliationOk: "الأرقام متطابقة",
    reconciliationOff: "فرق في المطابقة: {n}",
    showTable: "عرض كجدول", hideTable: "إخفاء الجدول",

    /* الموظفون */
    employees: "الموظفون", employee: "الموظف", addEmployee: "إضافة موظف",
    employeeNo: "الرقم الوظيفي", nationalId: "رقم الهوية", fullNameAr: "الاسم",
    fullNameEn: "الاسم بالإنجليزية", gender: "الجنس", mobile: "الجوال", email: "البريد",
    dob: "تاريخ الميلاد", nationality: "الجنسية", joiningDate: "تاريخ المباشرة",
    originalJoiningDate: "تاريخ المباشرة الأصلي", employmentStatus: "حالة التوظيف",
    employmentType: "نوع التوظيف", employeeCategory: "فئة الموظف", branch: "الفرع",
    department: "القسم", jobTitle: "المسمى الوظيفي", manager: "المدير المباشر",
    positionStartDate: "بداية المسمى الحالي", branchStartDate: "بداية الفرع الحالي",
    probationEnd: "نهاية التجربة", archived: "مؤرشف", includeArchived: "عرض المؤرشفين",
    profile: "ملف الموظف", timeline: "الخط الزمني", employmentHistory: "تاريخ التوظيف",
    statusHistory: "تاريخ الحالة", periods: "فترات التوظيف", period_: "الفترة",
    stats: "المؤشرات", serviceYears: "مدة الخدمة", age: "العمر",
    recordTransfer: "تسجيل نقل", recordResignation: "تسجيل استقالة",
    recordTermination: "تسجيل إنهاء خدمة", recordRetirement: "تسجيل تقاعد", rehire: "إعادة توظيف",
    archive: "أرشفة", unarchive: "إلغاء الأرشفة", deleteForever: "حذف نهائي",
    transferDate: "تاريخ النقل", toBranch: "إلى الفرع", toDepartment: "إلى القسم",
    toJobTitle: "إلى المسمى", approvedBy: "اعتمده", resignationDate: "تاريخ الاستقالة",
    terminationDate: "تاريخ القرار", lastWorkingDate: "آخر يوم عمل",
    resignationType: "نوع الاستقالة", terminationType: "نوع إنهاء الخدمة",
    noticePeriod: "مدة الإشعار (أيام)", rehireDate: "تاريخ إعادة التوظيف",
    previousLeaving: "آخر يوم عمل السابق", advancedSearch: "بحث متقدم",
    joinedFrom: "باشر من", joinedTo: "باشر إلى", noEmployees: "لا يوجد موظفون مطابقون",
    duplicateNationalId: "رقم الهوية مسجَّل مسبقًا", duplicateEmployeeNo: "الرقم الوظيفي مسجَّل مسبقًا",
    openEmployee: "فتح الملف", deleteReason: "سبب الحذف النهائي",
    nidHidden: "رقم الهوية محجوب — تحتاج صلاحية لعرضه",

    /* الحضور */
    attendance: "الحضور", addAttendance: "تسجيل حضور", bulkAttendance: "إدخال يوم كامل",
    checkIn: "وقت الحضور", checkOut: "وقت الانصراف", scheduledTime: "وقت الدوام",
    lateMinutesField: "دقائق التأخير", approved: "بعذر", unapproved: "بلا عذر",
    absenceType: "نوع الغياب", attendanceExists: "يوجد سجل لهذا اليوم — سيُحدَّث",
    markAllPresent: "تعليم الكل حاضرين", saveDay: "حفظ اليوم",

    /* الإجازات */
    leaves: "الإجازات", addLeave: "تسجيل إجازة", leaveType: "نوع الإجازة",
    startDate: "تاريخ البداية", endDate: "تاريخ النهاية", numberOfDays: "عدد الأيام",
    approvalStatus: "حالة الاعتماد", medicalCertificate: "شهادة مرضية",
    daysComputed: "يحسبها النظام من التاريخين",

    /* الانضباط */
    discipline: "الإجراءات الانضباطية", disciplinaryAction: "إجراء انضباطي",
    addDisciplinary: "تسجيل إجراء انضباطي", actionType: "نوع الإجراء", actionDate: "تاريخ الإجراء",
    description: "الوصف", actionTaken: "الإجراء المتخذ", issuedBy: "أصدره",
    corrective: "الإجراءات التصحيحية", addCorrective: "فتح إجراء تصحيحي",
    dateOpened: "تاريخ الفتح", dueDate: "تاريخ الاستحقاق", dateClosed: "تاريخ الإغلاق",
    responsiblePerson: "المسؤول", correctiveActionField: "الإجراء التصحيحي",
    closureNotes: "ملاحظات الإغلاق", overdueNote: "تجاوز تاريخ الاستحقاق",

    /* الحركات */
    movements: "الحركات", transfersTab: "النقل", separationsTab: "نهاية الخدمة",
    cancelSeparation: "إلغاء السجل", cancelReason: "سبب الإلغاء",

    /* التقارير */
    reports: "التقارير", monthlyReport: "تقرير شهري", annualReport: "تقرير سنوي",
    customReport: "مدة مخصصة", branchReport: "حسب الفرع", departmentReport: "حسب القسم",
    jobTitleReport: "حسب المسمى", month: "الشهر", year: "السنة",
    employeeMovement: "حركة الموظفين", monthlyTable: "الجدول الشهري",
    opening: "افتتاحي", closing: "ختامي", joiners: "مباشرون",
    resigned: "مستقيلون", terminated: "منتهية خدمتهم",
    headcountAt: "الموجودون في تاريخ", viewHeadcount: "عرض الأسماء",
    reportNote: "كل رقم محسوب من السجلات وقت طلب التقرير — لا أرقام مُدخلة يدويًا.",

    /* الاستيراد */
    import: "الاستيراد", importEmployees: "استيراد موظفين من إكسل",
    downloadTemplate: "تنزيل القالب", chooseFile: "اختر ملفًا", preview: "معاينة",
    mapping: "ربط الأعمدة", commit: "تنفيذ الاستيراد", createMissing: "إنشاء الفروع/الأقسام الناقصة",
    updateExisting: "تحديث الموجودين", importSummary: "الملخص", willCreate: "سيُضاف",
    willUpdate: "سيُحدَّث", willSkip: "سيُتجاوز", withErrors: "فيه أخطاء", line: "السطر",
    importDone: "تم الاستيراد: {c} إضافة · {u} تحديث", importNothing: "لا شيء للاستيراد",
    importHint: "لا يُكتب شيء في القاعدة قبل الضغط على «تنفيذ الاستيراد».",

    /* الإدارة */
    admin: "الإدارة", users: "المستخدمون", addUser: "إضافة مستخدم", role: "الدور",
    fullName: "الاسم", active: "نشط", inactive: "موقوف", resetPassword: "إعادة تعيين كلمة المرور",
    newPassword: "كلمة المرور الجديدة", currentPassword: "كلمة المرور الحالية",
    changePassword: "تغيير كلمة المرور", mustChangePassword: "يلزم تغيير كلمة المرور",
    branchScope: "الفروع المسموح بها", allBranches: "كل الفروع",
    sessions: "الجلسات النشطة", revokeSession: "إنهاء الجلسة", lastSeen: "آخر نشاط",
    loginLog: "سجل الدخول", permissionsMatrix: "مصفوفة الصلاحيات",
    lookups: "القوائم", branches: "الفروع", departments: "الأقسام", jobTitles: "المسميات الوظيفية",
    leaveTypes: "أنواع الإجازات", code: "الرمز", nameAr: "الاسم بالعربية", nameEn: "الاسم بالإنجليزية",
    city: "المدينة", isActive: "مفعَّل", deactivate: "تعطيل", activate: "تفعيل",
    settings: "الإعدادات", orgName: "اسم المنشأة", workDays: "أيام العمل",
    leaveDaysBasis: "احتساب أيام الإجازة", calendarDays: "أيام تقويمية", workDaysBasis: "أيام عمل",
    probationDays: "مدة التجربة (أيام)", lateGrace: "مهلة التأخير (دقائق)",
    correctiveDueSoon: "تنبيه الاستحقاق قبل (أيام)", nationalIdDigits: "عدد أرقام الهوية",
    auditLog: "سجل التدقيق", activityLog: "سجل النشاط", backups: "النسخ الاحتياطية",
    backupNow: "نسخة احتياطية الآن", backupHint: "النسخ اليومية تلقائية، وهذه نسخة إضافية فورية.",
    retention: "مدة الاحتفاظ", user: "المستخدم", action: "الإجراء", entity: "السجل",
    before: "قبل", after: "بعد", field: "الحقل", ip: "العنوان",
    auditNote: "سجل التدقيق لا يُعدَّل ولا يُحذف من داخل النظام.",
    refreshSnapshots: "إعادة حساب الحالات",

    /* التعدادات */
    st_active: "على رأس العمل", st_resigned: "مستقيل", st_terminated: "منتهية خدمته",
    st_retired: "متقاعد", st_on_leave: "في إجازة", st_suspended: "موقوف", st_transferred: "منقول",
    ty_full_time: "دوام كامل", ty_part_time: "دوام جزئي", ty_contract: "عقد",
    ty_temporary: "مؤقت", ty_intern: "متدرب", ty_locum: "بديل/زائر",
    g_male: "ذكر", g_female: "أنثى",
    at_present: "حضور", at_absent: "غياب", at_late: "تأخير", at_sick_leave: "إجازة مرضية",
    at_annual_leave: "إجازة سنوية", at_emergency_leave: "إجازة اضطرارية", at_other_leave: "إجازة أخرى",
    at_permission: "استئذان", at_official_mission: "مهمة عمل", at_holiday: "عطلة", at_other: "أخرى",
    ap_pending: "بانتظار الاعتماد", ap_approved: "معتمدة", ap_rejected: "مرفوضة", ap_cancelled: "ملغاة",
    da_verbal_warning: "إنذار شفهي", da_warning_letter: "خطاب إنذار", da_written_warning: "إنذار كتابي",
    da_final_warning: "إنذار نهائي", da_corrective_action: "إجراء تصحيحي", da_other: "أخرى",
    ds_active: "سارٍ", ds_revoked: "ملغى", ds_closed: "مغلق",
    ca_open: "مفتوح", ca_in_progress: "قيد التنفيذ", ca_closed: "مغلق", ca_overdue: "متأخر",
    kd_resignation: "استقالة", kd_termination: "إنهاء خدمة", kd_retirement: "تقاعد",
    rl_super_admin: "مدير النظام", rl_hr_admin: "موارد بشرية", rl_manager: "مدير", rl_viewer: "مطّلع",
    ev_record_created: "إنشاء ملف الموظف", ev_joined: "مباشرة العمل", ev_rehired: "إعادة توظيف",
    ev_transfer: "نقل", ev_resignation: "استقالة", ev_termination: "إنهاء خدمة",
    ev_retirement: "تقاعد", ev_last_working_day: "آخر يوم عمل", ev_leave: "إجازة",
    ev_late: "تأخير", ev_absent: "غياب", ev_disciplinary: "إجراء انضباطي",
    ev_corrective_opened: "فتح إجراء تصحيحي", ev_corrective_closed: "إغلاق إجراء تصحيحي",
    al_corrective_overdue: "إجراء تصحيحي متأخر", al_corrective_due: "إجراء تصحيحي يستحق قريبًا",
    al_probation_end: "نهاية فترة تجربة", al_leave_pending: "إجازة بانتظار الاعتماد",
    ac_create: "إضافة", ac_update: "تعديل", ac_delete: "حذف", ac_archive: "أرشفة",
    ac_unarchive: "إلغاء أرشفة", ac_import: "استيراد", ac_export: "تصدير", ac_backup: "نسخ احتياطي",
    ac_password: "كلمة مرور", ac_upload: "رفع مرفق", ac_revoke: "إنهاء جلسة",
    ac_maintenance: "صيانة",
    en_employee: "موظف", en_transfer: "نقل", en_resignation: "استقالة", en_termination: "إنهاء خدمة",
    en_retirement: "تقاعد", en_rehire: "إعادة توظيف", en_attendance: "حضور", en_leave: "إجازة",
    en_disciplinary: "إجراء انضباطي", en_corrective: "إجراء تصحيحي", en_user: "مستخدم",
    en_settings: "إعدادات", en_permissions: "صلاحيات", en_attachment: "مرفق",
    en_branches: "فرع", en_departments: "قسم", en_employees: "موظفون", en_system: "النظام",
    en_session: "جلسة", en_backup: "نسخة احتياطية",
    "en_job-titles": "مسمى وظيفي", "en_leave-types": "نوع إجازة",
    wd_0: "الأحد", wd_1: "الاثنين", wd_2: "الثلاثاء", wd_3: "الأربعاء",
    wd_4: "الخميس", wd_5: "الجمعة", wd_6: "السبت",

    /* الصلاحيات */
    "p_employees.view": "عرض الموظفين", "p_employees.create": "إضافة موظف",
    "p_employees.edit": "تعديل بيانات موظف", "p_employees.archive": "أرشفة موظف",
    "p_employees.delete": "حذف نهائي", "p_pii.national_id": "عرض رقم الهوية كاملًا",
    "p_movements.manage": "النقل والاستقالة وإنهاء الخدمة",
    "p_attendance.view": "عرض الحضور", "p_attendance.manage": "تسجيل الحضور",
    "p_leaves.view": "عرض الإجازات", "p_leaves.manage": "تسجيل الإجازات",
    "p_discipline.view": "عرض الإجراءات", "p_discipline.manage": "تسجيل الإجراءات",
    "p_attachments.upload": "رفع المرفقات", "p_attachments.delete": "حذف المرفقات",
    "p_reports.view": "عرض التقارير", "p_reports.export": "تصدير التقارير",
    "p_import.run": "الاستيراد من إكسل", "p_lookups.manage": "إدارة القوائم",
    "p_users.manage": "إدارة المستخدمين", "p_settings.manage": "إعدادات النظام",
    "p_audit.view": "عرض سجل التدقيق", "p_backup.manage": "النسخ الاحتياطية",
  };

  const EN = {
    appName: "HR Staff Management",
    login: "Sign in", logout: "Sign out", username: "Username", password: "Password",
    signInSub: "Sign in to continue", loginFoot: "Secure connection · sign-in attempts are logged",
    save: "Save", cancel: "Cancel", close: "Close", edit: "Edit", add: "Add", delete: "Delete",
    search: "Search", filter: "Filter", reset: "Clear", apply: "Apply", export: "Export",
    exportExcel: "Export to Excel", print: "Print / PDF", confirm: "Confirm", yes: "Yes", no: "No",
    all: "All", none: "None", total: "Total", details: "Details", actions: "Actions",
    loading: "Loading…", noData: "No data", saved: "Saved", deleted: "Deleted",
    required: "Required", optional: "Optional", back: "Back", next: "Next", prev: "Previous",
    page: "Page", of: "of", rows: "records", showing: "Showing", more: "More", notes: "Notes",
    reason: "Reason", attachment: "Attachment", attachments: "Attachments", upload: "Upload",
    download: "Download", from: "From", to: "To", date: "Date", day: "day", days: "days",
    minutes: "min", times: "times", status: "Status", type: "Type", createdAt: "Created at",
    createdBy: "Created by", updatedAt: "Updated at", updatedBy: "Updated by", eventDate: "Event date",
    quickSearchPlaceholder: "Search by National ID, Employee ID or name",
    sessionExpired: "Session expired — please sign in again",
    networkError: "Cannot reach the server",
    serverRequired: "This page is the front end of a server-side system — start the server (node server.js) and open it from its address.",
    confirmDelete: "Delete this? It cannot be undone.",

    navDashboard: "Dashboard", navEmployees: "Employees", navAttendance: "Attendance",
    navLeaves: "Leaves", navDiscipline: "Disciplinary", navMovements: "Movements",
    navReports: "Reports", navImport: "Import", navAdmin: "Administration",

    dashboard: "Dashboard", today: "Today", thisWeek: "This week", thisMonth: "This month",
    thisYear: "This year", custom: "Custom range", period: "Period",
    openingHeadcount: "Opening headcount", closingHeadcount: "Closing headcount",
    currentActive: "Active now", newJoiners: "New joiners", newHires: "New hires",
    rehires: "Rehires", resignations: "Resignations", terminations: "Terminations",
    retirements: "Retirements", transfersIn: "Transfers in", transfersOut: "Transfers out",
    transfers: "Transfers",
    present: "Present", absent: "Absent", late: "Late", lateOccurrences: "Late occurrences",
    lateMinutes: "Total late minutes", lateAverage: "Average late",
    sickLeave: "Sick leave", sickLeaveDays: "Sick leave days",
    annualLeaveDays: "Annual leave days", otherLeaveDays: "Other leave days",
    permissions: "Permissions", missions: "Official missions", warningLetters: "Warning letters",
    correctiveActions: "Corrective actions", correctiveOpen: "Open", correctiveOverdue: "Overdue",
    disciplinaryTotal: "Disciplinary actions", headcount: "Headcount",
    headcountTrend: "Headcount trend", joinersVsLeavers: "Joiners vs leavers",
    headcountByBranch: "Headcount by branch", headcountByDepartment: "Headcount by department",
    absenceByBranch: "Absence by branch", lateByDepartment: "Late by department",
    statusBreakdown: "Status breakdown", alerts: "Needs attention", noAlerts: "Nothing pending",
    reconciliation: "Reconciliation", reconciliationOk: "Figures reconcile",
    reconciliationOff: "Reconciliation difference: {n}",
    showTable: "Show as table", hideTable: "Hide table",

    employees: "Employees", employee: "Employee", addEmployee: "Add employee",
    employeeNo: "Employee ID", nationalId: "National ID", fullNameAr: "Name",
    fullNameEn: "English name", gender: "Gender", mobile: "Mobile", email: "Email",
    dob: "Date of birth", nationality: "Nationality", joiningDate: "Joining date",
    originalJoiningDate: "Original joining date", employmentStatus: "Employment status",
    employmentType: "Employment type", employeeCategory: "Employee category", branch: "Branch",
    department: "Department", jobTitle: "Job title", manager: "Direct manager",
    positionStartDate: "Current position start", branchStartDate: "Current branch start",
    probationEnd: "Probation end", archived: "Archived", includeArchived: "Include archived",
    profile: "Employee profile", timeline: "Timeline", employmentHistory: "Employment history",
    statusHistory: "Status history", periods: "Employment periods", period_: "Period",
    stats: "Statistics", serviceYears: "Service", age: "Age",
    recordTransfer: "Record transfer", recordResignation: "Record resignation",
    recordTermination: "Record termination", recordRetirement: "Record retirement", rehire: "Rehire",
    archive: "Archive", unarchive: "Unarchive", deleteForever: "Delete permanently",
    transferDate: "Transfer date", toBranch: "To branch", toDepartment: "To department",
    toJobTitle: "To job title", approvedBy: "Approved by", resignationDate: "Resignation date",
    terminationDate: "Decision date", lastWorkingDate: "Last working date",
    resignationType: "Resignation type", terminationType: "Termination type",
    noticePeriod: "Notice period (days)", rehireDate: "Rehire date",
    previousLeaving: "Previous last working date", advancedSearch: "Advanced search",
    joinedFrom: "Joined from", joinedTo: "Joined to", noEmployees: "No matching employees",
    duplicateNationalId: "This National ID already exists",
    duplicateEmployeeNo: "This Employee ID already exists",
    openEmployee: "Open profile", deleteReason: "Reason for permanent deletion",
    nidHidden: "National ID hidden — you lack permission to view it",

    attendance: "Attendance", addAttendance: "Record attendance", bulkAttendance: "Record a full day",
    checkIn: "Check-in", checkOut: "Check-out", scheduledTime: "Scheduled time",
    lateMinutesField: "Late minutes", approved: "Approved", unapproved: "Unapproved",
    absenceType: "Absence type", attendanceExists: "A record exists for this day — it will be updated",
    markAllPresent: "Mark all present", saveDay: "Save day",

    leaves: "Leaves", addLeave: "Record leave", leaveType: "Leave type",
    startDate: "Start date", endDate: "End date", numberOfDays: "Number of days",
    approvalStatus: "Approval status", medicalCertificate: "Medical certificate",
    daysComputed: "Calculated from the two dates",

    discipline: "Disciplinary actions", disciplinaryAction: "Disciplinary action",
    addDisciplinary: "Record disciplinary action", actionType: "Action type", actionDate: "Action date",
    description: "Description", actionTaken: "Action taken", issuedBy: "Issued by",
    corrective: "Corrective actions", addCorrective: "Open corrective action",
    dateOpened: "Date opened", dueDate: "Due date", dateClosed: "Date closed",
    responsiblePerson: "Responsible person", correctiveActionField: "Corrective action",
    closureNotes: "Closure notes", overdueNote: "Past its due date",

    movements: "Movements", transfersTab: "Transfers", separationsTab: "Separations",
    cancelSeparation: "Cancel record", cancelReason: "Cancellation reason",

    reports: "Reports", monthlyReport: "Monthly report", annualReport: "Annual report",
    customReport: "Custom range", branchReport: "By branch", departmentReport: "By department",
    jobTitleReport: "By job title", month: "Month", year: "Year",
    employeeMovement: "Employee movement", monthlyTable: "Monthly table",
    opening: "Opening", closing: "Closing", joiners: "Joiners",
    resigned: "Resigned", terminated: "Terminated",
    headcountAt: "Headcount on", viewHeadcount: "View names",
    reportNote: "Every figure is computed from the records when the report is run — no manually entered numbers.",

    import: "Import", importEmployees: "Import employees from Excel",
    downloadTemplate: "Download template", chooseFile: "Choose file", preview: "Preview",
    mapping: "Column mapping", commit: "Run import", createMissing: "Create missing branches/departments",
    updateExisting: "Update existing", importSummary: "Summary", willCreate: "To add",
    willUpdate: "To update", willSkip: "To skip", withErrors: "With errors", line: "Row",
    importDone: "Imported: {c} added · {u} updated", importNothing: "Nothing to import",
    importHint: "Nothing is written until you press “Run import”.",

    admin: "Administration", users: "Users", addUser: "Add user", role: "Role",
    fullName: "Full name", active: "Active", inactive: "Disabled", resetPassword: "Reset password",
    newPassword: "New password", currentPassword: "Current password",
    changePassword: "Change password", mustChangePassword: "Password change required",
    branchScope: "Allowed branches", allBranches: "All branches",
    sessions: "Active sessions", revokeSession: "End session", lastSeen: "Last seen",
    loginLog: "Sign-in log", permissionsMatrix: "Permission matrix",
    lookups: "Lists", branches: "Branches", departments: "Departments", jobTitles: "Job titles",
    leaveTypes: "Leave types", code: "Code", nameAr: "Arabic name", nameEn: "English name",
    city: "City", isActive: "Active", deactivate: "Deactivate", activate: "Activate",
    settings: "Settings", orgName: "Organisation name", workDays: "Working days",
    leaveDaysBasis: "Leave day counting", calendarDays: "Calendar days", workDaysBasis: "Working days",
    probationDays: "Probation (days)", lateGrace: "Late grace (minutes)",
    correctiveDueSoon: "Due-soon alert (days)", nationalIdDigits: "National ID digits",
    auditLog: "Audit log", activityLog: "Activity log", backups: "Backups",
    backupNow: "Back up now", backupHint: "Daily backups run automatically; this is an extra one.",
    retention: "Retention", user: "User", action: "Action", entity: "Entity",
    before: "Before", after: "After", field: "Field", ip: "IP",
    auditNote: "The audit log cannot be edited or deleted from inside the system.",
    refreshSnapshots: "Recompute statuses",

    st_active: "Active", st_resigned: "Resigned", st_terminated: "Terminated",
    st_retired: "Retired", st_on_leave: "On leave", st_suspended: "Suspended", st_transferred: "Transferred",
    ty_full_time: "Full time", ty_part_time: "Part time", ty_contract: "Contract",
    ty_temporary: "Temporary", ty_intern: "Intern", ty_locum: "Locum",
    g_male: "Male", g_female: "Female",
    at_present: "Present", at_absent: "Absent", at_late: "Late", at_sick_leave: "Sick leave",
    at_annual_leave: "Annual leave", at_emergency_leave: "Emergency leave", at_other_leave: "Other leave",
    at_permission: "Permission", at_official_mission: "Official mission", at_holiday: "Holiday", at_other: "Other",
    ap_pending: "Pending", ap_approved: "Approved", ap_rejected: "Rejected", ap_cancelled: "Cancelled",
    da_verbal_warning: "Verbal warning", da_warning_letter: "Warning letter", da_written_warning: "Written warning",
    da_final_warning: "Final warning", da_corrective_action: "Corrective action", da_other: "Other",
    ds_active: "Active", ds_revoked: "Revoked", ds_closed: "Closed",
    ca_open: "Open", ca_in_progress: "In progress", ca_closed: "Closed", ca_overdue: "Overdue",
    kd_resignation: "Resignation", kd_termination: "Termination", kd_retirement: "Retirement",
    rl_super_admin: "Super admin", rl_hr_admin: "HR / Admin", rl_manager: "Manager", rl_viewer: "Viewer",
    ev_record_created: "Employee record created", ev_joined: "Joined the company", ev_rehired: "Rehired",
    ev_transfer: "Transfer", ev_resignation: "Resignation", ev_termination: "Termination",
    ev_retirement: "Retirement", ev_last_working_day: "Last working day", ev_leave: "Leave",
    ev_late: "Late", ev_absent: "Absent", ev_disciplinary: "Disciplinary action",
    ev_corrective_opened: "Corrective action opened", ev_corrective_closed: "Corrective action closed",
    al_corrective_overdue: "Corrective action overdue", al_corrective_due: "Corrective action due soon",
    al_probation_end: "Probation ending", al_leave_pending: "Leave awaiting approval",
    ac_create: "Create", ac_update: "Update", ac_delete: "Delete", ac_archive: "Archive",
    ac_unarchive: "Unarchive", ac_import: "Import", ac_export: "Export", ac_backup: "Backup",
    ac_password: "Password", ac_upload: "Upload", ac_revoke: "Revoke session",
    ac_maintenance: "Maintenance",
    en_employee: "Employee", en_transfer: "Transfer", en_resignation: "Resignation",
    en_termination: "Termination", en_retirement: "Retirement", en_rehire: "Rehire",
    en_attendance: "Attendance", en_leave: "Leave", en_disciplinary: "Disciplinary",
    en_corrective: "Corrective", en_user: "User", en_settings: "Settings",
    en_permissions: "Permissions", en_attachment: "Attachment", en_branches: "Branch",
    en_departments: "Department", en_employees: "Employees", en_system: "System",
    en_session: "Session", en_backup: "Backup",
    "en_job-titles": "Job title", "en_leave-types": "Leave type",
    wd_0: "Sunday", wd_1: "Monday", wd_2: "Tuesday", wd_3: "Wednesday",
    wd_4: "Thursday", wd_5: "Friday", wd_6: "Saturday",

    "p_employees.view": "View employees", "p_employees.create": "Add employees",
    "p_employees.edit": "Edit employees", "p_employees.archive": "Archive employees",
    "p_employees.delete": "Delete permanently", "p_pii.national_id": "View full National ID",
    "p_movements.manage": "Transfers, resignations, terminations",
    "p_attendance.view": "View attendance", "p_attendance.manage": "Record attendance",
    "p_leaves.view": "View leaves", "p_leaves.manage": "Record leaves",
    "p_discipline.view": "View disciplinary", "p_discipline.manage": "Record disciplinary",
    "p_attachments.upload": "Upload attachments", "p_attachments.delete": "Delete attachments",
    "p_reports.view": "View reports", "p_reports.export": "Export reports",
    "p_import.run": "Import from Excel", "p_lookups.manage": "Manage lists",
    "p_users.manage": "Manage users", "p_settings.manage": "System settings",
    "p_audit.view": "View audit log", "p_backup.manage": "Backups",
  };

  const DICT = { ar: AR, en: EN };
  let lang = localStorage.getItem("staff_lang") || "ar";
  if (!DICT[lang]) lang = "ar";

  const I18N = {
    get lang() { return lang; },
    get dir() { return lang === "ar" ? "rtl" : "ltr"; },

    t(key, vars) {
      let s = DICT[lang][key];
      if (s === undefined) s = DICT.ar[key] !== undefined ? DICT.ar[key] : key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp("\\{" + k + "\\}", "g"), v);
      return s;
    },

    /* تسمية قيمة تعداد: I18N.e('st', 'active') */
    e(group, value) {
      if (value === null || value === undefined || value === "") return "—";
      return this.t(`${group}_${value}`);
    },

    /* اسم عنصر من القوائم حسب اللغة، والبيانات لا تُترجَم */
    name(obj) {
      if (!obj) return "—";
      if (typeof obj === "string") return obj;
      const ar = obj.nameAr || obj.name_ar;
      const en = obj.nameEn || obj.name_en;
      return (lang === "en" ? en || ar : ar || en) || "—";
    },

    person(e) {
      if (!e) return "—";
      const ar = e.fullNameAr || e.full_name_ar;
      const en = e.fullNameEn || e.full_name_en;
      return (lang === "en" ? en || ar : ar || en) || "—";
    },

    num(n, digits) {
      if (n === null || n === undefined || n === "") return "—";
      const v = Number(n);
      if (!Number.isFinite(v)) return "—";
      return new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US",
        { maximumFractionDigits: digits === undefined ? 1 : digits }).format(v);
    },

    /* التواريخ تُعرض DD/MM/YYYY وتُدخَل ISO */
    date(iso) {
      if (!iso) return "—";
      const s = String(iso).slice(0, 10);
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
    },

    dateTime(iso) {
      if (!iso) return "—";
      const d = new Date(iso);
      if (isNaN(d)) return String(iso).slice(0, 16).replace("T", " ");
      const p = (n) => String(n).padStart(2, "0");
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    },

    monthName(m) {
      const ar = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس",
        "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
      const en = ["January", "February", "March", "April", "May", "June", "July", "August",
        "September", "October", "November", "December"];
      return (lang === "en" ? en : ar)[Number(m) - 1] || String(m);
    },

    setLang(next) {
      if (!DICT[next]) return;
      lang = next;
      localStorage.setItem("staff_lang", next);
      document.documentElement.lang = next;
      document.documentElement.dir = this.dir;
    },

    apply() {
      document.documentElement.lang = lang;
      document.documentElement.dir = this.dir;
    },
  };

  window.I18N = I18N;
  I18N.apply();
})();
