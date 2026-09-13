/* ======================================================================
   طبقة HTTP — موجّه بسيط بلا اعتماديات
   توجيه، قراءة الجسم، كوكيز، ملفات ثابتة، ورؤوس الأمان.
   ====================================================================== */

"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/* أخطاء يُقصد بها الرد على العميل، تمييزًا عن الأعطال غير المتوقعة */
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || null;
  }
}
const bad = (msg, code) => new HttpError(400, msg, code);
const unauthorized = (msg) => new HttpError(401, msg || "يلزم تسجيل الدخول");
const forbidden = (msg) => new HttpError(403, msg || "لا تملك صلاحية هذا الإجراء");
const notFound = (msg) => new HttpError(404, msg || "غير موجود");
const conflict = (msg, code) => new HttpError(409, msg, code);
const tooMany = (msg) => new HttpError(429, msg || "محاولات كثيرة، انتظر قليلًا");

class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    // "/api/products/:id" → تعبير نمطي مع أسماء المتغيرات
    const names = [];
    const rx = new RegExp(
      "^" +
        pattern.replace(/:[A-Za-z_]+/g, (m) => {
          names.push(m.slice(1));
          return "([^/]+)";
        }) +
        "$"
    );
    this.routes.push({ method, rx, names, handler });
    return this;
  }

  get(p, h) { return this.add("GET", p, h); }
  post(p, h) { return this.add("POST", p, h); }
  put(p, h) { return this.add("PUT", p, h); }
  patch(p, h) { return this.add("PATCH", p, h); }
  delete(p, h) { return this.add("DELETE", p, h); }

  match(method, pathname) {
    // HEAD يُخدَم بمعالج GET نفسه (send يحذف الجسم ويُبقي الترويسات)،
    // وإلا ردّ الخادم 405 على أدوات المراقبة وفحوص الصحة.
    const wanted = method === "HEAD" ? "GET" : method;
    let pathExists = false;
    for (const r of this.routes) {
      const m = r.rx.exec(pathname);
      if (!m) continue;
      pathExists = true;
      if (r.method !== wanted) continue;
      const params = {};
      r.names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
    // المسار موجود بفعل آخر: 405 أوضح من 404
    if (pathExists) throw new HttpError(405, "طريقة غير مسموحة على هذا المسار");
    return null;
  }
}

/* ---------------------------------------------------------- قراءة الجسم */

const MAX_BODY = 12 * 1024 * 1024; // يكفي صورة منتج مرفوعة كـdata URI

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "حجم الطلب أكبر من المسموح"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req, limit) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    const val = JSON.parse(buf.toString("utf8"));
    if (val === null || typeof val !== "object") throw new Error("ليس كائنًا");
    return val;
  } catch (e) {
    throw bad("جسم الطلب ليس JSON صالحًا");
  }
}

