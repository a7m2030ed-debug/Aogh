#!/usr/bin/env node
/* ======================================================================
   تعبئة كتالوج تجريبي
   ----------------------------------------------------------------------
   يعيد استعمال نفس الكتالوج المكتوب في assets/data.js حتى لا يكون
   للبذرة مصدران يفترقان. للتجربة والعرض فقط — المتجر الحقيقي يبدأ
   فارغًا وتُدخل أقمشتك من اللوحة.

   التشغيل:  node seed-demo.js  [--force]
   ====================================================================== */

"use strict";

const path = require("node:path");
const { Store } = require("./lib/store");
const CONFIG = require("./config");

/* assets/data.js مكتوب للمتصفح: نعطيه الحد الأدنى مما يتوقعه */
function loadBrowserCatalog() {
  const mem = new Map();
  const win = {
    localStorage: {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    },
  };
  win.window = win;
  global.window = win;
  global.localStorage = win.localStorage;
  global.console = console;

  delete require.cache[require.resolve("../assets/data.js")];
  require("../assets/data.js");
  const Shop = win.Shop || global.Shop;
  if (!Shop) throw new Error("تعذّر تحميل الكتالوج من assets/data.js");
  return Shop.DB.products();
}

async function main() {
  const force = process.argv.includes("--force");
  const { config } = CONFIG.build(__dirname);
  const store = new Store(config.dataDir);

  const existing = store.read("products", []);
  if (existing.length && !force) {
    console.log(`الكتالوج فيه ${existing.length} قماشًا. لاستبداله: node seed-demo.js --force`);
    return;
  }

  const raw = loadBrowserCatalog();
  // الحقول التي يضيفها الخادم ولا وجود لها في نسخة المتصفح
  const products = raw.map((p) => ({
    ...p,
    meter: { ...p.meter, reserved: 0 },
    bolt: { ...p.bolt, reserved: 0 },
    updatedAt: Date.now(),
  }));

  await store.mutate("products", [], () => products);
  console.log(`كُتب ${products.length} قماشًا في ${path.join(config.dataDir, "products.json")}`);
  console.log("الطلبات والإعدادات لم تُمَس.");
}

main().catch((e) => {
  console.error("تعذّرت التعبئة:", e.message);
  process.exit(1);
});
