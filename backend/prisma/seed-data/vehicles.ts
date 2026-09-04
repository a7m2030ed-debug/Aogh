// Vehicle makes + models sold/driven in Saudi Arabia — the practical
// reading of "جميع الماركات والموديلات" for a KSA parts marketplace.
// Not literally every vehicle ever made worldwide (unbounded, and useless
// for a used-parts search index dominated by what's actually on the road
// here) — every mainstream brand and its common models instead. Add rows
// as gaps show up in real dealer inventory; this is a seed, not a ceiling.
//
// Each model gets one broad VehicleTrim (yearFrom/yearTo) rather than a
// hand-enumerated generation-by-generation breakdown — precise generation
// boundaries aren't knowable in bulk without a per-model research pass,
// and a wide year range is enough for search/filter to work correctly.

export interface SeedModel {
  nameEn: string;
  nameAr: string;
  yearFrom?: number;
  yearTo?: number;
}

export interface SeedMake {
  nameEn: string;
  nameAr: string;
  models: SeedModel[];
}

const DEFAULT_YEAR_FROM = 1995;
const DEFAULT_YEAR_TO = 2026;

export const vehicleMakes: SeedMake[] = [
  {
    nameEn: 'Toyota', nameAr: 'تويوتا',
    models: ['Camry|كامري', 'Corolla|كورولا', 'Yaris|يارس', 'Avalon|أفالون',
      'Land Cruiser|لاند كروزر', 'Prado|برادو', 'Fortuner|فورتشنر', 'Hilux|هايلكس',
      'RAV4|راف فور', 'Highlander|هايلاندر', 'Sequoia|سيكويا', 'Tacoma|تاكوما',
      'Tundra|تندرا', 'Innova|إنوفا', 'Rush|راش', 'Corolla Cross|كورولا كروس',
      'C-HR|سي إتش آر', 'GR86|جي آر 86', 'Hiace|هايس', 'Coaster|كوستر'].map(parseModel),
  },
  {
    nameEn: 'Hyundai', nameAr: 'هيونداي',
    models: ['Elantra|إلنترا', 'Sonata|سوناتا', 'Accent|أكسنت', 'Tucson|توسان',
      'Santa Fe|سنتافي', 'Creta|كريتا', 'Palisade|باليسيد', 'Azera|أزيرا',
      'Veloster|فيلوستر', 'i10|آي 10', 'i20|آي 20', 'H1|إتش 1', 'Staria|ستاريا',
      'Kona|كونا'].map(parseModel),
  },
  {
    nameEn: 'Kia', nameAr: 'كيا',
    models: ['Cerato|سيراتو', 'K5|K5', 'Sportage|سبورتاج', 'Sorento|سورينتو',
      'Rio|ريو', 'Picanto|بيكانتو', 'Carnival|كارنيفال', 'Seltos|سلتوس',
      'Telluride|تيلورايد', 'Soul|سول'].map(parseModel),
  },
  {
    nameEn: 'Nissan', nameAr: 'نيسان',
    models: ['Altima|ألتيما', 'Sunny|صني', 'Sentra|سنترا', 'Maxima|ماكسيما',
      'Patrol|باترول', 'X-Trail|إكس تريل', 'Pathfinder|باثفايندر', 'Navara|نافارا',
      'Xterra|إكستيرا', 'Kicks|كيكس', 'Juke|جوك', 'Urvan|أورفان'].map(parseModel),
  },
  {
    nameEn: 'Chevrolet', nameAr: 'شفروليه',
    models: ['Malibu|ماليبو', 'Cruze|كروز', 'Optra|أوبترا', 'Aveo|أفيو',
      'Captiva|كابتيفا', 'Tahoe|تاهو', 'Suburban|سوبربان', 'Silverado|سلفرادو',
      'Camaro|كمارو', 'Traverse|ترافيرس', 'Trailblazer|تريل بليزر',
      'Groove|غروف'].map(parseModel),
  },
  {
    nameEn: 'Ford', nameAr: 'فورد',
    models: ['F-150|إف 150', 'Explorer|إكسبلورر', 'Expedition|إكسبيديشن',
      'Edge|إيدج', 'Escape|إسكيب', 'Taurus|توروس', 'Mustang|موستنج',
      'Ranger|رينجر', 'Territory|تيريتوري'].map(parseModel),
  },
  {
    nameEn: 'GMC', nameAr: 'جي إم سي',
    models: ['Yukon|يوكن', 'Sierra|سييرا', 'Terrain|تيرين', 'Acadia|أكاديا'].map(parseModel),
  },
  {
    nameEn: 'Lexus', nameAr: 'لكزس',
    models: ['ES|إي إس', 'LS|إل إس', 'IS|آي إس', 'RX|آر إكس', 'GX|جي إكس',
      'LX|إل إكس', 'NX|إن إكس', 'UX|يو إكس', 'LC|إل سي'].map(parseModel),
  },
  {
    nameEn: 'Mercedes-Benz', nameAr: 'مرسيدس بنز',
    models: ['C-Class|الفئة C', 'E-Class|الفئة E', 'S-Class|الفئة S',
      'GLC|جي إل سي', 'GLE|جي إل إي', 'GLS|جي إل إس', 'G-Class|الفئة G',
      'A-Class|الفئة A', 'CLA|سي إل إيه', 'Sprinter|سبرينتر', 'Vito|فيتو'].map(parseModel),
  },
  {
    nameEn: 'BMW', nameAr: 'بي إم دبليو',
    models: ['2 Series|الفئة الثانية', '3 Series|الفئة الثالثة',
      '4 Series|الفئة الرابعة', '5 Series|الفئة الخامسة', '7 Series|الفئة السابعة',
      'X1|إكس 1', 'X3|إكس 3', 'X5|إكس 5', 'X6|إكس 6', 'X7|إكس 7'].map(parseModel),
  },
  {
    nameEn: 'Mitsubishi', nameAr: 'ميتسوبيشي',
    models: ['Lancer|لانسر', 'Pajero|باجيرو', 'Outlander|أوتلاندر', 'L200|إل 200',
      'ASX|إيه إس إكس', 'Eclipse Cross|إكليبس كروس', 'Mirage|ميراج',
      'Attrage|أتراج'].map(parseModel),
  },
  {
    nameEn: 'Mazda', nameAr: 'مازدا',
    models: ['Mazda3|مازدا 3', 'Mazda6|مازدا 6', 'CX-3|سي إكس 3',
      'CX-5|سي إكس 5', 'CX-9|سي إكس 9', 'CX-30|سي إكس 30', 'MX-5|إم إكس 5',
      'BT-50|بي تي 50'].map(parseModel),
  },
  {
    nameEn: 'Honda', nameAr: 'هوندا',
    models: ['Accord|أكورد', 'Civic|سيفيك', 'CR-V|سي آر في', 'City|سيتي',
      'Pilot|بايلوت', 'HR-V|إتش آر في', 'Odyssey|أوديسي'].map(parseModel),
  },
  {
    nameEn: 'Isuzu', nameAr: 'إيسوزو',
    models: ['D-Max|دي ماكس', 'MU-X|إم يو إكس'].map(parseModel),
  },
  {
    nameEn: 'Jeep', nameAr: 'جيب',
    models: ['Wrangler|رانجلر', 'Grand Cherokee|جراند شيروكي', 'Cherokee|شيروكي',
      'Compass|كومباس', 'Renegade|رينيجيد', 'Gladiator|جلادييتر'].map(parseModel),
  },
  {
    nameEn: 'Dodge', nameAr: 'دودج',
    models: ['Charger|تشارجر', 'Challenger|تشالنجر', 'Durango|دورانجو',
      'Ram|رام'].map(parseModel),
  },
  {
    nameEn: 'Land Rover', nameAr: 'لاند روفر',
    models: ['Range Rover|رنج روفر', 'Range Rover Sport|رنج روفر سبورت',
      'Range Rover Evoque|رنج روفر إيفوك', 'Discovery|ديسكفري',
      'Defender|ديفندر'].map(parseModel),
  },
  {
    nameEn: 'Infiniti', nameAr: 'إنفينيتي',
    models: ['Q50|كيو 50', 'QX60|كيو إكس 60', 'QX80|كيو إكس 80',
      'Q70|كيو 70'].map(parseModel),
  },
  {
    nameEn: 'Audi', nameAr: 'أودي',
    models: ['A4|إيه 4', 'A6|إيه 6', 'A8|إيه 8', 'Q3|كيو 3', 'Q5|كيو 5',
      'Q7|كيو 7', 'Q8|كيو 8'].map(parseModel),
  },
  {
    nameEn: 'Volkswagen', nameAr: 'فولكسفاغن',
    models: ['Jetta|جيتا', 'Passat|باسات', 'Tiguan|تيغوان', 'Teramont|تيرامونت',
      'Golf|جولف'].map(parseModel),
  },
  {
    nameEn: 'Peugeot', nameAr: 'بيجو',
    models: ['208|208', '308|308', '3008|3008', '5008|5008', '508|508'].map(parseModel),
  },
  {
    nameEn: 'Renault', nameAr: 'رينو',
    models: ['Duster|داستر', 'Koleos|كوليوس', 'Megane|ميغان',
      'Symbol|سيمبول'].map(parseModel),
  },
  {
    nameEn: 'MG', nameAr: 'إم جي',
    models: ['MG5|إم جي 5', 'MG6|إم جي 6', 'ZS|زد إس', 'HS|إتش إس',
      'RX5|آر إكس 5', 'RX8|آر إكس 8'].map(parseModel),
  },
  {
    nameEn: 'Changan', nameAr: 'شانجان',
    models: ['CS35|سي إس 35', 'CS55|سي إس 55', 'CS75|سي إس 75', 'Eado|إيدو',
      'Alsvin|ألسفين'].map(parseModel),
  },
  {
    nameEn: 'GAC', nameAr: 'جي إيه سي',
    models: ['GS3|جي إس 3', 'GS4|جي إس 4', 'GS8|جي إس 8',
      'Empow|إمباو'].map(parseModel),
  },
  {
    nameEn: 'Geely', nameAr: 'جيلي',
    models: ['Emgrand|إمجراند', 'Coolray|كولراي', 'Azkarra|أزكارا',
      'Tugella|توجيلا'].map(parseModel),
  },
  {
    nameEn: 'BYD', nameAr: 'بي واي دي',
    models: ['F3|إف 3', 'Song|سونج', 'Han|هان', 'Tang|تانج',
      'Atto 3|أتو 3'].map(parseModel),
  },
  {
    nameEn: 'Suzuki', nameAr: 'سوزوكي',
    models: ['Swift|سويفت', 'Vitara|فيتارا', 'Ciaz|سياز', 'Baleno|بالينو',
      'Jimny|جيمني', 'Dzire|ديزاير'].map(parseModel),
  },
  {
    nameEn: 'Chery', nameAr: 'شيري',
    models: ['Tiggo 2|تيجو 2', 'Tiggo 4|تيجو 4', 'Tiggo 7|تيجو 7',
      'Tiggo 8|تيجو 8', 'Arrizo|أريزو'].map(parseModel),
  },
  {
    nameEn: 'Jaguar', nameAr: 'جاكوار',
    models: ['F-Pace|إف بيس', 'XE|إكس إي', 'XF|إكس إف',
      'E-Pace|إي بيس'].map(parseModel),
  },
  {
    nameEn: 'Volvo', nameAr: 'فولفو',
    models: ['XC40|إكس سي 40', 'XC60|إكس سي 60', 'XC90|إكس سي 90',
      'S60|إس 60', 'S90|إس 90'].map(parseModel),
  },
  {
    nameEn: 'MINI', nameAr: 'ميني',
    models: ['Cooper|كوبر', 'Countryman|كونتري مان'].map(parseModel),
  },
  {
    nameEn: 'Porsche', nameAr: 'بورش',
    models: ['Cayenne|كايين', 'Macan|ماكان', 'Panamera|باناميرا',
      '911|911'].map(parseModel),
  },
  {
    nameEn: 'Genesis', nameAr: 'جينيسيس',
    models: ['G70|جي 70', 'G80|جي 80', 'G90|جي 90', 'GV70|جي في 70',
      'GV80|جي في 80'].map(parseModel),
  },
  {
    nameEn: 'GWM/Haval', nameAr: 'جي دبليو إم / هافال',
    models: ['H6|إتش 6', 'H9|إتش 9', 'Jolion|جوليون',
      'Dargo|دارجو'].map(parseModel),
  },
  {
    nameEn: 'Subaru', nameAr: 'سوبارو',
    models: ['Forester|فورستر', 'Outback|أوتباك', 'XV|إكس في',
      'Legacy|ليجاسي', 'Impreza|إمبريزا'].map(parseModel),
  },
  {
    nameEn: 'Cadillac', nameAr: 'كاديلاك',
    models: ['Escalade|إسكاليد', 'XT5|إكس تي 5', 'XT6|إكس تي 6',
      'CT5|سي تي 5'].map(parseModel),
  },
  {
    nameEn: 'Lincoln', nameAr: 'لينكولن',
    models: ['Navigator|نافيغيتور', 'Aviator|أفييتور',
      'Corsair|كورسير'].map(parseModel),
  },
];

function parseModel(entry: string): SeedModel {
  const [nameEn, nameAr] = entry.split('|');
  return { nameEn, nameAr, yearFrom: DEFAULT_YEAR_FROM, yearTo: DEFAULT_YEAR_TO };
}
