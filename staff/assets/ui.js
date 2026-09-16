/* ======================================================================
   عناصر الواجهة — بلا أي مكتبة
   ----------------------------------------------------------------------
   كل نصّ يدخل الصفحة عبر textContent لا عبر innerHTML، فبيانات الموظفين
   مهما كان فيها من رموز تُعرض نصًّا ولا تُنفَّذ أبدًا (وسياسة CSP على
   الخادم تمنع تنفيذ أي سكربت غير ملفات النظام أصلًا).
   ====================================================================== */

(function () {
  "use strict";

  const T = (k, v) => window.I18N.t(k, v);

  /* ------------------------------------------------------- بناء DOM */

  function el(tag, props, children) {
    const n = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === "class" || k === "className") n.className = v;
        else if (k === "text") n.textContent = v;
        else if (k === "on") for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
        else if (k === "style") Object.assign(n.style, v);
        else if (k === "dataset") Object.assign(n.dataset, v);
        else if (k === "attrs") for (const [a, val] of Object.entries(v)) {
          if (val !== null && val !== undefined && val !== false) n.setAttribute(a, val);
        }
        else if (k in n) n[k] = v;
        else n.setAttribute(k, v);
      }
    }
    append(n, children);
    return n;
  }

  function append(node, children) {
    if (children === undefined || children === null || children === false) return node;
    if (Array.isArray(children)) { children.forEach((c) => append(node, c)); return node; }
    node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
    return node;
  }

  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  const mount = (n, children) => append(clear(n), children);
  const frag = (children) => append(document.createDocumentFragment(), children);

  /* -------------------------------------------------------- تنبيهات */

  function toast(message, kind) {
    const box = document.getElementById("toasts");
    const t = el("div", { class: "toast " + (kind || ""), text: message });
    box.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transition = "opacity .25s";
      setTimeout(() => t.remove(), 260);
    }, kind === "bad" ? 6000 : 3200);
    return t;
  }

  /* --------------------------------------------------------- نوافذ */

  function modal(opts) {
    const root = document.getElementById("modal-root");
    const body = opts.body instanceof Node ? opts.body : el("div", { text: String(opts.body || "") });
    const foot = el("div", { class: "modal-foot" });
    const box = el("div", { class: "modal" + (opts.wide ? " wide" : "") }, [
      el("div", { class: "modal-head" }, [
        el("h2", { text: opts.title || "" }),
        el("div", { class: "spacer" }),
        el("button", { class: "btn ghost icon", type: "button", text: "✕", attrs: { "aria-label": T("close") }, on: { click: close } }),
      ]),
      el("div", { class: "modal-body" }, body),
      foot,
    ]);
    const back = el("div", { class: "modal-back", on: { click: (e) => { if (e.target === back) close(); } } }, box);

    (opts.actions || []).forEach((a) => {
      if (a === "spacer") return foot.appendChild(el("div", { class: "spacer" }));
      foot.appendChild(el("button", {
        class: "btn " + (a.kind || ""), type: "button", text: a.label,
        on: { click: () => a.onClick && a.onClick(close) },
      }));
    });
    if (!opts.actions) foot.remove();

    function close() {
      back.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);

    root.appendChild(back);
    const first = box.querySelector("input, select, textarea, button.primary");
    if (first) setTimeout(() => first.focus(), 30);
    return { close, box, body };
  }

  function confirm(opts) {
    return new Promise((resolve) => {
      let done = false;
      const m = modal({
        title: opts.title || T("confirm"),
        body: el("p", { text: opts.message || "" }),
        actions: [
          { label: opts.cancelLabel || T("cancel"), onClick: (close) => { done = true; close(); resolve(false); } },
          "spacer",
          { label: opts.okLabel || T("confirm"), kind: opts.danger ? "danger" : "primary",
            onClick: (close) => { done = true; close(); resolve(true); } },
        ],
      });
      const obs = new MutationObserver(() => {
        if (!document.body.contains(m.box) && !done) { done = true; obs.disconnect(); resolve(false); }
      });
      obs.observe(document.getElementById("modal-root"), { childList: true, subtree: true });
    });
  }

  /* -------------------------------------------------------- النماذج

     field = { key, label, type, options, required, hint, placeholder, half, when } */

  function form(opts) {
    const values = Object.assign({}, opts.values || {});
    const inputs = new Map();
    const box = el("form", { class: "grid", style: { gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" } });

    function build() {
      clear(box);
      for (const f of opts.fields) {
        if (f.when && !f.when(values)) continue;
        if (f.type === "separator") {
          box.appendChild(el("h3", { text: f.label, style: { gridColumn: "1 / -1", marginTop: "6px" } }));
          continue;
        }
        const wrap = el("label", { class: "field" });
        if (f.full) wrap.style.gridColumn = "1 / -1";
        wrap.appendChild(el("span", {}, [
          f.label,
          f.required ? el("span", { class: "error", text: " *" }) : null,
        ]));

        let input;
        const value = values[f.key];
        if (f.type === "select") {
          input = el("select");
          const opts2 = typeof f.options === "function" ? f.options(values) : (f.options || []);
          if (!f.required || f.placeholder) {
            input.appendChild(el("option", { value: "", text: f.placeholder || "—" }));
          }
          for (const o of opts2) {
            input.appendChild(el("option", {
              value: String(o.value), text: o.label,
              selected: String(o.value) === String(value === undefined || value === null ? "" : value),
            }));
          }
          if (value !== undefined && value !== null) input.value = String(value);
        } else if (f.type === "textarea") {
          input = el("textarea", { value: value || "", placeholder: f.placeholder || "" });
          wrap.style.gridColumn = "1 / -1";
        } else if (f.type === "checkbox") {
          input = el("input", { type: "checkbox", checked: !!value });
          wrap.classList.add("inline");
        } else {
          input = el("input", {
            type: f.type || "text",
            value: value === undefined || value === null ? "" : String(value),
            placeholder: f.placeholder || "",
            attrs: {
              min: f.min, max: f.max, step: f.step, maxlength: f.maxLength,
              inputmode: f.inputmode, autocomplete: f.autocomplete || "off",
              list: f.list || null, readonly: f.readOnly ? "readonly" : null,
            },
          });
        }
        if (f.required) input.required = true;
        input.addEventListener("input", () => {
          values[f.key] = f.type === "checkbox" ? input.checked : input.value;
          wrap.classList.remove("invalid");
          const err = wrap.querySelector(".field-error");
          if (err) err.remove();
          if (f.onChange) { f.onChange(values, api); }
          if (f.rebuild) build();
        });
        input.addEventListener("change", () => {
          values[f.key] = f.type === "checkbox" ? input.checked : input.value;
          if (f.onChange) f.onChange(values, api);
          if (f.rebuild) build();
        });

        wrap.appendChild(input);
        if (f.hint) wrap.appendChild(el("div", { class: "field-hint", text: f.hint }));
        inputs.set(f.key, { input, wrap, field: f });
        box.appendChild(wrap);
        if (f.datalist) box.appendChild(f.datalist);
      }
    }

    const api = {
      el: box,
      values: () => Object.assign({}, values),
      set(key, v) {
        values[key] = v;
        const rec = inputs.get(key);
        if (rec) {
          if (rec.field.type === "checkbox") rec.input.checked = !!v;
          else rec.input.value = v === null || v === undefined ? "" : String(v);
        }
      },
      get: (key) => values[key],
      error(key, message) {
        const rec = inputs.get(key);
        if (!rec) { toast(message, "bad"); return; }
        rec.wrap.classList.add("invalid");
        if (!rec.wrap.querySelector(".field-error")) {
          rec.wrap.appendChild(el("div", { class: "field-error", text: message }));
        }
        rec.input.focus();
      },
      clearErrors() {
        inputs.forEach((rec) => {
          rec.wrap.classList.remove("invalid");
          const e = rec.wrap.querySelector(".field-error");
          if (e) e.remove();
        });
      },
      rebuild: build,
      focus(key) { const r = inputs.get(key); if (r) r.input.focus(); },
    };

    build();
    box.addEventListener("submit", (e) => {
      e.preventDefault();
      if (opts.onSubmit) opts.onSubmit(api.values(), api);
    });
    return api;
  }

  /* نافذة نموذج جاهزة: تفتح، تتحقق، تُغلق عند النجاح */
  function formModal(opts) {
    let busy = false;
    const f = form({
      fields: opts.fields, values: opts.values,
      onSubmit: () => submit(),
    });
    const m = modal({
      title: opts.title, wide: opts.wide, body: frag([
        opts.intro ? el("p", { class: "muted small", text: opts.intro }) : null,
        f.el,
      ]),
      actions: [
        { label: T("cancel"), onClick: (close) => close() },
        "spacer",
        { label: opts.submitLabel || T("save"), kind: "primary", onClick: () => submit() },
      ],
    });

    async function submit() {
      if (busy) return;
      busy = true;
      f.clearErrors();
      try {
        const out = await opts.onSubmit(f.values(), f);
        if (out !== false) {
          m.close();
          if (opts.successMessage) toast(opts.successMessage, "good");
        }
      } catch (err) {
        handleError(err, f);
      } finally {
        busy = false;
      }
    }
    return { form: f, modal: m };
  }

  /* خطأ من الخادم: يُبرز الحقل المعني إن ذُكر، وإلا تنبيه عام */
  function handleError(err, f) {
    const msg = err && err.message ? err.message : T("networkError");
    if (f && err && err.field) f.error(err.field, msg);
    else if (f && err && err.details && err.details.field) f.error(err.details.field, msg);
    else toast(msg, "bad");
    return msg;
  }

  /* --------------------------------------------------------- جداول

     columns: [{ key, label, render(row), num, sortable, width }] */

  function table(opts) {
    const cols = opts.columns.filter(Boolean);
    const thead = el("thead", {}, el("tr", {}, cols.map((c) => el("th", {
      class: (c.num ? "num " : "") + (c.sortable ? "sortable" : ""),
      text: c.label + (opts.sort === c.key ? (opts.dir === "desc" ? " ↓" : " ↑") : ""),
      style: c.width ? { width: c.width } : null,
      on: c.sortable && opts.onSort ? { click: () => opts.onSort(c.key) } : null,
    }))));

    const tbody = el("tbody");
    if (!opts.rows.length) {
      tbody.appendChild(el("tr", {}, el("td", {
        class: "empty", text: opts.empty || T("noData"), attrs: { colspan: cols.length },
      })));
    } else {
      for (const row of opts.rows) {
        const tr = el("tr", {
          class: opts.onRow ? "clickable" : "",
          on: opts.onRow ? { click: (e) => { if (!e.target.closest("button, a")) opts.onRow(row); } } : null,
        });
        for (const c of cols) {
          const v = c.render ? c.render(row) : row[c.key];
          tr.appendChild(el("td", { class: c.num ? "num" : "" },
            v instanceof Node || Array.isArray(v) ? v : (v === null || v === undefined || v === "" ? "—" : String(v))));
        }
        tbody.appendChild(tr);
      }
    }

    const wrap = el("div", { class: "table-wrap" }, el("table", {}, [thead, tbody]));
    if (!opts.footer && !opts.total) return wrap;

    const foot = el("div", { class: "table-foot" });
    if (opts.total !== undefined) {
      foot.appendChild(el("span", { class: "muted", text: `${T("showing")} ${window.I18N.num(opts.rows.length, 0)} ${T("of")} ${window.I18N.num(opts.total, 0)}` }));
    }
    foot.appendChild(el("div", { class: "spacer" }));
    if (opts.footer) append(foot, opts.footer);
    if (opts.onPage && opts.total > opts.rows.length) {
      const pages = Math.ceil(opts.total / (opts.size || 25));
      foot.appendChild(el("button", {
        class: "btn small", text: "‹", disabled: (opts.page || 1) <= 1,
        on: { click: () => opts.onPage((opts.page || 1) - 1) },
      }));
      foot.appendChild(el("span", { class: "muted", text: `${opts.page || 1} / ${pages}` }));
      foot.appendChild(el("button", {
        class: "btn small", text: "›", disabled: (opts.page || 1) >= pages,
        on: { click: () => opts.onPage((opts.page || 1) + 1) },
      }));
    }
    return el("div", {}, [wrap, foot]);
  }

  /* ------------------------------------------------------ مرشّحات */

  /* شريط تصفية فوق الجدول — يعيد القيم عند كل تغيير */
  function filters(opts) {
    const values = Object.assign({}, opts.values || {});
    const row = el("div", { class: "row", style: { marginBottom: "12px" } });
    for (const f of opts.fields) {
      const wrap = el("label", { class: "field", style: { flex: f.grow ? "1 1 180px" : "0 0 auto", minWidth: f.width || "150px" } });
      wrap.appendChild(el("span", { text: f.label }));
      let input;
      if (f.type === "select") {
        input = el("select");
        input.appendChild(el("option", { value: "", text: f.placeholder || T("all") }));
        for (const o of (typeof f.options === "function" ? f.options() : f.options || [])) {
          input.appendChild(el("option", { value: String(o.value), text: o.label }));
        }
        input.value = values[f.key] === undefined || values[f.key] === null ? "" : String(values[f.key]);
      } else if (f.type === "checkbox") {
        input = el("input", { type: "checkbox", checked: !!values[f.key] });
      } else {
        input = el("input", { type: f.type || "text", value: values[f.key] || "", placeholder: f.placeholder || "" });
      }
      const fire = () => {
        values[f.key] = f.type === "checkbox" ? input.checked : input.value;
        opts.onChange(Object.assign({}, values));
      };
      input.addEventListener("change", fire);
      if (f.type === "text" || f.type === "search") {
        let timer = null;
        input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(fire, 350); });
      }
      wrap.appendChild(input);
      row.appendChild(wrap);
    }
    if (opts.actions) append(row, opts.actions);
    return row;
  }

  /* ------------------------------------------------------ عناصر صغيرة */

  function kpi(o) {
    const card = el("div", { class: "kpi " + (o.tone || "") + (o.onClick ? " clickable" : "") }, [
      el("div", { class: "k-label", text: o.label }),
      el("div", { class: "k-value", text: typeof o.value === "number" ? window.I18N.num(o.value, 0) : String(o.value) }),
      o.sub ? el("div", { class: "k-sub", text: o.sub }) : null,
    ]);
    if (o.onClick) {
      card.tabIndex = 0;
      card.addEventListener("click", o.onClick);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter") o.onClick(); });
    }
    return card;
  }

  function tag(text, tone) {
    return el("span", { class: "tag " + (tone || ""), text });
  }

  function tabs(opts) {
    const box = el("div", { class: "tabs" });
    for (const it of opts.items) {
      box.appendChild(el("button", {
        type: "button", class: it.key === opts.active ? "active" : "", text: it.label,
        on: { click: () => opts.onChange(it.key) },
      }));
    }
    return box;
  }

  function card(title, children, head) {
    return el("section", { class: "card" }, [
      title ? el("div", { class: "card-head" }, [el("h2", { text: title }), el("div", { class: "spacer" }), head]) : null,
      children,
    ]);
  }

  function pageHead(title, actions) {
    return el("div", { class: "page-head" }, [
      el("h1", { text: title }),
      el("div", { class: "spacer" }),
      el("div", { class: "row no-print" }, actions || []),
    ]);
  }

  const loading = () => el("div", { class: "empty", text: T("loading") });

  /* أسماء مختصرة للموظف في القوائم المنسدلة */
  function employeeOptions(list) {
    return list.map((e) => ({ value: e.id, label: `${e.employeeNo} — ${window.I18N.person(e)}` }));
  }

  /* حالة الموظف بلونها */
  function statusTag(status) {
    const tone = status === "active" ? "good"
      : status === "on_leave" ? "info"
        : status === "suspended" ? "warn"
          : status === "active" ? "" : (status === "resigned" || status === "terminated" ? "bad" : "");
    return tag(window.I18N.e("st", status), tone);
  }

  window.UI = {
    el, append, clear, mount, frag, toast, modal, confirm, form, formModal, handleError,
    table, filters, kpi, tag, tabs, card, pageHead, loading, employeeOptions, statusTag,
  };
})();

