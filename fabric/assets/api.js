/* ======================================================================
   عميل الواجهة البرمجية
   ----------------------------------------------------------------------
   المتجر يعمل في وضعين، ويختار بينهما تلقائيًا بلا إعداد:

     · وضع الخادم  — إن ردّ /api/catalog. كل شيء من قاعدة البيانات:
                     الطلبات تصلك، والمخزون مشترك بين كل الأجهزة.
     · وضع العرض   — إن لم يردّ (GitHub Pages مثلًا). البيانات في
                     متصفح الزائر وحده، والدفع محاكاة. للمعاينة فقط.

   لتثبيت عنوان خادم مختلف عن عنوان الصفحة، ضع في الصفحة:
     <meta name="naseej-api" content="https://api.example.com">
   ====================================================================== */

(function (global) {
  "use strict";

  function detectBase() {
    const tag = document.querySelector('meta[name="naseej-api"]');
    if (tag && tag.content) return tag.content.replace(/\/+$/, "");
    if (location.protocol === "file:") return "";
    return location.origin;
  }

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code || null;
    }
  }

  const Api = {
    base: "",
    live: false,

    url(path) {
      return (this.base || "") + path;
    },

    async call(method, path, body, { timeout = 25000 } = {}) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      let res;
      try {
        res = await fetch(this.url(path), {
          method,
          credentials: "include",
          headers: body === undefined ? {} : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: ctl.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        if (e.name === "AbortError") throw new ApiError("انتهت مهلة الاتصال بالخادم", 0);
        throw new ApiError("تعذّر الاتصال بالخادم. تحقّق من الشبكة.", 0);
      }
      clearTimeout(timer);

      let data = null;
      const text = await res.text();
      if (text) { try { data = JSON.parse(text); } catch { /* ليس JSON */ } }

      if (!res.ok) {
        const msg = (data && data.error) || `تعذّر تنفيذ الطلب (${res.status})`;
        throw new ApiError(msg, res.status, data && data.code);
      }
      return data;
    },

    get(p) { return this.call("GET", p); },
    post(p, b) { return this.call("POST", p, b === undefined ? {} : b); },
    put(p, b) { return this.call("PUT", p, b); },
    patch(p, b) { return this.call("PATCH", p, b); },
    del(p) { return this.call("DELETE", p); },

    /* هل يوجد خادم؟ تُنادى مرة واحدة عند الإقلاع */
    async probe() {
      this.base = detectBase();
      try {
        const data = await this.call("GET", "/api/catalog", undefined, { timeout: 6000 });
        if (!data || !Array.isArray(data.products)) throw new Error("ردّ غير متوقّع");
        this.live = true;
        return data;
      } catch (e) {
        this.live = false;
        return null;
      }
    },

    /* ------------------------------------------------------ المتجر */

    catalog() { return this.get("/api/catalog"); },
    quote(items, carrier) { return this.post("/api/orders/quote", { items, carrier }); },
    placeOrder(payload) { return this.post("/api/orders", payload); },
    track(number, phone) {
      return this.get(`/api/orders/track?number=${encodeURIComponent(number)}&phone=${encodeURIComponent(phone)}`);
    },

    /* ------------------------------------------------------ اللوحة */

    login(username, password) { return this.post("/api/admin/login", { username, password }); },
    logout() { return this.post("/api/admin/logout"); },
    me() { return this.get("/api/admin/me"); },
    changePassword(currentPassword, newPassword) {
      return this.post("/api/admin/password", { currentPassword, newPassword });
    },
    adminData() { return this.get("/api/admin/data"); },
    createProduct(p) { return this.post("/api/admin/products", p); },
    updateProduct(id, p) { return this.put("/api/admin/products/" + encodeURIComponent(id), p); },
    deleteProduct(id) { return this.del("/api/admin/products/" + encodeURIComponent(id)); },
    patchStock(id, fields) { return this.patch(`/api/admin/products/${encodeURIComponent(id)}/stock`, fields); },
    patchOrder(id, fields) { return this.patch("/api/admin/orders/" + encodeURIComponent(id), fields); },
    cancelOrder(id) { return this.post(`/api/admin/orders/${encodeURIComponent(id)}/cancel`); },
    waybill(id) { return this.post(`/api/admin/orders/${encodeURIComponent(id)}/waybill`); },
    invoice(id) { return this.get(`/api/admin/orders/${encodeURIComponent(id)}/invoice`); },
    saveSettings(s) { return this.put("/api/admin/settings", s); },
    exportAll() { return this.get("/api/admin/export"); },
    importAll(obj) { return this.call("POST", "/api/admin/import", obj); },
  };

  global.NaseejApi = Api;
  global.ApiError = ApiError;
})(window);
