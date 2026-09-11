/* ======================================================================
   متجر الأقمشة الرجالية — لوحة تحكم المدير
   المنتجات · الطلبات · المخزون · الإعدادات
   ====================================================================== */

(function () {
  "use strict";

  const S = window.Shop;
  const { DB, Money, esc, fmtQty, fmtDate, fmtDateShort, round2 } = S;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const ICONS = {
    dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    box: '<path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5v-7Z"/><path d="M3 8.5 12 13l9-4.5M12 13v7"/>',
    cart: '<path d="M6 7h12l-1 12H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.9H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9.4A1.6 1.6 0 0 0 10.5 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.1a2 2 0 1 1 0 4H21a1.6 1.6 0 0 0-1.6 1Z"/>',
    warn: '<path d="M10.3 4.3 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    truck: '<rect x="2" y="7" width="12" height="9" rx="1.5"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    down: '<path d="M12 4v12M7 12l5 5 5-5"/><path d="M4 20h16"/>',
    up: '<path d="M12 20V8M7 12l5-5 5 5"/><path d="M4 4h16"/>',
    trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M7 7v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ""}</svg>`;

  function toast(msg, kind) {
    const box = $("#toasts");
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 2400);
    setTimeout(() => t.remove(), 2800);
  }

  /* ------------------------------------------------------------ الدخول */

  const SESSION = "naseej.admin.session";

  function unlock() {
    $("#gate").hidden = true;
    $("#adm").hidden = false;
    buildNav();
    route();
  }

  $("#gateBtn").addEventListener("click", tryPass);
  $("#gatePass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryPass(); });
  function tryPass() {
    const v = $("#gatePass").value.trim();
    if (v === String(DB.settings().adminPass)) {
      try { sessionStorage.setItem(SESSION, "1"); } catch (e) { /* وضع خاص */ }
      unlock();
    } else {
      $("#gateErr").hidden = false;
      $("#gatePass").value = "";
    }
  }
  try { if (sessionStorage.getItem(SESSION) === "1") unlock(); } catch (e) { /* تجاهل */ }

  /* ------------------------------------------------------------ التبويب */

  const TABS = [
    { id: "dash", name: "لوحة المعلومات", icon: "dash" },
    { id: "products", name: "المنتجات", icon: "box" },
    { id: "orders", name: "الطلبات", icon: "cart" },
    { id: "stock", name: "المخزون والأسعار", icon: "layers" },
    { id: "settings", name: "الإعدادات", icon: "gear" },
  ];

  function buildNav() {
    const cur = (location.hash.replace("#", "") || "dash").split("/")[0];
    $("#admNav").innerHTML = TABS.map((t) => `
      <button data-act="tab" data-t="${t.id}" class="${t.id === cur ? "on" : ""}">${icon(t.icon)} ${esc(t.name)}</button>`).join("");
  }

  function route() {
    if ($("#adm").hidden) return;
    const tab = (location.hash.replace("#", "") || "dash").split("/")[0];
    buildNav();
    window.scrollTo(0, 0);
    ({ dash: viewDash, products: viewProducts, orders: viewOrders, stock: viewStock, settings: viewSettings }[tab] || viewDash)();
  }
  window.addEventListener("hashchange", route);

  /* -------------------------------------------------- لوحة المعلومات */

  function viewDash() {
    const orders = DB.orders();
    const prods = DB.liveProducts();
    const low = DB.lowStock();
    const now = Date.now(), day = 86400000;
    const in7 = orders.filter((o) => now - o.createdAt < 7 * day && o.status !== "cancelled");
    const prev7 = orders.filter((o) => now - o.createdAt >= 7 * day && now - o.createdAt < 14 * day && o.status !== "cancelled");
    const sum = (a) => round2(a.reduce((s, o) => s + o.totals.grand, 0));
    const rev = sum(in7), revPrev = sum(prev7);
    const delta = revPrev ? Math.round(((rev - revPrev) / revPrev) * 100) : null;
    const open = orders.filter((o) => o.status === "new" || o.status === "processing").length;
    const meters = round2(orders.filter((o) => o.status !== "cancelled").reduce((s, o) =>
      s + o.items.reduce((x, i) => x + (i.mode === "meter" ? i.qty : i.qty * 50), 0), 0));

    $("#admView").innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <h1 style="font-size:21px">لوحة المعلومات</h1>
        <span class="note">${fmtDateShort(now)}</span>
        <a class="btn btn-ghost btn-sm" href="index.html" style="margin-inline-start:auto">عرض المتجر ←</a>
      </div>

      <div class="stat-grid">
        <div class="stat"><small>مبيعات 7 أيام</small><b>${Money.fmt(rev)}</b>
          ${delta === null ? '<span class="note">لا مقارنة</span>'
            : `<span class="delta" style="color:${delta >= 0 ? "var(--ok)" : "var(--bad)"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}٪ عن الأسبوع السابق</span>`}
        </div>
        <div class="stat"><small>طلبات مفتوحة</small><b>${S.Money.num(open)}</b><span class="note">جديد أو قيد التنفيذ</span></div>
        <div class="stat"><small>أقمشة معروضة</small><b>${S.Money.num(prods.length)}</b><span class="note">من ${S.Money.num(DB.products().length)} في الكتالوج</span></div>
        <div class="stat"><small>أمتار مباعة</small><b>${S.Money.num(meters)}</b><span class="note">شاملة الطاقات</span></div>
      </div>

      ${low.length ? `
        <div class="panel" style="border-color:var(--warn);background:var(--warn-soft);margin-bottom:16px">
          <h3 style="display:flex;align-items:center;gap:8px;color:var(--warn)">
            <span style="width:18px;height:18px;display:inline-block">${icon("warn")}</span>
            تنبيه المخزون — ${S.Money.num(low.length)} صنف قارب على النفاد
          </h3>
          <div class="stack" style="gap:8px">
            ${low.slice(0, 6).map((l) => `
              <div style="display:flex;align-items:center;gap:10px;background:var(--paper);border-radius:10px;padding:9px 11px">
                <img src="${esc(l.product.images[0])}" alt="" style="width:34px;height:34px;border-radius:8px;object-fit:cover;flex:none">
                <span style="flex:1;min-width:0">
                  <b style="font-size:13px;display:block">${esc(l.product.name)}</b>
                  <span class="note">${l.mode === "meter" ? "بيع بالمتر" : "طاقات"} · الحد ${fmtQty(l.threshold, l.mode)}</span>
                </span>
                <span class="chip ${l.left <= 0 ? "chip-bad" : "chip-warn"}">${l.left <= 0 ? "نفد" : "بقي " + fmtQty(l.left, l.mode)}</span>
                <button class="btn btn-ghost btn-sm" data-act="editP" data-id="${l.product.id}">تزويد</button>
              </div>`).join("")}
          </div>
          ${low.length > 6 ? `<button class="btn btn-quiet btn-sm" data-act="tab" data-t="stock" style="margin-top:8px">عرض الكل (${S.Money.num(low.length)}) ←</button>` : ""}
        </div>` : ""}

      <div class="split">
        <div>
          <div class="sec-head" style="margin-bottom:10px"><h2 style="font-size:16px">أحدث الطلبات</h2>
            <button class="more btn btn-quiet btn-sm" data-act="tab" data-t="orders">الكل ←</button></div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>الطلب</th><th>العميل</th><th>المدينة</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
              <tbody>
                ${orders.slice(0, 7).map((o) => `
                  <tr data-act="openOrder" data-id="${o.id}" style="cursor:pointer">
                    <td><b>${esc(o.number)}</b><br><span class="note">${fmtDateShort(o.createdAt)}</span></td>
                    <td>${esc(o.customer.name)}</td>
                    <td>${esc(o.shipping.city)}</td>
                    <td><b>${Money.fmt(o.totals.grand)}</b></td>
                    <td><span class="chip ${S.statusOf(o.status).chip}">${esc(S.statusOf(o.status).name)}</span></td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div class="sec-head" style="margin-bottom:10px"><h2 style="font-size:16px">الأكثر مبيعًا</h2></div>
          <div class="panel stack" style="gap:10px">
            ${prods.slice().sort((a, b) => (b.sold || 0) - (a.sold || 0)).slice(0, 6).map((p, i) => {
              const max = Math.max(...prods.map((x) => x.sold || 0)) || 1;
              return `<div>
                <div style="display:flex;gap:8px;align-items:center;font-size:13px">
                  <span class="note">${i + 1}.</span>
                  <b style="flex:1;min-width:0">${esc(p.name)}</b>
                  <span class="note">${S.Money.num(p.sold || 0)}</span>
                </div>
                <div class="bar-mini" style="margin-top:4px"><i style="width:${((p.sold || 0) / max) * 100}%;background:var(--gold)"></i></div>
              </div>`;
            }).join("")}
          </div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------- المنتجات */

  let pFilter = { cat: "", q: "" };

  function viewProducts() {
    let list = DB.products();
    if (pFilter.cat) list = list.filter((p) => p.category === pFilter.cat);
    if (pFilter.q) {
      const t = pFilter.q.toLowerCase();
      list = list.filter((p) => (p.name + " " + p.sku).toLowerCase().includes(t));
    }

    $("#admView").innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <h1 style="font-size:21px">المنتجات</h1>
        <span class="note">${S.Money.num(list.length)} من ${S.Money.num(DB.products().length)}</span>
        <button class="btn btn-gold btn-sm" data-act="newP" style="margin-inline-start:auto">${icon("plus")} قماش جديد</button>
      </div>

      <div class="toolbar">
        <div class="filters" style="padding:0;flex:1">
          <button class="fbtn${pFilter.cat ? "" : " on"}" data-act="pcat" data-c="">الكل</button>
          ${S.CATEGORY.map((c) => `<button class="fbtn${pFilter.cat === c.id ? " on" : ""}" data-act="pcat" data-c="${c.id}">${esc(c.name)}</button>`).join("")}
        </div>
        <input class="search-in" style="max-width:240px" id="pq" value="${esc(pFilter.q)}" placeholder="ابحث بالاسم أو الرمز…">
      </div>

      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>القماش</th><th>القسم</th><th>الوقفة</th>
            <th>سعر المتر</th><th>مخزون الأمتار</th>
            <th>سعر الطاقة</th><th>الطاقات</th>
            <th>الحالة</th><th></th>
          </tr></thead>
          <tbody>
            ${list.map((p) => {
              const w = S.wiqfaOf(p.wiqfa);
              const lowM = p.meter.enabled && p.meter.stock <= (p.meter.low || 30);
              const lowB = p.bolt.enabled && p.bolt.stock <= (p.bolt.low || 2);
              return `<tr>
                <td class="wrap-cell">
                  <div style="display:flex;gap:9px;align-items:center">
                    <img src="${esc(p.images[0])}" alt="" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex:none">
                    <span><b>${esc(p.name)}</b><br><span class="note">${esc(p.sku)}</span></span>
                  </div>
                </td>
                <td>${esc(S.categoryOf(p.category).name)}</td>
                <td>${w ? `<span class="chip chip-gold">${esc(w.name)}</span>` : '<span class="note">—</span>'}</td>
                <td>${p.meter.enabled ? Money.fmt(p.meter.price) : '<span class="note">—</span>'}</td>
                <td>${p.meter.enabled ? `<span class="chip ${lowM ? (p.meter.stock <= 0 ? "chip-bad" : "chip-warn") : "chip-line"}">${fmtQty(p.meter.stock, "meter")}</span>` : '<span class="note">—</span>'}</td>
                <td>${p.bolt.enabled ? Money.fmt(p.bolt.price) : '<span class="note">—</span>'}</td>
                <td>${p.bolt.enabled ? `<span class="chip ${lowB ? (p.bolt.stock <= 0 ? "chip-bad" : "chip-warn") : "chip-line"}">${S.Money.num(p.bolt.stock)}</span>` : '<span class="note">—</span>'}</td>
                <td>${p.active === false ? '<span class="chip chip-line">مخفي</span>' : '<span class="chip chip-ok">معروض</span>'}</td>
                <td style="text-align:end">
                  <button class="btn btn-ghost btn-sm" data-act="editP" data-id="${p.id}">تعديل</button>
                  <button class="btn btn-quiet btn-sm" data-act="delP" data-id="${p.id}" title="حذف" style="color:var(--bad)">حذف</button>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      ${list.length ? "" : `<div class="empty">${icon("box")}<b>لا منتجات</b><span>أضف أول قماش من الزر بالأعلى.</span></div>`}`;

    const q = $("#pq");
    q.addEventListener("input", () => { pFilter.q = q.value; const at = q.selectionStart; viewProducts(); const n = $("#pq"); n.focus(); n.setSelectionRange(at, at); });
  }

  /* ------------------------------------------------- محرّر المنتج */

  let editing = null;

  function blankProduct() {
    return {
      id: "", sku: "", name: "", category: "summer", wiqfa: "nisf",
      color: "#f0ece1", colorName: "أبيض", blurb: "",
      images: [], video: { kind: "generated" },
      specs: { origin: "", composition: "", weight: "", width: 150, season: "صيفي", care: "غسيل جاف · كي على حرارة متوسطة" },
      meter: { enabled: true, price: 0, stock: 0, low: 30 },
      bolt: { enabled: false, price: 0, stock: 0, metersPer: 50, low: 2 },
      featured: false, bestseller: false, active: true, sold: 0,
    };
  }

  function openProduct(id) {
    editing = id ? JSON.parse(JSON.stringify(DB.product(id))) : blankProduct();
    if (!editing.images.length) regenImages();
    modal(id ? "تعديل قماش" : "قماش جديد", productForm(), [
      { label: "إلغاء", cls: "btn-ghost", act: "closeModal" },
      { label: id ? "حفظ التعديلات" : "إضافة القماش", cls: "btn-gold", act: "saveP" },
    ]);
  }

  function regenImages() {
    const isWinter = editing.category === "winter";
    editing.images = [
      S.fabricArt({ base: editing.color, sheen: isWinter ? 0.17 : 0.3, scale: isWinter ? 8 : 6 }),
      S.fabricArt({ base: editing.color, sheen: (isWinter ? 0.17 : 0.3) + 0.1, scale: isWinter ? 8 : 6, close: true }),
      S.fabricArt({ base: S.shade(editing.color, -10), sheen: isWinter ? 0.17 : 0.3, scale: (isWinter ? 8 : 6) + 2 }),
    ];
  }

  function productForm() {
    const e = editing;
    const showWiqfa = e.category === "summer" || e.category === "bolts";
    return `
      <div class="form-grid">
        <div class="row-2">
          <div class="field"><label>اسم القماش <span class="req">*</span></label>
            <input data-p="name" value="${esc(e.name)}" placeholder="مثال: الوسمي — نصف واقف"></div>
          <div class="field"><label>الرمز (SKU) <span class="req">*</span></label>
            <input data-p="sku" value="${esc(e.sku)}" placeholder="SM-NS-301"></div>
        </div>

        <div class="row-2">
          <div class="field"><label>القسم <span class="req">*</span></label>
            <select data-p="category">
              ${S.CATEGORY.map((c) => `<option value="${c.id}"${e.category === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field"${showWiqfa ? "" : ' style="opacity:.45;pointer-events:none"'}>
            <label>الوقفة ${e.category === "summer" ? '<span class="req">*</span>' : ""}</label>
            <select data-p="wiqfa">
              <option value="">— بلا وقفة —</option>
              ${S.WIQFA.map((w) => `<option value="${w.id}"${e.wiqfa === w.id ? " selected" : ""}>${esc(w.name)}</option>`).join("")}
            </select>
            <div class="help">${showWiqfa ? "تظهر في فلاتر القسم الصيفي" : "تخصّ الأقمشة الصيفية فقط"}</div>
          </div>
        </div>

        <div class="field"><label>الوصف المختصر</label>
          <textarea data-p="blurb" rows="2" placeholder="سطران يشرحان ملمس القماش وسقوطه">${esc(e.blurb)}</textarea></div>

        <div class="panel" style="padding:12px">
          <h3 style="font-size:13.5px">الصور والفيديو</h3>
          <div class="row-2" style="margin-bottom:10px">
            <div class="field"><label>اللون</label>
              <input type="color" data-p="color" value="${esc(e.color)}" style="height:42px;padding:4px"></div>
            <div class="field"><label>اسم اللون</label>
              <input data-p="colorName" value="${esc(e.colorName)}" placeholder="أبيض حليبي"></div>
          </div>
          <div class="img-picks" style="margin-bottom:9px">
            ${e.images.map((src, i) => `
              <div class="img-pick"><img src="${esc(src)}" alt="">
                <button class="x" data-act="rmImg" data-i="${i}" title="حذف">×</button></div>`).join("")}
            <button class="img-add" data-act="addImg" title="رفع صورة">+</button>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" data-act="regen">توليد صور من اللون</button>
            <button class="btn btn-ghost btn-sm" data-act="addVid">${e.video && e.video.kind === "file" ? "استبدال الفيديو" : "رفع فيديو للقماش"}</button>
            ${e.video && e.video.kind === "file" ? `<button class="btn btn-quiet btn-sm" data-act="rmVid" style="color:var(--bad)">حذف الفيديو</button>` : ""}
          </div>
          <div class="help" style="margin-top:7px">
            ${e.video && e.video.kind === "file"
              ? "فيديو مرفوع — يُعرض في معرض المنتج."
              : "بلا فيديو مرفوع: يعرض المتجر معاينة حركة مولَّدة من صورة القماش. ارفع مقطعًا قصيرًا (أقل من 2 ميغابايت) ليحلّ محلها."}
          </div>
        </div>

        <div class="panel" style="padding:12px">
          <h3 style="font-size:13.5px">المواصفات</h3>
          <div class="row-2">
            <div class="field"><label>الصناعة</label><input data-p="specs.origin" value="${esc(e.specs.origin)}" placeholder="اليابان"></div>
            <div class="field"><label>الوزن</label><input data-p="specs.weight" value="${esc(e.specs.weight)}" placeholder="180 غم/م²"></div>
          </div>
          <div class="field" style="margin-top:12px"><label>التركيب</label>
            <input data-p="specs.composition" value="${esc(e.specs.composition)}" placeholder="65٪ بوليستر · 35٪ قطن"></div>
          <div class="row-2" style="margin-top:12px">
            <div class="field"><label>العرض (سم)</label><input type="number" data-p="specs.width" value="${e.specs.width}" min="50" max="300"></div>
            <div class="field"><label>العناية</label><input data-p="specs.care" value="${esc(e.specs.care)}"></div>
          </div>
        </div>

        <div class="panel" style="padding:12px">
          <h3 style="font-size:13.5px">البيع بالمتر</h3>
          <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px;font-size:13px;font-weight:700">
            <input type="checkbox" data-p="meter.enabled" ${e.meter.enabled ? "checked" : ""} style="width:18px;height:18px">
            متاح للبيع بالمتر
          </label>
          <div class="row-2">
            <div class="field"><label>سعر المتر (ر.س)</label><input type="number" step="0.01" min="0" data-p="meter.price" value="${e.meter.price}"></div>
            <div class="field"><label>المخزون (أمتار)</label><input type="number" step="0.5" min="0" data-p="meter.stock" value="${e.meter.stock}"></div>
          </div>
          <div class="field" style="margin-top:12px"><label>حد التنبيه (أمتار)</label>
            <input type="number" step="1" min="0" data-p="meter.low" value="${e.meter.low}">
            <div class="help">يظهر تنبيه في لوحة المعلومات عند نزول المخزون إلى هذا الحد أو أقل</div></div>
        </div>

        <div class="panel" style="padding:12px">
          <h3 style="font-size:13.5px">البيع بالطاقة</h3>
          <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px;font-size:13px;font-weight:700">
            <input type="checkbox" data-p="bolt.enabled" ${e.bolt.enabled ? "checked" : ""} style="width:18px;height:18px">
            متاح للبيع بالطاقة الكاملة
          </label>
          <div class="row-2">
            <div class="field"><label>سعر الطاقة (ر.س)</label><input type="number" step="0.01" min="0" data-p="bolt.price" value="${e.bolt.price}"></div>
            <div class="field"><label>عدد الطاقات</label><input type="number" step="1" min="0" data-p="bolt.stock" value="${e.bolt.stock}"></div>
          </div>
          <div class="row-2" style="margin-top:12px">
            <div class="field"><label>أمتار الطاقة</label><input type="number" step="1" min="1" data-p="bolt.metersPer" value="${e.bolt.metersPer}"></div>
            <div class="field"><label>حد التنبيه (طاقات)</label><input type="number" step="1" min="0" data-p="bolt.low" value="${e.bolt.low}"></div>
          </div>
        </div>

        <div class="panel" style="padding:12px">
          <h3 style="font-size:13.5px">العرض في المتجر</h3>
          <div class="stack" style="gap:9px">
            ${[["active", "معروض في المتجر"], ["featured", "ضمن «مختارات الموسم»"], ["bestseller", "وسم «الأكثر مبيعًا»"]]
              .map(([k, lbl]) => `
                <label style="display:flex;gap:8px;align-items:center;font-size:13px;font-weight:700">
                  <input type="checkbox" data-p="${k}" ${e[k] ? "checked" : ""} style="width:18px;height:18px"> ${esc(lbl)}
                </label>`).join("")}
          </div>
        </div>
      </div>`;
  }

  function collectProduct() {
    $$("#modalBody [data-p]").forEach((inp) => {
      const path = inp.dataset.p.split(".");
      let obj = editing;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      const k = path[path.length - 1];
      if (inp.type === "checkbox") obj[k] = inp.checked;
      else if (inp.type === "number") obj[k] = Number(inp.value) || 0;
      else obj[k] = inp.value;
    });
    editing.specs.season = editing.category === "winter" ? "شتوي" : editing.category === "summer" ? "صيفي" : "كل المواسم";
    if (editing.category === "winter") editing.wiqfa = "";
    return editing;
  }

  function saveProduct() {
    const p = collectProduct();
    if (!p.name.trim()) return toast("اكتب اسم القماش", "bad");
    if (!p.sku.trim()) return toast("اكتب رمز القماش (SKU)", "bad");
    if (p.category === "summer" && !p.wiqfa) return toast("اختر نوع الوقفة للقماش الصيفي", "bad");
    if (!p.meter.enabled && !p.bolt.enabled) return toast("فعّل البيع بالمتر أو بالطاقة", "bad");
    if (p.meter.enabled && p.meter.price <= 0) return toast("سعر المتر يجب أن يكون أكبر من صفر", "bad");
    if (p.bolt.enabled && p.bolt.price <= 0) return toast("سعر الطاقة يجب أن يكون أكبر من صفر", "bad");
    const dup = DB.products().find((x) => x.sku.trim() === p.sku.trim() && x.id !== p.id);
    if (dup) return toast("الرمز «" + p.sku + "» مستخدم في قماش آخر", "bad");
    if (!p.wiqfa) p.wiqfa = null;

    DB.saveProduct(p);
    closeModal();
    toast("تم حفظ «" + p.name + "»", "ok");
    route();
  }

  function pickFile(accept, maxMB, cb) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = accept;
    inp.addEventListener("change", () => {
      const f = inp.files[0];
      if (!f) return;
      if (f.size > maxMB * 1024 * 1024) return toast("الملف أكبر من " + maxMB + " ميغابايت", "bad");
      const r = new FileReader();
      r.onload = () => cb(r.result);
      r.onerror = () => toast("تعذّرت قراءة الملف", "bad");
      r.readAsDataURL(f);
    });
    inp.click();
  }

  function refreshProductForm() {
    collectProduct();
    $("#modalBody").innerHTML = productForm();
  }

  /* ----------------------------------------------------------- الطلبات */

  let oFilter = "";

  function viewOrders() {
    let list = DB.orders();
    if (oFilter) list = list.filter((o) => o.status === oFilter);

    $("#admView").innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <h1 style="font-size:21px">الطلبات</h1>
        <span class="note">${S.Money.num(list.length)} طلب</span>
      </div>

      <div class="filters">
        <button class="fbtn${oFilter ? "" : " on"}" data-act="ofilter" data-s="">الكل</button>
        ${S.ORDER_STATUS.map((s) => {
          const n = DB.orders().filter((o) => o.status === s.id).length;
          return `<button class="fbtn${oFilter === s.id ? " on" : ""}" data-act="ofilter" data-s="${s.id}">${esc(s.name)} (${S.Money.num(n)})</button>`;
        }).join("")}
      </div>

      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>الطلب</th><th>التاريخ</th><th>العميل</th><th>المدينة</th><th>الأصناف</th><th>الإجمالي</th><th>الدفع</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            ${list.map((o) => `
              <tr>
                <td><b>${esc(o.number)}</b>${o.awb ? `<br><span class="note">${esc(o.awb)}</span>` : ""}</td>
                <td>${fmtDateShort(o.createdAt)}</td>
                <td class="wrap-cell">${esc(o.customer.name)}<br><span class="note">${esc(o.customer.phone)}</span></td>
                <td>${esc(o.shipping.city)}</td>
                <td>${S.Money.num(o.items.length)}</td>
                <td><b>${Money.fmt(o.totals.grand)}</b></td>
                <td><span class="chip ${o.payment.status === "paid" ? "chip-ok" : "chip-warn"}">${o.payment.status === "paid" ? "مدفوع" : "عند الاستلام"}</span></td>
                <td><span class="chip ${S.statusOf(o.status).chip}">${esc(S.statusOf(o.status).name)}</span></td>
                <td style="text-align:end"><button class="btn btn-ghost btn-sm" data-act="openOrder" data-id="${o.id}">فتح</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      ${list.length ? "" : `<div class="empty">${icon("cart")}<b>لا طلبات</b><span>لا يوجد طلب بهذه الحالة.</span></div>`}`;
  }

  function openOrder(id) {
    const o = DB.order(id);
    if (!o) return;
    const st = DB.settings();
    const carrier = (st.carriers || []).find((c) => c.id === o.shipping.carrier);
    const gw = (st.gateways || []).find((g) => g.id === o.payment.method);

    modal("الطلب " + o.number, `
      <div class="stack">
        <div class="panel" style="padding:12px">
          <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
            <span class="chip ${S.statusOf(o.status).chip}">${esc(S.statusOf(o.status).name)}</span>
            <span class="note">${fmtDate(o.createdAt)}</span>
          </div>
          <div class="field"><label>تغيير الحالة</label>
            <select id="oStatus">
              ${S.ORDER_STATUS.map((s) => `<option value="${s.id}"${o.status === s.id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}
            </select>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:11px">
            <button class="btn btn-gold btn-sm" data-act="setStatus" data-id="${o.id}">حفظ الحالة</button>
            ${o.awb
              ? `<button class="btn btn-ghost btn-sm" data-act="printAwb" data-id="${o.id}">${icon("print")} طباعة البوليصة</button>`
              : `<button class="btn btn-ghost btn-sm" data-act="makeAwb" data-id="${o.id}">${icon("truck")} إصدار بوليصة الشحن</button>`}
          </div>
        </div>

        <div class="panel" style="padding:12px">
          <h3 style="font-size:13.5px">الأصناف</h3>
          ${o.items.map((it) => `
            <div class="line-item">
              <span class="line-thumb"><img src="${esc(it.image)}" alt=""></span>
              <span class="line-info"><b>${esc(it.name)}</b>
                <span class="sub">${esc(it.sku)} · ${fmtQty(it.qty, it.mode)} × ${Money.fmt(it.unitPrice)}</span></span>
              <span class="line-sum">${Money.fmt(it.lineTotal)}</span>
            </div>`).join("")}
          <div class="totals" style="margin-top:11px">
            <div><span>المجموع</span><b>${Money.fmt(o.totals.subtotal)}</b></div>
            <div><span>الشحن</span><b>${o.totals.shipping === 0 ? "مجاني" : Money.fmt(o.totals.shipping)}</b></div>
            <div class="note" style="display:flex;justify-content:space-between"><span>منها ضريبة القيمة المضافة</span><span>${Money.fmt(o.totals.vat)}</span></div>
            <div class="grand"><span>الإجمالي</span><span>${Money.fmt(o.totals.grand)}</span></div>
          </div>
        </div>

        <div class="panel" style="padding:12px">
          <h3 style="font-size:13.5px">العميل والشحن</h3>
          <table class="spec-table"><tbody>
            <tr><th>الاسم</th><td>${esc(o.customer.name)}</td></tr>
            <tr><th>الجوال</th><td>${esc(o.customer.phone)}</td></tr>
            ${o.customer.email ? `<tr><th>البريد</th><td>${esc(o.customer.email)}</td></tr>` : ""}
            <tr><th>العنوان</th><td style="font-weight:400">${esc(o.shipping.city)}${o.shipping.district ? "، " + esc(o.shipping.district) : ""} — ${esc(o.shipping.address)}</td></tr>
            <tr><th>شركة الشحن</th><td>${esc(carrier ? carrier.name : o.shipping.carrier)}</td></tr>
            ${o.awb ? `<tr><th>رقم البوليصة</th><td>${esc(o.awb)}</td></tr>` : ""}
            <tr><th>الدفع</th><td>${esc(gw ? gw.name : o.payment.method)} · ${esc(o.payment.ref || "—")}</td></tr>
            ${o.shipping.notes ? `<tr><th>ملاحظات</th><td style="font-weight:400">${esc(o.shipping.notes)}</td></tr>` : ""}
          </tbody></table>
        </div>

        ${(o.timeline || []).length ? `
          <div class="panel" style="padding:12px">
            <h3 style="font-size:13.5px">سجل الطلب</h3>
            <div class="stack" style="gap:7px">
              ${o.timeline.slice().reverse().map((t) => `
                <div style="display:flex;gap:9px;font-size:12.5px">
                  <span class="note" style="flex:none">${fmtDate(t.at)}</span>
                  <span>${esc(t.note)}</span>
                </div>`).join("")}
            </div>
          </div>` : ""}
      </div>`, [{ label: "إغلاق", cls: "btn-ghost", act: "closeModal" }]);
  }

  function setStatus(id) {
    const o = DB.order(id);
    const v = $("#oStatus").value;
    if (!o || o.status === v) return closeModal();
    o.status = v;
    o.timeline = o.timeline || [];
    o.timeline.push({ at: Date.now(), status: v, note: "تغيّرت الحالة إلى: " + S.statusOf(v).name });
    if (v === "delivered" && o.payment.method === "cod") o.payment.status = "paid";
    DB.saveOrder(o);
    toast("تم تحديث حالة " + o.number, "ok");
    openOrder(id);
    route();
  }

  async function makeAwb(id) {
    const o = DB.order(id);
    if (!o) return;
    toast("جارٍ إصدار البوليصة…");
    const awb = await S.Shipping.createWaybill(o);
    o.awb = awb;
    if (o.status === "new") o.status = "processing";
    o.timeline = o.timeline || [];
    o.timeline.push({ at: Date.now(), status: o.status, note: "صدرت بوليصة الشحن " + awb });
    DB.saveOrder(o);
    toast("صدرت البوليصة " + awb, "ok");
    openOrder(id);
  }

  function printAwb(id) {
    const o = DB.order(id);
    if (!o) return;
    const st = DB.settings();
    const carrier = (st.carriers || []).find((c) => c.id === o.shipping.carrier);
    let area = $("#printArea");
    if (!area) {
      area = document.createElement("div");
      area.id = "printArea";
      area.className = "print-only";
      document.body.appendChild(area);
    }
    area.innerHTML = `
      <div style="padding:18px;font-family:inherit;max-width:600px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:10px">
          <div><b style="font-size:20px">بوليصة شحن</b><div style="font-size:12px">${esc(st.storeName)} — ${esc(st.tagline)}</div></div>
          <div style="text-align:end"><b style="font-size:15px">${esc(o.number)}</b><div style="font-size:12px">${fmtDateShort(o.createdAt)}</div></div>
        </div>
        <div style="display:flex;gap:20px;margin-top:14px;font-size:13px">
          <div style="flex:1">
            <b>المرسل إليه</b>
            <div>${esc(o.customer.name)}</div>
            <div>${esc(o.customer.phone)}</div>
            <div>${esc(o.shipping.city)}${o.shipping.district ? "، " + esc(o.shipping.district) : ""}</div>
            <div>${esc(o.shipping.address)}</div>
          </div>
          <div style="flex:1">
            <b>الشحن</b>
            <div>${esc(carrier ? carrier.name : o.shipping.carrier)}</div>
            <div>البوليصة: <b>${esc(o.awb || "—")}</b></div>
            <div>الدفع: ${o.payment.status === "paid" ? "مدفوع مسبقًا" : "تحصيل عند التسليم " + Money.fmt(o.totals.grand)}</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:12.5px">
          <thead><tr style="background:#eee"><th style="text-align:start;padding:6px;border:1px solid #999">الصنف</th><th style="padding:6px;border:1px solid #999">الكمية</th></tr></thead>
          <tbody>
            ${o.items.map((i) => `<tr><td style="padding:6px;border:1px solid #999">${esc(i.name)} (${esc(i.sku)})</td><td style="padding:6px;border:1px solid #999;text-align:center">${fmtQty(i.qty, i.mode)}</td></tr>`).join("")}
          </tbody>
        </table>
        <div style="margin-top:16px;font-size:26px;letter-spacing:6px;font-family:monospace;text-align:center;border:1px solid #000;padding:10px">${esc(o.awb || o.number)}</div>
        <p style="font-size:11px;color:#555;margin-top:12px">هذه بوليصة تجريبية مطبوعة من لوحة التحكم. عند ربط حساب ${esc(carrier ? carrier.name : "شركة الشحن")} تُصدَر البوليصة الرسمية من واجهتها البرمجية بباركود معتمد.</p>
      </div>`;
    document.body.classList.add("printing");
    window.print();
    setTimeout(() => document.body.classList.remove("printing"), 400);
  }

  /* ------------------------------------------------ المخزون والأسعار */

  function viewStock() {
    const list = DB.products();
    const low = DB.lowStock();

    $("#admView").innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <h1 style="font-size:21px">المخزون والأسعار</h1>
        <span class="note">عدّل مباشرة في الجدول — يُحفظ فور الخروج من الخانة</span>
      </div>

      ${low.length ? `
        <div class="panel" style="border-color:var(--warn);background:var(--warn-soft);margin-bottom:14px">
          <b style="color:var(--warn);font-size:13.5px">${S.Money.num(low.length)} صنف تحت حد التنبيه</b>
          <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px">
            ${low.map((l) => `<span class="chip ${l.left <= 0 ? "chip-bad" : "chip-warn"}">${esc(l.product.name)} — ${l.left <= 0 ? "نفد" : fmtQty(l.left, l.mode)}</span>`).join("")}
          </div>
        </div>` : `<div class="panel" style="border-color:var(--ok);background:var(--ok-soft);margin-bottom:14px"><b style="color:var(--ok);font-size:13.5px">كل الأصناف فوق حد التنبيه</b></div>`}

      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>القماش</th>
            <th>سعر المتر</th><th>مخزون الأمتار</th><th>حد التنبيه</th>
            <th>سعر الطاقة</th><th>الطاقات</th><th>حد التنبيه</th>
          </tr></thead>
          <tbody>
            ${list.map((p) => `
              <tr>
                <td class="wrap-cell">
                  <div style="display:flex;gap:9px;align-items:center">
                    <img src="${esc(p.images[0])}" alt="" style="width:32px;height:32px;border-radius:7px;object-fit:cover;flex:none">
                    <span><b>${esc(p.name)}</b><br><span class="note">${esc(p.sku)}</span></span>
                  </div>
                </td>
                ${p.meter.enabled ? `
                  <td><input class="cell" data-id="${p.id}" data-f="meter.price" type="number" step="0.01" min="0" value="${p.meter.price}"></td>
                  <td><input class="cell" data-id="${p.id}" data-f="meter.stock" type="number" step="0.5" min="0" value="${p.meter.stock}"></td>
                  <td><input class="cell" data-id="${p.id}" data-f="meter.low" type="number" step="1" min="0" value="${p.meter.low}"></td>`
                  : `<td colspan="3" class="note">لا يُباع بالمتر</td>`}
                ${p.bolt.enabled ? `
                  <td><input class="cell" data-id="${p.id}" data-f="bolt.price" type="number" step="0.01" min="0" value="${p.bolt.price}"></td>
                  <td><input class="cell" data-id="${p.id}" data-f="bolt.stock" type="number" step="1" min="0" value="${p.bolt.stock}"></td>
                  <td><input class="cell" data-id="${p.id}" data-f="bolt.low" type="number" step="1" min="0" value="${p.bolt.low}"></td>`
                  : `<td colspan="3" class="note">لا يُباع بالطاقة</td>`}
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;

    $$(".cell").forEach((inp) => {
      inp.style.cssText = "width:96px;padding:6px 8px;border:1px solid var(--line-2);border-radius:8px;background:var(--paper)";
      inp.addEventListener("change", () => {
        const p = DB.product(inp.dataset.id);
        if (!p) return;
        const [grp, key] = inp.dataset.f.split(".");
        p[grp][key] = Number(inp.value) || 0;
        DB.saveProduct(p);
        inp.style.borderColor = "var(--ok)";
        setTimeout(() => (inp.style.borderColor = "var(--line-2)"), 900);
        toast("حُفظ: " + p.name, "ok");
      });
    });
  }

  /* --------------------------------------------------------- الإعدادات */

  function viewSettings() {
    const s = DB.settings();
    $("#admView").innerHTML = `
      <h1 style="font-size:21px;margin-bottom:14px">الإعدادات</h1>

      <div class="split">
        <div class="stack">
          <div class="panel">
            <h3>المتجر</h3>
            <div class="form-grid">
              <div class="row-2">
                <div class="field"><label>اسم المتجر</label><input data-s="storeName" value="${esc(s.storeName)}"></div>
                <div class="field"><label>الوصف تحت الاسم</label><input data-s="tagline" value="${esc(s.tagline)}"></div>
              </div>
              <div class="row-2">
                <div class="field"><label>نسبة الضريبة</label>
                  <input type="number" step="0.01" min="0" max="1" data-s="vatRate" value="${s.vatRate}">
                  <div class="help">0.15 تعني 15٪</div></div>
                <div class="field"><label>الشحن مجاني فوق (ر.س)</label><input type="number" step="10" min="0" data-s="freeShipOver" value="${s.freeShipOver}"></div>
              </div>
              <div class="row-2">
                <div class="field"><label>أمتار الثوب — الأدنى</label><input type="number" step="0.5" min="1" data-s="thobeMetersMin" value="${s.thobeMetersMin}"></div>
                <div class="field"><label>أمتار الثوب — الأعلى</label><input type="number" step="0.5" min="1" data-s="thobeMetersMax" value="${s.thobeMetersMax}"></div>
              </div>
              <div class="row-2">
                <div class="field"><label>وحدة الزيادة بالمتر</label><input type="number" step="0.25" min="0.25" data-s="meterStep" value="${s.meterStep}"></div>
                <div class="field"><label>أقل كمية بالمتر</label><input type="number" step="0.5" min="0.5" data-s="minMeters" value="${s.minMeters}"></div>
              </div>
              <div class="field"><label>رمز دخول اللوحة</label><input data-s="adminPass" value="${esc(s.adminPass)}">
                <div class="help">حماية عرض فقط — النسخة الحقيقية تحتاج تسجيل دخول على الخادم</div></div>
              <button class="btn btn-gold" data-act="saveSettings">حفظ الإعدادات</button>
            </div>
          </div>

          <div class="panel">
            <h3>شركات الشحن</h3>
            <div class="stack">
              ${s.carriers.map((c, i) => `
                <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;border:1px solid var(--line);border-radius:11px;padding:10px">
                  <label style="display:flex;gap:7px;align-items:center;font-size:13px;font-weight:700;flex:1;min-width:150px">
                    <input type="checkbox" data-c="${i}.active" ${c.active ? "checked" : ""} style="width:17px;height:17px">
                    ${esc(c.name)}
                  </label>
                  <input data-c="${i}.eta" value="${esc(c.eta)}" style="flex:1;min-width:130px;padding:7px 9px;border:1px solid var(--line-2);border-radius:9px">
                  <input type="number" min="0" step="1" data-c="${i}.cost" value="${c.cost}" style="width:82px;padding:7px 9px;border:1px solid var(--line-2);border-radius:9px">
                  <span class="note">ر.س</span>
                </div>`).join("")}
            </div>
            <button class="btn btn-gold btn-sm" data-act="saveCarriers" style="margin-top:11px">حفظ شركات الشحن</button>
            <p class="note" style="margin-top:9px">الأسعار هنا ثابتة. عند ربط أرامكس أو سمسا تُحسب التكلفة آليًا من وزن الشحنة والمدينة، ويُصدَر رقم البوليصة من واجهتهم.</p>
          </div>
        </div>

        <div class="stack">
          <div class="panel">
            <h3>وسائل الدفع</h3>
            <div class="stack">
              ${s.gateways.map((g, i) => `
                <label style="display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:11px;padding:10px">
                  <input type="checkbox" data-g="${i}" ${g.active ? "checked" : ""} style="width:17px;height:17px">
                  <img class="pay-logo" src="${S.payLogo(g.logo)}" alt="" style="height:26px">
                  <span style="flex:1;min-width:0"><b style="font-size:13px;display:block">${esc(g.name)}</b><span class="note">${esc(g.note)}</span></span>
                </label>`).join("")}
            </div>
            <div class="field" style="margin-top:12px"><label>بوابة الدفع</label>
              <select data-s2="provider">
                ${[["demo", "تجريبية (بلا دفع حقيقي)"], ["paytabs", "PayTabs"], ["myfatoorah", "MyFatoorah"], ["tap", "Tap Payments"]]
                  .map(([v, n]) => `<option value="${v}"${s.provider === v ? " selected" : ""}>${esc(n)}</option>`).join("")}
              </select>
              <div class="help">اختيار بوابة حقيقية يحتاج مفاتيح على الخادم — راجع README قبل التبديل</div></div>
            <button class="btn btn-gold btn-sm" data-act="saveGateways" style="margin-top:11px">حفظ وسائل الدفع</button>
          </div>

          <div class="panel">
            <h3>البيانات</h3>
            <p class="note" style="margin:0 0 11px">كل شيء محفوظ في هذا المتصفح وحده. صدّر نسخة قبل تفريغ بيانات المتصفح.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" data-act="export">${icon("down")} تصدير نسخة</button>
              <button class="btn btn-ghost btn-sm" data-act="import">${icon("up")} استيراد نسخة</button>
              <button class="btn btn-ghost btn-sm" data-act="reset" style="color:var(--bad)">${icon("trash")} تصفير البيانات</button>
            </div>
          </div>

          <div class="panel">
            <h3>ملخص الكتالوج</h3>
            <table class="spec-table"><tbody>
              ${S.CATEGORY.map((c) => `<tr><th>${esc(c.name)}</th><td>${S.Money.num(DB.products().filter((p) => p.category === c.id).length)} قماش</td></tr>`).join("")}
              ${S.WIQFA.map((w) => `<tr><th>${esc(w.name)}</th><td>${S.Money.num(DB.products().filter((p) => p.wiqfa === w.id).length)} قماش</td></tr>`).join("")}
              <tr><th>إجمالي الطلبات</th><td>${S.Money.num(DB.orders().length)}</td></tr>
            </tbody></table>
          </div>
        </div>
      </div>`;
  }

  function saveSettings() {
    const patch = {};
    $$("[data-s]").forEach((inp) => {
      const k = inp.dataset.s;
      patch[k] = inp.type === "number" ? Number(inp.value) || 0 : inp.value;
    });
    DB.saveSettings(patch);
    toast("حُفظت الإعدادات", "ok");
    route();
  }

  function saveCarriers() {
    const carriers = JSON.parse(JSON.stringify(DB.settings().carriers));
    $$("[data-c]").forEach((inp) => {
      const [i, k] = inp.dataset.c.split(".");
      carriers[i][k] = inp.type === "checkbox" ? inp.checked : inp.type === "number" ? Number(inp.value) || 0 : inp.value;
    });
    DB.saveSettings({ carriers: carriers });
    toast("حُفظت شركات الشحن", "ok");
  }

  function saveGateways() {
    const gateways = JSON.parse(JSON.stringify(DB.settings().gateways));
    $$("[data-g]").forEach((inp) => { gateways[inp.dataset.g].active = inp.checked; });
    const prov = $("[data-s2='provider']");
    const patch = { gateways: gateways };
    if (prov) patch.provider = prov.value;
    if (!gateways.some((g) => g.active)) return toast("أبقِ وسيلة دفع واحدة على الأقل", "bad");
    DB.saveSettings(patch);
    toast("حُفظت وسائل الدفع", "ok");
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(DB.exportAll(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "naseej-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("نُزّلت النسخة", "ok");
  }

  function importData() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json,.json";
    inp.addEventListener("change", () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          DB.importAll(JSON.parse(r.result));
          toast("استُوردت النسخة", "ok");
          route();
        } catch (e) { toast("ملف غير صالح: " + e.message, "bad"); }
      };
      r.readAsText(f);
    });
    inp.click();
  }

  /* ----------------------------------------------------------- النافذة */

  function modal(title, body, buttons) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = body;
    $("#modalFoot").innerHTML = (buttons || []).map((b) => `<button class="btn ${b.cls || ""}" data-act="${b.act}">${esc(b.label)}</button>`).join("");
    $("#modalBack").classList.add("on");
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    $("#modalBack").classList.remove("on");
    document.body.style.overflow = "";
    editing = null;
  }
  $("#modalClose").addEventListener("click", closeModal);
  $("#modalBack").addEventListener("click", (e) => { if (e.target === $("#modalBack")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  function confirmBox(title, msg, onYes) {
    modal(title, `<p style="margin:0">${esc(msg)}</p>`, [
      { label: "إلغاء", cls: "btn-ghost", act: "closeModal" },
      { label: "تأكيد", cls: "btn-danger", act: "confirmYes" },
    ]);
    confirmBox._yes = onYes;
  }

  /* ------------------------------------------------------------ الأحداث */

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;

    switch (act) {
      case "tab": location.hash = "#" + el.dataset.t; break;
      case "pcat": pFilter.cat = el.dataset.c; viewProducts(); break;
      case "ofilter": oFilter = el.dataset.s; viewOrders(); break;

      case "newP": openProduct(null); break;
      case "editP": openProduct(el.dataset.id); break;
      case "saveP": saveProduct(); break;
      case "delP": {
        const p = DB.product(el.dataset.id);
        confirmBox("حذف قماش", "سيُحذف «" + p.name + "» نهائيًا من الكتالوج. الطلبات السابقة تحتفظ ببياناته.", () => {
          DB.deleteProduct(p.id);
          closeModal();
          toast("حُذف «" + p.name + "»", "ok");
          route();
        });
        break;
      }
      case "confirmYes": if (confirmBox._yes) confirmBox._yes(); break;

      case "regen": collectProduct(); regenImages(); $("#modalBody").innerHTML = productForm(); toast("وُلّدت الصور من اللون", "ok"); break;
      case "addImg": collectProduct(); pickFile("image/*", 3, (src) => { editing.images.push(src); $("#modalBody").innerHTML = productForm(); }); break;
      case "rmImg": {
        collectProduct();
        const i = Number(el.dataset.i);
        if (editing.images.length <= 1) return toast("أبقِ صورة واحدة على الأقل", "bad");
        editing.images.splice(i, 1);
        $("#modalBody").innerHTML = productForm();
        break;
      }
      case "addVid": collectProduct(); pickFile("video/*", 2, (src) => { editing.video = { kind: "file", src: src }; $("#modalBody").innerHTML = productForm(); toast("رُفع الفيديو", "ok"); }); break;
      case "rmVid": collectProduct(); editing.video = { kind: "generated" }; $("#modalBody").innerHTML = productForm(); break;

      case "openOrder": openOrder(el.dataset.id); break;
      case "setStatus": setStatus(el.dataset.id); break;
      case "makeAwb": makeAwb(el.dataset.id); break;
      case "printAwb": printAwb(el.dataset.id); break;

      case "saveSettings": saveSettings(); break;
      case "saveCarriers": saveCarriers(); break;
      case "saveGateways": saveGateways(); break;
      case "export": exportData(); break;
      case "import": importData(); break;
      case "reset":
        confirmBox("تصفير البيانات", "ستُحذف كل المنتجات والطلبات والإعدادات من هذا المتصفح ويعود الكتالوج التجريبي. صدّر نسخة أولًا إن أردت الاحتفاظ بها.", () => {
          DB.resetAll();
          closeModal();
          toast("أُعيدت البيانات إلى الأصل", "ok");
          route();
        });
        break;

      case "closeModal": closeModal(); break;
    }
  });

  document.addEventListener("change", (ev) => {
    const inp = ev.target;
    if (inp.dataset && inp.dataset.p === "category" && editing) {
      collectProduct();
      if (editing.category === "winter") editing.wiqfa = "";
      regenImages();
      $("#modalBody").innerHTML = productForm();
    }
  });
})();
