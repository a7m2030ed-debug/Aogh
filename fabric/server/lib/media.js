/* ======================================================================
   الوسائط — الصور والفيديو تُخزَّن ملفات لا داخل المنتج
   ----------------------------------------------------------------------
   كانت الصور تُحفظ داخل المنتج نفسه كـdata URI، فيخرج ردّ الكتالوج
   بمئات الكيلوبايتات لكل زائر، وتُعاد الصور كاملةً مع كل تحميل للصفحة
   لأن الرد لا يُخزَّن مؤقتًا. هنا تُكتب ملفًا على القرص ويحمل المنتج
   مسارها فقط:

     · ردّ الكتالوج يصغر إلى بضعة كيلوبايتات فيُضغط ويُخزَّن مؤقتًا.
     · كل صورة تُطلب مرة واحدة ويخزّنها المتصفح للأبد.
     · المتصفح لا يحمّل إلا صور ما يراه الزائر فعلًا.

   الاسم من تجزئة المحتوى، فالصورة المكررة تُكتب مرة واحدة، والمسار
   لا يتغيّر ما لم يتغيّر المحتوى — وهذا ما يجعل التخزين الأبدي آمنًا.
   ====================================================================== */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const MAX_IMAGE = 6 * 1024 * 1024;
const MAX_VIDEO = 12 * 1024 * 1024;

const DATA_URI = /^data:([a-z0-9.+/-]+);(base64,|charset=[^,]*,)?(.*)$/is;

function parseDataUri(src) {
  const m = DATA_URI.exec(String(src));
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const isBase64 = /base64,/i.test(m[2] || "");
  const raw = m[3] || "";
  let buf;
  try {
    buf = isBase64 ? Buffer.from(raw, "base64") : Buffer.from(decodeURIComponent(raw), "utf8");
  } catch {
    return null;
  }
  return { mime, buf };
}

class Media {
  constructor(dataDir) {
    this.dir = path.join(dataDir, "uploads");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /* يكتب data URI ملفًا ويعيد مساره النسبي، أو يعيد المسار كما هو إن
     كان ملفًا مخزَّنًا أصلًا. */
  async store(src, { video = false } = {}) {
    const s = String(src || "");
    if (/^uploads\/[A-Za-z0-9_.-]+$/.test(s)) return s; // مخزَّن سابقًا

    const parsed = parseDataUri(s);
    if (!parsed) throw new Error("صيغة الوسيط غير مدعومة");

    const ext = EXT[parsed.mime];
    if (!ext) throw new Error(`نوع غير مدعوم: ${parsed.mime}`);
    if (video && !/^video\//.test(parsed.mime)) throw new Error("المتوقع فيديو");
    if (!video && !/^image\//.test(parsed.mime)) throw new Error("المتوقع صورة");

    const limit = video ? MAX_VIDEO : MAX_IMAGE;
    if (parsed.buf.length > limit) {
      throw new Error(`الملف أكبر من ${Math.round(limit / 1024 / 1024)} ميغابايت`);
    }

    const hash = crypto.createHash("sha256").update(parsed.buf).digest("hex").slice(0, 20);
    const name = `${hash}.${ext}`;
    const full = path.join(this.dir, name);

    // الاسم من التجزئة: وجود الملف يعني أن محتواه هو هو
    if (!fs.existsSync(full)) {
      const tmp = full + ".tmp-" + process.pid;
      await fsp.writeFile(tmp, parsed.buf);
      await fsp.rename(tmp, full);
    }
    return "uploads/" + name;
  }

  /* يحوّل صور المنتج وفيديوه إلى ملفات قبل حفظه */
  async storeProductMedia(input) {
    const out = Object.assign({}, input);
    if (Array.isArray(input.images)) {
      out.images = [];
      for (const [i, src] of input.images.entries()) {
        try {
          out.images.push(await this.store(src));
        } catch (e) {
          throw new Error(`الصورة ${i + 1}: ${e.message}`);
        }
      }
    }
    if (input.video && input.video.kind === "file" && input.video.src) {
      try {
        out.video = { kind: "file", src: await this.store(input.video.src, { video: true }) };
      } catch (e) {
        throw new Error(`الفيديو: ${e.message}`);
      }
    }
    return out;
  }

  /* ترحيل ما حُفظ سابقًا داخل المنتجات كـdata URI إلى ملفات.
     يُنادى عند الإقلاع، ولا يفعل شيئًا إن لم يبقَ شيء للترحيل. */
  async migrateProducts(products) {
    let moved = 0;
    let bytes = 0;
    for (const p of products) {
      if (Array.isArray(p.images)) {
        for (let i = 0; i < p.images.length; i++) {
          if (!String(p.images[i]).startsWith("data:")) continue;
          bytes += p.images[i].length;
          try { p.images[i] = await this.store(p.images[i]); moved++; } catch { /* تُترك */ }
        }
      }
      if (p.video && p.video.kind === "file" && String(p.video.src || "").startsWith("data:")) {
        bytes += p.video.src.length;
        try { p.video.src = await this.store(p.video.src, { video: true }); moved++; } catch { /* تُترك */ }
      }
    }
    return { moved, bytes };
  }

  /* ملفات لم يعد يشير إليها أي منتج */
  async sweep(products) {
    const used = new Set();
    for (const p of products) {
      (p.images || []).forEach((s) => used.add(String(s).replace("uploads/", "")));
      if (p.video && p.video.src) used.add(String(p.video.src).replace("uploads/", ""));
    }
    let removed = 0;
    for (const name of await fsp.readdir(this.dir)) {
      if (name.endsWith(".tmp-" + process.pid)) continue;
      if (used.has(name)) continue;
      await fsp.unlink(path.join(this.dir, name)).then(() => removed++).catch(() => {});
    }
    return removed;
  }
}

module.exports = { Media, parseDataUri, EXT };
