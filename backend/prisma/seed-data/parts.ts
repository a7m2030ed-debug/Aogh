// Canonical parts taxonomy — the entity the technical review calls the
// single most important missing piece (see docs/project-brief.md): without
// a canonical name + synonym dictionary, "صدام" / "بمبر" / "Front Bumper"
// stay three unrelated strings and search + AI drift apart.
//
// Deliberately NOT tied to a specific vehicle make/model — a "صدام أمامي"
// is the same category of part whether it came off a Camry or a Hilux.
// Real OEM numbers are correct only per exact model/year/trim, so they
// don't belong on this generic taxonomy level; oemNumbers stays empty
// here and gets filled in per-listing by whoever actually has the part in
// hand, or added later as a dedicated fitment table.
//
// ~9 top categories, ~35 subcategories, ~190 parts — real, commonly
// searched-for automotive terms (Saudi/Gulf Arabic usage), not a
// mechanically generated list.

export interface SeedPart {
  nameEn: string;
  nameAr: string;
  synonyms?: string[];
}

export interface SeedSubcategory {
  nameEn: string;
  nameAr: string;
  parts: SeedPart[];
}

export interface SeedCategory {
  nameEn: string;
  nameAr: string;
  subcategories: SeedSubcategory[];
}

function p(entry: string): SeedPart {
  const [namesPart, synonymsPart] = entry.split('#');
  const [nameEn, nameAr] = namesPart.split('|');
  return {
    nameEn,
    nameAr,
    synonyms: synonymsPart ? synonymsPart.split(',') : undefined,
  };
}

