/* ======================================================================
   الاستيراد والإدارة — المستخدمون والصلاحيات والقوائم والإعدادات
   وسجل التدقيق والنسخ الاحتياطية
   ====================================================================== */

(function () {
  "use strict";

  const { el, frag, card, table, toast, formModal, confirm, tag, pageHead } = window.UI;
  const T = (k, v) => window.I18N.t(k, v);
  const N = window.I18N;
  const lookups = () => window.App.state.lookups;

  /* ===================================================== الاستيراد */

  function importView(view) {
    view.appendChild(pageHead(T("importEmployees"), [
      el("button", {
        class: "btn", type: "button", text: T("downloadTemplate"),
        on: { click: () => window.App.download("/api/import/template.xlsx") },
      }),
    ]));

    const state = { parsed: null, options: { createMissing: false, updateExisting: true } };
    const fileInput = el("input", { type: "file", attrs: { accept: ".xlsx,.xls,.csv" }, style: { maxWidth: "280px" } });
    const panel = el("div");

    const optRow = el("div", { class: "row" }, [
      checkbox(T("createMissing"), state.options.createMissing, (v) => { state.options.createMissing = v; reanalyze(); }),
      checkbox(T("updateExisting"), state.options.updateExisting, (v) => { state.options.updateExisting = v; reanalyze(); }),
    ]);

    view.appendChild(card(T("chooseFile"), frag([
      el("p", { class: "muted small", text: T("importHint") }),
      el("div", { class: "row" }, [
        fileInput,
        el("button", {
          class: "btn primary", type: "button", text: T("preview"),
          on: { click: () => upload() },
        }),
      ]),
      optRow,
    ])));
    view.appendChild(panel);

    function checkbox(label, value, onChange) {
      const input = el("input", { type: "checkbox", checked: value });
      input.addEventListener("change", () => onChange(input.checked));
      return el("label", { class: "field inline" }, [input, el("span", { text: label })]);
    }

    async function upload() {
      if (!fileInput.files || !fileInput.files[0]) return toast(T("chooseFile"), "bad");
      window.UI.mount(panel, window.UI.loading());
      const fd = new FormData();
      fd.append("file", fileInput.files[0]);
      fd.append("createMissing", state.options.createMissing ? "1" : "0");
      fd.append("updateExisting", state.options.updateExisting ? "1" : "0");
      try {
        state.parsed = await window.API.upload("/api/import/employees/preview", fd);
        draw();
      } catch (e) {
        window.UI.mount(panel, el("div", { class: "empty error", text: e.message }));
      }
    }

    async function reanalyze() {
      if (!state.parsed) return;
      try {
        state.parsed.analysis = await window.API.post("/api/import/employees/analyze", {
          rows: state.parsed.rows, mapping: state.parsed.mapping, options: state.options,
        });
        draw();
      } catch (e) { window.UI.handleError(e); }
    }

    function draw() {
      const p = state.parsed;
      const s = p.analysis.summary;
      const mapRow = el("div", { class: "row" }, p.fields.map((f) => {
        const sel = el("select", { style: { minWidth: "150px" } });
        sel.appendChild(el("option", { value: "", text: "—" }));
        p.header.forEach((h, i) => sel.appendChild(el("option", {
          value: String(i), text: h || `#${i + 1}`, selected: String(p.mapping[f.key]) === String(i),
        })));
        sel.addEventListener("change", () => {
          if (sel.value === "") delete p.mapping[f.key];
          else p.mapping[f.key] = Number(sel.value);
          reanalyze();
        });
        return el("label", { class: "field" }, [
          el("span", {}, [f.label, f.required ? el("span", { class: "error", text: " *" }) : null]),
          sel,
        ]);
      }));

      window.UI.mount(panel, frag([
        card(T("importSummary"), frag([
          el("div", { class: "kpis" }, [
            window.UI.kpi({ label: T("rows"), value: s.total }),
            window.UI.kpi({ label: T("willCreate"), value: s.create, tone: "good" }),
            window.UI.kpi({ label: T("willUpdate"), value: s.update, tone: "accent" }),
            window.UI.kpi({ label: T("willSkip"), value: s.skip }),
            window.UI.kpi({ label: T("withErrors"), value: s.errors, tone: s.errors ? "bad" : "" }),
          ]),
          missingBox(s.missingLookups),
          el("div", { class: "row", style: { marginTop: "12px" } }, [
            el("button", {
              class: "btn primary", type: "button", text: T("commit"),
              disabled: !(s.create + s.update),
              on: { click: () => commit() },
            }),
            el("span", { class: "muted small", style: { alignSelf: "center" },
              text: p.fileName || "" }),
          ]),
        ])),
        card(T("mapping"), mapRow),
        card(T("preview"), rowsTable(p.analysis.rows)),
      ]));
    }

    function missingBox(missing) {
      const bits = [];
      for (const [key, list] of Object.entries(missing || {})) {
        if (list && list.length) bits.push(`${T(key === "jobTitle" ? "jobTitle" : key === "branch" ? "branch" : "department")}: ${list.join(" · ")}`);
      }
      if (!bits.length) return null;
      return el("p", { class: "small", style: { marginTop: "8px" } }, [
        el("strong", { text: T("createMissing") + ": " }),
        el("span", { class: "muted", text: bits.join(" | ") }),
      ]);
    }

    function rowsTable(rows) {
      // اسم الحقل يظهر بتسميته العربية لا بمفتاحه البرمجي
      const labelOf = (key) => {
        const f = (state.parsed.fields || []).find((x) => x.key === key);
        return f ? f.label : key || "";
      };
      return table({
        columns: [
          { key: "line", label: T("line"), num: true },
          { key: "employeeNo", label: T("employeeNo") },
          { key: "name", label: T("fullNameAr") },
          { key: "action", label: T("status"), render: (r) => tag(
            r.action === "create" ? T("willCreate") : r.action === "update" ? T("willUpdate")
              : r.action === "skip" ? T("willSkip") : T("withErrors"),
            r.action === "error" ? "bad" : r.action === "create" ? "good" : r.action === "update" ? "info" : "") },
          { key: "msg", label: T("details"), render: (r) => frag([
            ...r.errors.map((e2) => el("div", { class: "error small", text: `${labelOf(e2.field)}: ${e2.message}` })),
            ...r.warnings.map((w) => el("div", { class: "muted small", text: `${labelOf(w.field)}: ${w.message}` })),
          ]) },
        ],
        rows: rows.slice(0, 400),
        total: rows.length,
      });
    }

    async function commit() {
      const p = state.parsed;
      try {
        const out = await window.API.post("/api/import/employees/commit", {
          rows: p.rows, mapping: p.mapping,
          options: Object.assign({}, state.options, { stopOnError: false }),
        });
        toast(T("importDone", { c: out.created, u: out.updated }), "good");
        await window.App.reloadLookups();
        window.App.go("#/employees");
      } catch (e) { window.UI.handleError(e); }
    }
  }

  /* ======================================================= الإدارة */

  function adminView(view, params) {
    const items = [
      window.App.can("users.manage") ? { key: "users", label: T("users") } : null,
      window.App.can("users.manage") ? { key: "permissions", label: T("permissionsMatrix") } : null,
      window.App.can("lookups.manage") ? { key: "lookups", label: T("lookups") } : null,
      window.App.can("settings.manage") ? { key: "settings", label: T("settings") } : null,
      window.App.can("audit.view") ? { key: "audit", label: T("auditLog") } : null,
      window.App.can("audit.view") ? { key: "logins", label: T("loginLog") } : null,
      window.App.can("users.manage") ? { key: "sessions", label: T("sessions") } : null,
      window.App.can("backup.manage") ? { key: "backups", label: T("backups") } : null,
    ].filter(Boolean);

    if (!items.length) {
      return view.appendChild(el("div", { class: "empty", text: T("noData") }));
    }
    let active = (params && params.tab) || items[0].key;
    const tabsBox = el("div");
    const panel = el("div");
    view.appendChild(pageHead(T("admin")));
    view.appendChild(tabsBox);
    view.appendChild(panel);

    const draw = () => {
      window.UI.mount(tabsBox, window.UI.tabs({ items, active, onChange: (k) => { active = k; draw(); } }));
      window.UI.mount(panel, window.UI.loading());
      const fn = { users: usersTab, permissions: permissionsTab, lookups: lookupsTab, settings: settingsTab,
        audit: auditTab, logins: loginsTab, sessions: sessionsTab, backups: backupsTab }[active];
      Promise.resolve(fn(draw)).then((node) => window.UI.mount(panel, node))
        .catch((e) => window.UI.mount(panel, el("div", { class: "empty error", text: e.message })));
    };
    draw();
  }

  /* ---------------------------------------------------- المستخدمون */

  async function usersTab(reload) {
    const { rows } = await window.API.get("/api/users");
    const branchName = (id) => {
      const b = lookups().branches.find((x) => x.id === Number(id));
      return b ? N.name(b) : id;
    };
    return card(T("users"), table({
      columns: [
        { key: "username", label: T("username") },
        { key: "fullName", label: T("fullName") },
        { key: "role", label: T("role"), render: (r) => tag(N.e("rl", r.role), r.role === "super_admin" ? "info" : "") },
        { key: "branchScope", label: T("branchScope"),
          render: (r) => (r.branchScope ? r.branchScope.map(branchName).join(" · ") : T("allBranches")) },
        { key: "isActive", label: T("status"), render: (r) => tag(r.isActive ? T("active") : T("inactive"), r.isActive ? "good" : "bad") },
        { key: "lastLoginAt", label: T("lastSeen"), render: (r) => N.dateTime(r.lastLoginAt) },
        { key: "sessions", label: T("sessions"), num: true, render: (r) => N.num(r.activeSessions, 0) },
        { key: "act", label: T("actions"), render: (r) => frag([
          el("button", { class: "btn small", type: "button", text: T("edit"), on: { click: () => userForm(r, reload) } }),
          el("button", { class: "btn small", type: "button", text: T("resetPassword"), on: { click: () => passwordForm(r, reload) } }),
        ]) },
      ],
      rows,
    }), el("button", { class: "btn small primary", type: "button", text: "＋ " + T("addUser"), on: { click: () => userForm(null, reload) } }));
  }

  function userForm(user, reload) {
    const branchOptions = lookups().branches.map((b) => ({ value: b.id, label: N.name(b) }));
    formModal({
      title: user ? `${T("edit")} · ${user.username}` : T("addUser"),
      submitLabel: T("save"), successMessage: T("saved"),
      values: user ? {
        fullName: user.fullName, email: user.email, role: user.role,
        isActive: user.isActive, branchScope: (user.branchScope || []).join(","),
      } : { role: "viewer", isActive: true },
      fields: [
        user ? null : { key: "username", label: T("username"), required: true },
        { key: "fullName", label: T("fullName"), required: true },
        { key: "email", label: T("email"), type: "email" },
        { key: "role", label: T("role"), type: "select", required: true,
          options: () => window.App.state.enums.roles.map((r) => ({ value: r, label: N.e("rl", r) })) },
        { key: "branchScope", label: T("branchScope"), type: "select",
          options: () => [{ value: "", label: T("allBranches") }].concat(branchOptions),
          hint: "اتركه على «كل الفروع» ليرى الجميع، أو اختر فرعًا ليُقصر عليه." },
        user ? { key: "isActive", label: T("active"), type: "checkbox" } : null,
        user ? null : { key: "password", label: T("password"), type: "password", required: true,
          hint: "عشرة أحرف فأكثر، وتجمع حروفًا وأرقامًا" },
        user ? null : { key: "mustChangePassword", label: T("mustChangePassword"), type: "checkbox" },
      ].filter(Boolean),
      onSubmit: async (v) => {
        const body = Object.assign({}, v, {
          branchScope: v.branchScope ? [Number(v.branchScope)] : null,
        });
        if (user) await window.API.patch(`/api/users/${user.id}`, body);
        else await window.API.post("/api/users", Object.assign(body, { mustChangePassword: !!v.mustChangePassword }));
        reload();
        return true;
      },
    });
  }

  function passwordForm(user, reload) {
    formModal({
      title: `${T("resetPassword")} · ${user.username}`,
      submitLabel: T("save"), successMessage: T("saved"),
      intro: "ستُنهى جلسات المستخدم، ويُطلب منه تغيير كلمة المرور عند أول دخول.",
      fields: [{ key: "password", label: T("newPassword"), type: "password", required: true, full: true }],
      onSubmit: async (v) => {
        await window.API.post(`/api/users/${user.id}/password`, { password: v.password });
        reload();
        return true;
      },
    });
  }

  /* ---------------------------------------------------- الصلاحيات */

  async function permissionsTab(reload) {
    const data = await window.API.get("/api/permissions");
    const boxes = new Map();
    const rows = data.permissions.map((p) => {
      const cells = data.roles.map((role) => {
        const input = el("input", {
          type: "checkbox", checked: (data.matrix[role] || []).includes(p),
          disabled: role === "super_admin",
        });
        boxes.set(role + "|" + p, input);
        return input;
      });
      return { p, cells };
    });

    const t = el("table", { class: "matrix" }, [
      el("thead", {}, el("tr", {}, [el("th", { text: T("field") })].concat(
        data.roles.map((r) => el("th", { text: N.e("rl", r) }))))),
      el("tbody", {}, rows.map((r) => el("tr", {}, [el("td", { text: T("p_" + r.p) })]
        .concat(r.cells.map((c) => el("td", {}, c)))))),
    ]);

    const save = el("button", {
      class: "btn primary", type: "button", text: T("save"),
      on: {
        click: async () => {
          const matrix = {};
          for (const role of data.roles) {
            matrix[role] = data.permissions.filter((p) => {
              const b = boxes.get(role + "|" + p);
              return role === "super_admin" ? true : b && b.checked;
            });
          }
          try {
            await window.API.put("/api/permissions", { matrix });
            toast(T("saved"), "good");
            await window.App.refreshUser();
            reload();
          } catch (e) { window.UI.handleError(e); }
        },
      },
    });

    return card(T("permissionsMatrix"), frag([
      el("p", { class: "muted small", text: "مدير النظام يملك كل الصلاحيات دائمًا، ولا يُترك النظام بلا من يديره." }),
      el("div", { class: "table-wrap" }, t),
      el("div", { class: "row", style: { marginTop: "12px" } }, save),
    ]));
  }

  /* -------------------------------------------------------- القوائم */

  async function lookupsTab(reload) {
    const kinds = [
      ["branches", T("branches")], ["departments", T("departments")],
      ["job-titles", T("jobTitles")], ["leave-types", T("leaveTypes")],
    ];
    const box = el("div", { class: "grid cols-2" });
    for (const [kind, label] of kinds) {
      const { rows } = await window.API.get(`/api/lookups/${kind}`);
      box.appendChild(card(label, table({
        columns: [
          { key: "code", label: T("code") },
          { key: "nameAr", label: T("nameAr") },
          { key: "nameEn", label: T("nameEn") },
          { key: "isActive", label: T("isActive"), render: (r) => tag(r.isActive ? T("active") : T("inactive"), r.isActive ? "good" : "") },
          { key: "act", label: T("actions"), render: (r) => frag([
            el("button", { class: "btn small", type: "button", text: T("edit"), on: { click: () => lookupForm(kind, label, r, reload) } }),
            el("button", {
              class: "btn small", type: "button", text: r.isActive ? T("deactivate") : T("activate"),
              on: {
                click: async () => {
                  await window.API.patch(`/api/lookups/${kind}/${r.id}`, { isActive: !r.isActive });
                  await window.App.reloadLookups();
                  reload();
                },
              },
            }),
            el("button", {
              class: "btn small danger", type: "button", text: T("delete"),
              on: {
                click: async () => {
                  if (!(await confirm({ message: T("confirmDelete"), danger: true }))) return;
                  try {
                    await window.API.del(`/api/lookups/${kind}/${r.id}`);
                    toast(T("deleted"), "good");
                    await window.App.reloadLookups();
                    reload();
                  } catch (e) { window.UI.handleError(e); }
                },
              },
            }),
          ]) },
        ],
        rows,
      }), el("button", {
        class: "btn small primary", type: "button", text: "＋ " + T("add"),
        on: { click: () => lookupForm(kind, label, null, reload) },
      })));
    }
    return box;
  }

  function lookupForm(kind, label, row, reload) {
    formModal({
      title: `${row ? T("edit") : T("add")} · ${label}`,
      submitLabel: T("save"), successMessage: T("saved"),
      values: row || { isActive: true },
      fields: [
        { key: "nameAr", label: T("nameAr"), required: true },
        { key: "nameEn", label: T("nameEn") },
        { key: "code", label: T("code") },
        kind === "branches" ? { key: "city", label: T("city") } : null,
        kind === "leave-types" ? { key: "attendanceStatus", label: T("attendance"), type: "select",
          options: () => ["sick_leave", "annual_leave", "emergency_leave", "other_leave", "permission", "official_mission"]
            .map((v) => ({ value: v, label: N.e("at", v) })) } : null,
        kind === "leave-types" ? { key: "requiresAttachment", label: T("medicalCertificate"), type: "checkbox" } : null,
        { key: "isActive", label: T("isActive"), type: "checkbox" },
      ].filter(Boolean),
      onSubmit: async (v) => {
        if (row) await window.API.patch(`/api/lookups/${kind}/${row.id}`, v);
        else await window.API.post(`/api/lookups/${kind}`, v);
        await window.App.reloadLookups();
        reload();
        return true;
      },
    });
  }

  /* ------------------------------------------------------ الإعدادات */

  async function settingsTab(reload) {
    const s = await window.API.get("/api/settings");
    const f = window.UI.form({
      values: {
        orgNameAr: s.orgNameAr, orgNameEn: s.orgNameEn, defaultLanguage: s.defaultLanguage,
        leaveDaysBasis: s.leaveDaysBasis, scheduledStartTime: s.scheduledStartTime,
        lateGraceMinutes: s.lateGraceMinutes, probationDays: s.probationDays,
        correctiveDueSoonDays: s.correctiveDueSoonDays, nationalIdDigits: s.nationalIdDigits,
        employeeNoPattern: s.employeeNoPattern,
      },
      fields: [
        { key: "orgNameAr", label: T("orgName") + " (AR)" },
        { key: "orgNameEn", label: T("orgName") + " (EN)" },
        { key: "defaultLanguage", label: T("appName"), type: "select",
          options: [{ value: "ar", label: "العربية" }, { value: "en", label: "English" }] },
        { key: "scheduledStartTime", label: T("scheduledTime"), type: "time" },
        { key: "lateGraceMinutes", label: T("lateGrace"), type: "number", min: 0, max: 240 },
        { key: "leaveDaysBasis", label: T("leaveDaysBasis"), type: "select",
          options: [{ value: "calendar", label: T("calendarDays") }, { value: "workdays", label: T("workDaysBasis") }] },
        { key: "probationDays", label: T("probationDays"), type: "number", min: 0, max: 730 },
        { key: "correctiveDueSoonDays", label: T("correctiveDueSoon"), type: "number", min: 1, max: 90 },
        { key: "nationalIdDigits", label: T("nationalIdDigits"), type: "number", min: 5, max: 20 },
        { key: "employeeNoPattern", label: T("employeeNo"), hint: "تعبير نمطي اختياري، مثل ^\\d{4,6}$" },
      ],
      onSubmit: async (v) => {
        try {
          const body = Object.assign({}, v, {
            workDays: days.filter((d) => d.input.checked).map((d) => d.value),
            lateGraceMinutes: Number(v.lateGraceMinutes) || 0,
            probationDays: Number(v.probationDays) || 0,
            correctiveDueSoonDays: Number(v.correctiveDueSoonDays) || 7,
            nationalIdDigits: Number(v.nationalIdDigits) || 10,
          });
          await window.API.patch("/api/settings", body);
          toast(T("saved"), "good");
          await window.App.refreshUser();
          reload();
        } catch (e) { window.UI.handleError(e, f); }
      },
    });

    const days = [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const input = el("input", { type: "checkbox", checked: (s.workDays || []).includes(d) });
      return { value: d, input };
    });

    return frag([
      card(T("settings"), frag([
        f.el,
        el("div", { style: { marginTop: "12px" } }, [
          el("div", { class: "field" }, el("span", { text: T("workDays") })),
          el("div", { class: "row" }, days.map((d) => el("label", { class: "field inline" },
            [d.input, el("span", { text: T("wd_" + d.value) })]))),
        ]),
        el("div", { class: "row", style: { marginTop: "14px" } }, [
          el("button", { class: "btn primary", type: "button", text: T("save"), on: { click: () => f.el.requestSubmit ? f.el.requestSubmit() : f.el.dispatchEvent(new Event("submit")) } }),
          el("button", {
            class: "btn", type: "button", text: T("refreshSnapshots"),
            on: {
              click: async () => {
                const out = await window.API.post("/api/maintenance/refresh", {});
                toast(`${T("saved")} (${N.num(out.refreshed, 0)})`, "good");
              },
            },
          }),
        ]),
      ])),
      card(T("changePassword"), ownPasswordForm()),
    ]);
  }

  function ownPasswordForm() {
    const f = window.UI.form({
      fields: [
        { key: "currentPassword", label: T("currentPassword"), type: "password", required: true },
        { key: "newPassword", label: T("newPassword"), type: "password", required: true },
      ],
      onSubmit: async (v) => {
        try {
          await window.API.post("/api/auth/password", v);
          toast(T("saved"), "good");
          f.set("currentPassword", "");
          f.set("newPassword", "");
        } catch (e) { window.UI.handleError(e, f); }
      },
    });
    return frag([f.el, el("div", { class: "row", style: { marginTop: "10px" } },
      el("button", { class: "btn primary", type: "button", text: T("save"),
        on: { click: () => f.el.requestSubmit ? f.el.requestSubmit() : f.el.dispatchEvent(new Event("submit")) } }))]);
  }

  /* ---------------------------------------------------- سجل التدقيق */

  let auditState = { page: 1, size: 50 };

  async function auditTab(reload) {
    const box = el("div");
    const head = window.UI.filters({
      values: auditState,
      fields: [
        { key: "q", label: T("search"), type: "text", grow: true },
        { key: "entity", label: T("entity"), type: "select",
          options: () => ["employee", "transfer", "resignation", "termination", "attendance", "leave",
            "disciplinary", "corrective", "user", "settings", "attachment"].map((v) => ({ value: v, label: N.e("en", v) })) },
        { key: "action", label: T("action"), type: "select",
          options: () => ["create", "update", "delete", "archive", "import", "export", "backup", "password"]
            .map((v) => ({ value: v, label: N.e("ac", v) })) },
        { key: "from", label: T("from"), type: "date" },
        { key: "to", label: T("to"), type: "date" },
      ],
      onChange: (v) => { auditState = Object.assign(auditState, v, { page: 1 }); load(); },
      actions: [window.App.can("reports.export") ? el("button", {
        class: "btn small", type: "button", text: T("exportExcel"),
        on: { click: () => window.App.download("/api/export/audit.xlsx", Object.assign({ lang: N.lang }, auditState)) },
      }) : null],
    });

    async function load() {
      window.UI.mount(box, window.UI.loading());
      const data = await window.API.get("/api/audit", auditState);
      window.UI.mount(box, table({
        columns: [
          { key: "at", label: T("date"), render: (r) => N.dateTime(r.at) },
          { key: "userName", label: T("user") },
          { key: "action", label: T("action"), render: (r) => tag(N.e("ac", r.action), r.action === "delete" ? "bad" : "") },
          { key: "entity", label: T("entity"), render: (r) => N.e("en", r.entity) },
          { key: "summary", label: T("details") },
          { key: "changes", label: `${T("before")} / ${T("after")}`, render: (r) => frag(r.changes.slice(0, 6).map((c) =>
            el("div", { class: "diff" }, [
              el("b", { text: c.field + ": " }),
              el("span", { class: "was", text: c.before === null || c.before === "" ? "—" : String(c.before) }),
              el("span", { text: " → " }),
              el("span", { class: "now", text: c.after === null || c.after === "" ? "—" : String(c.after) }),
            ]))) },
          { key: "ip", label: T("ip") },
        ],
        rows: data.rows, total: data.total, page: data.page, size: data.size,
        onPage: (p) => { auditState.page = p; load(); },
        onRow: (r) => { if (r.employeeId) window.App.go(`#/employee/${r.employeeId}`); },
      }));
    }
    load();
    return card(T("auditLog"), frag([el("p", { class: "muted small", text: T("auditNote") }), head, box]));
  }

  async function loginsTab() {
    const { rows } = await window.API.get("/api/login-log");
    return card(T("loginLog"), table({
      columns: [
        { key: "at", label: T("date"), render: (r) => N.dateTime(r.at) },
        { key: "username", label: T("username") },
        { key: "success", label: T("status"), render: (r) => tag(r.success ? "✓" : "✕", r.success ? "good" : "bad") },
        { key: "reason", label: T("reason") },
        { key: "ip", label: T("ip") },
      ],
      rows,
    }));
  }

  async function sessionsTab(reload) {
    const { rows } = await window.API.get("/api/sessions");
    return card(T("sessions"), table({
      columns: [
        { key: "fullName", label: T("user"), render: (r) => `${r.fullName} (${r.username})` },
        { key: "createdAt", label: T("createdAt"), render: (r) => N.dateTime(r.createdAt) },
        { key: "lastSeenAt", label: T("lastSeen"), render: (r) => N.dateTime(r.lastSeenAt) },
        { key: "ip", label: T("ip") },
        { key: "userAgent", label: T("details"), render: (r) => (r.userAgent || "").slice(0, 60) },
        { key: "act", label: T("actions"), render: (r) => el("button", {
          class: "btn small danger", type: "button", text: T("revokeSession"),
          on: {
            click: async () => {
              await window.API.del(`/api/sessions/${r.id}`);
              toast(T("saved"), "good");
              reload();
            },
          },
        }) },
      ],
      rows,
    }));
  }

  async function backupsTab(reload) {
    const data = await window.API.get("/api/backups");
    return card(T("backups"), frag([
      el("p", { class: "muted small", text: T("backupHint") }),
      el("p", { class: "muted small", text: `${data.dir} · ${T("retention")}: ${N.num(data.retentionDays, 0)} ${T("days")}` }),
      el("div", { class: "row", style: { marginBottom: "12px" } }, el("button", {
        class: "btn primary", type: "button", text: T("backupNow"),
        on: {
          click: async (e) => {
            e.target.disabled = true;
            try {
              const out = await window.API.post("/api/backups", {});
              toast(`${out.file} · ${N.num(Math.round(out.size / 1024), 0)} KB`, "good");
              reload();
            } catch (err) { window.UI.handleError(err); e.target.disabled = false; }
          },
        },
      })),
      table({
        columns: [
          { key: "file", label: T("attachment") },
          { key: "at", label: T("date"), render: (r) => N.dateTime(r.at) },
          { key: "size", label: T("total"), num: true, render: (r) => `${N.num(Math.round(r.size / 1024), 0)} KB` },
          { key: "act", label: T("actions"), render: (r) => el("button", {
            class: "btn small", type: "button", text: T("download"),
            on: { click: () => window.App.download(`/api/backups/${r.file}`) },
          }) },
        ],
        rows: data.rows,
      }),
    ]));
  }

  window.Views = window.Views || {};
  window.Views.import = { render: importView };
  window.Views.admin = { render: adminView };
})();
