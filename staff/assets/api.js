/* ======================================================================
   طبقة الاتصال بالخادم
   ----------------------------------------------------------------------
   الجلسة في كوكي HttpOnly لا تصل إليه هذه الشيفرة، ومعها رمز CSRF
   يُرسَل في رأس مستقل مع كل كتابة. وانتهاء الجلسة يُعيد الواجهة إلى
   شاشة الدخول بدل أن يُظهر خطأ غامضًا.
   ====================================================================== */

(function () {
  "use strict";

  let csrf = "";
  const listeners = { unauthorized: [] };

  function qs(params) {
    if (!params) return "";
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "" || v === false) continue;
      u.append(k, Array.isArray(v) ? v.join(",") : String(v));
    }
    const s = u.toString();
    return s ? "?" + s : "";
  }

  class ApiError extends Error {
    constructor(status, payload) {
      super((payload && payload.error) || `HTTP ${status}`);
      this.status = status;
      this.code = (payload && payload.code) || null;
      this.details = (payload && payload.details) || null;
      this.field = this.details && this.details.field ? this.details.field : null;
    }
  }

  async function raw(method, path, body, opts = {}) {
    const headers = {};
    if (body !== undefined && !opts.formData) headers["Content-Type"] = "application/json";
    if (method !== "GET" && csrf) headers["X-CSRF-Token"] = csrf;

    let res;
    try {
      res = await fetch(path, {
        method, headers, credentials: "same-origin",
        body: body === undefined ? undefined : opts.formData ? body : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, { error: window.I18N.t("networkError") });
    }

    if (res.status === 401 && !opts.quiet) {
      listeners.unauthorized.forEach((fn) => fn());
    }
    if (opts.blob) {
      if (!res.ok) {
        let payload = null;
        try { payload = await res.json(); } catch { /* ليس JSON */ }
        throw new ApiError(res.status, payload);
      }
      const name = fileNameOf(res.headers.get("content-disposition"));
      return { blob: await res.blob(), filename: name };
    }

    let payload = null;
    const text = await res.text();
    if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
    if (!res.ok) throw new ApiError(res.status, payload);
    return payload;
  }

  function fileNameOf(header) {
    if (!header) return "download";
    const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (star) return decodeURIComponent(star[1]);
    const plain = /filename="([^"]+)"/i.exec(header);
    return plain ? decodeURIComponent(plain[1]) : "download";
  }

  const API = {
    get csrf() { return csrf; },
    setCsrf(v) { csrf = v || ""; },
    onUnauthorized(fn) { listeners.unauthorized.push(fn); },

    get: (path, params) => raw("GET", path + qs(params)),
    post: (path, body) => raw("POST", path, body === undefined ? {} : body),
    patch: (path, body) => raw("PATCH", path, body === undefined ? {} : body),
    put: (path, body) => raw("PUT", path, body === undefined ? {} : body),
    del: (path, body) => raw("DELETE", path, body === undefined ? {} : body),

    async login(username, password) {
      const r = await raw("POST", "/api/auth/login", { username, password }, { quiet: true });
      csrf = r.csrf;
      return r;
    },

    async logout() {
      try { await raw("POST", "/api/auth/logout", {}, { quiet: true }); } catch { /* الجلسة انتهت */ }
      csrf = "";
    },

    async bootstrap() {
      const r = await raw("GET", "/api/bootstrap", undefined, { quiet: true });
      csrf = r.csrf;
      return r;
    },

    async upload(path, formData) {
      return raw("POST", path, formData, { formData: true });
    },

    /* التنزيل يمرّ بنفس المصادقة: لا رابط عام لبيانات الموظفين */
    async download(path, params) {
      const { blob, filename } = await raw("GET", path + qs(params), undefined, { blob: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return filename;
    },
  };

  window.API = API;
  window.ApiError = ApiError;
})();
