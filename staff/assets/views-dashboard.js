/* ======================================================================
   لوحة المعلومات
   ----------------------------------------------------------------------
   كل رقم هنا يأتي من /api/reports/dashboard محسوبًا من السجلات، ولا
   يُخزَّن أي مؤشر. وتغيير المدة يعيد الحساب كاملًا من الخادم.
   ====================================================================== */

(function () {
  "use strict";

  const { el, frag, card, kpi, table, toast } = window.UI;
  const T = (k, v) => window.I18N.t(k, v);
  const D = window.Dates;

  function periodBar(period, onChange) {
    const presets = [
      ["today", T("today")], ["week", T("thisWeek")], ["month", T("thisMonth")],
      ["year", T("thisYear")], ["custom", T("custom")],
    ];
    const row = el("div", { class: "row no-print", style: { marginBottom: "14px" } });
    const group = el("div", { class: "tabs", style: { border: "0", margin: "0" } });
    presets.forEach(([key, label]) => {
      group.appendChild(el("button", {
        type: "button", class: period.preset === key ? "active" : "", text: label,
        on: { click: () => onChange(D.presetRange(key, period)) },
      }));
    });
    row.appendChild(group);

    if (period.preset === "custom") {
      const from = el("input", { type: "date", value: period.from });
      const to = el("input", { type: "date", value: period.to });
      const go = el("button", {
        class: "btn primary small", type: "button", text: T("apply"),
        on: {
          click: () => {
            if (!from.value || !to.value) return toast(T("required"), "bad");
            onChange({ preset: "custom", from: from.value, to: to.value });
          },
        },
      });
      row.appendChild(el("label", { class: "field" }, [el("span", { text: T("from") }), from]));
      row.appendChild(el("label", { class: "field" }, [el("span", { text: T("to") }), to]));
      row.appendChild(go);
    } else {
      row.appendChild(el("div", { class: "muted small", style: { alignSelf: "center" } ,
        text: `${window.I18N.date(period.from)} — ${window.I18N.date(period.to)}` }));
    }
    return row;
  }

  function branchFilter(value, onChange) {
    const sel = el("select", { style: { maxWidth: "190px" } });
    sel.appendChild(el("option", { value: "", text: T("allBranches") }));
    for (const b of window.App.state.lookups.branches) {
      sel.appendChild(el("option", { value: String(b.id), text: window.I18N.name(b), selected: String(b.id) === String(value) }));
    }
    sel.addEventListener("change", () => onChange(sel.value));
    return el("label", { class: "field no-print" }, [el("span", { text: T("branch") }), sel]);
  }

  async function render(view) {
    const App = window.App;
    const period = App.period();
    view.appendChild(window.UI.pageHead(T("dashboard"), [
      branchFilter(App.state.dashBranch, (v) => { App.state.dashBranch = v || null; App.rerender(); }),
      App.can("reports.export") ? el("button", {
        class: "btn small", type: "button", text: T("exportExcel"),
        on: { click: () => App.download("/api/export/report.xlsx", Object.assign({ lang: window.I18N.lang }, query())) },
      }) : null,
      el("button", { class: "btn small", type: "button", text: T("print"), on: { click: () => window.print() } }),
    ]));
    view.appendChild(periodBar(period, (p) => { App.setPeriod(p); App.rerender(); }));

    const body = el("div", {}, window.UI.loading());
    view.appendChild(body);

    function query() {
      return { from: period.from, to: period.to, branchId: App.state.dashBranch || undefined };
    }

    let data;
    try {
      data = await window.API.get("/api/reports/dashboard", query());
    } catch (e) {
      window.UI.clear(body);
      body.appendChild(el("div", { class: "empty error", text: e.message }));
      return;
    }

    window.UI.clear(body);
    const m = data.movement, a = data.attendance, d = data.disciplinary;

    /* الأرقام الأساسية */
    body.appendChild(el("div", { class: "kpis" }, [
      kpi({ label: T("currentActive"), value: data.currentActive, tone: "accent",
        sub: `${T("today")} ${window.I18N.date(data.today)}`,
        onClick: () => showHeadcount(data.today) }),
      kpi({ label: T("openingHeadcount"), value: m.openingHeadcount,
        sub: window.I18N.date(period.from), onClick: () => showHeadcount(prevDay(period.from)) }),
      kpi({ label: T("newJoiners"), value: m.newJoiners, tone: "good",
        sub: m.rehires ? `${T("rehires")}: ${window.I18N.num(m.rehires, 0)}` : "" }),
      kpi({ label: T("resignations"), value: m.resignations, tone: m.resignations ? "warn" : "" }),
      kpi({ label: T("terminations"), value: m.terminations, tone: m.terminations ? "bad" : "" }),
      // «داخل/خارج» لا معنى لهما بلا فرع محدَّد، فيُعرض مجموع النقل بدلهما
      App.state.dashBranch
        ? kpi({ label: T("transfersIn"), value: m.transfersIn, sub: `${T("transfersOut")}: ${window.I18N.num(m.transfersOut, 0)}` })
        : kpi({ label: T("transfers"), value: m.transfers, sub: T("allBranches") }),
      kpi({ label: T("closingHeadcount"), value: m.closingHeadcount, tone: "accent",
        sub: window.I18N.date(period.to), onClick: () => showHeadcount(period.to) }),
      kpi({
        label: T("reconciliation"),
        value: m.reconciliation.difference === 0 ? "✓" : window.I18N.num(m.reconciliation.difference, 0),
        tone: m.reconciliation.difference === 0 ? "good" : "bad",
        sub: m.reconciliation.difference === 0 ? T("reconciliationOk") : T("reconciliationOff", { n: m.reconciliation.difference }),
      }),
    ]));

    /* الحضور والانضباط */
    body.appendChild(el("h2", { text: T("attendance"), style: { marginTop: "20px" } }));
    body.appendChild(el("div", { class: "kpis" }, [
      kpi({ label: T("present"), value: a.present, tone: "good" }),
      kpi({ label: T("absent"), value: a.absent, tone: a.absent ? "warn" : "",
        sub: a.absentUnapproved ? `${T("unapproved")}: ${window.I18N.num(a.absentUnapproved, 0)}` : "" }),
      kpi({ label: T("lateOccurrences"), value: a.lateOccurrences,
        sub: `${T("lateMinutes")}: ${window.I18N.num(a.lateMinutes, 0)}` }),
      kpi({ label: T("lateAverage"), value: window.I18N.num(a.lateAverage), sub: T("minutes") }),
      kpi({ label: T("sickLeaveDays"), value: a.sickLeaveDays }),
      kpi({ label: T("annualLeaveDays"), value: a.annualLeaveDays }),
      kpi({ label: T("otherLeaveDays"), value: a.otherLeaveDays }),
      kpi({ label: T("permissions"), value: a.permissions }),
    ]));

    body.appendChild(el("h2", { text: T("discipline"), style: { marginTop: "20px" } }));
    body.appendChild(el("div", { class: "kpis" }, [
      kpi({ label: T("warningLetters"), value: d.warningLetters, tone: d.warningLetters ? "warn" : "" }),
      kpi({ label: T("da_verbal_warning"), value: d.verbalWarnings }),
      kpi({ label: T("correctiveActions"), value: d.correctiveOpened,
        sub: `${T("correctiveOverdue")}: ${window.I18N.num(d.correctiveOverdue, 0)}` }),
      kpi({ label: T("da_other"), value: d.otherActions }),
    ]));

    /* الرسوم */
    const months = data.charts.monthly;
    const labels = months.map((r) => window.I18N.monthName(r.month).slice(0, 3));
    const grid = el("div", { class: "grid cols-2", style: { marginTop: "20px" } });

    grid.appendChild(window.Charts.chartCard({
      title: T("headcountTrend"),
      chart: window.Charts.lines(labels, [{
        name: T("headcount"), color: window.Charts.series(0), values: months.map((r) => r.closing),
      }], { area: true, zero: false }),
      table: () => window.Charts.dataTable([T("month"), T("opening"), T("closing")],
        months.map((r) => [r.label, window.I18N.num(r.opening, 0), window.I18N.num(r.closing, 0)])),
    }));

    grid.appendChild(window.Charts.chartCard({
      title: T("joinersVsLeavers"),
      chart: window.Charts.columns(labels, [
        { name: T("joiners"), color: window.Charts.series(0), values: months.map((r) => r.joiners) },
        { name: T("resignations") + " + " + T("terminations"), color: window.Charts.series(1),
          values: months.map((r) => r.resignations + r.terminations + r.retirements) },
      ]),
      legend: window.Charts.legend([
        { label: T("joiners"), color: window.Charts.series(0) },
        { label: T("resignations") + " + " + T("terminations"), color: window.Charts.series(1) },
      ]),
      table: () => window.Charts.dataTable([T("month"), T("joiners"), T("resignations"), T("terminations")],
        months.map((r) => [r.label, window.I18N.num(r.joiners, 0), window.I18N.num(r.resignations, 0), window.I18N.num(r.terminations, 0)])),
    }));

    grid.appendChild(window.Charts.chartCard({
      title: T("headcountByBranch"),
      chart: window.Charts.bars(data.charts.headcountByBranch.map(toRow)),
      table: () => window.Charts.dataTable([T("branch"), T("headcount")],
        data.charts.headcountByBranch.map((r) => [nameOf(r), window.I18N.num(r.value, 0)])),
    }));

    grid.appendChild(window.Charts.chartCard({
      title: T("headcountByDepartment"),
      chart: window.Charts.bars(data.charts.headcountByDepartment.map(toRow)),
      table: () => window.Charts.dataTable([T("department"), T("headcount")],
        data.charts.headcountByDepartment.map((r) => [nameOf(r), window.I18N.num(r.value, 0)])),
    }));

    grid.appendChild(window.Charts.chartCard({
      title: T("absenceByBranch"),
      chart: window.Charts.bars(data.charts.absenceByBranch.map(toRow), { color: window.Charts.series(1) }),
      table: () => window.Charts.dataTable([T("branch"), T("absent")],
        data.charts.absenceByBranch.map((r) => [nameOf(r), window.I18N.num(r.value, 0)])),
    }));

    grid.appendChild(window.Charts.chartCard({
      title: T("lateByDepartment"),
      chart: window.Charts.bars(data.charts.lateByDepartment.map(toRow), { color: window.Charts.series(1) }),
      table: () => window.Charts.dataTable([T("department"), T("lateOccurrences")],
        data.charts.lateByDepartment.map((r) => [nameOf(r), window.I18N.num(r.value, 0)])),
    }));

    grid.appendChild(window.Charts.chartCard({
      title: T("statusBreakdown"),
      chart: window.Charts.bars(data.charts.statusBreakdown.map((r) => ({
        label: window.I18N.e("st", r.status), value: r.value,
      }))),
      table: () => window.Charts.dataTable([T("status"), T("total")],
        data.charts.statusBreakdown.map((r) => [window.I18N.e("st", r.status), window.I18N.num(r.value, 0)])),
    }));

    grid.appendChild(card(T("alerts"), data.alerts.length
      ? el("div", { class: "alert-list" }, data.alerts.slice(0, 12).map(alertRow))
      : el("div", { class: "empty", text: T("noAlerts") })));

    body.appendChild(grid);
    body.appendChild(el("p", { class: "muted small", style: { marginTop: "14px" }, text: T("reportNote") }));
  }

  const nameOf = (r) => (window.I18N.lang === "en" ? r.nameEn || r.nameAr : r.nameAr);
  const toRow = (r) => ({ label: nameOf(r), value: r.value });
  const prevDay = (iso) => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  function alertRow(a) {
    return el("div", {
      class: "alert-item " + a.severity,
      on: { click: () => window.App.go(`#/employee/${a.employee.id}`) },
    }, [
      el("strong", { text: T("al_" + a.type) }),
      el("span", { class: "muted", text: `${a.employee.employeeNo} — ${window.I18N.person(a.employee)}` }),
      el("div", { class: "spacer" }),
      el("span", { class: "muted small", text: window.I18N.date(a.date) }),
    ]);
  }

  async function showHeadcount(date) {
    const m = window.UI.modal({
      title: `${T("headcountAt")} ${window.I18N.date(date)}`, wide: true,
      body: window.UI.loading(),
      actions: [
        window.App.can("reports.export") ? {
          label: T("exportExcel"),
          onClick: () => window.App.download("/api/export/headcount.xlsx",
            { date, branchId: window.App.state.dashBranch || undefined, lang: window.I18N.lang }),
        } : null,
        "spacer",
        { label: T("close"), kind: "primary", onClick: (close) => close() },
      ].filter(Boolean),
    });
    try {
      const data = await window.API.get("/api/reports/headcount",
        { date, branchId: window.App.state.dashBranch || undefined, size: 1000 });
      const byId = (list) => Object.fromEntries(list.map((x) => [x.id, window.I18N.name(x)]));
      const B = byId(window.App.state.lookups.branches);
      const DEPT = byId(window.App.state.lookups.departments);
      const J = byId(window.App.state.lookups.jobTitles);
      window.UI.mount(m.body, frag([
        el("p", { class: "muted small", text: `${T("total")}: ${window.I18N.num(data.total, 0)}` }),
        table({
          columns: [
            { key: "employeeNo", label: T("employeeNo") },
            { key: "name", label: T("fullNameAr"), render: (r) => window.I18N.person(r) },
            { key: "branch", label: T("branch"), render: (r) => B[r.branchId] || "—" },
            { key: "dept", label: T("department"), render: (r) => DEPT[r.departmentId] || "—" },
            { key: "job", label: T("jobTitle"), render: (r) => J[r.jobTitleId] || "—" },
            { key: "startDate", label: T("joiningDate"), render: (r) => window.I18N.date(r.startDate) },
          ],
          rows: data.rows,
          onRow: (r) => { m.close(); window.App.go(`#/employee/${r.id}`); },
        }),
      ]));
    } catch (e) {
      window.UI.mount(m.body, el("div", { class: "empty error", text: e.message }));
    }
  }

  window.Views = window.Views || {};
  window.Views.dashboard = { render, showHeadcount };
})();
