/* ======================================================================
   الرسوم — SVG مكتوب بخط اليد، بلا مكتبة
   ----------------------------------------------------------------------
   الألوان من لوحة مُتحقَّق منها لعمى الألوان (الأزرق ثم البرتقالي ثم
   الأخضر المائي…) بترتيب ثابت لا يُدوَّر، ولكل سمة درجاتها.

   · الشرائح الأفقية (حسب الفرع/القسم) مبنية بـHTML لا SVG: الاتجاه
     ينقلب مع اللغة بلا حساب إحداثيات.
   · السلاسل الزمنية بـSVG، وفي العربية تسير من اليمين إلى اليسار.
   · لكل رسم «عرض كجدول» — فما لا يُقرأ باللون يُقرأ بالرقم.
   ====================================================================== */

(function () {
  "use strict";

  const { el, frag, clear } = window.UI;
  const T = (k) => window.I18N.t(k);
  const NS = "http://www.w3.org/2000/svg";

  const series = (i) => `var(--series-${(i % 8) + 1})`;
  const isRtl = () => document.documentElement.dir === "rtl";

  function svg(tag, attrs, children) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined) continue;
      n.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : children ? [children] : []).forEach((c) => n.appendChild(c));
    return n;
  }

  const tipEl = () => document.getElementById("tooltip");

  function showTip(evt, lines) {
    const tip = tipEl();
    clear(tip);
    lines.filter(Boolean).forEach((l) => tip.appendChild(el("div", { text: l })));
    tip.hidden = false;
    const pad = 12;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY - h - pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y < 8) y = evt.clientY + pad;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  const hideTip = () => { tipEl().hidden = true; };

  /* -------------------------------------------------- إطار الرسم */

  function chartCard(opts) {
    const body = el("div", { class: "chart" });
    const tableBox = el("div", { hidden: true });
    let shown = false;

    const toggle = opts.table
      ? el("button", {
        class: "btn ghost small no-print", type: "button", text: T("showTable"),
        on: {
          click: () => {
            shown = !shown;
            tableBox.hidden = !shown;
            toggle.textContent = shown ? T("hideTable") : T("showTable");
            if (shown && !tableBox.firstChild) tableBox.appendChild(opts.table());
          },
        },
      })
      : null;

    body.appendChild(opts.render ? opts.render() : opts.chart);
    return el("section", { class: "card" }, [
      el("div", { class: "chart-head" }, [
        el("h3", { text: opts.title }),
        el("div", { class: "spacer" }),
        toggle,
      ]),
      body,
      opts.legend || null,
      tableBox,
    ]);
  }

  function legend(items) {
    return el("div", { class: "legend" }, items.map((it) =>
      el("span", {}, [el("i", { style: { background: it.color } }), it.label])));
  }

  const empty = () => el("div", { class: "chart-empty", text: T("noData") });

  /* ------------------------------------------- شرائح أفقية (HTML) */

  /* rows: [{label, value, tone}] — تُرتَّب نازلًا، والقيمة مكتوبة بجانبها */
  function bars(rows, opts = {}) {
    const data = (rows || []).filter((r) => r && Number(r.value) > 0);
    if (!data.length) return empty();
    const max = Math.max.apply(null, data.map((r) => Number(r.value)));
    const color = opts.color || series(0);
    const box = el("div", { class: "hbars" });
    data.slice(0, opts.limit || 12).forEach((r) => {
      const pct = max ? Math.max((Number(r.value) / max) * 100, 1.5) : 0;
      box.appendChild(el("div", { class: "hbar" }, [
        el("div", { class: "hbar-label", text: r.label, title: r.label }),
        el("div", { class: "hbar-track" }, el("div", {
          class: "hbar-fill",
          style: { width: pct + "%", background: r.color || color },
          on: {
            mousemove: (e) => showTip(e, [r.label, `${opts.unit || ""} ${window.I18N.num(r.value, 0)}`.trim()]),
            mouseleave: hideTip,
          },
        })),
        el("div", { class: "hbar-value", text: window.I18N.num(r.value, 0) }),
      ]));
    });
    return box;
  }

  /* ------------------------------------------ سلسلة زمنية (SVG) */

  /* categories: [نص], seriesList: [{name, values:[عدد], color}] */
  function lines(categories, seriesList, opts = {}) {
    const cats = isRtl() ? categories.slice().reverse() : categories.slice();
    const sers = seriesList.map((s) => ({
      name: s.name,
      color: s.color,
      values: isRtl() ? s.values.slice().reverse() : s.values.slice(),
    }));
    if (!cats.length || !sers.length) return empty();

    const W = 720, Hh = opts.height || 240;
    const m = { top: 14, right: 46, bottom: 26, left: 46 };
    const iw = W - m.left - m.right, ih = Hh - m.top - m.bottom;
    const all = sers.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
    let max = Math.max.apply(null, all.concat([1]));
    let min = opts.zero === false ? Math.min.apply(null, all.concat([max])) : 0;
    const pad = (max - min) * 0.12 || 1;
    max += pad;
    if (opts.zero !== false) min = 0; else min = Math.max(0, min - pad);

    const x = (i) => m.left + (cats.length === 1 ? iw / 2 : (i * iw) / (cats.length - 1));
    const y = (v) => m.top + ih - ((v - min) / (max - min || 1)) * ih;

    const kids = [];
    // شبكة خافتة: أربعة خطوط لا أكثر
    for (let t = 0; t <= 4; t++) {
      const v = min + ((max - min) * t) / 4;
      kids.push(svg("line", { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v), stroke: "var(--grid)", "stroke-width": 1 }));
      kids.push(svg("text", {
        x: isRtl() ? W - m.right + 8 : m.left - 8, y: y(v) + 4,
        "text-anchor": isRtl() ? "start" : "end", "font-size": 10, fill: "var(--muted)",
      }, [document.createTextNode(window.I18N.num(Math.round(v), 0))]));
    }

    const step = Math.ceil(cats.length / 12);
    cats.forEach((c, i) => {
      if (i % step) return;
      kids.push(svg("text", {
        x: x(i), y: Hh - 8, "text-anchor": "middle", "font-size": 10, fill: "var(--muted)",
      }, [document.createTextNode(c)]));
    });

    sers.forEach((s) => {
      const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
      if (opts.area) {
        kids.push(svg("polygon", {
          points: `${x(0)},${y(min)} ${pts} ${x(s.values.length - 1)},${y(min)}`,
          fill: s.color, opacity: .10,
        }));
      }
      kids.push(svg("polyline", {
        points: pts, fill: "none", stroke: s.color, "stroke-width": 2,
        "stroke-linejoin": "round", "stroke-linecap": "round",
      }));
      s.values.forEach((v, i) => {
        kids.push(svg("circle", { cx: x(i), cy: y(v), r: 3.5, fill: s.color, stroke: "var(--surface)", "stroke-width": 2 }));
      });
      // تسمية مباشرة لأحدث نقطة وحدها بدل رقم على كل نقطة.
      // في العربية الزمن يسير يمينًا→يسارًا، فأحدث نقطة هي أول المرسوم.
      const newest = isRtl() ? 0 : s.values.length - 1;
      kids.push(svg("text", {
        x: x(newest) + (isRtl() ? 8 : -8), y: y(s.values[newest]) - 9,
        "text-anchor": isRtl() ? "start" : "end", "font-size": 11, "font-weight": 600, fill: "var(--text-2)",
      }, [document.createTextNode(window.I18N.num(s.values[newest], 0))]));
    });

    const crosshair = svg("line", {
      y1: m.top, y2: m.top + ih, stroke: "var(--border-strong)", "stroke-width": 1,
      "stroke-dasharray": "3 3", opacity: 0,
    });
    kids.push(crosshair);

    /* لا سمة style على العنصر: سياسة CSP تمنع الأنماط السطرية، والمقاس
       يأتي من viewBox مع عرض ‎100%‎ في ملف الأنماط. */
    const root = svg("svg", {
      viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": opts.title || "",
    }, kids);

    root.addEventListener("mousemove", (e) => {
      const r = root.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      let idx = 0, best = Infinity;
      cats.forEach((_, i) => { const d = Math.abs(x(i) - px); if (d < best) { best = d; idx = i; } });
      crosshair.setAttribute("x1", x(idx));
      crosshair.setAttribute("x2", x(idx));
      crosshair.setAttribute("opacity", 1);
      showTip(e, [cats[idx]].concat(sers.map((s) => `${s.name}: ${window.I18N.num(s.values[idx], 0)}`)));
    });
    root.addEventListener("mouseleave", () => { crosshair.setAttribute("opacity", 0); hideTip(); });
    return root;
  }

  /* أعمدة مجمَّعة: مباشرون مقابل مغادرين */
  function columns(categories, seriesList, opts = {}) {
    const cats = isRtl() ? categories.slice().reverse() : categories.slice();
    const sers = seriesList.map((s) => ({
      name: s.name, color: s.color,
      values: isRtl() ? s.values.slice().reverse() : s.values.slice(),
    }));
    if (!cats.length) return empty();

    const W = 720, Hh = opts.height || 240;
    const m = { top: 14, right: 16, bottom: 26, left: 40 };
    const iw = W - m.left - m.right, ih = Hh - m.top - m.bottom;
    const max = Math.max.apply(null, sers.flatMap((s) => s.values).concat([1])) * 1.12;
    const bandW = iw / cats.length;
    const gap = 2;                                   // فاصل السطح بين عمودين
    const barW = Math.max((bandW - 10 - gap * (sers.length - 1)) / sers.length, 3);
    const y = (v) => m.top + ih - (v / max) * ih;

    const kids = [];
    for (let t = 0; t <= 3; t++) {
      const v = (max * t) / 3;
      kids.push(svg("line", { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v), stroke: "var(--grid)", "stroke-width": 1 }));
      kids.push(svg("text", {
        x: isRtl() ? W - m.right : m.left - 8, y: y(v) + 4,
        "text-anchor": isRtl() ? "start" : "end", "font-size": 10, fill: "var(--muted)",
      }, [document.createTextNode(window.I18N.num(Math.round(v), 0))]));
    }

    const step = Math.ceil(cats.length / 12);
    cats.forEach((c, i) => {
      const bx = m.left + i * bandW;
      if (!(i % step)) {
        kids.push(svg("text", {
          x: bx + bandW / 2, y: Hh - 8, "text-anchor": "middle", "font-size": 10, fill: "var(--muted)",
        }, [document.createTextNode(c)]));
      }
      sers.forEach((s, si) => {
        const v = s.values[i] || 0;
        const h = v ? Math.max(ih - (y(v) - m.top), 2) : 0;
        if (!h) return;
        const rect = svg("rect", {
          x: bx + 5 + si * (barW + gap), y: y(v), width: barW, height: h,
          rx: Math.min(4, barW / 2), fill: s.color,
        });
        rect.addEventListener("mousemove", (e) => showTip(e, [cats[i], `${s.name}: ${window.I18N.num(v, 0)}`]));
        rect.addEventListener("mouseleave", hideTip);
        kids.push(rect);
      });
    });

    return svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": opts.title || "" }, kids);
  }

  /* جدول بديل لأي رسم */
  function dataTable(head, rows) {
    return window.UI.table({
      columns: head.map((h, i) => ({ key: String(i), label: h, num: i > 0, render: (r) => r[i] })),
      rows,
    });
  }

  window.Charts = {
    bars, lines, columns, chartCard, legend, dataTable, series, showTip, hideTip, empty,
  };
})();
