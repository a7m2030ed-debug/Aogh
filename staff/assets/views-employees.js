/* ======================================================================
   الموظفون — القائمة والبحث وملف الموظف والحركات
   ====================================================================== */

(function () {
  "use strict";

  const { el, frag, card, table, filters, toast, formModal, confirm, statusTag, pageHead } = window.UI;
  const T = (k, v) => window.I18N.t(k, v);
  const N = window.I18N;

  const opts = (list) => list.filter((x) => x.isActive !== false).map((x) => ({ value: x.id, label: N.name(x) }));
  const lookups = () => window.App.state.lookups;
  const enums = () => window.App.state.enums;
  const enumOpts = (group, list) => list.map((v) => ({ value: v, label: N.e(group, v) }));

  /* ------------------------------------------------------- القائمة */

  let state = { page: 1, size: 25, sort: "name", dir: "asc", q: "", filters: {} };

  async function render(view, params) {
    if (params && params.q !== undefined) state.q = params.q;
    view.appendChild(pageHead(T("employees"), [
      window.App.can("employees.create") ? el("button", {
        class: "btn primary", type: "button", text: "＋ " + T("addEmployee"),
        on: { click: () => openEmployeeForm(null) },
      }) : null,
      window.App.can("reports.export") ? el("button", {
        class: "btn", type: "button", text: T("exportExcel"),
        on: { click: () => window.App.download("/api/export/employees.xlsx", Object.assign({ lang: N.lang }, query())) },
      }) : null,
    ]));

    const box = el("div");
    view.appendChild(filters({
      values: Object.assign({ q: state.q }, state.filters),
      fields: [
        { key: "q", label: T("search"), type: "text", grow: true, width: "220px", placeholder: T("quickSearchPlaceholder") },
        { key: "branchId", label: T("branch"), type: "select", options: () => opts(lookups().branches) },
        { key: "departmentId", label: T("department"), type: "select", options: () => opts(lookups().departments) },
        { key: "jobTitleId", label: T("jobTitle"), type: "select", options: () => opts(lookups().jobTitles) },
        { key: "status", label: T("employmentStatus"), type: "select", options: () => enumOpts("st", enums().employmentStatuses) },
        { key: "employmentType", label: T("employmentType"), type: "select", options: () => enumOpts("ty", enums().employmentTypes) },
        { key: "joinedFrom", label: T("joinedFrom"), type: "date" },
        { key: "joinedTo", label: T("joinedTo"), type: "date" },
        { key: "includeArchived", label: T("includeArchived"), type: "checkbox" },
      ],
      onChange: (v) => {
        state.q = v.q || "";
        state.filters = v;
        state.page = 1;
        load(box);
      },
    }));
    view.appendChild(box);
    load(box);
  }

  function query() {
    return Object.assign({}, state.filters, {
      q: state.q || undefined, page: state.page, size: state.size, sort: state.sort, dir: state.dir,
    });
  }

  async function load(box) {
    window.UI.mount(box, window.UI.loading());
    let data;
    try {
      data = await window.API.get("/api/employees", query());
    } catch (e) {
      return window.UI.mount(box, el("div", { class: "empty error", text: e.message }));
    }
    window.UI.mount(box, table({
      columns: [
        { key: "employeeNo", label: T("employeeNo"), sortable: true },
        { key: "name", label: T("fullNameAr"), sortable: true, render: (r) => N.person(r) },
        { key: "nationalId", label: T("nationalId"),
          render: (r) => el("span", { class: r.nationalIdMasked ? "muted" : "", text: r.nationalId || "—" }) },
        { key: "branch", label: T("branch"), render: (r) => N.name(r.branch) },
        { key: "department", label: T("department"), render: (r) => N.name(r.department) },
        { key: "jobTitle", label: T("jobTitle"), render: (r) => N.name(r.jobTitle) },
        { key: "joiningDate", label: T("joiningDate"), sortable: true, render: (r) => N.date(r.originalJoiningDate) },
        { key: "status", label: T("status"), render: (r) => frag([statusTag(r.employmentStatus),
          r.isArchived ? window.UI.tag(T("archived")) : null]) },
      ],
      rows: data.rows, total: data.total, page: data.page, size: data.size,
      sort: state.sort, dir: state.dir,
      onSort: (key) => {
        if (state.sort === key) state.dir = state.dir === "asc" ? "desc" : "asc";
        else { state.sort = key; state.dir = "asc"; }
        load(box);
      },
      onPage: (p) => { state.page = p; load(box); },
      onRow: (r) => window.App.go(`#/employee/${r.id}`),
      empty: T("noEmployees"),
    }));
  }

  /* --------------------------------------------------- نموذج الموظف */

  const employeeFields = (isEdit) => [
    { type: "separator", label: T("employee") },
    { key: "employeeNo", label: T("employeeNo"), required: true },
    { key: "nationalId", label: T("nationalId"), required: true,
      hint: `${window.App.state.settings.nationalIdDigits} ${T("days") === "days" ? "digits" : "أرقام"}` },
    { key: "fullNameAr", label: T("fullNameAr"), required: true },
    { key: "fullNameEn", label: T("fullNameEn") },
    { key: "gender", label: T("gender"), type: "select", options: () => enumOpts("g", enums().genders) },
    { key: "mobile", label: T("mobile"), inputmode: "tel" },
    { key: "email", label: T("email"), type: "email" },
    { key: "dob", label: T("dob"), type: "date" },
    { key: "nationality", label: T("nationality") },

    { type: "separator", label: T("employmentHistory") },
    { key: "originalJoiningDate", label: T("joiningDate"), type: "date", required: true,
      hint: isEdit ? T("originalJoiningDate") : "" },
    { key: "branchId", label: T("branch"), type: "select", required: true, options: () => opts(lookups().branches) },
    { key: "departmentId", label: T("department"), type: "select", options: () => opts(lookups().departments) },
    { key: "jobTitleId", label: T("jobTitle"), type: "select", options: () => opts(lookups().jobTitles) },
    { key: "employmentType", label: T("employmentType"), type: "select", options: () => enumOpts("ty", enums().employmentTypes) },
    { key: "employeeCategory", label: T("employeeCategory") },
    { key: "managerId", label: T("manager"), type: "select", options: () => window.App.managerOptions() },
    { key: "probationEndDate", label: T("probationEnd"), type: "date" },
    { key: "notes", label: T("notes"), type: "textarea" },
  ];

  function openEmployeeForm(employee, onDone) {
    const isEdit = !!employee;
    formModal({
      title: isEdit ? `${T("edit")} · ${N.person(employee)}` : T("addEmployee"),
      wide: true,
      submitLabel: T("save"),
      successMessage: T("saved"),
      values: isEdit ? {
        employeeNo: employee.employeeNo,
        nationalId: employee.nationalIdMasked ? "" : employee.nationalId,
        fullNameAr: employee.fullNameAr, fullNameEn: employee.fullNameEn,
        gender: employee.gender, mobile: employee.mobile, email: employee.email,
        dob: employee.dob, nationality: employee.nationality,
        originalJoiningDate: employee.originalJoiningDate,
        branchId: employee.branch && employee.branch.id,
        departmentId: employee.department && employee.department.id,
        jobTitleId: employee.jobTitle && employee.jobTitle.id,
        employmentType: employee.employmentType, employeeCategory: employee.employeeCategory,
        managerId: employee.manager && employee.manager.id,
        probationEndDate: employee.probationEndDate, notes: employee.notes,
      } : { originalJoiningDate: window.Dates.today() },
      fields: employeeFields(isEdit),
      onSubmit: async (v) => {
        const body = Object.assign({}, v);
        ["branchId", "departmentId", "jobTitleId"].forEach((k) => { body[k] = body[k] ? Number(body[k]) : null; });
        if (isEdit && !body.nationalId) delete body.nationalId;   // المقنَّع لا يُرسل فارغًا
        const saved = isEdit
          ? await window.API.patch(`/api/employees/${employee.id}`, body)
          : await window.API.post("/api/employees", body);
        if (onDone) onDone(saved);
        else window.App.go(`#/employee/${saved.id}`);
        return true;
      },
    });
  }

  /* ------------------------------------------------------ ملف الموظف */

  async function profile(view, params) {
    const id = params.id;
    view.appendChild(window.UI.loading());
    let data;
    try {
      data = await window.API.get(`/api/employees/${id}`);
    } catch (e) {
      return window.UI.mount(view, el("div", { class: "empty error", text: e.message }));
    }
    window.UI.clear(view);
    const e = data.employee;
    const canEdit = window.App.can("employees.edit");
    const canMove = window.App.can("movements.manage");
    const open = !!data.periods.length && !data.periods[data.periods.length - 1].endDate;

    const initials = (N.person(e) || "?").trim().slice(0, 1);
    view.appendChild(el("section", { class: "card" }, [
      el("div", { class: "profile-head" }, [
        el("div", { class: "avatar", text: initials }),
        el("div", { style: { flex: "1 1 240px" } }, [
          el("h1", { style: { margin: "0 0 2px" }, text: N.person(e) }),
          el("div", { class: "row small muted" }, [
            el("span", { text: `${T("employeeNo")}: ${e.employeeNo}` }),
            el("span", { text: `${T("branch")}: ${N.name(e.branch)}` }),
            el("span", { text: `${T("jobTitle")}: ${N.name(e.jobTitle)}` }),
            el("span", { text: `${T("serviceYears")}: ${window.Dates.duration(e.originalJoiningDate, lastDay(data))}` }),
          ]),
          el("div", { class: "row", style: { marginTop: "6px" } }, [
            statusTag(e.employmentStatus),
            e.isArchived ? window.UI.tag(T("archived"), "warn") : null,
            data.periods.length > 1 ? window.UI.tag(`${T("periods")}: ${N.num(data.periods.length, 0)}`, "info") : null,
          ]),
        ]),
        el("div", { class: "row no-print" }, [
          canEdit ? btn(T("edit"), () => openEmployeeForm(e, () => window.App.rerender())) : null,
          canMove && open ? btn(T("recordTransfer"), () => transferForm(e)) : null,
          canMove && open ? btn(T("recordResignation"), () => separationForm(e, "resignation")) : null,
          canMove && open ? btn(T("recordTermination"), () => separationForm(e, "termination"), "danger") : null,
          canMove && !open ? btn(T("rehire"), () => rehireForm(e, data), "primary") : null,
          moreMenu(e, data),
        ]),
      ]),
    ]));

    const tabsBox = el("div");
    const panel = el("div");
    view.appendChild(tabsBox);
    view.appendChild(panel);

    const items = [
      { key: "info", label: T("details") },
      { key: "timeline", label: T("timeline") },
      { key: "history", label: T("employmentHistory") },
      window.App.can("attendance.view") ? { key: "attendance", label: T("attendance") } : null,
      window.App.can("leaves.view") ? { key: "leaves", label: T("leaves") } : null,
      window.App.can("discipline.view") ? { key: "discipline", label: T("discipline") } : null,
      { key: "attachments", label: T("attachments") },
    ].filter(Boolean);

    let active = (params && params.tab) || "info";
    const draw = () => {
      window.UI.mount(tabsBox, window.UI.tabs({
        items, active, onChange: (k) => { active = k; draw(); },
      }));
      window.UI.mount(panel, window.UI.loading());
      tabContent(active, data).then((node) => window.UI.mount(panel, node))
        .catch((err) => window.UI.mount(panel, el("div", { class: "empty error", text: err.message })));
    };
    draw();
  }

  const btn = (text, onClick, kind) => el("button", { class: "btn small " + (kind || ""), type: "button", text, on: { click: onClick } });
  const lastDay = (data) => {
    const p = data.periods[data.periods.length - 1];
    return p && p.endDate ? p.endDate : null;
  };

  function moreMenu(e, data) {
    const actions = [];
    if (window.App.can("movements.manage") && !lastDay(data)) {
      actions.push({ label: T("recordRetirement"), fn: () => separationForm(e, "retirement") });
    }
    if (window.App.can("employees.archive")) {
      actions.push({
        label: e.isArchived ? T("unarchive") : T("archive"),
        fn: async () => {
          const okDo = await confirm({ title: e.isArchived ? T("unarchive") : T("archive"),
            message: e.isArchived ? "" : "سيختفي من نتائج البحث الافتراضية، وتبقى سجلاته وتقاريره كما هي." });
          if (!okDo) return;
          await window.API.post(`/api/employees/${e.id}/archive`, { archived: !e.isArchived });
          toast(T("saved"), "good");
          window.App.rerender();
        },
      });
    }
    if (window.App.can("employees.delete")) {
      actions.push({ label: T("deleteForever"), danger: true, fn: () => deleteForm(e) });
    }
    if (!actions.length) return null;
    const box = el("span", { style: { position: "relative" } });
    const menu = el("div", {
      class: "card", hidden: true,
      style: { position: "absolute", insetInlineEnd: "0", top: "110%", zIndex: "30", padding: "6px", minWidth: "190px" },
    }, actions.map((a) => el("button", {
      class: "btn ghost small block" + (a.danger ? " danger" : ""), type: "button", text: a.label,
      style: { justifyContent: "flex-start" },
      on: { click: () => { menu.hidden = true; a.fn(); } },
    })));
    box.appendChild(el("button", {
      class: "btn small", type: "button", text: "⋯",
      on: { click: () => { menu.hidden = !menu.hidden; } },
    }));
    box.appendChild(menu);
    return box;
  }

  /* -------------------------------------------------- محتوى التبويبات */

  async function tabContent(tab, data) {
    const e = data.employee;
    if (tab === "info") return infoTab(data);
    if (tab === "timeline") return timelineTab(e.id);
    if (tab === "history") return historyTab(data);
    if (tab === "attendance") return window.Views.hr.attendancePanel({ employeeId: e.id, employee: e });
    if (tab === "leaves") return window.Views.hr.leavesPanel({ employeeId: e.id, employee: e });
    if (tab === "discipline") return window.Views.hr.disciplinePanel({ employeeId: e.id, employee: e });
    if (tab === "attachments") return attachmentsTab(e);
    return el("div");
  }

  function kv(label, value) {
    return el("div", {}, [el("dt", { text: label }), el("dd", {}, value instanceof Node ? value : String(value === null || value === undefined || value === "" ? "—" : value))]);
  }

  function infoTab(data) {
    const e = data.employee;
    const s = data.stats;
    return frag([
      card(T("details"), el("dl", { class: "kv" }, [
        kv(T("employeeNo"), e.employeeNo),
        kv(T("nationalId"), e.nationalIdMasked
          ? el("span", { class: "muted", title: T("nidHidden"), text: e.nationalId }) : e.nationalId),
        kv(T("fullNameAr"), e.fullNameAr),
        kv(T("fullNameEn"), e.fullNameEn),
        kv(T("gender"), e.gender ? N.e("g", e.gender) : "—"),
        kv(T("mobile"), e.mobile),
        kv(T("email"), e.email),
        kv(T("dob"), N.date(e.dob)),
        kv(T("age"), e.dob ? window.Dates.duration(e.dob) : "—"),
        kv(T("nationality"), e.nationality),
      ])),
      card(T("employmentHistory"), el("dl", { class: "kv" }, [
        kv(T("originalJoiningDate"), N.date(e.originalJoiningDate)),
        kv(T("employmentStatus"), statusTag(e.employmentStatus)),
        kv(T("employmentType"), e.employmentType ? N.e("ty", e.employmentType) : "—"),
        kv(T("branch"), N.name(e.branch)),
        kv(T("branchStartDate"), N.date(e.branchStartDate)),
        kv(T("department"), N.name(e.department)),
        kv(T("jobTitle"), N.name(e.jobTitle)),
        kv(T("positionStartDate"), N.date(e.positionStartDate)),
        kv(T("manager"), e.manager ? e.manager.name : "—"),
        kv(T("employeeCategory"), e.employeeCategory),
        kv(T("probationEnd"), N.date(e.probationEndDate)),
        kv(T("serviceYears"), window.Dates.duration(e.originalJoiningDate, lastDay(data))),
      ])),
      card(T("stats"), el("div", { class: "kpis" }, [
        window.UI.kpi({ label: T("absent"), value: s.absences }),
        window.UI.kpi({ label: T("lateOccurrences"), value: s.lateCount }),
        window.UI.kpi({ label: T("lateMinutes"), value: s.lateMinutes }),
        window.UI.kpi({ label: T("lateAverage"), value: N.num(s.lateAverage) }),
        window.UI.kpi({ label: T("sickLeaveDays"), value: s.sickLeaveDays }),
        window.UI.kpi({ label: T("annualLeaveDays"), value: s.annualLeaveDays }),
        window.UI.kpi({ label: T("warningLetters"), value: s.warningLetters }),
        window.UI.kpi({ label: T("correctiveActions"), value: s.correctiveActions,
          sub: s.correctiveOpen ? `${T("correctiveOpen")}: ${N.num(s.correctiveOpen, 0)}` : "" }),
      ])),
      card(null, el("div", { class: "muted small" }, [
        el("div", { text: `${T("createdAt")}: ${N.dateTime(e.createdAt)} · ${T("createdBy")}: ${e.createdBy || "—"}` }),
        el("div", { text: `${T("updatedAt")}: ${N.dateTime(e.updatedAt)} · ${T("updatedBy")}: ${e.updatedBy || "—"}` }),
      ])),
    ]);
  }

  async function timelineTab(id) {
    const { events } = await window.API.get(`/api/employees/${id}/timeline`);
    if (!events.length) return el("div", { class: "empty", text: T("noData") });
    return card(T("timeline"), el("div", { class: "timeline" }, events.map((ev) => {
      const d = ev.details || {};
      let detail = "";
      if (ev.type === "transfer") {
        const fb = N.lang === "en" ? (d.toBranchEn || d.toBranch) : d.toBranch;
        const from = N.lang === "en" ? (d.fromBranchEn || d.fromBranch) : d.fromBranch;
        detail = `${from || "—"} ← ${fb || "—"}` + (d.reason ? ` · ${d.reason}` : "");
      } else if (ev.type === "leave") {
        detail = `${N.lang === "en" ? d.typeEn || d.typeAr : d.typeAr} · ${N.num(d.days, 0)} ${T("days")} (${N.date(d.startDate)} — ${N.date(d.endDate)})`;
      } else if (ev.type === "late") {
        detail = `${N.num(d.lateMinutes, 0)} ${T("minutes")}` + (d.reason ? ` · ${d.reason}` : "");
      } else if (ev.type === "disciplinary") {
        detail = `${N.e("da", d.actionType)}` + (d.reason ? ` · ${d.reason}` : "");
      } else if (ev.type === "resignation" || ev.type === "termination" || ev.type === "retirement") {
        detail = `${T("lastWorkingDate")}: ${N.date(d.lastWorkingDate)}` + (d.reason ? ` · ${d.reason}` : "");
      } else if (ev.type === "corrective_opened") {
        detail = (d.reason || "") + (d.dueDate ? ` · ${T("dueDate")}: ${N.date(d.dueDate)}` : "");
      } else if (ev.type === "corrective_closed") {
        detail = d.notes || "";
      } else if (ev.type === "absent") {
        detail = d.reason || "";
      } else if (ev.type === "record_created") {
        detail = d.by ? `${T("createdBy")}: ${d.by}` : "";
      }
      const late = ev.createdAt && String(ev.createdAt).slice(0, 10) !== ev.date
        ? `${T("createdAt")}: ${N.date(String(ev.createdAt).slice(0, 10))}` : "";
      return el("div", { class: "tl-item " + ev.type }, [
        el("div", { class: "tl-date", text: N.date(ev.date) }),
        el("div", { class: "tl-rail" }, el("span", { class: "tl-dot" })),
        el("div", { class: "tl-body" }, [
          el("div", { class: "tl-title", text: N.e("ev", ev.type) }),
          detail ? el("div", { class: "tl-meta", text: detail }) : null,
          late ? el("div", { class: "tl-meta", text: late }) : null,
        ]),
      ]);
    })));
  }

  function historyTab(data) {
    return frag([
      card(T("periods"), table({
        columns: [
          { key: "seq", label: T("period_"), render: (r) => N.num(r.seq, 0) },
          { key: "startDate", label: T("joiningDate"), render: (r) => N.date(r.startDate) },
          { key: "startReason", label: T("type"), render: (r) => (r.startReason === "rehire" ? T("rehires") : T("newHires")) },
          { key: "endDate", label: T("lastWorkingDate"), render: (r) => N.date(r.endDate) },
          { key: "endKind", label: T("status"), render: (r) => (r.endKind ? N.e("kd", r.endKind) : window.UI.tag(T("st_active"), "good")) },
          { key: "endReason", label: T("reason") },
        ],
        rows: data.periods,
      })),
      card(T("employmentHistory"), table({
        columns: [
          { key: "from", label: T("from"), render: (r) => N.date(r.from) },
          { key: "to", label: T("to"), render: (r) => (r.to ? N.date(r.to) : "—") },
          { key: "branch", label: T("branch"), render: (r) => N.name(r.branch) },
          { key: "department", label: T("department"), render: (r) => N.name(r.department) },
          { key: "jobTitle", label: T("jobTitle"), render: (r) => N.name(r.jobTitle) },
          { key: "reason", label: T("reason"), render: (r) => (r.reason ? N.e("ev", r.reason === "hire" ? "joined" : r.reason) : "—") },
        ],
        rows: data.assignments,
      })),
      card(T("statusHistory"), table({
        columns: [
          { key: "from", label: T("from"), render: (r) => N.date(r.from) },
          { key: "to", label: T("to"), render: (r) => (r.to ? N.date(r.to) : "—") },
          { key: "status", label: T("status"), render: (r) => statusTag(r.status) },
          { key: "reason", label: T("reason") },
        ],
        rows: data.statuses,
      })),
    ]);
  }

  async function attachmentsTab(e) {
    const { rows } = await window.API.get("/api/attachments", { employeeId: e.id });
    const box = el("div");
    const list = table({
      columns: [
        { key: "fileName", label: T("attachment") },
        { key: "refType", label: T("type"), render: (r) => N.e("en", r.refType) },
        { key: "size", label: T("total"), num: true, render: (r) => `${N.num(Math.round(r.size / 1024), 0)} KB` },
        { key: "uploadedAt", label: T("createdAt"), render: (r) => N.dateTime(r.uploadedAt) },
        { key: "act", label: T("actions"), render: (r) => frag([
          el("button", { class: "btn small", type: "button", text: T("download"),
            on: { click: () => window.App.download(`/api/attachments/${r.id}/download`) } }),
          window.App.can("attachments.delete") ? el("button", {
            class: "btn small danger", type: "button", text: T("delete"),
            on: { click: async () => {
              if (!(await confirm({ message: T("confirmDelete"), danger: true }))) return;
              await window.API.del(`/api/attachments/${r.id}`);
              toast(T("deleted"), "good");
              window.App.rerender();
            } },
          }) : null,
        ]) },
      ],
      rows,
    });
    window.UI.mount(box, frag([
      window.App.can("attachments.upload") ? uploadBox({ employeeId: e.id, refType: "employee" }) : null,
      list,
    ]));
    return card(T("attachments"), box);
  }

  function uploadBox(ref) {
    const input = el("input", { type: "file", style: { maxWidth: "260px" } });
    const go = el("button", {
      class: "btn small primary", type: "button", text: T("upload"),
      on: {
        click: async () => {
          if (!input.files || !input.files[0]) return toast(T("chooseFile"), "bad");
          const fd = new FormData();
          fd.append("file", input.files[0]);
          if (ref.employeeId) fd.append("employeeId", ref.employeeId);
          if (ref.refType) fd.append("refType", ref.refType);
          if (ref.refId) fd.append("refId", ref.refId);
          try {
            await window.API.upload("/api/attachments", fd);
            toast(T("saved"), "good");
            if (ref.onDone) ref.onDone();
            else window.App.rerender();
          } catch (err) { window.UI.handleError(err); }
        },
      },
    });
    return el("div", { class: "row no-print", style: { marginBottom: "10px" } }, [input, go]);
  }

  /* --------------------------------------------------------- الحركات */

  function transferForm(e) {
    formModal({
      title: `${T("recordTransfer")} · ${N.person(e)}`,
      submitLabel: T("save"), successMessage: T("saved"),
      intro: "لا يُستبدل الفرع: يُغلق الإسناد الحالي ويُفتح إسناد جديد من تاريخ النقل، فتبقى تقارير الماضي على الفرع القديم.",
      values: {
        transferDate: window.Dates.today(),
        toBranchId: e.branch && e.branch.id,
        toDepartmentId: e.department && e.department.id,
        toJobTitleId: e.jobTitle && e.jobTitle.id,
      },
      fields: [
        { key: "transferDate", label: T("transferDate"), type: "date", required: true },
        { key: "toBranchId", label: T("toBranch"), type: "select", required: true, options: () => opts(lookups().branches) },
        { key: "toDepartmentId", label: T("toDepartment"), type: "select", options: () => opts(lookups().departments) },
        { key: "toJobTitleId", label: T("toJobTitle"), type: "select", options: () => opts(lookups().jobTitles) },
        { key: "approvedBy", label: T("approvedBy") },
        { key: "reason", label: T("reason"), type: "textarea" },
        { key: "notes", label: T("notes"), type: "textarea" },
      ],
      onSubmit: async (v) => {
        await window.API.post(`/api/employees/${e.id}/transfer`, Object.assign({}, v, {
          toBranchId: Number(v.toBranchId) || null,
          toDepartmentId: v.toDepartmentId ? Number(v.toDepartmentId) : null,
          toJobTitleId: v.toJobTitleId ? Number(v.toJobTitleId) : null,
        }));
        window.App.rerender();
        return true;
      },
    });
  }

  function separationForm(e, kind) {
    const title = kind === "resignation" ? T("recordResignation")
      : kind === "termination" ? T("recordTermination") : T("recordRetirement");
    formModal({
      title: `${title} · ${N.person(e)}`,
      submitLabel: T("save"), successMessage: T("saved"),
      intro: "لا يُحذف الموظف: تُغلق فترة توظيفه بآخر يوم عمل، وتبقى بياناته وتاريخه في النظام والتقارير.",
      values: { eventDate: window.Dates.today(), lastWorkingDate: window.Dates.today() },
      fields: [
        { key: "eventDate", label: kind === "resignation" ? T("resignationDate") : T("terminationDate"), type: "date", required: true },
        { key: "lastWorkingDate", label: T("lastWorkingDate"), type: "date", required: true },
        { key: "subType", label: kind === "resignation" ? T("resignationType") : T("terminationType") },
        { key: "noticePeriodDays", label: T("noticePeriod"), type: "number", min: 0, max: 365 },
        { key: "approvedBy", label: T("approvedBy") },
        { key: "reason", label: T("reason"), type: "textarea" },
        { key: "notes", label: T("notes"), type: "textarea" },
      ],
      onSubmit: async (v) => {
        await window.API.post(`/api/employees/${e.id}/${kind}`, v);
        window.App.rerender();
        return true;
      },
    });
  }

  function rehireForm(e, data) {
    const last = data.periods[data.periods.length - 1];
    formModal({
      title: `${T("rehire")} · ${N.person(e)}`,
      submitLabel: T("save"), successMessage: T("saved"),
      intro: `${T("previousLeaving")}: ${N.date(last.endDate)} — تُفتح فترة توظيف جديدة على نفس الملف، ويبقى تاريخ المباشرة الأصلي كما هو.`,
      values: {
        rehireDate: window.Dates.today(),
        branchId: e.branch && e.branch.id,
        departmentId: e.department && e.department.id,
        jobTitleId: e.jobTitle && e.jobTitle.id,
        employmentType: e.employmentType,
      },
      fields: [
        { key: "rehireDate", label: T("rehireDate"), type: "date", required: true },
        { key: "branchId", label: T("branch"), type: "select", required: true, options: () => opts(lookups().branches) },
        { key: "departmentId", label: T("department"), type: "select", options: () => opts(lookups().departments) },
        { key: "jobTitleId", label: T("jobTitle"), type: "select", options: () => opts(lookups().jobTitles) },
        { key: "employmentType", label: T("employmentType"), type: "select", options: () => enumOpts("ty", enums().employmentTypes) },
      ],
      onSubmit: async (v) => {
        await window.API.post(`/api/employees/${e.id}/rehire`, Object.assign({}, v, {
          branchId: Number(v.branchId) || null,
          departmentId: v.departmentId ? Number(v.departmentId) : null,
          jobTitleId: v.jobTitleId ? Number(v.jobTitleId) : null,
        }));
        window.App.rerender();
        return true;
      },
    });
  }

  function deleteForm(e) {
    formModal({
      title: `${T("deleteForever")} · ${N.person(e)}`,
      submitLabel: T("delete"),
      intro: "الحذف النهائي يمسح الموظف وكل سجلاته من القاعدة ولا يمكن التراجع عنه. الأفضل «الأرشفة». وستُحفظ نسخة من السجل في سجل التدقيق.",
      fields: [{ key: "reason", label: T("deleteReason"), type: "textarea", required: true, full: true }],
      onSubmit: async (v) => {
        await window.API.del(`/api/employees/${e.id}`, { reason: v.reason });
        toast(T("deleted"), "good");
        window.App.go("#/employees");
        return true;
      },
    });
  }

  window.Views = window.Views || {};
  window.Views.employees = { render, profile, openEmployeeForm, uploadBox, transferForm, separationForm };
})();
