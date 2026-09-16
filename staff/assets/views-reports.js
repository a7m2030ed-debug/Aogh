/* ======================================================================
   التقارير — شهري وسنوي ومخصص، وحسب الفرع والقسم والمسمى
   ----------------------------------------------------------------------
   الأرقام كلها من الخادم محسوبة من السجلات الخام لحظة الطلب.
   ====================================================================== */

(function () {
  "use strict";

  const { el, frag, card, table, kpi, pageHead, toast } = window.UI;
  const T = (k, v) => window.I18N.t(k, v);
  const N = window.I18N;

  const lookups = () => window.App.state.lookups;
  const opts = (list) => list.map((x) => ({ value: x.id, label: N.name(x) }));

  let state = null;

  function defaults() {
    const today = window.Dates.today();
    return {
      tab: "monthly",
      year: +today.slice(0, 4),
      month: +today.slice(5, 7),
      from: window.Dates.monthStart(today),
      to: today,
      branchId: "",
      departmentId: "",
      jobTitleId: "",
      dimension: "branch",
    };
  }

  function render(view) {
    if (!state) state = defaults();
    const head = el("div");
    const panel = el("div");

    view.appendChild(pageHead(T("reports"), [
      window.App.can("reports.export") ? el("button", {
        class: "btn", type: "button", text: T("exportExcel"),
        on: { click: () => window.App.download("/api/export/report.xlsx", Object.assign({ lang: N.lang }, rangeQuery())) },
      }) : null,
      el("button", { class: "btn", type: "button", text: T("print"), on: { click: () => window.print() } }),
    ]));
    view.appendChild(head);
    view.appendChild(panel);

    const draw = () => {
      window.UI.mount(head, frag([
        window.UI.tabs({
          items: [
            { key: "monthly", label: T("monthlyReport") },
            { key: "annual", label: T("annualReport") },
            { key: "custom", label: T("customReport") },
            { key: "dimension", label: T("branchReport") + " / " + T("departmentReport") },
          ],
          active: state.tab,
          onChange: (k) => { state.tab = k; draw(); },
        }),
        controls(draw),
      ]));
      window.UI.mount(panel, window.UI.loading());
      load(panel).catch((e) => window.UI.mount(panel, el("div", { class: "empty error", text: e.message })));
    };
    draw();
  }

  function controls(draw) {
    const row = el("div", { class: "row no-print", style: { marginBottom: "14px" } });
    const add = (label, node) => row.appendChild(el("label", { class: "field" }, [el("span", { text: label }), node]));

    if (state.tab === "monthly") {
      const mSel = el("select");
      for (let m = 1; m <= 12; m++) mSel.appendChild(el("option", { value: String(m), text: N.monthName(m), selected: m === state.month }));
      mSel.addEventListener("change", () => { state.month = +mSel.value; draw(); });
      add(T("month"), mSel);
      add(T("year"), yearInput(draw));
    } else if (state.tab === "annual") {
      add(T("year"), yearInput(draw));
    } else if (state.tab === "custom") {
      const from = el("input", { type: "date", value: state.from });
      const to = el("input", { type: "date", value: state.to });
      from.addEventListener("change", () => { state.from = from.value; draw(); });
      to.addEventListener("change", () => { state.to = to.value; draw(); });
      add(T("from"), from);
      add(T("to"), to);
    } else {
      const dim = el("select");
      [["branch", T("branch")], ["department", T("department")], ["jobTitle", T("jobTitle")]].forEach(([v, l]) =>
        dim.appendChild(el("option", { value: v, text: l, selected: state.dimension === v })));
      dim.addEventListener("change", () => { state.dimension = dim.value; draw(); });
      add(T("type"), dim);
      const from = el("input", { type: "date", value: state.from });
      const to = el("input", { type: "date", value: state.to });
      from.addEventListener("change", () => { state.from = from.value; draw(); });
      to.addEventListener("change", () => { state.to = to.value; draw(); });
      add(T("from"), from);
      add(T("to"), to);
    }

    if (state.tab !== "dimension") {
      const b = el("select");
      b.appendChild(el("option", { value: "", text: T("allBranches") }));
      opts(lookups().branches).forEach((o) => b.appendChild(el("option", { value: String(o.value), text: o.label, selected: String(o.value) === String(state.branchId) })));
      b.addEventListener("change", () => { state.branchId = b.value; draw(); });
      add(T("branch"), b);

      const d = el("select");
      d.appendChild(el("option", { value: "", text: T("all") }));
      opts(lookups().departments).forEach((o) => d.appendChild(el("option", { value: String(o.value), text: o.label, selected: String(o.value) === String(state.departmentId) })));
      d.addEventListener("change", () => { state.departmentId = d.value; draw(); });
      add(T("department"), d);
    }
    return row;
  }

  function yearInput(draw) {
    const y = el("input", { type: "number", value: String(state.year), min: "2000", max: "2199", style: { width: "110px" } });
    y.addEventListener("change", () => { state.year = +y.value || state.year; draw(); });
    return y;
  }

  function rangeQuery() {
    const base = { branchId: state.branchId || undefined, departmentId: state.departmentId || undefined };
    if (state.tab === "monthly") {
      const last = window.Dates.monthEnd(`${state.year}-${String(state.month).padStart(2, "0")}-01`);
      return Object.assign(base, { from: `${state.year}-${String(state.month).padStart(2, "0")}-01`, to: last });
    }
    if (state.tab === "annual") return Object.assign(base, { from: `${state.year}-01-01`, to: `${state.year}-12-31` });
    return Object.assign(base, { from: state.from, to: state.to });
  }

  async function load(panel) {
    if (state.tab === "dimension") return loadDimension(panel);
    const q = rangeQuery();
    const data = state.tab === "monthly"
      ? await window.API.get("/api/reports/monthly", { year: state.year, month: state.month, branchId: q.branchId, departmentId: q.departmentId })
      : state.tab === "annual"
        ? await window.API.get("/api/reports/annual", { year: state.year, branchId: q.branchId, departmentId: q.departmentId })
        : await window.API.get("/api/reports/period", q);

    const m = data.movement, a = data.attendance, d = data.disciplinary;
    const title = state.tab === "monthly" ? `${N.monthName(state.month)} ${state.year}`
      : state.tab === "annual" ? String(state.year)
        : `${N.date(data.range.from)} — ${N.date(data.range.to)}`;

    const nodes = [
      el("div", { class: "print-head" }, [
        el("h1", { text: `${T("reports")} — ${title}` }),
        el("p", { class: "muted small", text: filterLabel(data) }),
      ]),
      card(`${T("employeeMovement")} · ${title}`, el("div", { class: "kpis" }, [
        kpi({ label: T("openingHeadcount"), value: m.openingHeadcount, tone: "accent" }),
        kpi({ label: T("newJoiners"), value: m.newJoiners, tone: "good",
          sub: `${T("newHires")}: ${N.num(m.newHires, 0)} · ${T("rehires")}: ${N.num(m.rehires, 0)}` }),
        kpi({ label: T("resignations"), value: m.resignations }),
        kpi({ label: T("terminations"), value: m.terminations }),
        kpi({ label: T("retirements"), value: m.retirements }),
        kpi({ label: T("transfersIn"), value: m.transfersIn }),
        kpi({ label: T("transfersOut"), value: m.transfersOut }),
        kpi({ label: T("closingHeadcount"), value: m.closingHeadcount, tone: "accent" }),
      ])),
      card(T("attendance"), el("div", { class: "kpis" }, [
        kpi({ label: T("present"), value: a.present }),
        kpi({ label: T("absent"), value: a.absent }),
        kpi({ label: T("lateOccurrences"), value: a.lateOccurrences }),
        kpi({ label: T("lateMinutes"), value: a.lateMinutes }),
        kpi({ label: T("lateAverage"), value: N.num(a.lateAverage) }),
        kpi({ label: T("sickLeaveDays"), value: a.sickLeaveDays }),
        kpi({ label: T("annualLeaveDays"), value: a.annualLeaveDays }),
        kpi({ label: T("otherLeaveDays"), value: a.otherLeaveDays }),
      ])),
      leaveBreakdown(a),
      card(T("discipline"), el("div", { class: "kpis" }, [
        kpi({ label: T("da_verbal_warning"), value: d.verbalWarnings }),
        kpi({ label: T("warningLetters"), value: d.warningLetters }),
        kpi({ label: T("correctiveActions"), value: d.correctiveOpened }),
        kpi({ label: T("ca_closed"), value: d.correctiveClosedInRange }),
        kpi({ label: T("correctiveOverdue"), value: d.correctiveOverdue, tone: d.correctiveOverdue ? "bad" : "" }),
        kpi({ label: T("da_other"), value: d.otherActions }),
      ])),
    ];

    if (state.tab === "annual" && data.months) {
      nodes.push(card(T("monthlyTable"), monthlyTable(data.months)));
      nodes.push(window.Charts.chartCard({
        title: T("headcountTrend"),
        chart: window.Charts.lines(data.months.map((r) => N.monthName(r.month).slice(0, 3)),
          [{ name: T("headcount"), color: window.Charts.series(0), values: data.months.map((r) => r.closing) }],
          { area: true, zero: false }),
      }));
      nodes.push(window.Charts.chartCard({
        title: T("joinersVsLeavers"),
        chart: window.Charts.columns(data.months.map((r) => N.monthName(r.month).slice(0, 3)), [
          { name: T("joiners"), color: window.Charts.series(0), values: data.months.map((r) => r.joiners) },
          { name: T("resignations"), color: window.Charts.series(1), values: data.months.map((r) => r.resignations + r.terminations) },
        ]),
        legend: window.Charts.legend([
          { label: T("joiners"), color: window.Charts.series(0) },
          { label: T("resignations") + " + " + T("terminations"), color: window.Charts.series(1) },
        ]),
      }));
    }

    nodes.push(el("div", { class: "row no-print", style: { marginTop: "10px" } }, [
      el("button", {
        class: "btn small", type: "button", text: `${T("viewHeadcount")} · ${N.date(data.range.to)}`,
        on: { click: () => window.Views.dashboard.showHeadcount(data.range.to) },
      }),
    ]));
    nodes.push(el("p", { class: "muted small", text: T("reportNote") }));
    window.UI.mount(panel, frag(nodes));
  }

  function filterLabel(data) {
    const f = data.filters || {};
    const bits = [];
    if (f.branch) bits.push(`${T("branch")}: ${N.name(f.branch)}`);
    if (f.department) bits.push(`${T("department")}: ${N.name(f.department)}`);
    if (!bits.length) bits.push(T("allBranches"));
    return bits.join(" · ");
  }

  function leaveBreakdown(a) {
    const rows = (a.leaveDays && a.leaveDays.rows) || [];
    if (!rows.length) return null;
    return card(T("leaves"), table({
      columns: [
        { key: "name", label: T("leaveType"), render: (r) => (N.lang === "en" ? r.nameEn : r.nameAr) },
        { key: "requests", label: T("rows"), num: true, render: (r) => N.num(r.requests, 0) },
        { key: "days", label: T("days"), num: true, render: (r) => N.num(r.days, 0) },
      ],
      rows,
    }));
  }

  function monthlyTable(months) {
    return table({
      columns: [
        { key: "month", label: T("month"), render: (r) => N.monthName(r.month) },
        { key: "opening", label: T("opening"), num: true, render: (r) => N.num(r.opening, 0) },
        { key: "joiners", label: T("joiners"), num: true, render: (r) => N.num(r.joiners, 0) },
        { key: "resignations", label: T("resigned"), num: true, render: (r) => N.num(r.resignations, 0) },
        { key: "terminations", label: T("terminated"), num: true, render: (r) => N.num(r.terminations, 0) },
        { key: "transfersIn", label: T("transfersIn"), num: true, render: (r) => N.num(r.transfersIn, 0) },
        { key: "transfersOut", label: T("transfersOut"), num: true, render: (r) => N.num(r.transfersOut, 0) },
        { key: "closing", label: T("closing"), num: true, render: (r) => N.num(r.closing, 0) },
      ],
      rows: months,
    });
  }

  async function loadDimension(panel) {
    const data = await window.API.get("/api/reports/by-dimension", {
      dimension: state.dimension, from: state.from, to: state.to,
    });
    const label = state.dimension === "branch" ? T("branch") : state.dimension === "department" ? T("department") : T("jobTitle");
    const rows = data.rows;
    window.UI.mount(panel, frag([
      el("div", { class: "print-head" }, [
        el("h1", { text: `${T("reports")} — ${label}` }),
        el("p", { class: "muted small", text: `${N.date(state.from)} — ${N.date(state.to)}` }),
      ]),
      card(`${label} · ${N.date(state.from)} — ${N.date(state.to)}`, table({
        columns: [
          { key: "name", label, render: (r) => (N.lang === "en" ? r.nameEn || r.nameAr : r.nameAr) },
          { key: "opening", label: T("opening"), num: true, render: (r) => N.num(r.opening, 0) },
          { key: "joiners", label: T("joiners"), num: true, render: (r) => N.num(r.joiners, 0) },
          { key: "resignations", label: T("resigned"), num: true, render: (r) => N.num(r.resignations, 0) },
          { key: "terminations", label: T("terminated"), num: true, render: (r) => N.num(r.terminations, 0) },
          { key: "transfersIn", label: T("transfersIn"), num: true, render: (r) => N.num(r.transfersIn, 0) },
          { key: "transfersOut", label: T("transfersOut"), num: true, render: (r) => N.num(r.transfersOut, 0) },
          { key: "closing", label: T("closing"), num: true, render: (r) => N.num(r.closing, 0) },
          { key: "absences", label: T("absent"), num: true, render: (r) => N.num(r.absences, 0) },
          { key: "sickLeaveDays", label: T("sickLeaveDays"), num: true, render: (r) => N.num(r.sickLeaveDays, 0) },
          { key: "lateOccurrences", label: T("lateOccurrences"), num: true, render: (r) => N.num(r.lateOccurrences, 0) },
          { key: "lateMinutes", label: T("lateMinutes"), num: true, render: (r) => N.num(r.lateMinutes, 0) },
          { key: "warningLetters", label: T("warningLetters"), num: true, render: (r) => N.num(r.warningLetters, 0) },
          { key: "correctiveActions", label: T("correctiveActions"), num: true, render: (r) => N.num(r.correctiveActions, 0) },
        ],
        rows,
      })),
      window.Charts.chartCard({
        title: `${T("closingHeadcount")} · ${label}`,
        chart: window.Charts.bars(rows.map((r) => ({ label: N.lang === "en" ? r.nameEn || r.nameAr : r.nameAr, value: r.closing }))),
      }),
      window.Charts.chartCard({
        title: `${T("absent")} · ${label}`,
        chart: window.Charts.bars(rows.map((r) => ({ label: N.lang === "en" ? r.nameEn || r.nameAr : r.nameAr, value: r.absences })),
          { color: window.Charts.series(1) }),
      }),
      el("p", { class: "muted small", text: T("reportNote") }),
    ]));
  }

  window.Views = window.Views || {};
  window.Views.reports = { render };
})();
