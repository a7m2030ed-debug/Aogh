/* ======================================================================
   الهيكل — الدخول والتوجيه والقائمة واللغة والسمة
   ====================================================================== */

(function () {
  "use strict";

  const { el, frag, toast } = window.UI;
  const T = (k, v) => window.I18N.t(k, v);

  const state = {
    user: null, lookups: { branches: [], departments: [], jobTitles: [], leaveTypes: [] },
    settings: {}, enums: {}, today: new Date().toISOString().slice(0, 10),
    employees: [], dashBranch: null,
    period: null,
  };

  const ROUTES = [
    { key: "dashboard", hash: "#/dashboard", icon: "▦", label: () => T("navDashboard"), perm: "reports.view",
      render: (v, p) => window.Views.dashboard.render(v, p) },
    { key: "employees", hash: "#/employees", icon: "👤", label: () => T("navEmployees"), perm: "employees.view",
      render: (v, p) => window.Views.employees.render(v, p) },
    { key: "attendance", hash: "#/attendance", icon: "🕘", label: () => T("navAttendance"), perm: "attendance.view",
      render: (v) => window.Views.hr.attendanceView(v) },
    { key: "leaves", hash: "#/leaves", icon: "✈", label: () => T("navLeaves"), perm: "leaves.view",
      render: (v) => window.Views.hr.leavesView(v) },
    { key: "discipline", hash: "#/discipline", icon: "⚠", label: () => T("navDiscipline"), perm: "discipline.view",
      render: (v) => window.Views.hr.disciplineView(v) },
    { key: "movements", hash: "#/movements", icon: "⇄", label: () => T("navMovements"), perm: "employees.view",
      render: (v) => window.Views.hr.movementsView(v) },
    { key: "reports", hash: "#/reports", icon: "📊", label: () => T("navReports"), perm: "reports.view",
      render: (v) => window.Views.reports.render(v) },
    { key: "import", hash: "#/import", icon: "⭳", label: () => T("navImport"), perm: "import.run",
      render: (v) => window.Views.import.render(v) },
    { key: "admin", hash: "#/admin", icon: "⚙", label: () => T("navAdmin"), perm: null,
      adminOnly: true, render: (v, p) => window.Views.admin.render(v, p) },
  ];

  const ADMIN_PERMS = ["users.manage", "lookups.manage", "settings.manage", "audit.view", "backup.manage"];

  const can = (p) => !!(state.user && state.user.permissions && state.user.permissions.includes(p));
  const visible = (r) => (r.adminOnly ? ADMIN_PERMS.some(can) : !r.perm || can(r.perm));

  /* ------------------------------------------------------- التوجيه */

  let current = null;

  function parseHash() {
    const h = (location.hash || "#/dashboard").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean);
    const key = parts[0] || "dashboard";
    if (key === "employee" && parts[1]) return { key: "employee", params: { id: parts[1], tab: parts[2] } };
    const q = {};
    const qi = h.indexOf("?");
    if (qi >= 0) {
      new URLSearchParams(h.slice(qi + 1)).forEach((v, k) => { q[k] = v; });
    }
    return { key, params: q };
  }

  async function route() {
    const { key, params } = parseHash();
    const view = document.getElementById("view");
    window.UI.clear(view);
    window.scrollTo(0, 0);
    document.getElementById("sidebar").classList.remove("open");

    if (key === "employee") {
      current = { key, params };
      if (!can("employees.view")) return denied(view);
      return window.Views.employees.profile(view, params);
    }
    const r = ROUTES.find((x) => x.key === key) || ROUTES[0];
    if (!visible(r)) {
      const first = ROUTES.find(visible);
      if (first && first.key !== r.key) { location.hash = first.hash; return; }
      return denied(view);
    }
    current = { key: r.key, params };
    markNav(r.key);
    try {
      await r.render(view, params);
    } catch (e) {
      window.UI.mount(view, el("div", { class: "empty error", text: e.message }));
    }
  }

  const denied = (view) => window.UI.mount(view, el("div", { class: "empty", text: T("noData") }));

  function markNav(key) {
    document.querySelectorAll("#nav button").forEach((b) => {
      b.classList.toggle("active", b.dataset.key === key);
    });
  }

  function buildNav() {
    const nav = document.getElementById("nav");
    window.UI.clear(nav);
    ROUTES.filter(visible).forEach((r) => {
      nav.appendChild(el("button", {
        type: "button", dataset: { key: r.key },
        on: { click: () => { location.hash = r.hash; } },
      }, [el("span", { class: "nav-icon", text: r.icon }), el("span", { text: r.label() })]));
    });
  }

  /* --------------------------------------------------------- الدخول */

  const loginBox = () => document.getElementById("login");
  const appBox = () => document.getElementById("app");

  function showLogin(message) {
    appBox().hidden = true;
    loginBox().hidden = false;
    const err = document.getElementById("login-error");
    if (message) { err.textContent = message; err.hidden = false; } else err.hidden = true;
    translateLogin();
  }

  function translateLogin() {
    document.getElementById("login-title").textContent = state.settings.orgNameAr && window.I18N.lang === "ar"
      ? state.settings.orgNameAr : (state.settings.orgNameEn && window.I18N.lang === "en" ? state.settings.orgNameEn : T("appName"));
    document.getElementById("login-sub").textContent = T("signInSub");
    document.getElementById("login-user-label").textContent = T("username");
    document.getElementById("login-pass-label").textContent = T("password");
    document.getElementById("login-btn").textContent = T("login");
    document.getElementById("login-foot").textContent = T("loginFoot");
  }

  function translateShell() {
    document.getElementById("quick-search-input").placeholder = T("quickSearchPlaceholder");
    document.getElementById("quick-search-btn").textContent = T("search");
    document.getElementById("btn-logout").textContent = T("logout");
    document.getElementById("btn-lang").textContent = window.I18N.lang === "ar" ? "EN" : "ع";
    document.getElementById("org-name").textContent = window.I18N.lang === "en"
      ? (state.settings.orgNameEn || T("appName")) : (state.settings.orgNameAr || T("appName"));
    document.title = window.I18N.lang === "en"
      ? (state.settings.orgNameEn || T("appName")) : (state.settings.orgNameAr || T("appName"));
    if (state.user) {
      document.getElementById("who-name").textContent = state.user.fullName;
      document.getElementById("who-role").textContent = window.I18N.e("rl", state.user.role);
    }
  }

  async function boot() {
    try {
      const data = await window.API.bootstrap();
      applyBootstrap(data);
      start();
    } catch (e) {
      // ‎404‎ أو انقطاع تام: الصفحة مفتوحة بلا خادم (استضافة ثابتة مثلًا)
      const noServer = e.status === 404 || e.status === 0;
      showLogin(e.status === 401 ? null : noServer ? T("serverRequired") : e.message);
      if (noServer) document.getElementById("login-btn").disabled = true;
    }
  }

  function applyBootstrap(data) {
    state.user = data.user;
    state.lookups = data.lookups;
    state.settings = data.settings;
    state.enums = data.enums;
    state.today = data.today;
    if (!state.period) state.period = window.Dates.presetRange("month");
    if (!localStorage.getItem("staff_lang") && data.settings.defaultLanguage) {
      window.I18N.setLang(data.settings.defaultLanguage);
    }
  }

  function start() {
    loginBox().hidden = true;
    appBox().hidden = false;
    translateShell();
    buildNav();
    loadEmployees();
    loadAlerts();
    if (state.user.mustChangePassword) return forcePasswordChange();
    if (!location.hash || location.hash === "#") {
      const first = ROUTES.find(visible);
      location.hash = first ? first.hash : "#/dashboard";
    } else route();
  }

  function forcePasswordChange() {
    window.UI.formModal({
      title: T("changePassword"),
      submitLabel: T("save"),
      intro: "كلمة المرور الحالية مؤقتة — اختر كلمة جديدة لتتمكن من استخدام النظام.",
      fields: [
        { key: "currentPassword", label: T("currentPassword"), type: "password", required: true, full: true },
        { key: "newPassword", label: T("newPassword"), type: "password", required: true, full: true,
          hint: "عشرة أحرف فأكثر، وتجمع حروفًا وأرقامًا" },
      ],
      onSubmit: async (v) => {
        await window.API.post("/api/auth/password", v);
        toast(T("saved"), "good");
        const data = await window.API.bootstrap();
        applyBootstrap(data);
        start();
        return true;
      },
    });
  }

  /* -------------------------------------------------------- تنبيهات */

  async function loadAlerts() {
    try {
      const { rows } = await window.API.get("/api/notifications");
      const badge = document.getElementById("alerts-count");
      const urgent = rows.filter((r) => r.severity !== "low").length;
      badge.textContent = String(rows.length);
      badge.hidden = !rows.length;
      document.getElementById("btn-alerts").onclick = () => showAlerts(rows);
      if (urgent) document.getElementById("btn-alerts").title = `${urgent} ${T("alerts")}`;
    } catch { /* الجلسة انتهت أو لا صلاحية */ }
  }

  function showAlerts(rows) {
    window.UI.modal({
      title: T("alerts"),
      body: rows.length
        ? el("div", { class: "alert-list" }, rows.map((a) => el("div", {
          class: "alert-item " + a.severity,
          on: { click: () => { location.hash = `#/employee/${a.employee.id}`; document.querySelector(".modal-back").remove(); } },
        }, [
          el("strong", { text: T("al_" + a.type) }),
          el("span", { class: "muted", text: `${a.employee.employeeNo} — ${window.I18N.person(a.employee)}` }),
          el("div", { class: "spacer" }),
          el("span", { class: "muted small", text: window.I18N.date(a.date) }),
        ])))
        : el("div", { class: "empty", text: T("noAlerts") }),
      actions: [{ label: T("close"), kind: "primary", onClick: (c) => c() }],
    });
  }

  /* ------------------------------------------------- قوائم الموظفين */

  async function loadEmployees() {
    if (!can("employees.view")) return;
    try {
      const data = await window.API.get("/api/employees", { size: 500, sort: "name" });
      state.employees = data.rows;
    } catch { state.employees = []; }
  }

  /* -------------------------------------------------------- الواجهة */

  const App = {
    state,
    can,
    go(hash) { location.hash = hash; },
    rerender() { route(); },
    period: () => state.period,
    setPeriod(p) { state.period = p; },
    employeeOptions: () => window.UI.employeeOptions(state.employees),
    managerOptions: () => window.UI.employeeOptions(state.employees),

    async reloadLookups() {
      try {
        state.lookups = await window.API.get("/api/lookups");
        await loadEmployees();
      } catch { /* تُحدَّث في الإقلاع التالي */ }
    },

    async refreshUser() {
      const data = await window.API.bootstrap();
      applyBootstrap(data);
      translateShell();
      buildNav();
    },

    async download(path, params) {
      try {
        const name = await window.API.download(path, params);
        toast(name, "good");
      } catch (e) { window.UI.handleError(e); }
    },
  };
  window.App = App;

  /* --------------------------------------------------------- الأحداث */

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("login-btn");
    const fd = new FormData(e.target);
    btn.disabled = true;
    try {
      await window.API.login(fd.get("username"), fd.get("password"));
      const data = await window.API.bootstrap();
      applyBootstrap(data);
      e.target.reset();
      start();
    } catch (err) {
      showLogin(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("btn-logout").addEventListener("click", async () => {
    await window.API.logout();
    state.user = null;
    location.hash = "";
    showLogin();
  });

  document.getElementById("btn-menu").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  document.getElementById("btn-lang").addEventListener("click", () => {
    window.I18N.setLang(window.I18N.lang === "ar" ? "en" : "ar");
    translateShell();
    translateLogin();
    buildNav();
    route();
  });

  const THEMES = ["auto", "light", "dark"];
  document.getElementById("btn-theme").addEventListener("click", () => {
    const now = document.documentElement.dataset.theme || "auto";
    const next = THEMES[(THEMES.indexOf(now) + 1) % THEMES.length];
    document.documentElement.dataset.theme = next;
    localStorage.setItem("staff_theme", next);
    toast(next === "auto" ? "◐" : next === "dark" ? "🌙" : "☀");
  });

  document.getElementById("quick-search").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = document.getElementById("quick-search-input").value.trim();
    if (!q) return;
    // تطابق تام لرقم الهوية أو الرقم الوظيفي يفتح الملف مباشرة
    try {
      const r = await window.API.get("/api/employees/lookup", { nationalId: /^\d{6,}$/.test(q) ? q : undefined, employeeNo: /^\d{6,}$/.test(q) ? undefined : q });
      if (r.found) { location.hash = `#/employee/${r.employee.id}`; return; }
    } catch { /* نكمل إلى البحث العام */ }
    location.hash = `#/employees?q=${encodeURIComponent(q)}`;
    if (current && current.key === "employees") route();
  });

  window.addEventListener("hashchange", route);

  window.API.onUnauthorized(() => {
    if (!state.user) return;
    state.user = null;
    showLogin(T("sessionExpired"));
  });

  const savedTheme = localStorage.getItem("staff_theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;

  translateLogin();
  boot();
})();