export const partCategories: SeedCategory[] = [
  {
    nameEn: 'Exterior Body',
    nameAr: 'الهيكل الخارجي',
    subcategories: [
      {
        nameEn: 'Bumpers',
        nameAr: 'الصدامات',
        parts: [
          p('Front Bumper|صدام أمامي#بمبر أمامي,صدام قدام'),
          p('Rear Bumper|صدام خلفي#بمبر خلفي,صدام ورا'),
          p('Front Bumper Grille|شبك الصدام الأمامي'),
          p('Bumper Bracket|حامل الصدام#دعامة الصدام'),
        ],
      },
      {
        nameEn: 'Doors',
        nameAr: 'الأبواب',
        parts: [
          p('Front Right Door|باب أمامي يمين'),
          p('Front Left Door|باب أمامي يسار'),
          p('Rear Right Door|باب خلفي يمين'),
          p('Rear Left Door|باب خلفي يسار'),
          p('Door Handle|مقبض الباب#يد الباب'),
          p('Door Lock Actuator|قفل الباب المركزي#موتور القفل المركزي'),
          p('Door Hinge|مفصلة الباب'),
        ],
      },
      {
        nameEn: 'Hood & Trunk',
        nameAr: 'الكبوت والصندوق',
        parts: [
          p('Hood|كبوت#غطاء المحرك'),
          p('Trunk Lid|غطاء الصندوق الخلفي#شنطة السيارة'),
          p('Hood Hinge|مفصلة الكبوت'),
          p('Trunk Strut|مساعد الصندوق'),
        ],
      },
      {
        nameEn: 'Fenders',
        nameAr: 'الرفارف',
        parts: [
          p('Front Right Fender|رفرف أمامي يمين'),
          p('Front Left Fender|رفرف أمامي يسار'),
          p('Rear Right Fender|رفرف خلفي يمين'),
          p('Rear Left Fender|رفرف خلفي يسار'),
          p('Wheel Arch Liner|بطانة الرفرف#كتم الطين'),
        ],
      },
      {
        nameEn: 'Mirrors',
        nameAr: 'المرايا',
        parts: [
          p('Right Side Mirror|مرآة جانبية يمين#مراية يمين'),
          p('Left Side Mirror|مرآة جانبية يسار#مراية يسار'),
          p('Rearview Mirror|مرآة داخلية#مراية وسط'),
        ],
      },
      {
        nameEn: 'Glass',
        nameAr: 'الزجاج',
        parts: [
          p('Windshield|زجاج أمامي#سكرين,برايز أمامي'),
          p('Rear Windshield|زجاج خلفي'),
          p('Front Right Door Glass|زجاج باب أمامي يمين'),
          p('Front Left Door Glass|زجاج باب أمامي يسار'),
          p('Rear Right Door Glass|زجاج باب خلفي يمين'),
          p('Rear Left Door Glass|زجاج باب خلفي يسار'),
          p('Side Mirror Glass|زجاج المرآة'),
        ],
      },
      {
        nameEn: 'Grille & Trim',
        nameAr: 'الشبك والإكسسوارات الخارجية',
        parts: [
          p('Front Grille|شبك المبرد الأمامي#كالندر'),
          p('Roof Rack|حامل السقف#ريل السقف'),
          p('Side Molding|ليسته جانبية#كرومات جانبية'),
          p('Spoiler|سبويلر#جناح خلفي'),
          p('Antenna|هوائي الراديو#أنتينا'),
        ],
      },
    ],
  },
  {
    nameEn: 'Lighting',
    nameAr: 'الإضاءة',
    subcategories: [
      {
        nameEn: 'Headlights',
        nameAr: 'المصابيح الأمامية',
        parts: [
          p('Right Headlight|مصباح أمامي يمين#شمعة يمين'),
          p('Left Headlight|مصباح أمامي يسار#شمعة يسار'),
          p('Headlight Bulb|لمبة الشمعة'),
          p('Headlight Washer|رشاش الشمعة'),
        ],
      },
      {
        nameEn: 'Taillights',
        nameAr: 'المصابيح الخلفية',
        parts: [
          p('Right Taillight|مصباح خلفي يمين#ستوب يمين'),
          p('Left Taillight|مصباح خلفي يسار#ستوب يسار'),
          p('Center Taillight Panel|شريط الستوب الأوسط'),
          p('Brake Light Bulb|لمبة الفرامل'),
        ],
      },
      {
        nameEn: 'Turn Signals & Fog Lights',
        nameAr: 'الإشارات ومصابيح الضباب',
        parts: [
          p('Front Turn Signal|إشارة أمامية#غماز أمامي'),
          p('Side Mirror Turn Signal|إشارة المرآة'),
          p('Right Fog Light|كشاف ضباب يمين'),
          p('Left Fog Light|كشاف ضباب يسار'),
        ],
      },
    ],
  },
  {
    nameEn: 'Engine & Drivetrain',
    nameAr: 'المحرك ونظام الدفع',
    subcategories: [
      {
        nameEn: 'Engine',
        nameAr: 'المحرك',
        parts: [
          p('Complete Engine|مكينة كاملة#محرك كامل'),
          p('Engine Block|كتلة المحرك'),
          p('Cylinder Head|رأس المكينة#طرمبة الهواء'),
          p('Timing Belt Kit|طقم سير الكاتينة#سير الكامة'),
          p('Timing Chain|كاتينة التايمنج'),
          p('Oil Pump|طرمبة الزيت'),
          p('Water Pump|طرمبة الماء'),
          p('Thermostat|الثرموستات#منظم الحرارة'),
          p('Engine Mount|كف المكينة#مساند المكينة'),
          p('Spark Plug|بوجيه'),
          p('Ignition Coil|كويل الإشعال#بوبينة'),
          p('Fuel Injector|بخاخ الوقود#إنجكتور'),
          p('Fuel Pump|طرمبة البنزين'),
          p('Air Filter Housing|علبة فلتر الهواء'),
          p('Valve Cover|غطاء الصبابات'),
          p('Oil Pan|كرتير الزيت'),
        ],
      },
      {
        nameEn: 'Turbo & Forced Induction',
        nameAr: 'التيربو وأنظمة الشحن',
        parts: [
          p('Turbocharger|تيربو#شاحن توربيني'),
          p('Intercooler|إنتركولر#مبرد التيربو'),
          p('Wastegate Actuator|صمام التيربو'),
        ],
      },
      {
        nameEn: 'Exhaust System',
        nameAr: 'نظام العادم',
        parts: [
          p('Exhaust Muffler|كتم الصوت#شكمان'),
          p('Catalytic Converter|كتاليتيك#محول حفاز'),
          p('Exhaust Manifold|مانيفولد العادم'),
          p('Oxygen Sensor|حساس الأكسجين#سنسور الأكسجين'),
        ],
      },
      {
        nameEn: 'Transmission & Clutch',
        nameAr: 'ناقل الحركة والكلتش',
        parts: [
          p('Automatic Transmission|جير أوتوماتيك#ناقل حركة أوتوماتيك'),
          p('Manual Transmission|جير عادي#ناقل حركة يدوي'),
          p('Clutch Kit|طقم كلتش#دبرياج'),
          p('Torque Converter|محول العزم'),
          p('CV Axle|كردان#عمود الدفع الجانبي'),
          p('Drive Shaft|عمود الكردان'),
          p('Differential|الفرندة#الديفرنشل'),
        ],
      },
      {
        nameEn: 'Cooling System',
        nameAr: 'نظام التبريد',
        parts: [
          p('Radiator|الرديتر#المشع'),
          p('Radiator Fan|مروحة الرديتر'),
          p('Radiator Hose|خرطوم الرديتر'),
          p('Coolant Reservoir Tank|خزان الماء الاحتياطي'),
        ],
      },
    ],
  },
  {
    nameEn: 'Electrical & Charging',
    nameAr: 'الكهرباء والشحن',
    subcategories: [
      {
        nameEn: 'Charging & Starting',
        nameAr: 'الشحن والتشغيل',
        parts: [
          p('Alternator|دينمو#مولد الكهرباء'),
          p('Starter Motor|مارش#بادئ الحركة'),
          p('Battery|بطارية السيارة'),
          p('Battery Cable|سلك البطارية'),
        ],
      },
      {
        nameEn: 'Computer & Sensors',
        nameAr: 'الكمبيوتر والحساسات',
        parts: [
          p('Engine Control Unit|كمبيوتر السيارة#ECU,دماغ السيارة'),
          p('ABS Control Module|كمبيوتر الـABS'),
          p('Crankshaft Position Sensor|حساس الكرنك'),
          p('Camshaft Position Sensor|حساس الكامة'),
          p('Mass Air Flow Sensor|حساس الهواء#MAF سنسور'),
          p('Speed Sensor|حساس السرعة'),
          p('Fuse Box|علبة الفيوزات'),
        ],
      },
      {
        nameEn: 'Wiring & Switches',
        nameAr: 'الأسلاك والمفاتيح',
        parts: [
          p('Wiring Harness|طقم الأسلاك#هارنس'),
          p('Window Regulator Switch|مفتاح الزجاج الكهربائي'),
          p('Window Regulator Motor|موتور الزجاج الكهربائي'),
          p('Ignition Switch|مفتاح التشغيل#السويتش'),
        ],
      },
    ],
  },
  {
    nameEn: 'Brakes & Suspension',
    nameAr: 'الفرامل والتعليق',
    subcategories: [
      {
        nameEn: 'Brakes',
        nameAr: 'الفرامل',
        parts: [
          p('Front Brake Disc|دسك فرامل أمامي#طارة فرامل أمامي'),
          p('Rear Brake Disc|دسك فرامل خلفي'),
          p('Brake Pads|تيل فرامل'),
          p('Brake Caliper|كاليبر الفرامل#كماشة الفرامل'),
          p('Brake Master Cylinder|مويتر الفرامل الرئيسي'),
          p('ABS Sensor|حساس الـABS'),
          p('Handbrake Cable|سلك الفرامل اليدوي'),
        ],
      },
      {
        nameEn: 'Suspension',
        nameAr: 'التعليق',
        parts: [
          p('Front Shock Absorber|مساعد أمامي#كزوط أمامي'),
          p('Rear Shock Absorber|مساعد خلفي#كزوط خلفي'),
          p('Coil Spring|يايات التعليق#سبرنقة'),
          p('Control Arm|كرونك#ذراع التعليق'),
          p('Ball Joint|رمان التعليق#كرة المفصل'),
          p('Stabilizer Link|بلي الكرونك#رابط الكرونة'),
          p('Sway Bar Bushing|كاوتش الكرونة'),
          p('Strut Mount|طبلية المساعد'),
        ],
      },
      {
        nameEn: 'Steering',
        nameAr: 'التوجيه',
        parts: [
          p('Steering Rack|علبة الدركسيون#الدركسون'),
          p('Power Steering Pump|طرمبة الدركسون'),
          p('Tie Rod End|رأس الدركسون#طرف عمود التوجيه'),
        ],
      },
    ],
  },
  {
    nameEn: 'Wheels & Tires',
    nameAr: 'العجلات والإطارات',
    subcategories: [
      {
        nameEn: 'Wheels',
        nameAr: 'العجلات',
        parts: [
          p('Alloy Wheel Rim|جنط#جنط ألمنيوم'),
          p('Steel Wheel Rim|جنط حديد'),
          p('Wheel Bearing|رمان العجلة#كرسي العجلة'),
          p('Wheel Hub|طبلون العجلة'),
          p('Spare Tire|إطار احتياطي#إسكوب'),
          p('Wheel Cap|طاسة الجنط'),
        ],
      },
    ],
  },
  {
    nameEn: 'Interior',
    nameAr: 'الداخلية',
    subcategories: [
      {
        nameEn: 'Seats',
        nameAr: 'المقاعد',
        parts: [
          p('Front Right Seat|مقعد أمامي يمين#كرسي السائق'),
          p('Front Left Seat|مقعد أمامي يسار'),
          p('Rear Seat|مقعد خلفي#كنبة خلفية'),
          p('Seat Belt|حزام الأمان'),
          p('Airbag|إيرباق#الوسادة الهوائية'),
          p('Airbag Control Module|كمبيوتر الإيرباق'),
        ],
      },
      {
        nameEn: 'Dashboard & Controls',
        nameAr: 'الطبلون ولوحة القيادة',
        parts: [
          p('Dashboard|الطبلون#الداشبورد'),
          p('Instrument Cluster|عداد السيارة#ساعة السيارة'),
          p('Steering Wheel|عجلة القيادة#الدركسون (المقود)'),
          p('Center Console|الكونسول الأوسط'),
          p('AC Control Panel|لوحة تحكم المكيف'),
          p('Infotainment Screen|شاشة السيارة#المالتيميديا'),
          p('Glove Box|الكبت#صندوق القفازات'),
        ],
      },
      {
        nameEn: 'Interior Trim',
        nameAr: 'التكسيات الداخلية',
        parts: [
          p('Door Panel|تكسية الباب#بطانة الباب'),
          p('Headliner|تكسية السقف#سقف السيارة الداخلي'),
          p('Floor Mat|دواسة الأرضية#سجاد السيارة'),
          p('Sun Visor|واقي الشمس#الشمسية'),
        ],
      },
      {
        nameEn: 'Wipers & Pedals',
        nameAr: 'المساحات والدواسات',
        parts: [
          p('Windshield Wiper Motor|موتور المساحات'),
          p('Wiper Blade|ريشة المساحة'),
          p('Brake Pedal|دواسة الفرامل'),
          p('Accelerator Pedal|دواسة البنزين#دواسة الوقود'),
        ],
      },
    ],
  },
  {
    nameEn: 'AC & Climate Control',
    nameAr: 'التكييف والمكيف',
    subcategories: [
      {
        nameEn: 'AC System',
        nameAr: 'نظام التكييف',
        parts: [
          p('AC Compressor|كمبروسر المكيف'),
          p('AC Condenser|فبريكة المكيف#مكثف التكييف'),
          p('AC Evaporator|مبخر المكيف'),
          p('Blower Motor|موتور المكيف الداخلي#مروحة الكبينة'),
          p('Cabin Air Filter|فلتر المكيف الداخلي'),
          p('AC Compressor Clutch|كلتش الكمبروسر'),
        ],
      },
    ],
  },
  {
    nameEn: 'Fuel & Emissions',
    nameAr: 'الوقود والانبعاثات',
    subcategories: [
      {
        nameEn: 'Fuel System',
        nameAr: 'نظام الوقود',
        parts: [
          p('Fuel Tank|خزان البنزين#تنك الوقود'),
          p('Fuel Filter|فلتر البنزين'),
          p('Fuel Cap|غطاء تعبئة البنزين'),
          p('Fuel Rail|سكة الحقن'),
        ],
      },
    ],
  },
];

export function flattenPartsCount(): number {
  return partCategories.reduce(
    (sum, cat) =>
      sum + cat.subcategories.reduce((s, sub) => s + sub.parts.length, 0),
    0,
  );
}
