/* ======================================================================
   متجر الأقمشة الرجالية — طبقة البيانات
   ----------------------------------------------------------------------
   كل شيء هنا يعمل داخل المتصفح على localStorage. الواجهة كلها تمرّ عبر
   الدوال في آخر الملف (DB / Cart / Money)، فاستبدال التخزين بواجهة خادم
   حقيقية لاحقًا لا يمسّ صفحات المتجر: تُبدَّل هذه الطبقة وحدها.
   ====================================================================== */

(function (global) {
  "use strict";

  /* ------------------------------------------------------------ ثوابت */

  const KEY = {
    products: "naseej.products.v1",
    orders: "naseej.orders.v1",
    settings: "naseej.settings.v1",
    cart: "naseej.cart.v1",
    seq: "naseej.seq.v1",
  };

  // أنواع الوقفة — تصنيف الأقمشة الصيفية المتعارف عليه في السوق الخليجي.
  const WIQFA = [
    {
      id: "taye7",
      name: "الطايح",
      short: "طايح",
      desc: "أطرى الأقمشة وأكثرها انسيابية. يسقط على الجسم بلا قوام، مناسب للحر الشديد وللمجالس.",
      stiffness: 1,
    },
    {
      id: "rub3",
      name: "ربع وقفة",
      short: "ربع",
      desc: "طري مع أثر خفيف من القوام. يحفظ شكل الثوب دون أن يبدو متيبسًا.",
      stiffness: 2,
    },
    {
      id: "nisf",
      name: "نصف واقف",
      short: "نصف",
      desc: "الوسط الذهبي وأكثر الأنواع طلبًا. قوام واضح مع راحة في اللبس طوال اليوم.",
      stiffness: 3,
    },
    {
      id: "waqif",
      name: "واقف",
      short: "واقف",
      desc: "أقوى قوامًا. يعطي الثوب حِدّة في الكتف والصدر، ويُفضَّل للمناسبات والدوام الرسمي.",
      stiffness: 4,
    },
  ];

  const CATEGORY = [
    { id: "summer", name: "أقمشة صيفية", sub: "خفيفة ومصنّفة بالوقفة", icon: "sun" },
    { id: "winter", name: "أقمشة شتوية", sub: "صوف ومخاليط ثقيلة", icon: "snow" },
    { id: "bolts", name: "طاقات", sub: "جملة وأمتار كاملة", icon: "roll" },
  ];

  const SAUDI_CITIES = [
    "الرياض", "جدة", "مكة المكرمة", "المدينة المنورة", "الدمام", "الخبر", "الظهران",
    "الأحساء", "بريدة", "عنيزة", "حائل", "تبوك", "أبها", "خميس مشيط", "نجران",
    "جازان", "الطائف", "ينبع", "الجبيل", "القطيف", "سكاكا", "عرعر", "الباحة",
  ];

  /* ------------------------------------------------- توليد صور الأقمشة */

  /* الصور مولَّدة داخل المتصفح كـ SVG: لا ملفات ولا طلبات شبكة، وتُستبدل
     بصور المنتج الحقيقية من لوحة التحكم عند رفعها. */

  function fabricArt(opt) {
    const o = Object.assign(
      { base: "#cdc6b8", warp: "#00000018", weft: "#ffffff20", stripe: 0, sheen: 0.25, scale: 6, close: false, noise: 0.5 },
      opt || {}
    );
    const S = 600;
    const step = o.close ? o.scale * 3.2 : o.scale;
    const id = "f" + Math.abs(hashStr(JSON.stringify(o))).toString(36);

    let lines = "";
    for (let x = 0; x < S; x += step) {
      lines += `<rect x="${x}" y="0" width="${step / 2}" height="${S}" fill="${o.warp}"/>`;
    }
    for (let y = 0; y < S; y += step) {
      lines += `<rect x="0" y="${y}" width="${S}" height="${step / 2}" fill="${o.weft}"/>`;
    }

    let stripes = "";
    if (o.stripe) {
      const w = o.stripe;
      for (let x = 0; x < S; x += w * 5) {
        stripes += `<rect x="${x}" y="0" width="${w}" height="${S}" fill="#00000014"/>`;
        stripes += `<rect x="${x + w * 1.6}" y="0" width="${w / 2.5}" height="${S}" fill="#ffffff22"/>`;
      }
    }

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
      `<defs>` +
      `<filter id="n${id}"><feTurbulence type="fractalNoise" baseFrequency="${o.close ? 0.42 : 0.9}" numOctaves="4" seed="${Math.abs(hashStr(o.base)) % 90}"/>` +
      `<feColorMatrix type="saturate" values="0"/></filter>` +
      `<linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#ffffff" stop-opacity="${o.sheen}"/>` +
      `<stop offset=".45" stop-color="#ffffff" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="#000000" stop-opacity="${o.sheen * 0.6}"/></linearGradient>` +
      `</defs>` +
      `<rect width="${S}" height="${S}" fill="${o.base}"/>` +
      lines + stripes +
      `<rect width="${S}" height="${S}" filter="url(#n${id})" opacity="${o.noise * (o.close ? 0.22 : 0.13)}"/>` +
      `<rect width="${S}" height="${S}" fill="url(#g${id})"/>` +
      `</svg>`;

    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }

  /* رسم بانر: طيّات قماش متدرجة */
  function bannerArt(c1, c2, c3) {
    const W = 1400, H = 600;
    let folds = "";
    for (let i = 0; i < 16; i++) {
      const x = (i / 16) * W;
      folds += `<path d="M${x} 0 Q ${x + 60} ${H / 2} ${x + 10} ${H}" stroke="#00000012" stroke-width="${18 + (i % 4) * 9}" fill="none"/>`;
      folds += `<path d="M${x + 34} 0 Q ${x + 92} ${H / 2} ${x + 44} ${H}" stroke="#ffffff14" stroke-width="${10 + (i % 3) * 7}" fill="none"/>`;
    }
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient>` +
      `<filter id="bn"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3"/><feColorMatrix type="saturate" values="0"/></filter></defs>` +
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${folds}` +
      `<rect width="${W}" height="${H}" filter="url(#bn)" opacity=".1"/></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* رسم توضيحي لسقوط القماش حسب الوقفة — يُستعمل في دليل الوقفة */
  function wiqfaGlyph(stiffness) {
    const k = stiffness; // 1..4
    const spread = 26 - k * 5;      // كلما زاد القوام قلّ الانتشار
    const curve = 30 - k * 7;       // وانخفض الانحناء
    const d = `M32 6 L${32 - 14} 22 Q${32 - 14 - curve} 56 ${32 - spread - 6} 92 L${32 + spread + 6} 92 Q${32 + 14 + curve} 56 ${32 + 14} 22 Z`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 100" width="64" height="100">` +
      `<path d="${d}" fill="#e8e0cf" stroke="#a98b4b" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M32 8 L32 92" stroke="#a98b4b" stroke-width="1" opacity=".35"/>` +
      `<path d="M${32 - 7} 20 Q${32 - 8 - curve / 2} 56 ${32 - spread / 1.6 - 4} 90" stroke="#a98b4b" stroke-width="1" fill="none" opacity=".35"/>` +
      `<path d="M${32 + 7} 20 Q${32 + 8 + curve / 2} 56 ${32 + spread / 1.6 + 4} 90" stroke="#a98b4b" stroke-width="1" fill="none" opacity=".35"/>` +
      `</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* شعارات وسائل الدفع — مرسومة، لا تستدعي أي مورد خارجي */
  function payLogo(kind) {
    const box = (inner, bg) =>
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="76" height="48" viewBox="0 0 76 48">` +
        `<rect width="76" height="48" rx="7" fill="${bg || "#ffffff"}" stroke="#e4ded2"/>${inner}</svg>`
      );
    if (kind === "mada")
      return box(
        `<text x="38" y="23" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="700" fill="#1a4c8b">mada</text>` +
        `<text x="38" y="37" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="#8cc63f">مدى</text>`
      );
    if (kind === "applepay")
      return box(
        `<text x="38" y="31" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="600" fill="#111">&#63743; Pay</text>`
      );
    if (kind === "visa")
      return box(`<text x="38" y="31" text-anchor="middle" font-family="serif" font-size="18" font-style="italic" font-weight="700" fill="#1a1f71">VISA</text>`);
    if (kind === "mastercard")
      return box(
        `<circle cx="31" cy="24" r="12" fill="#eb001b"/><circle cx="45" cy="24" r="12" fill="#f79e1b" opacity=".85"/>`
      );
    if (kind === "cod")
      return box(
        `<rect x="16" y="16" width="44" height="18" rx="3" fill="none" stroke="#2f7d52" stroke-width="2"/>` +
        `<circle cx="38" cy="25" r="5" fill="none" stroke="#2f7d52" stroke-width="2"/>`
      );
    return box("");
  }

  /* --------------------------------------------------- الإعدادات */

  const DEFAULT_SETTINGS = {
    storeName: "نسيج",
    tagline: "أقمشة رجالية",
    currency: "SAR",
    vatRate: 0.15,
    vatIncluded: true,          // الأسعار المعروضة شاملة الضريبة
    freeShipOver: 800,
    thobeMetersMin: 3,
    thobeMetersMax: 4,
    meterStep: 0.5,
    minMeters: 1,
    lowStockMeters: 30,
    lowStockBolts: 2,
    adminPass: "1234",
    whatsapp: "966500000000",
    carriers: [
      { id: "smsa", name: "سمسا SMSA", eta: "1 – 3 أيام عمل", cost: 25, active: true },
      { id: "aramex", name: "أرامكس Aramex", eta: "2 – 4 أيام عمل", cost: 22, active: true },
      { id: "pickup", name: "استلام من المعرض", eta: "جاهز خلال ساعتين", cost: 0, active: true },
    ],
    gateways: [
      { id: "mada", name: "مدى", note: "بطاقة الصراف الآلي السعودية", logo: "mada", active: true },
      { id: "applepay", name: "Apple Pay", note: "الدفع من محفظة الجهاز", logo: "applepay", active: true },
      { id: "card", name: "بطاقة ائتمانية", note: "فيزا · ماستركارد", logo: "visa", active: true },
      { id: "cod", name: "الدفع عند الاستلام", note: "رسوم إضافية 20 ر.س", logo: "cod", active: false },
    ],
    provider: "demo", // بوابة الدفع الفعلية: demo | paytabs | myfatoorah | tap
  };

  /* ------------------------------------------------- الكتالوج المبدئي */

  function seedProducts() {
    const P = [];
    let n = 0;
    const mk = (o) => {
      n++;
      const imgs = [
        fabricArt({ base: o.color, stripe: o.stripe || 0, sheen: o.sheen, scale: o.scale || 6 }),
        fabricArt({ base: o.color, stripe: o.stripe || 0, sheen: (o.sheen || 0.25) + 0.1, scale: o.scale || 6, close: true }),
        fabricArt({ base: shade(o.color, -10), stripe: o.stripe || 0, sheen: o.sheen, scale: (o.scale || 6) + 2 }),
      ];
      P.push({
        id: "p" + String(n).padStart(3, "0"),
        sku: o.sku,
        name: o.name,
        category: o.category,
        wiqfa: o.wiqfa || null,
        color: o.color,
        colorName: o.colorName,
        blurb: o.blurb,
        images: imgs,
        video: o.video !== false ? { kind: "generated", color: o.color } : null,
        specs: {
          origin: o.origin,
          composition: o.composition,
          weight: o.weight,
          width: o.width || 150,
          season: o.category === "winter" ? "شتوي" : o.category === "summer" ? "صيفي" : "كل المواسم",
          care: o.care || "غسيل جاف · كي على حرارة متوسطة",
        },
        meter: o.meter ? { enabled: true, price: o.meter.price, stock: o.meter.stock, low: o.meter.low || 30 } : { enabled: false, price: 0, stock: 0, low: 30 },
        bolt: o.bolt ? { enabled: true, price: o.bolt.price, stock: o.bolt.stock, metersPer: o.bolt.metersPer, low: o.bolt.low || 2 } : { enabled: false, price: 0, stock: 0, metersPer: 50, low: 2 },
        featured: !!o.featured,
        bestseller: !!o.bestseller,
        active: true,
        sold: o.sold || 0,
        createdAt: Date.now() - n * 86400000,
      });
    };

    /* ---- صيفية: الطايح ---- */
    mk({
      sku: "SM-TA-101", name: "نسيم — طايح ياباني", category: "summer", wiqfa: "taye7",
      color: "#f2efe6", colorName: "أبيض لؤلؤي", sheen: 0.3,
      blurb: "قطن مخلوط بخيط ياباني رفيع، يسقط انسيابيًا بلا أي قوام. اختيار أهل الحر.",
      origin: "اليابان", composition: "70٪ بوليستر · 30٪ قطن", weight: "140 غم/م²",
      meter: { price: 110, stock: 420, low: 40 }, bolt: { price: 5200, stock: 6, metersPer: 50 },
      featured: true, bestseller: true, sold: 318,
    });
    mk({
      sku: "SM-TA-102", name: "غيم — طايح كوري", category: "summer", wiqfa: "taye7",
      color: "#e9e4d6", colorName: "عاجي", sheen: 0.22,
      blurb: "أخف ما في القسم الصيفي. مناسب للسفر ولأيام الصيف الطويلة.",
      origin: "كوريا", composition: "65٪ بوليستر · 35٪ قطن", weight: "130 غم/م²",
      meter: { price: 78, stock: 260, low: 40 },
      sold: 205,
    });

    /* ---- صيفية: ربع وقفة ---- */
    mk({
      sku: "SM-RB-201", name: "سرمد — ربع وقفة", category: "summer", wiqfa: "rub3",
      color: "#f5f2ea", colorName: "أبيض ناصع", sheen: 0.34,
      blurb: "طراوة الطايح مع أثر خفيف يحفظ خط الكتف. الأكثر طلبًا لمن يبدأ من الطايح ويريد قوامًا.",
      origin: "اليابان", composition: "100٪ بوليستر دقيق", weight: "155 غم/م²",
      meter: { price: 135, stock: 380, low: 40 }, bolt: { price: 6300, stock: 4, metersPer: 50 },
      featured: true, bestseller: true, sold: 412,
    });
    mk({
      sku: "SM-RB-202", name: "وسيم — ربع وقفة مخطط", category: "summer", wiqfa: "rub3",
      color: "#eeeade", colorName: "بيج فاتح", sheen: 0.26, stripe: 5,
      blurb: "خطوط طولية خفيفة لا تُرى إلا عن قرب، تعطي الثوب طولًا في النظر.",
      origin: "إيطاليا", composition: "55٪ بوليستر · 45٪ قطن", weight: "160 غم/م²",
      meter: { price: 165, stock: 140, low: 40 },
      sold: 96,
    });

    /* ---- صيفية: نصف واقف ---- */
    mk({
      sku: "SM-NS-301", name: "الوسمي — نصف واقف", category: "summer", wiqfa: "nisf",
      color: "#f4f1e8", colorName: "أبيض حليبي", sheen: 0.38,
      blurb: "الوسط الذهبي: قوام واضح وراحة طوال اليوم. أكثر أقمشتنا مبيعًا على الإطلاق.",
      origin: "اليابان", composition: "100٪ بوليستر عالي الكثافة", weight: "180 غم/م²",
      meter: { price: 175, stock: 510, low: 60 }, bolt: { price: 8200, stock: 7, metersPer: 50 },
      featured: true, bestseller: true, sold: 688,
    });
    mk({
      sku: "SM-NS-302", name: "رواء — نصف واقف", category: "summer", wiqfa: "nisf",
      color: "#e6e2d4", colorName: "سكري", sheen: 0.3,
      blurb: "لون سكري هادئ يصلح للدوام والمناسبات معًا، مع قوام ثابت لا يتغير بالغسيل.",
      origin: "اليابان", composition: "95٪ بوليستر · 5٪ إيلاستين", weight: "185 غم/م²",
      meter: { price: 190, stock: 24, low: 40 },
      bestseller: true, sold: 274,
    });

    /* ---- صيفية: واقف ---- */
    mk({
      sku: "SM-WQ-401", name: "الرايق — واقف", category: "summer", wiqfa: "waqif",
      color: "#f6f4ee", colorName: "أبيض ثلجي", sheen: 0.44,
      blurb: "أقوى قوامًا في القسم الصيفي. حِدّة في الكتف والصدر تُبقي الثوب مرتبًا من أول النهار لآخره.",
      origin: "سويسرا", composition: "100٪ بوليستر", weight: "205 غم/م²",
      meter: { price: 225, stock: 300, low: 50 }, bolt: { price: 10500, stock: 3, metersPer: 50 },
      featured: true, sold: 356,
    });
    mk({
      sku: "SM-WQ-402", name: "مهيب — واقف فاخر", category: "summer", wiqfa: "waqif",
      color: "#ece8dc", colorName: "بيج ملكي", sheen: 0.4,
      blurb: "للمناسبات الرسمية. لمعة خفيفة جدًا وقوام لا ينكسر.",
      origin: "إيطاليا", composition: "80٪ بوليستر · 20٪ حرير صناعي", weight: "215 غم/م²",
      meter: { price: 310, stock: 88, low: 30 },
      sold: 141,
    });

    /* ---- شتوية ---- */
    mk({
      sku: "WN-501", name: "دفء — صوف إنجليزي", category: "winter",
      color: "#4a4c52", colorName: "رمادي فحمي", sheen: 0.18, scale: 8,
      blurb: "صوف إنجليزي ثقيل بملمس ناعم. يحفظ الحرارة بلا ثقل ظاهر على الكتف.",
      origin: "إنجلترا", composition: "70٪ صوف · 30٪ بوليستر", weight: "320 غم/م²",
      meter: { price: 240, stock: 180, low: 30 }, bolt: { price: 11000, stock: 3, metersPer: 45 },
      featured: true, bestseller: true, sold: 233,
    });
    mk({
      sku: "WN-502", name: "شمال — صوف مخلوط", category: "winter",
      color: "#3b3f47", colorName: "كحلي داكن", sheen: 0.16, scale: 8,
      blurb: "لون كحلي عميق مع نسيج مشدود، مناسب لثوب الشتاء اليومي.",
      origin: "تركيا", composition: "50٪ صوف · 50٪ أكريليك", weight: "290 غم/م²",
      meter: { price: 155, stock: 210, low: 30 },
      sold: 178,
    });
    mk({
      sku: "WN-503", name: "سديم — كشمير مخلوط", category: "winter",
      color: "#6b6257", colorName: "بني رمادي", sheen: 0.2, scale: 7,
      blurb: "لمسة كشمير تعطي نعومة ظاهرة من أول لمسة. الأغلى في القسم الشتوي وأكثره فخامة.",
      origin: "إيطاليا", composition: "20٪ كشمير · 60٪ صوف · 20٪ بوليستر", weight: "340 غم/م²",
      meter: { price: 420, stock: 62, low: 20 },
      featured: true, sold: 87,
    });
    mk({
      sku: "WN-504", name: "ركاز — شتوي مخطط", category: "winter",
      color: "#57544d", colorName: "زيتي داكن", sheen: 0.15, stripe: 6, scale: 8,
      blurb: "خطوط شتوية كلاسيكية بلون زيتي، تليق بالبشوت والأثواب الرسمية.",
      origin: "إنجلترا", composition: "65٪ صوف · 35٪ بوليستر", weight: "310 غم/م²",
      meter: { price: 265, stock: 14, low: 25 },
      sold: 64,
    });
    mk({
      sku: "WN-505", name: "قرّة — صوف ثقيل", category: "winter",
      color: "#2f3238", colorName: "أسود دخاني", sheen: 0.14, scale: 9,
      blurb: "أثقل أقمشتنا. لليالي الشتاء الباردة وللمناطق الشمالية.",
      origin: "تركيا", composition: "80٪ صوف · 20٪ بوليستر", weight: "380 غم/م²",
      meter: { price: 198, stock: 0, low: 25 },
      sold: 119,
    });

    /* ---- طاقات (جملة) ---- */
    mk({
      sku: "BL-601", name: "طاقة الوسمي — 50 م", category: "bolts",
      color: "#f4f1e8", colorName: "أبيض حليبي", sheen: 0.38,
      blurb: "طاقة كاملة من «الوسمي» نصف واقف — سعر الجملة للخياطين والمحلات.",
      origin: "اليابان", composition: "100٪ بوليستر عالي الكثافة", weight: "180 غم/م²",
      bolt: { price: 7900, stock: 12, metersPer: 50, low: 3 },
      featured: true, bestseller: true, sold: 41,
    });
    mk({
      sku: "BL-602", name: "طاقة سرمد — 50 م", category: "bolts",
      color: "#f5f2ea", colorName: "أبيض ناصع", sheen: 0.34,
      blurb: "طاقة «سرمد» ربع وقفة. خصم الجملة يبدأ من ثلاث طاقات.",
      origin: "اليابان", composition: "100٪ بوليستر دقيق", weight: "155 غم/م²",
      bolt: { price: 6100, stock: 9, metersPer: 50, low: 3 },
      sold: 28,
    });
    mk({
      sku: "BL-603", name: "طاقة الرايق — 50 م", category: "bolts",
      color: "#f6f4ee", colorName: "أبيض ثلجي", sheen: 0.44,
      blurb: "طاقة «الرايق» واقف، للخياطين الذين يعملون على الأثواب الرسمية.",
      origin: "سويسرا", composition: "100٪ بوليستر", weight: "205 غم/م²",
      bolt: { price: 10200, stock: 2, metersPer: 50, low: 3 },
      sold: 17,
    });
    mk({
      sku: "BL-604", name: "طاقة دفء الشتوية — 45 م", category: "bolts",
      color: "#4a4c52", colorName: "رمادي فحمي", sheen: 0.18, scale: 8,
      blurb: "طاقة صوف إنجليزي كاملة بسعر الجملة.",
      origin: "إنجلترا", composition: "70٪ صوف · 30٪ بوليستر", weight: "320 غم/م²",
      bolt: { price: 10400, stock: 4, metersPer: 45, low: 2 },
      sold: 23,
    });
    mk({
      sku: "BL-605", name: "طاقة نسيم — 50 م", category: "bolts",
      color: "#f2efe6", colorName: "أبيض لؤلؤي", sheen: 0.3,
      blurb: "طاقة «نسيم» الطايح. الأكثر طلبًا من محلات التفصيل في الصيف.",
      origin: "اليابان", composition: "70٪ بوليستر · 30٪ قطن", weight: "140 غم/م²",
      bolt: { price: 5000, stock: 15, metersPer: 50, low: 3 },
      bestseller: true, sold: 52,
    });

    return P;
  }

  function shade(hex, pct) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const num = parseInt(m[1], 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (pct / 100) * 255)));
    return "#" + [f(num >> 16), f((num >> 8) & 255), f(num & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  function seedOrders(products) {
    const names = ["عبدالله الحربي", "سعود القحطاني", "ماجد العتيبي", "خالد الدوسري", "فهد الشمري", "بدر الغامدي"];
    const cities = ["الرياض", "جدة", "الدمام", "بريدة", "أبها", "المدينة المنورة"];
    const statuses = ["delivered", "shipped", "processing", "new", "delivered", "new"];
    const out = [];
    for (let i = 0; i < 6; i++) {
      const p = products[(i * 3) % products.length];
      const mode = p.meter.enabled ? "meter" : "bolt";
      const qty = mode === "meter" ? [3, 4, 3.5, 8, 4, 6][i] : [1, 2, 1, 3, 1, 2][i];
      const unit = mode === "meter" ? p.meter.price : p.bolt.price;
      const sub = round2(unit * qty);
      const ship = sub >= 800 ? 0 : 25;
      out.push({
        id: "o" + (1000 + i),
        number: "NS-" + (2451 + i),
        createdAt: Date.now() - (i * 26 + 4) * 3600000,
        items: [{ productId: p.id, sku: p.sku, name: p.name, mode: mode, qty: qty, unitPrice: unit, lineTotal: sub, image: p.images[0] }],
        customer: { name: names[i], phone: "05" + (50000000 + i * 111111), email: "" },
        shipping: { city: cities[i], district: "حي النرجس", address: "شارع الأمير سلطان، مبنى " + (12 + i), notes: "", carrier: i % 2 ? "aramex" : "smsa", cost: ship },
        payment: { method: i % 3 === 0 ? "mada" : i % 3 === 1 ? "applepay" : "card", status: "paid", ref: "TXN" + (778001 + i) },
        totals: { subtotal: sub, shipping: ship, vat: round2((sub + ship) * 0.15 / 1.15), grand: round2(sub + ship) },
        status: statuses[i],
        awb: i < 3 ? (i % 2 ? "ARX" : "SMSA") + (90014500 + i * 37) : "",
        timeline: [{ at: Date.now() - (i * 26 + 4) * 3600000, status: "new", note: "تم إنشاء الطلب" }],
      });
    }
    return out;
  }

  /* ----------------------------------------------------------- التخزين */

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("تعذّرت قراءة", key, e);
      return fallback;
    }
  }

  function write(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      console.warn("تعذّر الحفظ في", key, e);
      return false;
    }
  }

  let _products = null, _orders = null, _settings = null;

  const DB = {
    settings() {
      if (!_settings) _settings = Object.assign({}, DEFAULT_SETTINGS, read(KEY.settings, {}));
      return _settings;
    },
    saveSettings(patch) {
      _settings = Object.assign({}, DB.settings(), patch);
      write(KEY.settings, _settings);
      emit();
      return _settings;
    },

    products() {
      if (!_products) {
        _products = read(KEY.products, null);
        if (!_products || !_products.length) {
          _products = seedProducts();
          write(KEY.products, _products);
        }
      }
      return _products;
    },
    liveProducts() {
      return DB.products().filter((p) => p.active !== false);
    },
    product(id) {
      return DB.products().find((p) => p.id === id) || null;
    },
    saveProduct(p) {
      const list = DB.products();
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) list[i] = p;
      else {
        p.id = p.id || "p" + Date.now().toString(36);
        p.createdAt = p.createdAt || Date.now();
        list.unshift(p);
      }
      write(KEY.products, list);
      emit();
      return p;
    },
    deleteProduct(id) {
      _products = DB.products().filter((p) => p.id !== id);
      write(KEY.products, _products);
      emit();
    },

    orders() {
      if (!_orders) {
        _orders = read(KEY.orders, null);
        if (!_orders) {
          _orders = seedOrders(DB.products());
          write(KEY.orders, _orders);
        }
      }
      return _orders;
    },
    order(id) {
      return DB.orders().find((o) => o.id === id) || null;
    },
    saveOrder(o) {
      const list = DB.orders();
      const i = list.findIndex((x) => x.id === o.id);
      if (i >= 0) list[i] = o;
      else list.unshift(o);
      write(KEY.orders, list);
      emit();
      return o;
    },
    nextOrderNumber() {
      const seq = (read(KEY.seq, 2456) | 0) + 1;
      write(KEY.seq, seq);
      return "NS-" + seq;
    },

    /* خصم المخزون عند تأكيد الطلب: بالأمتار أو بعدد الطاقات */
    commitStock(items) {
      const list = DB.products();
      items.forEach((it) => {
        const p = list.find((x) => x.id === it.productId);
        if (!p) return;
        if (it.mode === "meter") p.meter.stock = round2(Math.max(0, p.meter.stock - it.qty));
        else p.bolt.stock = Math.max(0, p.bolt.stock - it.qty);
        p.sold = (p.sold || 0) + (it.mode === "meter" ? Math.round(it.qty) : it.qty * 10);
      });
      write(KEY.products, list);
      emit();
    },

    lowStock() {
      const out = [];
      DB.liveProducts().forEach((p) => {
        if (p.meter.enabled && p.meter.stock <= (p.meter.low || 30))
          out.push({ product: p, mode: "meter", left: p.meter.stock, threshold: p.meter.low || 30 });
        if (p.bolt.enabled && p.bolt.stock <= (p.bolt.low || 2))
          out.push({ product: p, mode: "bolt", left: p.bolt.stock, threshold: p.bolt.low || 2 });
      });
      return out.sort((a, b) => a.left / (a.threshold || 1) - b.left / (b.threshold || 1));
    },

    exportAll() {
      return { v: 1, exportedAt: new Date().toISOString(), products: DB.products(), orders: DB.orders(), settings: DB.settings() };
    },
    importAll(obj) {
      if (!obj || !Array.isArray(obj.products)) throw new Error("ملف غير صالح");
      _products = obj.products;
      write(KEY.products, _products);
      if (Array.isArray(obj.orders)) { _orders = obj.orders; write(KEY.orders, _orders); }
      if (obj.settings) { _settings = Object.assign({}, DEFAULT_SETTINGS, obj.settings); write(KEY.settings, _settings); }
      emit();
    },
    resetAll() {
      [KEY.products, KEY.orders, KEY.settings, KEY.cart, KEY.seq].forEach((k) => localStorage.removeItem(k));
      _products = _orders = _settings = null;
      emit();
    },
  };

  /* --------------------------------------------------------- الاشتراك */

  const subs = [];
  function emit() { subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); }
  function onChange(f) { subs.push(f); return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); }; }

  /* ------------------------------------------------------------ السلة */

  const Cart = {
    items() { return read(KEY.cart, []); },
    save(items) { write(KEY.cart, items); emit(); },

    add(productId, mode, qty) {
      const p = DB.product(productId);
      if (!p) return { ok: false, msg: "المنتج غير موجود" };
      const stock = mode === "meter" ? p.meter.stock : p.bolt.stock;
      const items = Cart.items();
      const line = items.find((i) => i.productId === productId && i.mode === mode);
      const want = round2((line ? line.qty : 0) + qty);
      if (want > stock) return { ok: false, msg: stock <= 0 ? "نفدت الكمية" : "المتاح " + fmtQty(stock, mode) + " فقط" };
      if (line) line.qty = want;
      else items.push({ productId: productId, mode: mode, qty: round2(qty) });
      Cart.save(items);
      return { ok: true };
    },
    setQty(productId, mode, qty) {
      const items = Cart.items();
      const line = items.find((i) => i.productId === productId && i.mode === mode);
      if (!line) return;
      if (qty <= 0) return Cart.remove(productId, mode);
      const p = DB.product(productId);
      const stock = p ? (mode === "meter" ? p.meter.stock : p.bolt.stock) : 0;
      line.qty = round2(Math.min(qty, stock));
      Cart.save(items);
    },
    remove(productId, mode) {
      Cart.save(Cart.items().filter((i) => !(i.productId === productId && i.mode === mode)));
    },
    clear() { Cart.save([]); },

    /* أسطر السلة موسّعة ببيانات المنتج والأسعار */
    lines() {
      return Cart.items().map((i) => {
        const p = DB.product(i.productId);
        if (!p) return null;
        const unit = i.mode === "meter" ? p.meter.price : p.bolt.price;
        const stock = i.mode === "meter" ? p.meter.stock : p.bolt.stock;
        return {
          productId: p.id, sku: p.sku, name: p.name, image: p.images[0],
          mode: i.mode, qty: i.qty, unitPrice: unit, lineTotal: round2(unit * i.qty),
          stock: stock, overStock: i.qty > stock,
          meters: i.mode === "meter" ? i.qty : i.qty * (p.bolt.metersPer || 50),
        };
      }).filter(Boolean);
    },

    count() { return Cart.items().reduce((s, i) => s + (i.mode === "meter" ? 1 : i.qty), 0); },

    totals(carrierId) {
      const s = DB.settings();
      const lines = Cart.lines();
      const subtotal = round2(lines.reduce((a, l) => a + l.lineTotal, 0));
      const carrier = (s.carriers || []).find((c) => c.id === carrierId);
      let shipping = carrier ? carrier.cost : 0;
      if (carrier && carrier.id !== "pickup" && s.freeShipOver && subtotal >= s.freeShipOver) shipping = 0;
      const grand = round2(subtotal + shipping);
      const vat = s.vatIncluded ? round2(grand - grand / (1 + s.vatRate)) : round2(grand * s.vatRate);
      return {
        subtotal: subtotal,
        shipping: shipping,
        shippingFree: !!(carrier && carrier.cost > 0 && shipping === 0),
        vat: vat,
        grand: s.vatIncluded ? grand : round2(grand + vat),
        toFreeShip: s.freeShipOver ? Math.max(0, round2(s.freeShipOver - subtotal)) : 0,
      };
    },
  };

  /* ------------------------------------------------ إتمام الطلب (محاكاة) */

  /* بوابة الدفع: واجهة واحدة. النسخة التجريبية تُقرّ الدفع محليًا؛ ربط
     PayTabs / MyFatoorah / Tap يستبدل جسم charge() بنداء الخادم دون تغيير
     أي شيء في صفحات المتجر. راجع fabric/README.md § الربط الخارجي. */
  const Payments = {
    async charge(order, method) {
      const s = DB.settings();
      if (s.provider !== "demo") throw new Error("بوابة «" + s.provider + "» تحتاج مفاتيح الخادم — راجع README");
      await sleep(900);
      if (method === "cod") return { status: "pending", ref: "COD" + Date.now().toString().slice(-6) };
      return { status: "paid", ref: "TXN" + Date.now().toString().slice(-6) };
    },
  };

  /* شركة الشحن: إصدار بوليصة. تُستبدل بنداء Aramex/SMSA من الخادم. */
  const Shipping = {
    async createWaybill(order) {
      await sleep(500);
      const pre = order.shipping.carrier === "aramex" ? "ARX" : order.shipping.carrier === "smsa" ? "SMSA" : "PKP";
      return pre + Math.floor(10000000 + Math.random() * 89999999);
    },
  };

  async function placeOrder(payload) {
    const lines = Cart.lines();
    if (!lines.length) throw new Error("السلة فارغة");
    const bad = lines.find((l) => l.overStock || l.qty <= 0);
    if (bad) throw new Error("الكمية المطلوبة من «" + bad.name + "» تتجاوز المتاح");

    const t = Cart.totals(payload.shipping.carrier);
    const order = {
      id: "o" + Date.now().toString(36),
      number: DB.nextOrderNumber(),
      createdAt: Date.now(),
      items: lines.map((l) => ({
        productId: l.productId, sku: l.sku, name: l.name, mode: l.mode,
        qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal, image: l.image,
      })),
      customer: payload.customer,
      shipping: Object.assign({}, payload.shipping, { cost: t.shipping }),
      payment: { method: payload.paymentMethod, status: "pending", ref: "" },
      totals: { subtotal: t.subtotal, shipping: t.shipping, vat: t.vat, grand: t.grand },
      status: "new",
      awb: "",
      timeline: [{ at: Date.now(), status: "new", note: "تم إنشاء الطلب" }],
    };

    const pay = await Payments.charge(order, payload.paymentMethod);
    order.payment.status = pay.status;
    order.payment.ref = pay.ref;

    DB.commitStock(order.items);
    DB.saveOrder(order);
    Cart.clear();
    return order;
  }

  /* ------------------------------------------------------------ أدوات */

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

  const nf0 = new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat("ar-SA-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const Money = {
    fmt(n) {
      const v = Number(n) || 0;
      return (Number.isInteger(v) ? nf0.format(v) : nf2.format(v)) + " ر.س";
    },
    plain(n) { return nf2.format(Number(n) || 0); },
    num(n) { return nf0.format(Number(n) || 0); },
  };

  function fmtQty(q, mode) {
    if (mode === "meter") {
      const v = Number(q) || 0;
      return (Number.isInteger(v) ? nf0.format(v) : nf2.format(v).replace(/0$/, "")) + " م";
    }
    // المفرد والمثنّى في العربية لا يسبقهما العدد: «طاقة»، «طاقتان»،
    // ثم «3 طاقات» حتى العشرة، و«11 طاقة» بعدها.
    const n = Number(q) || 0;
    if (n === 1) return "طاقة واحدة";
    if (n === 2) return "طاقتان";
    if (n >= 3 && n <= 10) return nf0.format(n) + " طاقات";
    return nf0.format(n) + " طاقة";
  }

  function fmtDate(ts) {
    return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(new Date(ts));
  }

  function fmtDateShort(ts) {
    return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
  }

  const ORDER_STATUS = [
    { id: "new", name: "جديد", chip: "chip-info" },
    { id: "processing", name: "قيد التنفيذ", chip: "chip-warn" },
    { id: "shipped", name: "تم الشحن", chip: "chip-gold" },
    { id: "delivered", name: "تم التسليم", chip: "chip-ok" },
    { id: "cancelled", name: "ملغي", chip: "chip-bad" },
  ];

  function statusOf(id) { return ORDER_STATUS.find((s) => s.id === id) || ORDER_STATUS[0]; }
  function wiqfaOf(id) { return WIQFA.find((w) => w.id === id) || null; }
  function categoryOf(id) { return CATEGORY.find((c) => c.id === id) || null; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ------------------------------------------------------------ التصدير */

  global.Shop = {
    KEY, WIQFA, CATEGORY, SAUDI_CITIES, ORDER_STATUS, DEFAULT_SETTINGS,
    DB, Cart, Money, Payments, Shipping, placeOrder,
    fabricArt, bannerArt, wiqfaGlyph, payLogo, shade,
    fmtQty, fmtDate, fmtDateShort, round2, esc, sleep,
    statusOf, wiqfaOf, categoryOf, onChange, emit,
  };
})(window);
