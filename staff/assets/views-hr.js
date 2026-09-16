/* ======================================================================
   عمليات الموارد البشرية — الحضور والإجازات والإجراءات والحركات
   ----------------------------------------------------------------------
   كل قسم له شاشته الكاملة ولوحته المصغَّرة داخل ملف الموظف، من نفس
   الكود: تختلف في أن اللوحة تثبّت الموظف وتُخفي عموده.
   ====================================================================== */

(function () {
  "use strict";

  const { el, frag, card, table, filters, toast, formModal, confirm, tag, pageHead } = window.UI;
  const T = (k, v) => window.I18N.t(k, v);
  const N = window.I18N;

  const lookups = () => window.App.state.lookups;
  const enums = () => window.App.state.enums;
  const opts = (list) => list.filter((x) => x.isActive !== false).map((x) => ({ value: x.id, label: N.name(x) }));
  const enumOpts = (group, list) => list.map((v) => ({ value: v, label: N.e(group, v) }));
  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

  /* قسم عام: مرشّحات + جدول + زر إضافة، ويُعاد تحميله عند كل تغيير */
  function section(cfg) {
    const box = el("div");
    let state = Object.assign({ page: 1, size: 25 }, cfg.initial || {});

    async function load() {
      const head = el("div");
      const body = el("div", {}, window.UI.loading());
      window.UI.mount(box, frag([head, body]));

      if (cfg.filterFields && cfg.filterFields.length) {
        head.appendChild(filters({
          values: state,
          fields: cfg.filterFields,
          onChange: (v) => { state = Object.assign(state, v, { page: 1 }); load(); },
        }));
      }
      try {
        const q = Object.assign({}, state, cfg.fixed || {});
        const data = await window.API.get(cfg.endpoint, q);
        window.UI.mount(body, frag([
          cfg.summary ? cfg.summary(data) : null,
          table({
            columns: cfg.columns(),
            rows: data.rows, total: data.total, page: data.page, size: data.size,
            onPage: (p) => { state.page = p; load(); },
            onRow: cfg.onRow,
            empty: cfg.empty || T("noData"),
          }),
        ]));
      } catch (e) {
        window.UI.mount(body, el("div", { class: "empty error", text: e.message }));
      }
    }
    load();
    return { el: box, reload: load, state: () => state };
  }

  const actionCell = (canEdit, onEdit, onDelete) => frag([
    canEdit ? el("button", { class: "btn small", type: "button", text: T("edit"), on: { click: onEdit } }) : null,
    canEdit ? el("button", {
      class: "btn small danger", type: "button", text: T("delete"),
      on: {
        click: async () => {
          if (!(await confirm({ message: T("confirmDelete"), danger: true }))) return;
          try { await onDelete(); toast(T("deleted"), "good"); } catch (e) { window.UI.handleError(e); }
        },
      },
    }) : null,
  ]);

  /* ======================================================== الحضور */

  function attendanceColumns(showEmployee, reload) {
    const canEdit = window.App.can("attendance.manage");
    return [
      { key: "date", label: T("date"), render: (r) => N.date(r.date) },
      showEmployee ? { key: "emp", label: T("employee"), render: (r) => `${r.employee.employeeNo} — ${N.person(r.employee)}` } : null,
      showEmployee ? { key: "branch", label: T("branch"), render: (r) => N.name(r.branch) } : null,
      { key: "status", label: T("status"), render: (r) => tag(N.e("at", r.status), toneOf(r.status)) },
      { key: "checkIn", label: T("checkIn") },
      { key: "checkOut", label: T("checkOut") },
      { key: "lateMinutes", label: T("lateMinutesField"), num: true, render: (r) => (r.lateMinutes ? N.num(r.lateMinutes, 0) : "—") },
      { key: "approved", label: T("approved"), render: (r) => (r.approved === null ? "—" : r.approved ? tag(T("yes"), "good") : tag(T("no"), "bad")) },
      { key: "reason", label: T("reason") },
      canEdit ? { key: "act", label: T("actions"), render: (r) => actionCell(true,
        () => attendanceForm(r.employee, r, reload),
        async () => { await window.API.del(`/api/attendance/${r.id}`); reload(); }) } : null,
    ].filter(Boolean);
  }

  const toneOf = (s) => (s === "present" ? "good" : s === "absent" ? "bad" : s === "late" ? "warn" : "info");

  function attendanceSummary(data) {
    if (!data.totals) return null;
    return el("div", { class: "kpis", style: { marginBottom: "12px" } }, [
      window.UI.kpi({ label: T("rows"), value: data.total }),
      window.UI.kpi({ label: T("absent"), value: data.totals.absences || 0 }),
      window.UI.kpi({ label: T("lateOccurrences"), value: data.totals.lateCount || 0 }),
      window.UI.kpi({ label: T("lateMinutes"), value: data.totals.lateMinutes || 0 }),
    ]);
  }

  function attendanceForm(employee, existing, onDone) {
    const fixed = !!employee;
    formModal({
      title: existing ? T("edit") : T("addAttendance"),
      submitLabel: T("save"), successMessage: T("saved"),
      values: existing ? {
        employeeId: existing.employee.id, date: existing.date, status: existing.status,
        scheduledTime: existing.scheduledTime, checkIn: existing.checkIn, checkOut: existing.checkOut,
        lateMinutes: existing.lateMinutes, approved: existing.approved,
        absenceType: existing.absenceType, reason: existing.reason, notes: existing.notes,
      } : {
        employeeId: fixed ? employee.id : "", date: window.Dates.today(),
        status: "present", scheduledTime: window.App.state.settings.scheduledStartTime,
      },
      fields: [
        fixed || existing ? null : { key: "employeeId", label: T("employee"), type: "select", required: true,
          options: () => window.App.employeeOptions() },
        { key: "date", label: T("date"), type: "date", required: true },
        { key: "status", label: T("status"), type: "select", required: true, rebuild: true,
          options: () => enumOpts("at", enums().attendanceStatuses) },
        { key: "scheduledTime", label: T("scheduledTime"), type: "time", when: (v) => v.status === "late" || v.status === "present" },
        { key: "checkIn", label: T("checkIn"), type: "time", when: (v) => v.status === "late" || v.status === "present" },
        { key: "checkOut", label: T("checkOut"), type: "time", when: (v) => v.status === "late" || v.status === "present" },
        { key: "lateMinutes", label: T("lateMinutesField"), type: "number", min: 0, max: 1440,
          hint: "يُحسب تلقائيًا من وقت الدوام والحضور إن تُرك فارغًا", when: (v) => v.status === "late" },
        { key: "approved", label: T("approved"), type: "select",
          options: [{ value: "1", label: T("approved") }, { value: "0", label: T("unapproved") }],
          when: (v) => v.status === "absent" || v.status === "late" },
        { key: "absenceType", label: T("absenceType"), when: (v) => v.status === "absent" },
        { key: "reason", label: T("reason"), type: "textarea" },
        { key: "notes", label: T("notes"), type: "textarea" },
      ].filter(Boolean),
      onSubmit: async (v) => {
        const body = Object.assign({}, v, {
          lateMinutes: num(v.lateMinutes),
          approved: v.approved === "" || v.approved === undefined ? null : v.approved === "1" || v.approved === true,
          upsert: true,
        });
        if (existing) await window.API.patch(`/api/attendance/${existing.id}`, body);
        else await window.API.post("/api/attendance", body);
        if (onDone) onDone();
        return true;
      },
    });
  }

  /* إدخال يوم كامل لفرع: صفّ لكل موظف، وحفظ واحد */
  async function bulkDay() {
    const state = { date: window.Dates.today(), branchId: "" };
    const body = el("div");
    const m = window.UI.modal({
      title: T("bulkAttendance"), wide: true, body,
      actions: [
        { label: T("cancel"), onClick: (c) => c() },
        "spacer",
        { label: T("saveDay"), kind: "primary", onClick: () => save() },
      ],
    });
    const rowsBox = el("div");
    const inputs = new Map();

    const head = filters({
      values: state,
      fields: [
        { key: "date", label: T("date"), type: "date" },
        { key: "branchId", label: T("branch"), type: "select", options: () => opts(lookups().branches) },
      ],
      onChange: (v) => { Object.assign(state, v); loadRows(); },
      actions: [el("button", {
        class: "btn small", type: "button", text: T("markAllPresent"),
        on: { click: () => inputs.forEach((rec) => { rec.status.value = "present"; }) },
      })],
    });
    window.UI.mount(body, frag([head, rowsBox]));
    loadRows();

    async function loadRows() {
      window.UI.mount(rowsBox, window.UI.loading());
      inputs.clear();
      const data = await window.API.get("/api/reports/headcount", { date: state.date, branchId: state.branchId || undefined, size: 500 });
      if (!data.rows.length) return window.UI.mount(rowsBox, el("div", { class: "empty", text: T("noEmployees") }));
      const existing = await window.API.get("/api/attendance", { date: state.date, branchId: state.branchId || undefined, size: 500 });
      const byEmp = Object.fromEntries(existing.rows.map((r) => [r.employee.id, r]));

      window.UI.mount(rowsBox, table({
        columns: [
          { key: "employeeNo", label: T("employeeNo") },
          { key: "name", label: T("fullNameAr"), render: (r) => N.person(r) },
          { key: "status", label: T("status"), render: (r) => {
            const sel = el("select", { style: { minWidth: "130px" } });
            enums().attendanceStatuses.forEach((s) => sel.appendChild(el("option", { value: s, text: N.e("at", s) })));
            sel.value = byEmp[r.id] ? byEmp[r.id].status : "present";
            inputs.set(r.id, Object.assign(inputs.get(r.id) || {}, { status: sel }));
            return sel;
          } },
          { key: "checkIn", label: T("checkIn"), render: (r) => {
            const inp = el("input", { type: "time", style: { width: "110px" }, value: byEmp[r.id] ? byEmp[r.id].checkIn || "" : "" });
            inputs.set(r.id, Object.assign(inputs.get(r.id) || {}, { checkIn: inp }));
            return inp;
          } },
          { key: "reason", label: T("reason"), render: (r) => {
            const inp = el("input", { value: byEmp[r.id] ? byEmp[r.id].reason || "" : "" });
            inputs.set(r.id, Object.assign(inputs.get(r.id) || {}, { reason: inp }));
            return inp;
          } },
        ],
        rows: data.rows,
      }));
    }

    async function save() {
      const rows = [];
      inputs.forEach((rec, employeeId) => {
        rows.push({
          employeeId, date: state.date, status: rec.status.value,
          checkIn: rec.checkIn.value || null, reason: rec.reason.value || null,
          scheduledTime: window.App.state.settings.scheduledStartTime,
        });
      });
      if (!rows.length) return;
      try {
        const out = await window.API.post("/api/attendance/bulk", { rows, date: state.date });
        toast(`${T("saved")}: ${N.num(out.saved, 0)}` + (out.errors.length ? ` · ${T("withErrors")}: ${out.errors.length}` : ""),
          out.errors.length ? "bad" : "good");
        m.close();
        window.App.rerender();
      } catch (e) { window.UI.handleError(e); }
    }
  }

  function attendanceView(view) {
    const canEdit = window.App.can("attendance.manage");
    const s = section({
      endpoint: "/api/attendance",
      initial: { from: window.Dates.monthStart(window.Dates.today()), to: window.Dates.today() },
      filterFields: [
        { key: "q", label: T("search"), type: "text", grow: true },
        { key: "from", label: T("from"), type: "date" },
        { key: "to", label: T("to"), type: "date" },
        { key: "status", label: T("status"), type: "select", options: () => enumOpts("at", enums().attendanceStatuses) },
        { key: "branchId", label: T("branch"), type: "select", options: () => opts(lookups().branches) },
        { key: "departmentId", label: T("department"), type: "select", options: () => opts(lookups().departments) },
      ],
      summary: attendanceSummary,
      columns: () => attendanceColumns(true, () => s.reload()),
    });
    view.appendChild(pageHead(T("attendance"), [
      canEdit ? el("button", { class: "btn primary", type: "button", text: "＋ " + T("addAttendance"), on: { click: () => attendanceForm(null, null, () => s.reload()) } }) : null,
      canEdit ? el("button", { class: "btn", type: "button", text: T("bulkAttendance"), on: { click: bulkDay } }) : null,
      window.App.can("reports.export") ? el("button", {
        class: "btn", type: "button", text: T("exportExcel"),
        on: { click: () => window.App.download("/api/export/attendance.xlsx", Object.assign({ lang: N.lang }, s.state())) },
      }) : null,
    ]));
    view.appendChild(s.el);
  }

  function attendancePanel(ctx) {
    const s = section({
      endpoint: "/api/attendance",
      fixed: { employeeId: ctx.employeeId },
      initial: { size: 50 },
      filterFields: [
        { key: "from", label: T("from"), type: "date" },
        { key: "to", label: T("to"), type: "date" },
        { key: "status", label: T("status"), type: "select", options: () => enumOpts("at", enums().attendanceStatuses) },
      ],
      summary: attendanceSummary,
      columns: () => attendanceColumns(false, () => s.reload()),
    });
    return card(T("attendance"), s.el, window.App.can("attendance.manage")
      ? el("button", { class: "btn small primary", type: "button", text: "＋ " + T("addAttendance"),
        on: { click: () => attendanceForm(ctx.employee, null, () => s.reload()) } })
      : null);
  }

  /* ======================================================= الإجازات */

  function leaveColumns(showEmployee, reload) {
    const canEdit = window.App.can("leaves.manage");
    return [
      showEmployee ? { key: "emp", label: T("employee"), render: (r) => `${r.employee.employeeNo} — ${N.person(r.employee)}` } : null,
      { key: "leaveType", label: T("leaveType"), render: (r) => N.name(r.leaveType) },
      { key: "startDate", label: T("startDate"), render: (r) => N.date(r.startDate) },
      { key: "endDate", label: T("endDate"), render: (r) => N.date(r.endDate) },
      { key: "days", label: T("numberOfDays"), num: true, render: (r) => N.num(r.days, 0) },
      { key: "approvalStatus", label: T("approvalStatus"),
        render: (r) => tag(N.e("ap", r.approvalStatus), r.approvalStatus === "approved" ? "good" : r.approvalStatus === "pending" ? "warn" : "") },
      { key: "medicalCertificate", label: T("medicalCertificate"), render: (r) => (r.medicalCertificate ? "✓" : "—") },
      { key: "attachments", label: T("attachments"), num: true, render: (r) => (r.attachments ? N.num(r.attachments, 0) : "—") },
      { key: "reason", label: T("reason") },
      canEdit ? { key: "act", label: T("actions"), render: (r) => frag([
        actionCell(true, () => leaveForm(r.employee, r, reload), async () => { await window.API.del(`/api/leaves/${r.id}`); reload(); }),
        window.App.can("attachments.upload") ? el("button", {
          class: "btn small", type: "button", text: T("attachment"),
          on: { click: () => attachModal({ employeeId: r.employee.id, refType: "leave", refId: r.id }, reload) },
        }) : null,
      ]) } : null,
    ].filter(Boolean);
  }

  function leaveForm(employee, existing, onDone) {
    const fixed = !!employee && !existing;
    formModal({
      title: existing ? T("edit") : T("addLeave"),
      submitLabel: T("save"), successMessage: T("saved"),
      values: existing ? {
        employeeId: existing.employee.id, leaveTypeId: existing.leaveType && existing.leaveType.id,
        startDate: existing.startDate, endDate: existing.endDate, days: existing.days,
        approvalStatus: existing.approvalStatus, medicalCertificate: existing.medicalCertificate,
        approvedBy: existing.approvedBy, reason: existing.reason, notes: existing.notes,
      } : {
        employeeId: fixed ? employee.id : "", startDate: window.Dates.today(), endDate: window.Dates.today(),
        approvalStatus: "approved",
      },
      fields: [
        fixed || existing ? null : { key: "employeeId", label: T("employee"), type: "select", required: true,
          options: () => window.App.employeeOptions() },
        { key: "leaveTypeId", label: T("leaveType"), type: "select", required: true, options: () => opts(lookups().leaveTypes) },
        { key: "startDate", label: T("startDate"), type: "date", required: true, rebuild: true },
        { key: "endDate", label: T("endDate"), type: "date", required: true, rebuild: true },
        { key: "days", label: T("numberOfDays"), type: "number", min: 1, hint: T("daysComputed"),
          placeholder: computedDays },
        { key: "approvalStatus", label: T("approvalStatus"), type: "select", required: true,
          options: () => enumOpts("ap", enums().leaveApprovals) },
        { key: "medicalCertificate", label: T("medicalCertificate"), type: "checkbox" },
        { key: "approvedBy", label: T("approvedBy") },
        { key: "reason", label: T("reason"), type: "textarea" },
        { key: "notes", label: T("notes"), type: "textarea" },
      ].filter(Boolean),
      onSubmit: async (v) => {
        const body = Object.assign({}, v, { leaveTypeId: num(v.leaveTypeId), days: num(v.days) });
        if (existing) await window.API.patch(`/api/leaves/${existing.id}`, body);
        else await window.API.post("/api/leaves", body);
        if (onDone) onDone();
        return true;
      },
    });
    function computedDays() { return ""; }
  }

  function leavesView(view) {
    const canEdit = window.App.can("leaves.manage");
    const s = section({
      endpoint: "/api/leaves",
      initial: { from: window.Dates.yearStart(window.Dates.today()), to: window.Dates.today() },
      filterFields: [
        { key: "q", label: T("search"), type: "text", grow: true },
        { key: "from", label: T("from"), type: "date" },
        { key: "to", label: T("to"), type: "date" },
        { key: "leaveTypeId", label: T("leaveType"), type: "select", options: () => opts(lookups().leaveTypes) },
        { key: "approvalStatus", label: T("approvalStatus"), type: "select", options: () => enumOpts("ap", enums().leaveApprovals) },
        { key: "branchId", label: T("branch"), type: "select", options: () => opts(lookups().branches) },
      ],
      summary: (data) => el("div", { class: "kpis", style: { marginBottom: "12px" } }, [
        window.UI.kpi({ label: T("rows"), value: data.total }),
        window.UI.kpi({ label: T("days"), value: (data.totals && data.totals.days) || 0 }),
        window.UI.kpi({ label: T("sickLeaveDays"), value: (data.totals && data.totals.sickDays) || 0 }),
      ]),
      columns: () => leaveColumns(true, () => s.reload()),
    });
    view.appendChild(pageHead(T("leaves"), [
      canEdit ? el("button", { class: "btn primary", type: "button", text: "＋ " + T("addLeave"), on: { click: () => leaveForm(null, null, () => s.reload()) } }) : null,
      window.App.can("reports.export") ? el("button", {
        class: "btn", type: "button", text: T("exportExcel"),
        on: { click: () => window.App.download("/api/export/leaves.xlsx", Object.assign({ lang: N.lang }, s.state())) },
      }) : null,
    ]));
    view.appendChild(s.el);
  }

  function leavesPanel(ctx) {
    const s = section({
      endpoint: "/api/leaves", fixed: { employeeId: ctx.employeeId }, initial: { size: 50 },
      columns: () => leaveColumns(false, () => s.reload()),
    });
    return card(T("leaves"), s.el, window.App.can("leaves.manage")
      ? el("button", { class: "btn small primary", type: "button", text: "＋ " + T("addLeave"),
        on: { click: () => leaveForm(ctx.employee, null, () => s.reload()) } })
      : null);
  }

  /* ================================================== الانضباطية */

  function disciplinaryColumns(showEmployee, reload) {
    const canEdit = window.App.can("discipline.manage");
    return [
      { key: "actionDate", label: T("actionDate"), render: (r) => N.date(r.actionDate) },
      showEmployee ? { key: "emp", label: T("employee"), render: (r) => `${r.employee.employeeNo} — ${N.person(r.employee)}` } : null,
      showEmployee ? { key: "branch", label: T("branch"), render: (r) => N.name(r.branch) } : null,
      { key: "actionType", label: T("actionType"), render: (r) => tag(N.e("da", r.actionType),
        r.actionType === "final_warning" ? "bad" : r.actionType === "verbal_warning" ? "" : "warn") },
      { key: "reason", label: T("reason") },
      { key: "actionTaken", label: T("actionTaken") },
      { key: "issuedBy", label: T("issuedBy") },
      { key: "status", label: T("status"), render: (r) => N.e("ds", r.status) },
      { key: "attachments", label: T("attachments"), num: true, render: (r) => (r.attachments ? N.num(r.attachments, 0) : "—") },
      canEdit ? { key: "act", label: T("actions"), render: (r) => frag([
        actionCell(true, () => disciplinaryForm(r.employee, r, reload), async () => { await window.API.del(`/api/disciplinary/${r.id}`); reload(); }),
        window.App.can("attachments.upload") ? el("button", {
          class: "btn small", type: "button", text: T("attachment"),
          on: { click: () => attachModal({ employeeId: r.employee.id, refType: "disciplinary", refId: r.id }, reload) },
        }) : null,
      ]) } : null,
    ].filter(Boolean);
  }

  function disciplinaryForm(employee, existing, onDone) {
    const fixed = !!employee && !existing;
    formModal({
      title: existing ? T("edit") : T("addDisciplinary"),
      submitLabel: T("save"), successMessage: T("saved"),
      intro: "تاريخ الإجراء هو تاريخ وقوعه لا تاريخ إدخاله — وبه يظهر في تقرير شهره.",
      values: existing ? {
        employeeId: existing.employee.id, actionDate: existing.actionDate, actionType: existing.actionType,
        reason: existing.reason, description: existing.description, actionTaken: existing.actionTaken,
        issuedBy: existing.issuedBy, status: existing.status, notes: existing.notes,
      } : {
        employeeId: fixed ? employee.id : "", actionDate: window.Dates.today(),
        actionType: "warning_letter", status: "active",
      },
      fields: [
        fixed || existing ? null : { key: "employeeId", label: T("employee"), type: "select", required: true,
          options: () => window.App.employeeOptions() },
        { key: "actionDate", label: T("actionDate"), type: "date", required: true },
        { key: "actionType", label: T("actionType"), type: "select", required: true, options: () => enumOpts("da", enums().actionTypes) },
        { key: "issuedBy", label: T("issuedBy") },
        { key: "status", label: T("status"), type: "select", options: () => enumOpts("ds", enums().actionStatuses) },
        { key: "reason", label: T("reason"), type: "textarea" },
        { key: "description", label: T("description"), type: "textarea" },
        { key: "actionTaken", label: T("actionTaken"), type: "textarea" },
        { key: "notes", label: T("notes"), type: "textarea" },
      ].filter(Boolean),
      onSubmit: async (v) => {
        if (existing) await window.API.patch(`/api/disciplinary/${existing.id}`, v);
        else await window.API.post("/api/disciplinary", v);
        if (onDone) onDone();
        return true;
      },
    });
  }

  function correctiveColumns(showEmployee, reload) {
    const canEdit = window.App.can("discipline.manage");
    return [
      { key: "dateOpened", label: T("dateOpened"), render: (r) => N.date(r.dateOpened) },
      showEmployee ? { key: "emp", label: T("employee"), render: (r) => `${r.employee.employeeNo} — ${N.person(r.employee)}` } : null,
      { key: "reason", label: T("reason") },
      { key: "correctiveAction", label: T("correctiveActionField") },
      { key: "responsiblePerson", label: T("responsiblePerson") },
      { key: "dueDate", label: T("dueDate"), render: (r) => N.date(r.dueDate) },
      { key: "status", label: T("status"), render: (r) => tag(N.e("ca", r.displayStatus),
        r.displayStatus === "overdue" ? "bad" : r.status === "closed" ? "good" : "warn") },
      { key: "dateClosed", label: T("dateClosed"), render: (r) => N.date(r.dateClosed) },
      canEdit ? { key: "act", label: T("actions"), render: (r) => frag([
        actionCell(true, () => correctiveForm(r.employee, r, reload), async () => { await window.API.del(`/api/corrective/${r.id}`); reload(); }),
        r.status !== "closed" ? el("button", {
          class: "btn small primary", type: "button", text: T("ca_closed"),
          on: { click: () => closeCorrective(r, reload) },
        }) : null,
      ]) } : null,
    ].filter(Boolean);
  }

  function correctiveForm(employee, existing, onDone) {
    const fixed = !!employee && !existing;
    formModal({
      title: existing ? T("edit") : T("addCorrective"),
      submitLabel: T("save"), successMessage: T("saved"),
      values: existing ? {
        employeeId: existing.employee.id, dateOpened: existing.dateOpened, reason: existing.reason,
        description: existing.description, correctiveAction: existing.correctiveAction,
        responsiblePerson: existing.responsiblePerson, dueDate: existing.dueDate, status: existing.status,
        dateClosed: existing.dateClosed, closureNotes: existing.closureNotes, notes: existing.notes,
      } : {
        employeeId: fixed ? employee.id : "", dateOpened: window.Dates.today(),
        dueDate: window.Dates.addDays(window.Dates.today(), 14), status: "open",
      },
      fields: [
        fixed || existing ? null : { key: "employeeId", label: T("employee"), type: "select", required: true,
          options: () => window.App.employeeOptions() },
        { key: "dateOpened", label: T("dateOpened"), type: "date", required: true },
        { key: "dueDate", label: T("dueDate"), type: "date" },
        { key: "responsiblePerson", label: T("responsiblePerson") },
        { key: "status", label: T("status"), type: "select", required: true, rebuild: true,
          options: () => enumOpts("ca", enums().correctiveStatuses) },
        { key: "dateClosed", label: T("dateClosed"), type: "date", when: (v) => v.status === "closed" },
        { key: "reason", label: T("reason"), type: "textarea" },
        { key: "description", label: T("description"), type: "textarea" },
        { key: "correctiveAction", label: T("correctiveActionField"), type: "textarea" },
        { key: "closureNotes", label: T("closureNotes"), type: "textarea", when: (v) => v.status === "closed" },
        { key: "notes", label: T("notes"), type: "textarea" },
      ].filter(Boolean),
      onSubmit: async (v) => {
        if (existing) await window.API.patch(`/api/corrective/${existing.id}`, v);
        else await window.API.post("/api/corrective", v);
        if (onDone) onDone();
        return true;
      },
    });
  }

  function closeCorrective(r, onDone) {
    formModal({
      title: `${T("ca_closed")} · ${N.person(r.employee)}`,
      submitLabel: T("save"), successMessage: T("saved"),
      values: { dateClosed: window.Dates.today() },
      fields: [
        { key: "dateClosed", label: T("dateClosed"), type: "date", required: true },
        { key: "closureNotes", label: T("closureNotes"), type: "textarea", full: true },
      ],
      onSubmit: async (v) => {
        await window.API.patch(`/api/corrective/${r.id}`, Object.assign({ status: "closed" }, v));
        if (onDone) onDone();
        return true;
      },
    });
  }

  function disciplineView(view) {
    const canEdit = window.App.can("discipline.manage");
    let tab = "actions";
    const head = el("div");
    const bodyBox = el("div");

    const draw = () => {
      const isActions = tab === "actions";
      const s = isActions ? section({
        endpoint: "/api/disciplinary",
        initial: { from: window.Dates.yearStart(window.Dates.today()), to: window.Dates.today() },
        filterFields: [
          { key: "q", label: T("search"), type: "text", grow: true },
          { key: "from", label: T("from"), type: "date" },
          { key: "to", label: T("to"), type: "date" },
          { key: "actionType", label: T("actionType"), type: "select", options: () => enumOpts("da", enums().actionTypes) },
          { key: "branchId", label: T("branch"), type: "select", options: () => opts(lookups().branches) },
        ],
        columns: () => disciplinaryColumns(true, () => s.reload()),
      }) : section({
        endpoint: "/api/corrective",
        filterFields: [
          { key: "q", label: T("search"), type: "text", grow: true },
          { key: "from", label: T("from"), type: "date" },
          { key: "to", label: T("to"), type: "date" },
          { key: "status", label: T("status"), type: "select",
            options: () => enums().correctiveStatuses.concat(["overdue"]).map((v) => ({ value: v, label: N.e("ca", v) })) },
          { key: "branchId", label: T("branch"), type: "select", options: () => opts(lookups().branches) },
        ],
        columns: () => correctiveColumns(true, () => s.reload()),
      });
      window.UI.mount(bodyBox, s.el);
      window.UI.mount(head, window.UI.tabs({
        items: [{ key: "actions", label: T("discipline") }, { key: "corrective", label: T("corrective") }],
        active: tab, onChange: (k) => { tab = k; draw(); },
      }));
    };

    view.appendChild(pageHead(T("discipline"), [
      canEdit ? el("button", { class: "btn primary", type: "button", text: "＋ " + T("addDisciplinary"),
        on: { click: () => disciplinaryForm(null, null, () => draw()) } }) : null,
      canEdit ? el("button", { class: "btn", type: "button", text: "＋ " + T("addCorrective"),
        on: { click: () => correctiveForm(null, null, () => draw()) } }) : null,
      window.App.can("reports.export") ? el("button", {
        class: "btn", type: "button", text: T("exportExcel"),
        on: { click: () => window.App.download("/api/export/discipline.xlsx", { lang: N.lang }) },
      }) : null,
    ]));
    view.appendChild(head);
    view.appendChild(bodyBox);
    draw();
  }

  function disciplinePanel(ctx) {
    const s1 = section({
      endpoint: "/api/disciplinary", fixed: { employeeId: ctx.employeeId }, initial: { size: 50 },
      columns: () => disciplinaryColumns(false, () => s1.reload()),
    });
    const s2 = section({
      endpoint: "/api/corrective", fixed: { employeeId: ctx.employeeId }, initial: { size: 50 },
      columns: () => correctiveColumns(false, () => s2.reload()),
    });
    const canEdit = window.App.can("discipline.manage");
    return frag([
      card(T("discipline"), s1.el, canEdit ? el("button", {
        class: "btn small primary", type: "button", text: "＋ " + T("addDisciplinary"),
        on: { click: () => disciplinaryForm(ctx.employee, null, () => s1.reload()) },
      }) : null),
      card(T("corrective"), s2.el, canEdit ? el("button", {
        class: "btn small primary", type: "button", text: "＋ " + T("addCorrective"),
        on: { click: () => correctiveForm(ctx.employee, null, () => s2.reload()) },
      }) : null),
    ]);
  }

  /* ======================================================== الحركات */

  function movementsView(view) {
    let tab = "transfers";
    const head = el("div");
    const bodyBox = el("div");

    const draw = () => {
      const s = tab === "transfers" ? section({
        endpoint: "/api/transfers",
        initial: { from: window.Dates.yearStart(window.Dates.today()), to: window.Dates.today() },
        filterFields: [
          { key: "from", label: T("from"), type: "date" },
          { key: "to", label: T("to"), type: "date" },
          { key: "branchId", label: T("branch"), type: "select", options: () => opts(lookups().branches) },
        ],
        columns: () => [
          { key: "transferDate", label: T("transferDate"), render: (r) => N.date(r.transferDate) },
          { key: "emp", label: T("employee"), render: (r) => `${r.employee.employeeNo} — ${N.person(r.employee)}` },
          { key: "from", label: T("from"), render: (r) => N.name(r.fromBranch) },
          { key: "to", label: T("toBranch"), render: (r) => N.name(r.toBranch) },
          { key: "fromDept", label: T("department"), render: (r) => `${N.name(r.fromDepartment)} ← ${N.name(r.toDepartment)}` },
          { key: "job", label: T("jobTitle"), render: (r) => `${N.name(r.fromJobTitle)} ← ${N.name(r.toJobTitle)}` },
          { key: "reason", label: T("reason") },
          { key: "approvedBy", label: T("approvedBy") },
        ],
        onRow: (r) => window.App.go(`#/employee/${r.employee.id}`),
      }) : section({
        endpoint: "/api/separations",
        initial: { from: window.Dates.yearStart(window.Dates.today()), to: window.Dates.today() },
        filterFields: [
          { key: "from", label: T("from"), type: "date" },
          { key: "to", label: T("to"), type: "date" },
          { key: "kind", label: T("type"), type: "select", options: () => enumOpts("kd", enums().separationKinds) },
          { key: "branchId", label: T("branch"), type: "select", options: () => opts(lookups().branches) },
        ],
        columns: () => [
          { key: "eventDate", label: T("eventDate"), render: (r) => N.date(r.eventDate) },
          { key: "emp", label: T("employee"), render: (r) => `${r.employee.employeeNo} — ${N.person(r.employee)}` },
          { key: "branch", label: T("branch"), render: (r) => N.name(r.branch) },
          { key: "kind", label: T("type"), render: (r) => tag(N.e("kd", r.kind), r.kind === "termination" ? "bad" : "warn") },
          { key: "lastWorkingDate", label: T("lastWorkingDate"), render: (r) => N.date(r.lastWorkingDate) },
          { key: "subType", label: T("type") },
          { key: "reason", label: T("reason") },
          { key: "approvedBy", label: T("approvedBy") },
          window.App.can("movements.manage") ? { key: "act", label: T("actions"), render: (r) => el("button", {
            class: "btn small danger", type: "button", text: T("cancelSeparation"),
            on: { click: () => cancelSeparation(r, () => draw()) },
          }) } : null,
        ].filter(Boolean),
      });
      window.UI.mount(bodyBox, s.el);
      window.UI.mount(head, window.UI.tabs({
        items: [{ key: "transfers", label: T("transfersTab") }, { key: "separations", label: T("separationsTab") }],
        active: tab, onChange: (k) => { tab = k; draw(); },
      }));
    };

    view.appendChild(pageHead(T("movements"), [
      window.App.can("reports.export") ? el("button", {
        class: "btn", type: "button", text: T("exportExcel"),
        on: { click: () => window.App.download("/api/export/movements.xlsx", { lang: N.lang }) },
      }) : null,
    ]));
    view.appendChild(head);
    view.appendChild(bodyBox);
    draw();
  }

  function cancelSeparation(r, onDone) {
    formModal({
      title: `${T("cancelSeparation")} · ${N.person(r.employee)}`,
      submitLabel: T("confirm"),
      intro: "سيُحذف سجل نهاية الخدمة وتُعاد فترة التوظيف مفتوحة. يبقى أثر العملية في سجل التدقيق.",
      fields: [{ key: "reason", label: T("cancelReason"), type: "textarea", required: true, full: true }],
      onSubmit: async (v) => {
        await window.API.del(`/api/separations/${r.id}`, { reason: v.reason });
        toast(T("saved"), "good");
        if (onDone) onDone();
        return true;
      },
    });
  }

  function attachModal(ref, onDone) {
    const m = window.UI.modal({
      title: T("attachments"),
      body: el("div"),
      actions: [{ label: T("close"), kind: "primary", onClick: (c) => c() }],
    });
    const refresh = async () => {
      const { rows } = await window.API.get("/api/attachments", { refType: ref.refType, refId: ref.refId });
      window.UI.mount(m.body, frag([
        window.Views.employees.uploadBox(Object.assign({}, ref, { onDone: () => { refresh(); if (onDone) onDone(); } })),
        table({
          columns: [
            { key: "fileName", label: T("attachment") },
            { key: "uploadedAt", label: T("createdAt"), render: (r) => N.dateTime(r.uploadedAt) },
            { key: "act", label: T("actions"), render: (r) => el("button", {
              class: "btn small", type: "button", text: T("download"),
              on: { click: () => window.App.download(`/api/attachments/${r.id}/download`) },
            }) },
          ],
          rows,
        }),
      ]));
    };
    refresh();
  }

  window.Views = window.Views || {};
  window.Views.hr = {
    attendanceView, attendancePanel, leavesView, leavesPanel,
    disciplineView, disciplinePanel, movementsView, attachModal,
  };
})();
