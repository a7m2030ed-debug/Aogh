/* ======================================================================
   متجر الأقمشة الرجالية — واجهة المتجر
   توجيه بالـhash: #/ · #/c/:cat · #/p/:id · #/checkout · #/order/:id
   ====================================================================== */

(function () {
  "use strict";

  const S = window.Shop;
  const { DB, Cart, Money, esc, fmtQty, fmtDate, fmtDateShort, round2 } = S;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const view = $("#view");

  /* ------------------------------------------------------------ أيقونات */

  const ICONS = {
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/>',
    snow: '<path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
    roll: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    ruler: '<rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M7 8v3M12 8v4M17 8v3"/>',
    truck: '<rect x="2" y="7" width="12" height="9" rx="1.5"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bag: '<path d="M6 7h12l-1 12H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    back: '<path d="m9 6 6 6-6 6"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    scissors: '<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.1 7.6 20 18M8.1 16.4 20 6"/>',
  };
  const icon = (n, cls) => `<svg class="${cls || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ""}</svg>`;

  /* ------------------------------------------------------------- تنبيه */

  function toast(msg, kind) {
    const box = $("#toasts");
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 2400);
    setTimeout(() => t.remove(), 2800);
  }

  /* ------------------------------------------------- معاينة حركة القماش */

  /* بدل فيديو مرفوع: نسيج يتموّج فعليًا عبر feTurbulence + feDisplacementMap.
     إن رفع المدير فيديو حقيقيًا للمنتج عُرض بدله. */
  function motionPreview(p) {
    if (p.video && p.video.kind === "file" && p.video.src) {
      return `<video src="${esc(p.video.src)}" controls playsinline muted loop preload="metadata"></video>`;
    }
    const uid = "mv" + p.id;
    return `
      <svg viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%">
        <defs>
          <filter id="${uid}">
            <feTurbulence type="fractalNoise" baseFrequency="0.004 0.012" numOctaves="2" seed="4" result="t">
              <animate attributeName="baseFrequency" dur="7s" values="0.004 0.012;0.011 0.02;0.004 0.012" repeatCount="indefinite"/>
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="t" scale="34" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
          <linearGradient id="${uid}s" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#fff" stop-opacity="0"/>
            <stop offset=".5" stop-color="#fff" stop-opacity=".3"/>
            <stop offset="1" stop-color="#fff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <g filter="url(#${uid})">
          <image href="${esc(p.images[0])}" x="-40" y="-40" width="680" height="680" preserveAspectRatio="xMidYMid slice"/>
        </g>
        <rect width="600" height="600" fill="url(#${uid}s)" opacity=".7">
          <animateTransform attributeName="transform" type="translate" dur="4.5s" values="-600 0;600 0" repeatCount="indefinite"/>
        </rect>
      </svg>
      <span class="chip chip-line" style="position:absolute;inset-block-end:10px;inset-inline-start:10px;background:rgba(255,255,255,.9)">معاينة حركة القماش وسقوطه</span>`;
  }

  /* --------------------------------------------------------- بطاقة منتج */

  function stockChip(p) {
    if (p.meter.enabled && p.meter.stock <= 0 && (!p.bolt.enabled || p.bolt.stock <= 0))
      return '<span class="chip chip-bad">نفدت الكمية</span>';
    if (p.bolt.enabled && !p.meter.enabled && p.bolt.stock <= 0)
      return '<span class="chip chip-bad">نفدت الكمية</span>';
    if (p.meter.enabled && p.meter.stock > 0 && p.meter.stock <= (p.meter.low || 30))
      return '<span class="chip chip-warn">آخر ' + fmtQty(p.meter.stock, "meter") + '</span>';
    if (p.bolt.enabled && !p.meter.enabled && p.bolt.stock <= (p.bolt.low || 2))
      return '<span class="chip chip-warn">آخر ' + fmtQty(p.bolt.stock, "bolt") + '</span>';
    return "";
  }

  function priceOf(p) {
    if (p.meter.enabled) return { v: p.meter.price, unit: "للمتر" };
    return { v: p.bolt.price, unit: "للطاقة (" + S.Money.num(p.bolt.metersPer) + " م)" };
  }

  function productCard(p) {
    const w = S.wiqfaOf(p.wiqfa);
    const pr = priceOf(p);
    const tags = [];
    if (p.bestseller) tags.push('<span class="chip chip-gold">الأكثر مبيعًا</span>');
    const st = stockChip(p);
    if (st) tags.push(st);
    return `
      <a class="prod-card" href="#/p/${p.id}">
        <div class="prod-thumb">
          <img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">
          ${tags.length ? `<div class="thumb-tags">${tags.join("")}</div>` : ""}
        </div>
        <div class="prod-body">
          <div class="prod-name">${esc(p.name)}</div>
          <div class="prod-meta">${w ? esc(w.name) + " · " : ""}${esc(p.specs.origin)} · ${esc(p.colorName)}</div>
          <div class="prod-price"><b>${Money.fmt(pr.v)}</b><span>${pr.unit}</span></div>
        </div>
      </a>`;
  }

  /* --------------------------------------------------------- الصفحة: الرئيسية */

  function viewHome() {
    const prods = DB.liveProducts();
    const feat = prods.filter((p) => p.featured).slice(0, 8);
    const best = prods.slice().sort((a, b) => (b.sold || 0) - (a.sold || 0)).slice(0, 8);
    const st = DB.settings();

    const slides = [
      {
        art: S.bannerArt("#efe9dc", "#d8cdb6", "#a98b4b"),
        eyebrow: "موسم الصيف",
        title: "اختر قماشك بالوقفة، لا بالتخمين",
        text: "كل قماش صيفي مصنَّف: طايح · ربع وقفة · نصف واقف · واقف. تعرف شكل الثوب قبل أن يُخاط.",
        cta: "تصفّح الصيفية", href: "#/c/summer",
      },
      {
        art: S.bannerArt("#3b3f47", "#575a62", "#8d8578"),
        eyebrow: "أقمشة شتوية",
        title: "صوف إنجليزي وكشمير مخلوط",
        text: "دفء بلا ثقل، بألوان الشتاء: فحمي، كحلي، وزيتي داكن.",
        cta: "تصفّح الشتوية", href: "#/c/winter",
      },
      {
        art: S.bannerArt("#c9bda4", "#a98b4b", "#6f5a2e"),
        eyebrow: "للخياطين والمحلات",
        title: "طاقات كاملة بسعر الجملة",
        text: "45 إلى 50 مترًا في الطاقة، وخصم يبدأ من ثلاث طاقات.",
        cta: "تصفّح الطاقات", href: "#/c/bolts",
      },
    ];

    view.innerHTML = `
      <section class="hero">
        <div class="hero-track" id="heroTrack">
          ${slides.map((s) => `
            <div class="hero-slide">
              <img class="hero-art" src="${s.art}" alt="">
              <div class="hero-cap">
                <div class="hero-eyebrow">${esc(s.eyebrow)}</div>
                <h2>${esc(s.title)}</h2>
                <p>${esc(s.text)}</p>
                <a class="btn btn-gold" href="${s.href}">${esc(s.cta)}</a>
              </div>
            </div>`).join("")}
        </div>
        <button class="hero-nav prev" data-act="hero" data-d="-1" aria-label="السابق">${icon("back")}</button>
        <button class="hero-nav next" data-act="hero" data-d="1" aria-label="التالي" style="transform:translateY(-50%) rotate(180deg)">${icon("back")}</button>
        <div class="hero-dots" id="heroDots">
          ${slides.map((_, i) => `<button class="hero-dot${i === 0 ? " on" : ""}" data-act="heroGo" data-i="${i}" aria-label="شريحة ${i + 1}"></button>`).join("")}
        </div>
      </section>

      <div class="wrap">
        <section class="sec">
          <div class="sec-head"><h2>تسوّق حسب القسم</h2></div>
          <div class="cat-grid">
            ${S.CATEGORY.map((c) => {
              const sample = prods.find((p) => p.category === c.id);
              return `<a class="cat-card" href="#/c/${c.id}">
                <img src="${esc(sample ? sample.images[0] : "")}" alt="" loading="lazy">
                <figcaption><b>${esc(c.name)}</b><span>${esc(c.sub)}</span></figcaption>
              </a>`;
            }).join("")}
          </div>
        </section>

        <section class="sec">
          <div class="sec-head"><h2>الأكثر مبيعًا</h2><a class="more" href="#/c/summer">الكل ←</a></div>
          <div class="rail">${best.map(productCard).join("")}</div>
        </section>

        <section class="sec">
          <div class="guide" id="guide">
            <div class="sec-head" style="margin-bottom:4px"><h2>ما معنى «الوقفة»؟</h2></div>
            <p class="sec-sub" style="margin:6px 0 0">الوقفة هي مقدار قوام القماش: كم يقف الثوب على الجسم بدل أن يسقط عليه. كل أقمشتنا الصيفية مصنَّفة بها، من الأطرى إلى الأقوى.</p>
            <div class="guide-grid">
              ${S.WIQFA.map((w) => `
                <a class="guide-item" href="#/c/summer?w=${w.id}">
                  <span class="guide-vis"><img src="${S.wiqfaGlyph(w.stiffness)}" alt=""></span>
                  <span><b>${esc(w.name)}</b><p>${esc(w.desc)}</p></span>
                </a>`).join("")}
            </div>
          </div>
        </section>

        <section class="sec">
          <div class="sec-head"><h2>مختارات الموسم</h2></div>
          <div class="prod-grid">${feat.map(productCard).join("")}</div>
        </section>

        <section class="sec">
          <div class="cat-grid" style="grid-template-columns:repeat(2,1fr)">
            ${[
              ["ruler", "بيع بالمتر أو بالطاقة", "اطلب 3 أمتار لثوب واحد، أو طاقة كاملة بسعر الجملة."],
              ["scissors", "قصّ بالمتر بدقة", "نقصّ ما تطلبه تمامًا ونرسله ملفوفًا بلا كسرات."],
              ["truck", "شحن لكل المملكة", "سمسا وأرامكس · شحن مجاني فوق " + Money.fmt(st.freeShipOver) + "."],
              ["shield", "دفع آمن", "مدى · Apple Pay · بطاقات ائتمانية."],
            ].map(([ic, t, d]) => `
              <div class="panel" style="display:flex;gap:11px;align-items:flex-start">
                <span style="color:var(--gold);flex:none">${icon(ic)}</span>
                <span><b style="display:block;font-size:14px">${esc(t)}</b><span class="note">${esc(d)}</span></span>
              </div>`).join("")}
          </div>
        </section>
      </div>`;

    startHero(slides.length);
  }

  let heroTimer = null, heroIdx = 0, heroN = 0;
  function startHero(n) {
    heroN = n; heroIdx = 0;
    clearInterval(heroTimer);
    heroTimer = setInterval(() => heroGo(heroIdx + 1), 5500);
  }
  function heroGo(i) {
    const track = $("#heroTrack");
    if (!track) { clearInterval(heroTimer); return; }
    heroIdx = (i + heroN) % heroN;
    track.style.transform = `translateX(${heroIdx * 100}%)`;
    $$("#heroDots .hero-dot").forEach((d, k) => d.classList.toggle("on", k === heroIdx));
  }

  /* --------------------------------------------------------- الصفحة: قسم */

  const SORTS = [
    { id: "pop", name: "الأكثر رواجًا" },
    { id: "new", name: "الأحدث" },
    { id: "asc", name: "السعر: من الأقل" },
    { id: "desc", name: "السعر: من الأعلى" },
  ];

  function viewCategory(catId, params) {
    const cat = S.categoryOf(catId);
    if (!cat) return viewNotFound();
    const wFilter = params.get("w") || "";
    const sort = params.get("sort") || "pop";
    const q = (params.get("q") || "").trim();

    let list = DB.liveProducts().filter((p) => p.category === catId);
    if (catId === "summer" && wFilter) list = list.filter((p) => p.wiqfa === wFilter);
    if (q) {
      const t = q.toLowerCase();
      list = list.filter((p) =>
        (p.name + " " + p.sku + " " + p.colorName + " " + p.specs.composition + " " + p.specs.origin).toLowerCase().includes(t));
    }
    list.sort((a, b) => {
      const pa = priceOf(a).v, pb = priceOf(b).v;
      if (sort === "asc") return pa - pb;
      if (sort === "desc") return pb - pa;
      if (sort === "new") return b.createdAt - a.createdAt;
      return (b.sold || 0) - (a.sold || 0);
    });

    const filters = catId === "summer"
      ? `<div class="filters">
           <button class="fbtn${wFilter ? "" : " on"}" data-act="wf" data-w="">كل الوقفات</button>
           ${S.WIQFA.map((w) => `<button class="fbtn${wFilter === w.id ? " on" : ""}" data-act="wf" data-w="${w.id}">${esc(w.name)}</button>`).join("")}
         </div>`
      : "";

    const wNote = catId === "summer" && wFilter
      ? `<div class="hint">${icon("info")}<span><b>${esc(S.wiqfaOf(wFilter).name)}:</b> ${esc(S.wiqfaOf(wFilter).desc)}</span></div>`
      : "";

    view.innerHTML = `
      <div class="wrap">
        <div class="crumbs"><a href="#/">الرئيسية</a><span>›</span><span>${esc(cat.name)}</span></div>
        <h1 style="font-size:23px;margin-bottom:4px">${esc(cat.name)}</h1>
        <p class="sec-sub" style="margin:4px 0 12px">${esc(cat.sub)}${catId === "summer" ? " — اختر الوقفة التي تناسبك" : ""}</p>
        ${filters}
        ${wNote}
        <div class="toolbar" style="margin-top:12px">
          <span class="count">${S.Money.num(list.length)} قماش</span>
          <select class="sel" data-act="sort">
            ${SORTS.map((s) => `<option value="${s.id}"${s.id === sort ? " selected" : ""}>${esc(s.name)}</option>`).join("")}
          </select>
        </div>
        ${list.length
          ? `<div class="prod-grid">${list.map(productCard).join("")}</div>`
          : `<div class="empty">${icon("bag")}<b>لا نتائج</b><span>جرّب وقفة أخرى أو امسح البحث.</span></div>`}
        ${catId === "summer" ? `
          <section class="sec">
            <div class="guide">
              <div class="sec-head" style="margin-bottom:4px"><h2>دليل الوقفة</h2></div>
              <div class="guide-grid">
                ${S.WIQFA.map((w) => `
                  <button class="guide-item" data-act="wf" data-w="${w.id}" style="text-align:start;cursor:pointer;font:inherit">
                    <span class="guide-vis"><img src="${S.wiqfaGlyph(w.stiffness)}" alt=""></span>
                    <span><b>${esc(w.name)}</b><p>${esc(w.desc)}</p></span>
                  </button>`).join("")}
              </div>
            </div>
          </section>` : ""}
      </div>`;
  }

  /* --------------------------------------------------------- الصفحة: منتج */

  const PD = { mode: "meter", qty: 3, gal: 0 };

  function viewProduct(id) {
    const p = DB.product(id);
    if (!p || p.active === false) return viewNotFound();
    const st = DB.settings();
    const w = S.wiqfaOf(p.wiqfa);
    const cat = S.categoryOf(p.category);

    PD.mode = p.meter.enabled && p.meter.stock > 0 ? "meter" : p.bolt.enabled ? "bolt" : "meter";
    PD.qty = PD.mode === "meter" ? st.thobeMetersMin : 1;
    PD.gal = 0;

    const related = DB.liveProducts()
      .filter((x) => x.id !== p.id && (x.wiqfa === p.wiqfa || x.category === p.category))
      .slice(0, 6);

    view.innerHTML = `
      <div class="wrap">
        <div class="crumbs">
          <a href="#/">الرئيسية</a><span>›</span>
          <a href="#/c/${p.category}">${esc(cat.name)}</a>
          ${w ? `<span>›</span><a href="#/c/summer?w=${w.id}">${esc(w.name)}</a>` : ""}
        </div>

        <div class="pd-layout">
          <div>
            <div class="gallery">
              <div class="gal-main" id="galMain"></div>
              <div class="gal-strip" id="galStrip"></div>
            </div>
          </div>

          <div>
            <div class="pd-tags">
              ${w ? `<span class="chip chip-gold">${esc(w.name)}</span>` : ""}
              <span class="chip chip-line">${esc(p.specs.season)}</span>
              <span class="chip chip-line">${esc(p.colorName)}</span>
              ${p.bestseller ? '<span class="chip chip-ok">الأكثر مبيعًا</span>' : ""}
              ${stockChip(p)}
            </div>
            <h1 class="pd-title">${esc(p.name)}</h1>
            <div class="note" style="margin-bottom:8px">الرمز ${esc(p.sku)} · ${esc(p.specs.origin)}</div>
            <p style="margin:0 0 4px;color:var(--ink-2)">${esc(p.blurb)}</p>

            <div id="buyBox"></div>

            <div class="panel">
              <h3>المواصفات</h3>
              <table class="spec-table">
                <tbody>
                  <tr><th>الصناعة</th><td>${esc(p.specs.origin)}</td></tr>
                  <tr><th>التركيب</th><td>${esc(p.specs.composition)}</td></tr>
                  <tr><th>الوزن</th><td>${esc(p.specs.weight)}</td></tr>
                  <tr><th>العرض</th><td>${S.Money.num(p.specs.width)} سم</td></tr>
                  ${w ? `<tr><th>الوقفة</th><td>${esc(w.name)}</td></tr>` : ""}
                  <tr><th>الموسم</th><td>${esc(p.specs.season)}</td></tr>
                  <tr><th>العناية</th><td>${esc(p.specs.care)}</td></tr>
                </tbody>
              </table>
            </div>

            <div class="panel">
              <h3>كم مترًا أحتاج؟</h3>
              <p class="note" style="margin:0 0 10px">اختر طولك ليُحسب المتر المناسب لثوب واحد. القياس تقديري، والخياط قد يزيد نصف متر للأكمام الواسعة.</p>
              <div class="filters" style="padding-bottom:0">
                ${[["حتى 165 سم", 3], ["166 – 178", 3.5], ["179 – 188", 4], ["أطول من 188", 4.5]]
                  .map(([lbl, m]) => `<button class="fbtn" data-act="calc" data-m="${m}">${lbl}</button>`).join("")}
              </div>
              <div id="calcOut" class="note" style="margin-top:10px"></div>
            </div>
          </div>
        </div>

        ${related.length ? `
          <section class="sec">
            <div class="sec-head"><h2>قد يناسبك أيضًا</h2></div>
            <div class="rail">${related.map(productCard).join("")}</div>
          </section>` : ""}

        <div class="buy-spacer"></div>
      </div>`;

    renderGallery(p);
    renderBuyBox(p);
  }

  function renderGallery(p) {
    const main = $("#galMain"), strip = $("#galStrip");
    if (!main) return;
    const slides = p.images.map((src, i) => ({ kind: "img", src: src, label: i === 1 ? "قريب" : "" }));
    if (p.video !== null) slides.push({ kind: "vid" });

    const draw = () => {
      const s = slides[PD.gal] || slides[0];
      main.innerHTML = s.kind === "vid"
        ? motionPreview(p)
        : `<img src="${esc(s.src)}" alt="${esc(p.name)}">`;
      strip.innerHTML = slides.map((sl, i) => `
        <button class="gal-thumb${i === PD.gal ? " on" : ""}" data-act="gal" data-i="${i}" aria-label="صورة ${i + 1}">
          <img src="${esc(sl.kind === "vid" ? p.images[0] : sl.src)}" alt="">
          ${sl.kind === "vid" ? `<span class="play"><svg viewBox="0 0 24 24">${ICONS.play}</svg></span>` : ""}
        </button>`).join("");
    };
    main._draw = draw;
    draw();
  }

  function renderBuyBox(p) {
    const box = $("#buyBox");
    if (!box) return;
    const st = DB.settings();
    const both = p.meter.enabled && p.bolt.enabled;
    const unit = PD.mode === "meter" ? p.meter : p.bolt;
    const stock = unit.stock;
    const out = stock <= 0;
    const total = round2((PD.mode === "meter" ? p.meter.price : p.bolt.price) * PD.qty);

    const stockLine = out
      ? '<span class="chip chip-bad">نفدت الكمية</span>'
      : stock <= (unit.low || (PD.mode === "meter" ? 30 : 2))
        ? `<span class="chip chip-warn">بقي ${fmtQty(stock, PD.mode)} فقط</span>`
        : `<span class="chip chip-ok">متوفر · ${fmtQty(stock, PD.mode)}</span>`;

    box.innerHTML = `
      <div class="pd-price">
        <b>${Money.fmt(PD.mode === "meter" ? p.meter.price : p.bolt.price)}</b>
        <span>${PD.mode === "meter" ? "للمتر · شامل الضريبة" : "للطاقة (" + S.Money.num(p.bolt.metersPer) + " م) · شامل الضريبة"}</span>
      </div>

      <div class="panel">
        ${both || p.bolt.enabled ? `
          <div class="mode-tabs">
            <button class="mode-tab${PD.mode === "meter" ? " on" : ""}" data-act="mode" data-m="meter" ${p.meter.enabled ? "" : "disabled"}>
              <b>بالمتر</b><span>${p.meter.enabled ? Money.fmt(p.meter.price) + " / م" : "غير متاح"}</span>
            </button>
            <button class="mode-tab${PD.mode === "bolt" ? " on" : ""}" data-act="mode" data-m="bolt" ${p.bolt.enabled ? "" : "disabled"}>
              <b>طاقة كاملة</b><span>${p.bolt.enabled ? S.Money.num(p.bolt.metersPer) + " م · " + Money.fmt(p.bolt.price) : "غير متاح"}</span>
            </button>
          </div>` : ""}

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <b style="font-size:13.5px">${PD.mode === "meter" ? "الكمية بالأمتار" : "عدد الطاقات"}</b>
          <span style="margin-inline-start:auto">${stockLine}</span>
        </div>

        <div class="qty">
          <button class="qty-btn" data-act="q" data-d="-1" aria-label="إنقاص">−</button>
          <div class="qty-val">${PD.mode === "meter" ? S.fmtQty(PD.qty, "meter").replace(" م", "") + ' <small>متر</small>' : S.Money.num(PD.qty) + ' <small>طاقة</small>'}</div>
          <button class="qty-btn" data-act="q" data-d="1" aria-label="زيادة">+</button>
        </div>

        ${PD.mode === "meter" ? `
          <div class="quick-m">
            ${[st.thobeMetersMin, 3.5, st.thobeMetersMax, round2(st.thobeMetersMin * 2 + 1)].filter((v, i, a) => a.indexOf(v) === i).map((m) =>
              `<button class="fbtn${PD.qty === m ? " on" : ""}" data-act="setq" data-v="${m}">${S.fmtQty(m, "meter")}${m >= st.thobeMetersMax * 1.7 ? " (ثوبان)" : ""}</button>`).join("")}
          </div>
          <div class="hint">${icon("info")}
            <span>تحتاج عادة من <b>${S.Money.num(st.thobeMetersMin)} إلى ${S.Money.num(st.thobeMetersMax)} أمتار</b> للثوب الواحد، بحسب الطول وسعة الأكمام. القصّ يتم بالمتر ونصف المتر.</span>
          </div>` : `
          <div class="hint">${icon("info")}
            <span>الطاقة الواحدة <b>${S.Money.num(p.bolt.metersPer)} مترًا</b> — تكفي نحو ${S.Money.num(Math.floor(p.bolt.metersPer / 3.5))} ثوبًا. سعر المتر داخل الطاقة ${Money.fmt(round2(p.bolt.price / p.bolt.metersPer))}.</span>
          </div>`}
      </div>

      <div class="buy-bar">
        <div class="wrap">
          <div class="buy-total"><small>الإجمالي</small><b>${Money.fmt(total)}</b></div>
          <button class="btn btn-gold btn-wide" data-act="add" data-id="${p.id}" ${out ? "disabled" : ""}>
            ${icon("bag")} ${out ? "نفدت الكمية" : "أضف للسلة"}
          </button>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------- الصفحة: الوقفة */

  function viewGuide() {
    view.innerHTML = `
      <div class="wrap">
        <div class="crumbs"><a href="#/">الرئيسية</a><span>›</span><span>دليل الوقفة</span></div>
        <h1 style="font-size:23px;margin:6px 0 6px">دليل الوقفة</h1>
        <p class="sec-sub">«الوقفة» مصطلح سوق الأقمشة لمقدار قوام القماش: هل يقف الثوب على الجسم أم يسقط عليه؟ هذه الأنواع الأربعة هي ما تجده في القسم الصيفي، مرتبة من الأطرى إلى الأقوى.</p>
        <div class="stack" style="margin-top:16px">
          ${S.WIQFA.map((w, i) => `
            <div class="panel" style="display:flex;gap:14px;align-items:flex-start">
              <span class="guide-vis" style="width:64px;flex:none"><img src="${S.wiqfaGlyph(w.stiffness)}" alt=""></span>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <b style="font-size:16px">${i + 1}. ${esc(w.name)}</b>
                  <span class="chip chip-line">القوام ${"▮".repeat(w.stiffness)}${"▯".repeat(4 - w.stiffness)}</span>
                </div>
                <p style="margin:6px 0 10px;color:var(--ink-2);font-size:13.5px">${esc(w.desc)}</p>
                <a class="btn btn-ghost btn-sm" href="#/c/summer?w=${w.id}">أقمشة ${esc(w.name)} ←</a>
              </div>
            </div>`).join("")}
        </div>
        <div class="hint" style="margin-top:16px">${icon("info")}
          <span><b>نصيحة:</b> إن كنت لا تعرف ما يناسبك، ابدأ بـ«نصف واقف» — هو الوسط الذي يرضي أغلب الأذواق، وأكثر ما يُطلب في السوق.</span>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------ الصفحة: الدفع */

  const CO = {
    step: 1,
    customer: { name: "", phone: "", email: "" },
    shipping: { city: "", district: "", address: "", notes: "", carrier: "" },
    paymentMethod: "",
    busy: false,
  };

  function viewCheckout() {
    const lines = Cart.lines();
    if (!lines.length) {
      view.innerHTML = `<div class="wrap"><div class="empty">${icon("bag")}<b>سلتك فارغة</b><span>أضف قماشًا لتتمكن من إتمام الطلب.</span><div style="margin-top:14px"><a class="btn btn-gold" href="#/c/summer">تصفّح الأقمشة</a></div></div></div>`;
      return;
    }
    const st = DB.settings();
    const carriers = (st.carriers || []).filter((c) => c.active);
    const gateways = (st.gateways || []).filter((g) => g.active);
    if (!CO.shipping.carrier && carriers[0]) CO.shipping.carrier = carriers[0].id;
    if (!CO.paymentMethod && gateways[0]) CO.paymentMethod = gateways[0].id;

    view.innerHTML = `
      <div class="wrap">
        <div class="crumbs"><a href="#/">الرئيسية</a><span>›</span><span>إتمام الطلب</span></div>
        <div class="steps">
          <span class="step ${CO.step >= 1 ? (CO.step > 1 ? "done" : "on") : ""}"><span class="n">${CO.step > 1 ? "✓" : "1"}</span> البيانات</span>
          <span class="step-line"></span>
          <span class="step ${CO.step >= 2 ? (CO.step > 2 ? "done" : "on") : ""}"><span class="n">${CO.step > 2 ? "✓" : "2"}</span> الشحن</span>
          <span class="step-line"></span>
          <span class="step ${CO.step >= 3 ? "on" : ""}"><span class="n">3</span> الدفع</span>
        </div>

        <div class="checkout-layout">
          <div id="coMain"></div>
          <div class="checkout-side">
            <div class="panel">
              <h3>ملخص الطلب</h3>
              <div id="coSummary"></div>
            </div>
          </div>
        </div>
      </div>`;

    renderCoStep();
    renderCoSummary();
  }

  function renderCoStep() {
    const host = $("#coMain");
    if (!host) return;
    const st = DB.settings();
    const carriers = (st.carriers || []).filter((c) => c.active);
    const gateways = (st.gateways || []).filter((g) => g.active);
    const t = Cart.totals(CO.shipping.carrier);

    if (CO.step === 1) {
      host.innerHTML = `
        <div class="panel">
          <h3>بيانات المستلم</h3>
          <div class="form-grid">
            <div class="field" data-f="name">
              <label>الاسم الكامل <span class="req">*</span></label>
              <input id="coName" value="${esc(CO.customer.name)}" placeholder="مثال: عبدالله محمد الحربي" autocomplete="name">
            </div>
            <div class="row-2">
              <div class="field" data-f="phone">
                <label>الجوال <span class="req">*</span></label>
                <input id="coPhone" value="${esc(CO.customer.phone)}" placeholder="05XXXXXXXX" inputmode="tel" autocomplete="tel">
                <div class="help">نستخدمه لتأكيد الطلب وتتبّع الشحنة</div>
              </div>
              <div class="field" data-f="email">
                <label>البريد الإلكتروني</label>
                <input id="coEmail" type="email" value="${esc(CO.customer.email)}" placeholder="اختياري" autocomplete="email">
              </div>
            </div>
          </div>
        </div>
        <div class="panel">
          <h3>عنوان الشحن</h3>
          <div class="form-grid">
            <div class="row-2">
              <div class="field" data-f="city">
                <label>المدينة <span class="req">*</span></label>
                <select id="coCity">
                  <option value="">اختر المدينة…</option>
                  ${S.SAUDI_CITIES.map((c) => `<option${c === CO.shipping.city ? " selected" : ""}>${esc(c)}</option>`).join("")}
                </select>
              </div>
              <div class="field" data-f="district">
                <label>الحي</label>
                <input id="coDistrict" value="${esc(CO.shipping.district)}" placeholder="مثال: حي النرجس">
              </div>
            </div>
            <div class="field" data-f="address">
              <label>العنوان التفصيلي <span class="req">*</span></label>
              <textarea id="coAddress" rows="3" placeholder="الشارع، رقم المبنى، أقرب معلم">${esc(CO.shipping.address)}</textarea>
            </div>
            <div class="field">
              <label>ملاحظات للطلب</label>
              <input id="coNotes" value="${esc(CO.shipping.notes)}" placeholder="اختياري — وقت التسليم المفضّل مثلًا">
            </div>
          </div>
          <div style="margin-top:14px"><button class="btn btn-gold btn-wide" data-act="coNext">متابعة إلى الشحن</button></div>
        </div>`;
    } else if (CO.step === 2) {
      host.innerHTML = `
        <div class="panel">
          <h3>طريقة الشحن</h3>
          <div class="pick">
            ${carriers.map((c) => {
              const free = c.cost > 0 && st.freeShipOver && t.subtotal >= st.freeShipOver;
              return `<button class="pick-opt${CO.shipping.carrier === c.id ? " on" : ""}" data-act="carrier" data-id="${c.id}">
                <span class="dot"></span>
                <span class="txt"><b>${esc(c.name)}</b><span>${esc(c.eta)}</span></span>
                <b style="white-space:nowrap">${c.cost === 0 ? "مجاني" : free ? '<s style="color:var(--muted);font-weight:400">' + Money.fmt(c.cost) + "</s> مجاني" : Money.fmt(c.cost)}</b>
              </button>`;
            }).join("")}
          </div>
          ${t.toFreeShip > 0 ? `<div class="hint" style="margin-top:12px">${icon("truck")}<span>أضف ما قيمته <b>${Money.fmt(t.toFreeShip)}</b> ليصبح الشحن مجانيًا.</span></div>` : ""}
          <div style="display:flex;gap:9px;margin-top:14px">
            <button class="btn btn-ghost" data-act="coBack">رجوع</button>
            <button class="btn btn-gold" style="flex:1" data-act="coNext">متابعة إلى الدفع</button>
          </div>
        </div>`;
    } else {
      host.innerHTML = `
        <div class="panel">
          <h3>طريقة الدفع</h3>
          <div class="pick">
            ${gateways.map((g) => `
              <button class="pick-opt${CO.paymentMethod === g.id ? " on" : ""}" data-act="pay" data-id="${g.id}">
                <span class="dot"></span>
                <span class="txt"><b>${esc(g.name)}</b><span>${esc(g.note)}</span></span>
                <img class="pay-logo" src="${S.payLogo(g.logo)}" alt="">
              </button>`).join("")}
          </div>
          <div class="hint" style="margin-top:12px">${icon("shield")}
            <span>هذه نسخة تجريبية: الدفع يُحاكى محليًا ولا تُرسل أي بيانات بطاقة. عند الربط بـPayTabs أو MyFatoorah أو Tap يتحوّل هذا الزر إلى صفحة البوابة الآمنة.</span>
          </div>
          <div style="display:flex;gap:9px;margin-top:14px">
            <button class="btn btn-ghost" data-act="coBack" ${CO.busy ? "disabled" : ""}>رجوع</button>
            <button class="btn btn-gold" style="flex:1" data-act="coPlace" ${CO.busy ? "disabled" : ""}>
              ${CO.busy ? "جارٍ تنفيذ الدفع…" : "ادفع " + Money.fmt(t.grand)}
            </button>
          </div>
        </div>
        <div class="panel">
          <h3>مراجعة البيانات</h3>
          <table class="spec-table"><tbody>
            <tr><th>المستلم</th><td>${esc(CO.customer.name)} · ${esc(CO.customer.phone)}</td></tr>
            <tr><th>العنوان</th><td>${esc(CO.shipping.city)}${CO.shipping.district ? "، " + esc(CO.shipping.district) : ""} — ${esc(CO.shipping.address)}</td></tr>
            <tr><th>الشحن</th><td>${esc((carriers.find((c) => c.id === CO.shipping.carrier) || {}).name || "")}</td></tr>
          </tbody></table>
          <button class="btn btn-quiet btn-sm" data-act="coStep" data-s="1" style="margin-top:8px">تعديل البيانات</button>
        </div>`;
    }
  }

  function renderCoSummary() {
    const host = $("#coSummary");
    if (!host) return;
    const lines = Cart.lines();
    const t = Cart.totals(CO.shipping.carrier);
    const st = DB.settings();
    host.innerHTML = `
      <div style="margin-bottom:12px">
        ${lines.map((l) => `
          <div class="line-item">
            <span class="line-thumb"><img src="${esc(l.image)}" alt=""></span>
            <span class="line-info">
              <b>${esc(l.name)}</b>
              <span class="sub">${fmtQty(l.qty, l.mode)} × ${Money.fmt(l.unitPrice)}</span>
              ${l.mode === "bolt" ? `<span class="sub">${S.Money.num(l.meters)} م إجمالًا</span>` : ""}
            </span>
            <span class="line-sum">${Money.fmt(l.lineTotal)}</span>
          </div>`).join("")}
      </div>
      <div class="totals">
        <div><span>المجموع</span><b>${Money.fmt(t.subtotal)}</b></div>
        <div><span>الشحن</span><b>${t.shipping === 0 ? "مجاني" : Money.fmt(t.shipping)}</b></div>
        <div class="note" style="display:flex;justify-content:space-between"><span>منها ضريبة القيمة المضافة 15٪</span><span>${Money.fmt(t.vat)}</span></div>
        <div class="grand"><span>الإجمالي</span><span>${Money.fmt(t.grand)}</span></div>
      </div>`;
  }

  function coCollect() {
    CO.customer.name = ($("#coName") || {}).value || CO.customer.name;
    CO.customer.phone = ($("#coPhone") || {}).value || CO.customer.phone;
    CO.customer.email = ($("#coEmail") || {}).value || CO.customer.email;
    CO.shipping.city = ($("#coCity") || {}).value || CO.shipping.city;
    CO.shipping.district = ($("#coDistrict") || {}).value || CO.shipping.district;
    CO.shipping.address = ($("#coAddress") || {}).value || CO.shipping.address;
    CO.shipping.notes = ($("#coNotes") || {}).value || CO.shipping.notes;
  }

  function coValidate() {
    coCollect();
    const bad = [];
    const put = (f, msg) => {
      const box = document.querySelector(`.field[data-f="${f}"]`);
      if (box) {
        box.classList.add("bad");
        if (!$(".err", box)) box.insertAdjacentHTML("beforeend", `<div class="err">${esc(msg)}</div>`);
      }
      bad.push(f);
    };
    $$(".field.bad").forEach((b) => { b.classList.remove("bad"); const e = $(".err", b); if (e) e.remove(); });

    if (CO.customer.name.trim().length < 3) put("name", "اكتب الاسم الكامل");
    const ph = CO.customer.phone.replace(/[\s-]/g, "");
    if (!/^(?:\+9665|009665|05)\d{8}$/.test(ph)) put("phone", "رقم جوال سعودي غير صحيح (05XXXXXXXX)");
    if (CO.customer.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(CO.customer.email)) put("email", "بريد غير صحيح");
    if (!CO.shipping.city) put("city", "اختر المدينة");
    if (CO.shipping.address.trim().length < 8) put("address", "اكتب العنوان التفصيلي");

    if (bad.length) {
      const first = document.querySelector(`.field[data-f="${bad[0]}"]`);
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      toast("راجع الحقول المميّزة بالأحمر", "bad");
      return false;
    }
    return true;
  }

  async function coPlace() {
    if (CO.busy) return;
    const lines = Cart.lines();
    const over = lines.find((l) => l.overStock);
    if (over) return toast("الكمية المطلوبة من «" + over.name + "» لم تعد متاحة", "bad");

    CO.busy = true;
    renderCoStep();
    try {
      const order = await S.placeOrder({
        customer: Object.assign({}, CO.customer),
        shipping: Object.assign({}, CO.shipping),
        paymentMethod: CO.paymentMethod,
      });
      CO.busy = false;
      CO.step = 1;
      CO.customer = { name: "", phone: "", email: "" };
      CO.shipping = { city: "", district: "", address: "", notes: "", carrier: "" };
      location.hash = "#/order/" + order.id;
    } catch (e) {
      CO.busy = false;
      renderCoStep();
      toast(e.message || "تعذّر إتمام الطلب", "bad");
    }
  }

  /* ---------------------------------------------------- الصفحة: تأكيد الطلب */

  function viewOrder(id) {
    const o = DB.order(id);
    if (!o) return viewNotFound();
    const st = DB.settings();
    const carrier = (st.carriers || []).find((c) => c.id === o.shipping.carrier);
    const gw = (st.gateways || []).find((g) => g.id === o.payment.method);
    const sObj = S.statusOf(o.status);

    view.innerHTML = `
      <div class="wrap">
        <div class="panel" style="text-align:center;margin-top:18px;border-color:var(--ok)">
          <span style="color:var(--ok);display:inline-block">${icon("check")}</span>
          <h1 style="font-size:21px;margin:8px 0 4px">تم استلام طلبك</h1>
          <p class="note" style="margin:0">رقم الطلب <b style="color:var(--ink);font-size:15px">${esc(o.number)}</b></p>
          <p class="note" style="margin:6px 0 0">${o.payment.status === "paid" ? "تم تأكيد الدفع · مرجع العملية " + esc(o.payment.ref) : "الدفع عند الاستلام · مرجع " + esc(o.payment.ref)}</p>
          <p class="note" style="margin:10px 0 0">سنرسل رسالة على ${esc(o.customer.phone)} عند شحن الطلب.</p>
        </div>

        <div class="panel">
          <h3>ما طلبته</h3>
          ${o.items.map((it) => `
            <div class="line-item">
              <span class="line-thumb"><img src="${esc(it.image)}" alt=""></span>
              <span class="line-info"><b>${esc(it.name)}</b><span class="sub">${fmtQty(it.qty, it.mode)} × ${Money.fmt(it.unitPrice)}</span></span>
              <span class="line-sum">${Money.fmt(it.lineTotal)}</span>
            </div>`).join("")}
          <div class="totals" style="margin-top:12px">
            <div><span>المجموع</span><b>${Money.fmt(o.totals.subtotal)}</b></div>
            <div><span>الشحن</span><b>${o.totals.shipping === 0 ? "مجاني" : Money.fmt(o.totals.shipping)}</b></div>
            <div class="note" style="display:flex;justify-content:space-between"><span>منها ضريبة القيمة المضافة</span><span>${Money.fmt(o.totals.vat)}</span></div>
            <div class="grand"><span>الإجمالي</span><span>${Money.fmt(o.totals.grand)}</span></div>
          </div>
        </div>

        <div class="panel">
          <h3>الشحن والحالة</h3>
          <table class="spec-table"><tbody>
            <tr><th>الحالة</th><td><span class="chip ${sObj.chip}">${esc(sObj.name)}</span></td></tr>
            <tr><th>شركة الشحن</th><td>${esc(carrier ? carrier.name : o.shipping.carrier)}${carrier ? " · " + esc(carrier.eta) : ""}</td></tr>
            ${o.awb ? `<tr><th>رقم البوليصة</th><td>${esc(o.awb)}</td></tr>` : ""}
            <tr><th>العنوان</th><td>${esc(o.shipping.city)}${o.shipping.district ? "، " + esc(o.shipping.district) : ""} — ${esc(o.shipping.address)}</td></tr>
            <tr><th>طريقة الدفع</th><td>${esc(gw ? gw.name : o.payment.method)}</td></tr>
            <tr><th>تاريخ الطلب</th><td>${fmtDate(o.createdAt)}</td></tr>
          </tbody></table>
        </div>

        <div style="display:flex;gap:9px;margin-top:14px;flex-wrap:wrap">
          <a class="btn btn-ghost" href="#/">العودة للمتجر</a>
          <a class="btn btn-gold" href="#/track?n=${encodeURIComponent(o.number)}">تتبّع الطلب</a>
        </div>
      </div>`;
  }

  /* --------------------------------------------------- الصفحة: تتبّع الطلب */

  function viewTrack(params) {
    const n = params.get("n") || "";
    const o = n ? DB.orders().find((x) => x.number.toLowerCase() === n.toLowerCase()) : null;
    const steps = ["new", "processing", "shipped", "delivered"];
    const at = o ? steps.indexOf(o.status) : -1;

    view.innerHTML = `
      <div class="wrap">
        <div class="crumbs"><a href="#/">الرئيسية</a><span>›</span><span>تتبّع الطلب</span></div>
        <h1 style="font-size:22px;margin:6px 0 12px">تتبّع الطلب</h1>
        <div class="panel">
          <div class="field"><label>رقم الطلب</label>
            <input id="trkNum" value="${esc(n)}" placeholder="مثال: NS-2457">
            <div class="help">تجده في رسالة التأكيد، ويبدأ بـ NS-</div>
          </div>
          <button class="btn btn-gold btn-wide" data-act="track" style="margin-top:12px">ابحث</button>
        </div>
        ${n && !o ? `<div class="hint" style="background:var(--bad-soft);border-color:#eecac6;color:#7d2b24">${icon("info")}<span>لا يوجد طلب بهذا الرقم.</span></div>` : ""}
        ${o ? `
          <div class="panel">
            <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:12px">
              <b style="font-size:16px">${esc(o.number)}</b>
              <span class="chip ${S.statusOf(o.status).chip}">${esc(S.statusOf(o.status).name)}</span>
              <span class="note" style="margin-inline-start:auto">${fmtDateShort(o.createdAt)}</span>
            </div>
            <div class="stack">
              ${steps.map((s, i) => {
                const done = at >= i && o.status !== "cancelled";
                const st = S.statusOf(s);
                return `<div style="display:flex;gap:11px;align-items:center;opacity:${done ? 1 : .42}">
                  <span style="width:26px;height:26px;border-radius:50%;flex:none;display:grid;place-items:center;background:${done ? "var(--ok)" : "var(--sand-2)"};color:${done ? "#fff" : "var(--muted)"};font-size:12px;font-weight:800">${done ? "✓" : i + 1}</span>
                  <b style="font-size:13.5px">${esc(st.name)}</b>
                </div>`;
              }).join("")}
            </div>
            ${o.awb ? `<div class="hint" style="margin-top:12px">${icon("truck")}<span>رقم البوليصة <b>${esc(o.awb)}</b> لدى ${esc((DB.settings().carriers.find((c) => c.id === o.shipping.carrier) || {}).name || "")}</span></div>` : ""}
            <div style="margin-top:12px"><a class="btn btn-ghost btn-sm" href="#/order/${o.id}">تفاصيل الطلب</a></div>
          </div>` : ""}
      </div>`;
  }

  /* ------------------------------------------------------ صفحات ثابتة */

  const PAGES = {
    shipping: {
      t: "الشحن والتوصيل",
      body: [
        ["مدة التجهيز", "يُقصّ القماش ويُجهَّز خلال يوم عمل واحد من تأكيد الدفع."],
        ["شركات الشحن", "سمسا (1 – 3 أيام عمل) وأرامكس (2 – 4 أيام عمل) لكل مدن المملكة."],
        ["الشحن المجاني", "مجاني لكل طلب تتجاوز قيمته 800 ر.س."],
        ["الاستلام من المعرض", "متاح بلا رسوم، ويكون الطلب جاهزًا خلال ساعتين من تأكيده."],
        ["الطاقات", "تُشحن الطاقات الكاملة بترتيب خاص، ويتواصل معك الفريق لتحديد الموعد."],
      ],
    },
    returns: {
      t: "الاستبدال والاسترجاع",
      body: [
        ["المدة", "7 أيام من تاريخ الاستلام."],
        ["الشرط", "أن يكون القماش كما هو: غير مقصوص ولا مغسول ولا مُفصَّل، وبغلافه الأصلي."],
        ["القصّ بالمتر", "الأمتار المقصوصة حسب طلبك لا تُسترجع إلا إن كان بها عيب مصنعي."],
        ["العيب المصنعي", "نستبدله فورًا ونتحمّل الشحن في الاتجاهين."],
        ["مدة إعادة المبلغ", "من 3 إلى 7 أيام عمل بعد وصول القماش إلينا، على نفس وسيلة الدفع."],
      ],
    },
    terms: {
      t: "الشروط والأحكام",
      body: [
        ["الأسعار", "كل الأسعار بالريال السعودي وشاملة ضريبة القيمة المضافة 15٪."],
        ["اختلاف الألوان", "قد يختلف اللون قليلًا بين الشاشة والقماش الفعلي باختلاف الإضاءة والشاشات."],
        ["القياس", "القصّ بالمتر بهامش ±5 سم، ويُحتسب لصالح العميل."],
        ["التوفّر", "المخزون يتغيّر لحظيًا، وإن نفد قماش بعد الطلب نتواصل معك للاستبدال أو الاسترجاع الكامل."],
      ],
    },
    privacy: {
      t: "سياسة الخصوصية",
      body: [
        ["ما نجمعه", "الاسم والجوال والعنوان فقط — لتنفيذ الطلب وتسليمه."],
        ["بيانات الدفع", "لا تمرّ بيانات البطاقة عبر المتجر إطلاقًا؛ تُدخل مباشرة لدى بوابة الدفع المعتمدة."],
        ["المشاركة", "تُشارك بيانات العنوان مع شركة الشحن وحدها لغرض التسليم."],
        ["حقوقك", "يمكنك طلب حذف بياناتك في أي وقت عبر خدمة العملاء."],
      ],
    },
  };

  function viewPage(slug) {
    const p = PAGES[slug];
    if (!p) return viewNotFound();
    view.innerHTML = `
      <div class="wrap">
        <div class="crumbs"><a href="#/">الرئيسية</a><span>›</span><span>${esc(p.t)}</span></div>
        <h1 style="font-size:22px;margin:6px 0 12px">${esc(p.t)}</h1>
        <div class="panel">
          <table class="spec-table"><tbody>
            ${p.body.map(([k, v]) => `<tr><th>${esc(k)}</th><td style="font-weight:400">${esc(v)}</td></tr>`).join("")}
          </tbody></table>
        </div>
      </div>`;
  }

  function viewNotFound() {
    view.innerHTML = `<div class="wrap"><div class="empty">${icon("info")}<b>الصفحة غير موجودة</b><span>ربما حُذف القماش أو تغيّر الرابط.</span><div style="margin-top:14px"><a class="btn btn-gold" href="#/">العودة للرئيسية</a></div></div></div>`;
  }

  /* -------------------------------------------------------- بحث عام */

  function viewSearch(params) {
    const q = (params.get("q") || "").trim();
    let list = DB.liveProducts();
    if (q) {
      const t = q.toLowerCase();
      list = list.filter((p) => (p.name + " " + p.sku + " " + p.colorName + " " + p.specs.composition + " " + p.specs.origin + " " + (S.wiqfaOf(p.wiqfa) || {}).name).toLowerCase().includes(t));
    }
    view.innerHTML = `
      <div class="wrap">
        <div class="crumbs"><a href="#/">الرئيسية</a><span>›</span><span>البحث</span></div>
        <h1 style="font-size:21px;margin:6px 0 4px">نتائج البحث عن «${esc(q)}»</h1>
        <p class="sec-sub">${S.Money.num(list.length)} قماش</p>
        ${list.length
          ? `<div class="prod-grid">${list.map(productCard).join("")}</div>`
          : `<div class="empty">${icon("bag")}<b>لا نتائج</b><span>جرّب اسم القماش أو الرمز أو نوع الوقفة.</span></div>`}
      </div>`;
  }

  /* -------------------------------------------------------- درج السلة */

  function renderCart() {
    const lines = Cart.lines();
    const body = $("#cartBody"), foot = $("#cartFoot");
    const n = Cart.count();
    const badge = $("#cartCount");
    badge.hidden = n === 0;
    badge.textContent = S.Money.num(lines.length);

    if (!lines.length) {
      body.innerHTML = `<div class="empty">${icon("bag")}<b>السلة فارغة</b><span>ابدأ من الأقمشة الصيفية أو الشتوية.</span></div>`;
      foot.innerHTML = `<a class="btn btn-ghost btn-wide" href="#/c/summer" data-act="closeCart">تصفّح الأقمشة</a>`;
      return;
    }
    const t = Cart.totals(null);
    body.innerHTML = lines.map((l) => `
      <div class="line-item">
        <span class="line-thumb"><img src="${esc(l.image)}" alt=""></span>
        <span class="line-info">
          <b>${esc(l.name)}</b>
          <span class="sub">${l.mode === "meter" ? "بيع بالمتر" : "طاقة كاملة"} · ${Money.fmt(l.unitPrice)}</span>
          ${l.overStock ? `<span class="chip chip-bad" style="margin-top:4px">المتاح ${fmtQty(l.stock, l.mode)} فقط</span>` : ""}
          <span class="line-ctl">
            <button class="mini-btn" data-act="cq" data-id="${l.productId}" data-m="${l.mode}" data-d="-1">−</button>
            <span class="line-qty">${fmtQty(l.qty, l.mode)}</span>
            <button class="mini-btn" data-act="cq" data-id="${l.productId}" data-m="${l.mode}" data-d="1">+</button>
            <button class="btn btn-quiet btn-sm" data-act="crm" data-id="${l.productId}" data-m="${l.mode}" style="margin-inline-start:auto">حذف</button>
          </span>
        </span>
        <span class="line-sum">${Money.fmt(l.lineTotal)}</span>
      </div>`).join("");

    foot.innerHTML = `
      <div class="totals" style="margin-bottom:12px">
        <div><span>المجموع</span><b>${Money.fmt(t.subtotal)}</b></div>
        ${t.toFreeShip > 0
          ? `<div class="note" style="display:block">
               <div style="display:flex;justify-content:space-between"><span>للشحن المجاني</span><span>${Money.fmt(t.toFreeShip)}</span></div>
               <div class="bar-mini" style="margin-top:5px"><i style="width:${Math.min(100, (t.subtotal / DB.settings().freeShipOver) * 100)}%;background:var(--gold)"></i></div>
             </div>`
          : `<div class="note" style="display:flex;justify-content:space-between"><span>الشحن</span><span style="color:var(--ok);font-weight:800">مجاني</span></div>`}
      </div>
      <button class="btn btn-gold btn-wide" data-act="goCheckout">إتمام الطلب</button>`;
  }

  function openCart(on) {
    $("#cartDrawer").classList.toggle("on", on);
    $("#cartBack").classList.toggle("on", on);
    document.body.style.overflow = on ? "hidden" : "";
  }

  /* ------------------------------------------------------------ التوجيه */

  function parseHash() {
    const h = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = h.split("?");
    return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(qs || "") };
  }

  function route() {
    const { parts, params } = parseHash();
    clearInterval(heroTimer);
    window.scrollTo(0, 0);

    if (!parts.length) viewHome();
    else if (parts[0] === "c") viewCategory(parts[1], params);
    else if (parts[0] === "p") viewProduct(parts[1]);
    else if (parts[0] === "checkout") viewCheckout();
    else if (parts[0] === "order") viewOrder(parts[1]);
    else if (parts[0] === "guide") viewGuide();
    else if (parts[0] === "track") viewTrack(params);
    else if (parts[0] === "search") viewSearch(params);
    else if (parts[0] === "page") viewPage(parts[1]);
    else viewNotFound();

    buildNav(parts, params);
    openCart(false);
  }

  function buildNav(parts, params) {
    const cur = parts[0] === "c" ? parts[1] : parts.length === 0 ? "home" : parts[0];
    $("#navRow").innerHTML =
      `<a class="nav-link${cur === "home" ? " on" : ""}" href="#/">الرئيسية</a>` +
      S.CATEGORY.map((c) => `<a class="nav-link${cur === c.id ? " on" : ""}" href="#/c/${c.id}">${esc(c.name)}</a>`).join("") +
      `<a class="nav-link${cur === "guide" ? " on" : ""}" href="#/guide">دليل الوقفة</a>` +
      `<a class="nav-link${cur === "track" ? " on" : ""}" href="#/track">تتبّع طلبي</a>`;
  }

  function setParam(key, val) {
    const { parts, params } = parseHash();
    if (val) params.set(key, val); else params.delete(key);
    const qs = params.toString();
    location.hash = "#/" + parts.join("/") + (qs ? "?" + qs : "");
  }

  /* ------------------------------------------------------------ الأحداث */

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;

    switch (act) {
      case "hero": heroGo(heroIdx + Number(el.dataset.d)); break;
      case "heroGo": heroGo(Number(el.dataset.i)); break;

      case "wf": ev.preventDefault(); setParam("w", el.dataset.w); break;

      case "gal": {
        PD.gal = Number(el.dataset.i);
        const m = $("#galMain");
        if (m && m._draw) m._draw();
        break;
      }

      case "mode": {
        const p = DB.product(location.hash.split("/")[2]);
        PD.mode = el.dataset.m;
        PD.qty = PD.mode === "meter" ? DB.settings().thobeMetersMin : 1;
        renderBuyBox(p);
        break;
      }

      case "q": {
        const p = DB.product(location.hash.split("/")[2]);
        const st = DB.settings();
        const d = Number(el.dataset.d);
        if (PD.mode === "meter") {
          PD.qty = round2(Math.max(st.minMeters, PD.qty + d * st.meterStep));
          PD.qty = Math.min(PD.qty, Math.max(st.minMeters, p.meter.stock));
        } else {
          PD.qty = Math.max(1, Math.min(PD.qty + d, Math.max(1, p.bolt.stock)));
        }
        renderBuyBox(p);
        break;
      }

      case "setq": {
        const p = DB.product(location.hash.split("/")[2]);
        PD.qty = Math.min(Number(el.dataset.v), p.meter.stock || Number(el.dataset.v));
        renderBuyBox(p);
        break;
      }

      case "calc": {
        const m = Number(el.dataset.m);
        $$("[data-act='calc']").forEach((b) => b.classList.toggle("on", b === el));
        $("#calcOut").innerHTML = `القياس المقترح: <b style="color:var(--ink)">${S.fmtQty(m, "meter")}</b> للثوب الواحد. <button class="btn btn-ghost btn-sm" data-act="setq" data-v="${m}" style="margin-inline-start:6px">اعتمد هذا المقدار</button>`;
        break;
      }

      case "add": {
        const r = Cart.add(el.dataset.id, PD.mode, PD.qty);
        if (!r.ok) return toast(r.msg, "bad");
        toast("أُضيف للسلة: " + fmtQty(PD.qty, PD.mode), "ok");
        renderCart();
        openCart(true);
        break;
      }

      case "cq": {
        const l = Cart.lines().find((x) => x.productId === el.dataset.id && x.mode === el.dataset.m);
        if (!l) break;
        const step = el.dataset.m === "meter" ? DB.settings().meterStep : 1;
        Cart.setQty(el.dataset.id, el.dataset.m, round2(l.qty + Number(el.dataset.d) * step));
        renderCart();
        if (location.hash.startsWith("#/checkout")) renderCoSummary();
        break;
      }
      case "crm":
        Cart.remove(el.dataset.id, el.dataset.m);
        renderCart();
        if (location.hash.startsWith("#/checkout")) { renderCoSummary(); if (!Cart.items().length) viewCheckout(); }
        break;

      case "goCheckout": openCart(false); location.hash = "#/checkout"; break;
      case "closeCart": openCart(false); break;

      case "coNext":
        if (CO.step === 1 && !coValidate()) break;
        coCollect();
        CO.step = Math.min(3, CO.step + 1);
        viewCheckout();
        break;
      case "coBack": coCollect(); CO.step = Math.max(1, CO.step - 1); viewCheckout(); break;
      case "coStep": CO.step = Number(el.dataset.s); viewCheckout(); break;
      case "carrier": CO.shipping.carrier = el.dataset.id; renderCoStep(); renderCoSummary(); break;
      case "pay": CO.paymentMethod = el.dataset.id; renderCoStep(); break;
      case "coPlace": coPlace(); break;

      case "track": {
        const v = ($("#trkNum") || {}).value || "";
        location.hash = "#/track?n=" + encodeURIComponent(v.trim());
        break;
      }
    }
  });

  $("#btnCart").addEventListener("click", () => { renderCart(); openCart(true); });
  $("#cartClose").addEventListener("click", () => openCart(false));
  $("#cartBack").addEventListener("click", () => openCart(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") openCart(false); });

  $("#btnSearch").addEventListener("click", () => {
    const bar = $("#searchBar");
    bar.hidden = !bar.hidden;
    if (!bar.hidden) $("#searchIn").focus();
  });
  $("#searchIn").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = e.target.value.trim();
    if (q) location.hash = "#/search?q=" + encodeURIComponent(q);
  });

  /* ------------------------------------------------------------ الإقلاع */

  $("#year").textContent = new Date().getFullYear();
  $("#footPay").innerHTML = ["mada", "applepay", "visa", "mastercard"]
    .map((k) => `<img class="pay-logo" src="${S.payLogo(k)}" alt="">`).join("");

  window.addEventListener("hashchange", route);
  S.onChange(() => { renderCart(); });
  renderCart();
  route();
})();