/* ======================================================================
   التواريخ في الواجهة — بالأيام لا بالمللي ثانية، كما في الخادم
   ====================================================================== */

(function () {
  "use strict";

  const DAY = 86400000;
  const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

  const Dates = {
    today: () => (window.App && window.App.state && window.App.state.today) || new Date().toISOString().slice(0, 10),
    addDays: (d, n) => iso(utc(d) + n * DAY),
    monthStart: (d) => d.slice(0, 8) + "01",
    monthEnd(d) {
      const y = +d.slice(0, 4), m = +d.slice(5, 7);
      return iso(Date.UTC(y, m, 0));
    },
    weekStart(d) {
      const dow = new Date(utc(d)).getUTCDay();   // الأحد = 0، وهو أول أيام الأسبوع هنا
      return iso(utc(d) - dow * DAY);
    },
    yearStart: (d) => d.slice(0, 4) + "-01-01",
    yearEnd: (d) => d.slice(0, 4) + "-12-31",

    /* مدى جاهز من اسم الاختصار */
    presetRange(preset, current) {
      const t = Dates.today();
      switch (preset) {
        case "today": return { preset, from: t, to: t };
        case "week": return { preset, from: Dates.weekStart(t), to: Dates.addDays(Dates.weekStart(t), 6) };
        case "month": return { preset, from: Dates.monthStart(t), to: Dates.monthEnd(t) };
        case "year": return { preset, from: Dates.yearStart(t), to: Dates.yearEnd(t) };
        default:
          return { preset: "custom", from: (current && current.from) || Dates.monthStart(t), to: (current && current.to) || t };
      }
    },

    diffDays: (a, b) => Math.round((utc(b) - utc(a)) / DAY),

    /* مدة الخدمة بالسنوات والأشهر */
    duration(from, to) {
      if (!from) return "—";
      const days = Dates.diffDays(from, to || Dates.today());
      if (days < 0) return "—";
      const years = Math.floor(days / 365.25);
      const months = Math.floor((days - years * 365.25) / 30.44);
      const L = window.I18N.lang === "en";
      if (years <= 0 && months <= 0) return L ? `${days} d` : `${days} يوم`;
      const y = years ? (L ? `${years}y` : `${window.I18N.num(years, 0)} سنة`) : "";
      const m = months ? (L ? `${months}m` : `${window.I18N.num(months, 0)} شهر`) : "";
      return [y, m].filter(Boolean).join(L ? " " : " و");
    },
  };

  window.Dates = Dates;
})();
