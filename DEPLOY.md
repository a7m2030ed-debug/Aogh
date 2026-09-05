# نشر قطعتي — Deploying

الهدف من هذا الملف: تنشر الباك إند وتحصل على دومين، لأن كل شي بعده
يعتمد عليه — تطبيق الجوال يحتاج رابط سيرفر حقيقي عشان يشتغل.

The container applies migrations and loads the catalog on boot, so a
fresh database needs no separate setup step. Pick one of the two paths.

---

## المسار الأول: Render (الأسهل — موصى به للبدء)

المستودع فيه ملف `render.yaml` يعرّف الخدمة وقاعدة البيانات معًا ويربطهما
تلقائيًا، فالنشر يصير "اربط المستودع واضغط تطبيق" بدل خطوات يدوية.

1. سجّل في [render.com](https://render.com) واربط حساب GitHub.
2. **New → Blueprint**، واختر هذا المستودع، والفرع
   `claude/mobile-app-gqyrfz`.
3. Render يقرأ `render.yaml` ويعرض عليك: خدمة `qitaati-api` وقاعدة بيانات
   `qitaati-db`. اختر الباقة (Render يسأل عنها — ما حدّدتها بالملف عمدًا
   حتى ما أختار نيابة عنك ما تدفعه) ثم **Apply**.
4. انتظر أول بناء. لما يخلص بيعطيك دومين مثل
   `https://qitaati-api.onrender.com`.

**رابط الـAPI عندك يصير:** `https://<دومينك>/api/v1`

ما يحتاج منك ضبط `DATABASE_URL` ولا `JWT_SECRET` — الملف يربط الأول
تلقائيًا ويولّد الثاني بقيمة عشوائية آمنة.

### التحقق إنه اشتغل

```bash
curl https://<دومينك>/api/v1/health          # {"status":"ok"}
curl https://<دومينك>/api/v1/catalog/vehicles/makes | head -c 200
```

الثاني لازم يرجع قائمة الماركات — إذا رجعت، فقاعدة البيانات اتصلت
والبيانات الأساسية تحمّلت.

---

## المسار الثاني: خادم خاص (VPS)

أرخص وتحكّم أكثر، لكن يدوي أكثر. يحتاج Docker على الخادم.

```bash
git clone <repo> && cd Aogh/backend
cp .env.example .env
```

عدّل `.env`:

```bash
POSTGRES_PASSWORD=$(openssl rand -base64 24)   # أضفه للملف
JWT_SECRET=$(openssl rand -base64 48)          # أضفه للملف
```

ثم:

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f api    # تابع الإقلاع
```

الخدمة تسمع على `127.0.0.1:3000` فقط — مو مكشوفة للإنترنت مباشرة. حط
أمامها Caddy أو nginx لشهادة TLS والدومين. مثال Caddy (سطرين):

```
api.your-domain.com {
    reverse_proxy 127.0.0.1:3000
}
```

---

## بعد النشر

### ١. رقّ حسابك لمشرف

سجّل دخول من التطبيق مرة برقمك (رمز التحقق `0000` ما دام
`OTP_PROVIDER=mock`)، ثم:

```bash
# Render: من Shell بلوحة التحكم | VPS:
docker compose -f docker-compose.prod.yml exec api npx prisma db execute \
  --stdin <<< "UPDATE users SET role='ADMIN' WHERE phone='+9665XXXXXXXX';"
```

ثم سجّل خروج ودخول عشان الصلاحية تسري.

### ٢. ابنِ تطبيق الجوال على دومينك

قل لي الدومين وأشغّل البناء وأعطيك رابط الـAPK — أو شغّله بنفسك:

```bash
flutter build apk --release \
  --dart-define=API_BASE_URL=https://<دومينك>/api/v1
```

### ٣. فعّل المزوّدين لما تجهز حساباتهم

كلهم تُضاف من إعدادات البيئة بدون أي تعديل كود — التفاصيل الكاملة لكل
متغيّر في `backend/.env.example`:

| | المتغيرات |
|---|---|
| رسائل SMS حقيقية | `OTP_PROVIDER=taqnyat` + `TAQNYAT_TOKEN` + `TAQNYAT_SENDER` |
| الإشعارات | `PUSH_PROVIDER=fcm` + `FCM_PROJECT_ID` + `FCM_CLIENT_EMAIL` + `FCM_PRIVATE_KEY` |
| رفع الصور | `STORAGE_BUCKET` + `STORAGE_ENDPOINT` + `STORAGE_PUBLIC_BASE_URL` + `STORAGE_ACCESS_KEY_ID` + `STORAGE_SECRET_ACCESS_KEY` |

**تقدر تجرّب التطبيق كامل قبل ما يجهز أي منها** — تسجيل الدخول يشتغل
برمز `0000`، والإشعارات تُكتب داخل التطبيق بدون تنبيه على الجهاز، والطلب
بدون صورة يشتغل عادي.

---

## ملاحظات

- **الترحيلات تُطبَّق عند كل إقلاع** (`docker-entrypoint.sh`). مناسب
  لنسخة واحدة من الخدمة؛ لو شغّلت أكثر من نسخة متوازية، افصل الترحيل
  لخطوة نشر مستقلة حتى ما تتسابق النسخ عليه.
- **`SEED_ON_START=false`** يوقف تحميل البيانات الأساسية عند الإقلاع.
  افتراضيًا شغّال، ويتخطّى نفسه فورًا إذا كانت البيانات موجودة.
- **صفحة Swagger مقفلة بالإنتاج** عمدًا. `SWAGGER_ENABLED=true` تفتحها
  لو احتجتها بخادم تجريبي.
- **حدود الطلبات وتخزين رموز التحقق داخل الذاكرة** — تكفي نسخة واحدة.
  الانتقال لـRedis هو التغيير المطلوب قبل تشغيل أكثر من نسخة.
