/* ======================================================================
   طبقة HTTP — موجّه بسيط بلا اعتماديات
   توجيه، قراءة الجسم، multipart، كوكيز، ملفات ثابتة، ورؤوس الأمان.
   ====================================================================== */

"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

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
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv; charset=utf-8",
};

/* أخطاء يُقصد بها الرد على العميل، تمييزًا عن الأعطال غير المتوقعة */
class HttpError extends Error {
  constructor(status, message, code, extra) {
    super(message);
    this.status = status;
    this.code = code || null;
    this.extra = extra || null;
  }
}
const bad = (msg, code, extra) => new HttpError(400, msg, code, extra);
const unauthorized = (msg, code) => new HttpError(401, msg || "يلزم تسجيل الدخول", code || "unauthenticated");
const forbidden = (msg) => new HttpError(403, msg || "لا تملك صلاحية هذا الإجراء", "forbidden");
const notFound = (msg) => new HttpError(404, msg || "غير موجود", "not_found");
const conflict = (msg, code, extra) => new HttpError(409, msg, code, extra);
const tooMany = (msg) => new HttpError(429, msg || "محاولات كثيرة، انتظر قليلًا", "rate_limited");

class Router {
  constructor() { this.routes = []; }

  add(method, pattern, handler) {
    const names = [];
    const rx = new RegExp(
      "^" + pattern.replace(/[.]/g, "\\.").replace(/:[A-Za-z_]+/g, (m) => {
        names.push(m.slice(1));
        return "([^/]+)";
      }) + "$"
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
    let pathExists = false;
    for (const r of this.routes) {
      const m = r.rx.exec(pathname);
      if (!m) continue;
      pathExists = true;
      if (r.method !== method) continue;
      const params = {};
      r.names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
    if (pathExists) throw new HttpError(405, "طريقة غير مسموحة على هذا المسار");
    return null;
  }
}

/* ---------------------------------------------------------- قراءة الجسم */

function readBody(req, limit) {
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

async function readJson(req, limit = 2 * 1024 * 1024) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    const val = JSON.parse(buf.toString("utf8"));
    if (val === null || typeof val !== "object") throw new Error("ليس كائنًا");
    return val;
  } catch {
    throw bad("جسم الطلب ليس JSON صالحًا");
  }
}

/* ------------------------------------------------------------ multipart */

/* قارئ multipart/form-data مختصر: يكفي رفع مرفق أو ملف إكسل واحد.
   لا يُكتب أي شيء على القرص هنا — المنادي هو من يقرر. */
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) throw bad("طلب الرفع بلا حدّ فاصل (boundary)");
  const boundary = Buffer.from("--" + (m[1] || m[2]).trim());
  const fields = {};
  const files = [];

  let idx = buf.indexOf(boundary);
  while (idx >= 0) {
    const start = idx + boundary.length;
    if (buf.slice(start, start + 2).toString("latin1") === "--") break; // نهاية المتن
    const next = buf.indexOf(boundary, start);
    if (next < 0) break;

    let chunk = buf.slice(start, next);
    if (chunk.slice(0, 2).toString("latin1") === "\r\n") chunk = chunk.slice(2);
    if (chunk.slice(-2).toString("latin1") === "\r\n") chunk = chunk.slice(0, -2);

    const sep = chunk.indexOf("\r\n\r\n");
    if (sep > 0) {
      const head = chunk.slice(0, sep).toString("utf8");
      const body = chunk.slice(sep + 4);
      const disp = /content-disposition:([^\r\n]*)/i.exec(head);
      if (disp) {
        const name = /name="([^"]*)"/i.exec(disp[1]);
        const filename = /filename="([^"]*)"/i.exec(disp[1]);
        const type = /content-type:\s*([^\r\n;]+)/i.exec(head);
        if (filename) {
          if (filename[1]) {
            files.push({
              field: name ? name[1] : "file",
              filename: filename[1],
              mime: type ? type[1].trim() : "application/octet-stream",
              data: body,
            });
          }
        } else if (name) {
          fields[name[1]] = body.toString("utf8");
        }
      }
    }
    idx = next;
  }
  return { fields, files };
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
  bits.push(`SameSite=${opt.sameSite || "Strict"}`);
  if (opt.httpOnly !== false) bits.push("HttpOnly");
  if (opt.secure) bits.push("Secure");
  return bits.join("; ");
}

/* ------------------------------------------------------------ الردود */

/* رؤوس أمان على كل رد:
   - CSP يمنع أي سكربت خارجي أو inline، فحتى لو تسرّب نص خبيث لم يُنفَّذ.
   - nosniff يمنع المتصفح من تخمين نوع مرفق مرفوع.
   - frame-ancestors none يمنع وضع النظام داخل إطار (clickjacking). */
function securityHeaders(secure) {
  const h = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; " +
      "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; " +
      "form-action 'self'; frame-ancestors 'none'",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  if (secure) h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return h;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, Object.assign({}, res.baseHeaders || {}, headers));
  res.end(body);
}

function sendJson(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), Object.assign(
    { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, headers));
}

/* ------------------------------------------------------ ملفات ثابتة */

function safeJoin(root, urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(root, clean);
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}

/* مجلدات لا تُخدَم أبدًا: جذر الواجهة هو أب مجلد الخادم، فبدون هذا
   المنع يصير /server/.env و/server/data/staff.db قابلين للتنزيل. */
const DENY_SEGMENTS = new Set(["server", "node_modules", "data", "backups"]);

function isDenied(relPath) {
  const parts = relPath.split(/[/\\]/).filter(Boolean);
  if (!parts.length) return false;
  if (DENY_SEGMENTS.has(parts[0].toLowerCase())) return true;
  return parts.some((p) => p.startsWith("."));
}

async function serveStatic(req, res, root, urlPath, { cache = "no-cache" } = {}) {
  let full = safeJoin(root, urlPath);
  if (!full) return false;
  if (isDenied(path.relative(root, full))) return false;

  let st;
  try { st = await fsp.stat(full); } catch { return false; }
  if (st.isDirectory()) {
    full = path.join(full, "index.html");
    try { st = await fsp.stat(full); } catch { return false; }
  }

  const type = MIME[path.extname(full).toLowerCase()] || "application/octet-stream";
  const etag = `W/"${st.size}-${st.mtimeMs.toString(36)}"`;
  if (req.headers["if-none-match"] === etag) {
    send(res, 304, "", { ETag: etag, "Cache-Control": cache });
    return true;
  }

  res.writeHead(200, Object.assign({}, res.baseHeaders || {}, {
    "Content-Type": type,
    "Content-Length": st.size,
    ETag: etag,
    "Cache-Control": cache,
  }));
  if (req.method === "HEAD") { res.end(); return true; }
  await new Promise((resolve, reject) => {
    const s = fs.createReadStream(full);
    s.pipe(res);
    s.on("end", resolve);
    s.on("error", reject);
  });
  return true;
}

/* --------------------------------------------------------------- CORS */

function applyCors(req, res, allowed) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!allowed.includes(origin)) {
    if (req.method === "OPTIONS") { send(res, 403, ""); return false; }
    return true; // بلا كوكي، وسيسقط عند المصادقة
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-CSRF-Token");
    res.setHeader("Access-Control-Max-Age", "600");
    send(res, 204, "");
    return false;
  }
  return true;
}

module.exports = {
  Router, HttpError, MIME,
  bad, unauthorized, forbidden, notFound, conflict, tooMany,
  readBody, readJson, parseMultipart, parseCookies, cookie,
  send, sendJson, serveStatic, safeJoin, applyCors, isDenied, securityHeaders,
};