/* ------------------------------------------------------------- كوكيز */

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function cookie(name, value, opt = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`];
  bits.push(`Path=${opt.path || "/"}`);
  if (opt.maxAge != null) bits.push(`Max-Age=${Math.floor(opt.maxAge)}`);
  if (opt.expires) bits.push(`Expires=${opt.expires.toUTCString()}`);
  bits.push(`SameSite=${opt.sameSite || "Lax"}`);
  if (opt.httpOnly !== false) bits.push("HttpOnly");
  if (opt.secure) bits.push("Secure");
  return bits.join("; ");
}

/* ------------------------------------------------------------ الردود */

/* الأنواع التي يجدي ضغطها. الصور والفيديو مضغوطة أصلًا. */
const COMPRESSIBLE = /^(?:text\/|application\/(?:json|javascript|xml)|image\/svg)/;
const COMPRESS_MIN = 1024; // أصغر من هذا: الضغط أغلى من فائدته

function pickEncoding(req) {
  const accept = String((req && req.headers && req.headers["accept-encoding"]) || "");
  if (/\bbr\b/.test(accept)) return "br";
  if (/\bgzip\b/.test(accept)) return "gzip";
  return null;
}

function compressSync(buf, encoding) {
  return encoding === "br"
    ? zlib.brotliCompressSync(buf, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5, // توازن: سريع وضغط جيد
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
        },
      })
    : zlib.gzipSync(buf, { level: 6 });
}

function send(res, status, body, headers = {}) {
  const h = Object.assign(
    {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "SAMEORIGIN",
    },
    headers
  );

  // الضغط يُتفاوض عليه من الطلب نفسه (res.req)، فلا يتغيّر أي نداء قائم
  const type = String(h["Content-Type"] || "");
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""), "utf8");
  if (buf.length >= COMPRESS_MIN && COMPRESSIBLE.test(type) && !h["Content-Encoding"]) {
    const enc = pickEncoding(res.req);
    if (enc) {
      try {
        buf = compressSync(buf, enc);
        h["Content-Encoding"] = enc;
        h.Vary = h.Vary ? h.Vary + ", Accept-Encoding" : "Accept-Encoding";
      } catch { /* يُرسل بلا ضغط */ }
    }
  }
  h["Content-Length"] = buf.length;

  res.writeHead(status, h);
  if (res.req && res.req.method === "HEAD") return res.end();
  res.end(buf);
}

function sendJson(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  send(res, status, body, Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, headers));
}

/* ------------------------------------------------------ ملفات ثابتة */

function safeJoin(root, urlPath) {
  // يمنع ../ من الخروج خارج الجذر
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(root, clean);
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}

/* مجلدات وملفات لا تُخدَم أبدًا مهما كان جذر الملفات الثابتة.
   جذر المتجر هو المجلد الأب لمجلد الخادم، فبدون هذا المنع يصير
   /server/.env قابلًا للتنزيل ومعه مفاتيح بوابة الدفع. */
const DENY_SEGMENTS = new Set(["server", "node_modules", "data"]);

function isDenied(relPath) {
  const parts = relPath.split(/[/\\]/).filter(Boolean);
  if (!parts.length) return false;
  if (DENY_SEGMENTS.has(parts[0].toLowerCase())) return true;
  // أي ملف أو مجلد يبدأ بنقطة: .env و.git وما شابه
  return parts.some((p) => p.startsWith("."));
}

async function serveStatic(req, res, root, urlPath, { cache = "no-cache", allowAll = false } = {}) {
  let full = safeJoin(root, urlPath);
  if (!full) return false;
  if (!allowAll && isDenied(path.relative(root, full))) return false;

  let st;
  try {
    st = await fsp.stat(full);
  } catch {
    return false;
  }
  if (st.isDirectory()) {
    full = path.join(full, "index.html");
    try {
      st = await fsp.stat(full);
    } catch {
      return false;
    }
  }

  const type = MIME[path.extname(full).toLowerCase()] || "application/octet-stream";
  const etag = `W/"${st.size}-${st.mtimeMs.toString(36)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag, "Cache-Control": cache });
    return res.end(), true;
  }

  // النصية تُقرأ وتُضغط؛ الكبيرة وغير القابلة للضغط تُبَثّ كما هي
  const compressible = COMPRESSIBLE.test(type) && st.size >= COMPRESS_MIN && st.size <= 4 * 1024 * 1024;
  if (compressible && pickEncoding(req)) {
    const body = await fsp.readFile(full);
    send(res, 200, body, { "Content-Type": type, ETag: etag, "Cache-Control": cache });
    return true;
  }

  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": st.size,
    ETag: etag,
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") return res.end(), true;
  await new Promise((resolve, reject) => {
    const s = fs.createReadStream(full);
    s.pipe(res);
    s.on("end", resolve);
    s.on("error", reject);
  });
  return true;
}

/* --------------------------------------------------------------- CORS */

/* المتجر قد يُستضاف على نطاق غير نطاق الخادم (GitHub Pages مثلًا)،
   فنسمح للنطاقات المصرّح بها وحدها، لا لـ* — الكوكي لا يُرسل مع *. */
function applyCors(req, res, allowed) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!allowed.includes(origin)) {
    if (req.method === "OPTIONS") {
      send(res, 403, "");
      return false;
    }
    return true; // الطلب بلا كوكي سيفشل عند المصادقة على أي حال
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
    send(res, 204, "");
    return false;
  }
  return true;
}

module.exports = {
  Router, HttpError, MIME,
  bad, unauthorized, forbidden, notFound, conflict, tooMany,
  readBody, readJson, parseCookies, cookie,
  send, sendJson, serveStatic, safeJoin, applyCors, isDenied,
};
