# الخادم

```
node server.js
```

بلا `npm install` ولا مرحلة بناء: النظام يستعمل ما في Node نفسه — `node:sqlite` للقاعدة، و`node:zlib` لملفات إكسل، و`node:crypto` للتجزئة. يلزم **Node 22.5 فأحدث**.

عند أول تشغيل يُنشأ حساب `admin` وتُطبع كلمة مروره مرة واحدة في الطرفية، ويُطلب تغييرها عند أول دخول.

## المتغيّرات

انسخ `.env.example` إلى `.env`. الملف مستثنى في `.gitignore`، ولا يُكتب سرّ في الكود.

| المتغيّر | الافتراضي | ماذا يفعل |
|---|---|---|
| `NODE_ENV` | development | في `production` تُفرض فحوص الإقلاع |
| `PORT` · `HOST` | 3000 · 0.0.0.0 | منفذ الاستماع |
| `PUBLIC_URL` | http://localhost:PORT | العنوان العام. **يجب أن يكون https في الإنتاج** |
| `DATA_DIR` | `data` | القاعدة (`staff.db`) والمرفقات |
| `BACKUP_DIR` | `backups` | النسخ الاحتياطية — **اجعله على حجم آخر** |
| `BACKUP_HOUR` | 2 | ساعة النسخ اليومي، و`-1` لإيقافه |
| `BACKUP_RETENTION_DAYS` | 30 | مدة الاحتفاظ بالنسخ |
| `SESSION_IDLE_MINUTES` | 30 | انتهاء الجلسة بالخمول |
| `SESSION_MAX_HOURS` | 12 | الحد الأقصى المطلق لعمر الجلسة |
| `TRUST_PROXY` | 0 | `1` خلف Nginx ليُقرأ عنوان الزائر الحقيقي |
| `ALLOWED_ORIGINS` | = PUBLIC_URL | نطاقات إضافية مسموح لها بمناداة الواجهة |
| `MAX_UPLOAD_MB` | 10 | حد حجم المرفق الواحد |
| `ADMIN_USERNAME` · `ADMIN_PASSWORD` · `ADMIN_NAME` | admin · (عشوائية) · مدير النظام | الحساب الأول، ويُنشأ مرة واحدة |

**فحوص لا يقلع الإنتاج بدونها**: `PUBLIC_URL` على https، وكوكي محمي، ومجلد نسخ خارج مجلد البيانات.

## الأوامر

| | |
|---|---|
| `npm start` | تشغيل الخادم |
| `npm test` | ‎49‎ اختبارًا من طرف إلى طرف على خادم حقيقي |
| `npm run seed` | بيانات تجريبية (`node seed-demo.js --reset` يمسح أولًا) |
| `npm run backup` | نسخة احتياطية فورية، تصلح لمهمة cron |
| `node tools/restore.js` | عرض النسخ، و`node tools/restore.js <ملف>` للاستعادة |
| `npm run user list` | المستخدمون · `add` · `password` · `unlock` · `role` — للطوارئ |
| `node deploy/preflight.js <url>` | فحص ما قبل التسليم |

## الملفات

| | |
|---|---|
| `server.js` | التوجيه، وفحوص الجلسة وCSRF والصلاحية، وخدمة ملفات الواجهة |
| `lib/db.js` · `lib/schema.sql` | فتح القاعدة والمعاملات والترقية والقوائم الافتراضية، والمخطط |
| `lib/auth.js` · `lib/users.js` | كلمات المرور والجلسات والقفل، والحسابات ومصفوفة الصلاحيات |
| `lib/history.js` | **قلب النظام**: الفترات والإسنادات والحالات، وإعادة حساب اللقطة الحالية |
| `lib/employees.js` · `lib/movements.js` | الموظفون، والنقل والاستقالة وإنهاء الخدمة وإعادة التوظيف |
| `lib/attendance.js` · `lib/leaves.js` · `lib/discipline.js` | عمليات الموارد البشرية اليومية |
| `lib/reports.js` | **قواعد احتساب العدد** وكل التقارير |
| `lib/xlsx.js` · `lib/importer.js` · `lib/exports.js` | قراءة إكسل وكتابته، والاستيراد والتصدير |
| `lib/audit.js` · `lib/backup.js` · `lib/files.js` | سجل التدقيق، والنسخ، والمرفقات |
| `lib/http.js` · `lib/dates.js` · `lib/validate.js` | الموجّه ورؤوس الأمان، والتواريخ، وفحص المدخلات |

## المسارات

كلها تحت `/api`، وكلها تطلب جلسة عدا `/api/health` و`/api/auth/login`. وكل كتابة تطلب رأس `X-CSRF-Token`.

| | |
|---|---|
| `POST /api/auth/login` · `logout` · `password` · `GET /api/auth/me` | الجلسة |
| `GET /api/bootstrap` | المستخدم والقوائم والإعدادات والتعدادات في طلب واحد |
| `GET/POST /api/employees` · `GET/PATCH/DELETE /api/employees/:id` | الموظفون |
| `GET /api/employees/lookup?nationalId=` | بحث بتطابق تام |
| `GET /api/employees/:id/timeline` · `/stats` | الخط الزمني والمؤشرات |
| `POST /api/employees/:id/transfer` · `resignation` · `termination` · `retirement` · `rehire` · `archive` | الحركات |
| `GET /api/transfers` · `/api/separations` · `PATCH/DELETE /api/separations/:id` | سجلات الحركات |
| `/api/attendance` (+`/bulk`) · `/api/leaves` · `/api/disciplinary` · `/api/corrective` | العمليات اليومية |
| `/api/attachments` (+`/:id/download`) | المرفقات |
| `/api/reports/dashboard` · `period` · `monthly` · `annual` · `by-dimension` · `trend` · `headcount` | التقارير |
| `/api/export/*.xlsx` · `/api/import/employees/{preview,analyze,commit}` · `/api/import/template.xlsx` | التصدير والاستيراد |
| `/api/users` · `/api/sessions` · `/api/permissions` · `/api/settings` · `/api/audit` · `/api/login-log` · `/api/backups` | الإدارة |

## القاعدة

ملف واحد `DATA_DIR/staff.db` بوضع WAL، ومفاتيح أجنبية مفروضة، و`synchronous=FULL` — بيانات موظفين لا تُقايَض متانتها بالسرعة. النسخ الاحتياطي `VACUUM INTO`: نسخة متّسقة والقاعدة تعمل.

الاستعلامات كلها **معاملات مربوطة**؛ لا يوجد في النظام استعلام واحد يُبنى بلصق نصّ.
