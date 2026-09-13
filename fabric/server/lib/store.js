/* ======================================================================
   التخزين — ملفات JSON بكتابة ذرّية وقفل تسلسلي
   ----------------------------------------------------------------------
   لا اعتماديات: يكفي `node server.js`. حجم متجر أقمشة (عشرات الطلبات
   أسبوعيًا) لا يحتاج أكثر من هذا، والنسخ الاحتياطي نسخ مجلد واحد.

   الكتابة ذرّية: يُكتب ملف مؤقت ثم يُعاد تسميته، فانقطاع الكهرباء في
   منتصف الحفظ لا يترك ملفًا نصفه مكتوب. وكل كتابة تمرّ على قفل تسلسلي
   حتى لا يدهس طلبان متزامنان أحدهما الآخر.

   للانتقال إلى Postgres لاحقًا: استبدل هذا الملف وحده — بقية الخادم
   يتعامل معه عبر read/mutate فقط.
   ====================================================================== */

"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

class Store {
  constructor(dir) {
    this.dir = dir;
    this.cache = new Map();
    this.queue = Promise.resolve();
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "uploads"), { recursive: true });
  }

  file(name) {
    return path.join(this.dir, name + ".json");
  }

  /* قراءة: من الذاكرة إن كانت محمّلة، وإلا من القرص مرة واحدة */
  read(name, fallback) {
    if (this.cache.has(name)) return this.cache.get(name);
    let val = fallback;
    try {
      val = JSON.parse(fs.readFileSync(this.file(name), "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") {
        // ملف تالف: لا نمسحه ولا نتجاهله بصمت
        throw new Error(`تعذّرت قراءة ${name}.json: ${e.message}`);
      }
    }
    this.cache.set(name, val);
    return val;
  }

  /* تعديل متسلسل: fn تستقبل النسخة الحالية وتعيد الجديدة (أو تعدّلها) */
  mutate(name, fallback, fn) {
    const run = async () => {
      const cur = this.read(name, fallback);
      const next = await fn(cur);
      const val = next === undefined ? cur : next;
      await this.write(name, val);
      return val;
    };
    // كل التعديلات تتسلسل على طابور واحد، والخطأ لا يكسر الطابور
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  async write(name, val) {
    const target = this.file(name);
    const tmp = target + ".tmp-" + process.pid;
    await fsp.writeFile(tmp, JSON.stringify(val, null, 2), "utf8");
    await fsp.rename(tmp, target);
    this.cache.set(name, val);
  }

  /* نسخة احتياطية كاملة لكل المجموعات */
  snapshot(names) {
    const out = { v: 1, exportedAt: new Date().toISOString() };
    for (const n of names) out[n] = this.read(n, null);
    return out;
  }
}

module.exports = { Store };
