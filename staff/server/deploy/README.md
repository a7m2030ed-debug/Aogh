# النشر

بيانات الموظفين تحتاج **خادمًا يعمل دائمًا**، و**https**، و**نسخًا احتياطية خارج الجهاز**. لا يُشغَّل النظام من جهاز شخصي.

---

## ١ · خادم VPS — الطريق الموصى به

خادم أوبونتو أو دبيان جديد (‎1‎ نواة و‎1‎ غيغا تكفي مئات الموظفين)، ونطاق سجل `A` له يشير إليه.

```bash
# على جهازك: انسخ مجلد staff إلى الخادم
scp -r staff root@<عنوان-الخادم>:/root/

# على الخادم
cd /root/staff
sudo bash server/deploy/setup.sh staff.example.com hr@example.com
```

السكربت يفعل كل شيء، وتشغيله مرة أخرى يحدّث ولا يمسّ البيانات:

| | |
|---|---|
| **Node 22** | يُثبَّت إن لم يكن، ويُتحقق من وجود `node:sqlite` |
| **مستخدم نظام** `staffhr` | بلا صدفة دخول، ويملك الملفات والبيانات وحده |
| **خدمة systemd** | تعمل وتعود بعد إعادة التشغيل، ومقيَّدة: `ProtectSystem=strict` ولا تكتب إلا في مجلدَي البيانات والنسخ |
| **Nginx** | وسيط على ‎443‎، يمرّر عنوان الزائر الحقيقي، ويحدّ حجم المرفوع |
| **شهادة https** | Let's Encrypt تتجدّد تلقائيًا |
| **جدار ناري** | ‎22‎ و‎80‎ و‎443‎ فقط |
| **نسخ احتياطي** | يومي في `/var/backups/staff` عبر `cron.daily`، **خارج** مجلد البيانات |

كلمة مرور أول دخول:

```bash
journalctl -u staff | grep -A3 'الحساب الأول'
```

ثم الفحص:

```bash
cd /srv/staff/server && node deploy/preflight.js https://staff.example.com
```

### التحديث لاحقًا

```bash
scp -r staff root@<الخادم>:/root/ && ssh root@<الخادم> \
  'cd /root/staff && sudo bash server/deploy/setup.sh staff.example.com hr@example.com'
```

البيانات في `/var/lib/staff` لا يلمسها التحديث، والقاعدة تُرقّى وحدها عند الإقلاع إن لزم.

---

## ٢ · حاوية

```bash
cd staff
PUBLIC_URL=https://staff.example.com docker compose -f server/deploy/docker-compose.yml up -d
docker compose -f server/deploy/docker-compose.yml logs | grep -A3 'الحساب الأول'
```

المنفذ مربوط بـ`127.0.0.1` عمدًا: ضع أمامه Nginx بشهادة (ملف `nginx.conf` هنا جاهز للنسخ). البيانات في حجم `staff-data` والنسخ في `staff-backups`، وكلاهما يبقى بعد كل تحديث:

```bash
docker run --rm -v staff-backups:/b -v "$PWD":/out alpine \
  tar czf /out/staff-backups-$(date +%F).tar.gz -C /b .
```

---

## ٣ · تشغيل مباشر (تجربة أو شبكة داخلية)

```bash
cd staff/server && node server.js
```

يصلح للتجربة أو لشبكة داخلية مغلقة. للإنتاج يلزم ما سبق: https وخدمة تعمل دائمًا ونسخ خارج الجهاز.

---

## بعد النشر

| | |
|---|---|
| **غيّر كلمة المرور الأولى** | يطلبها النظام عند أول دخول |
| **أنشئ حسابات المستخدمين** | بأدوارها، واحصر المديرين بفروعهم |
| **راجع القوائم** | الفروع والأقسام والمسميات وأنواع الإجازات من شاشة الإدارة |
| **اضبط الإعدادات** | أيام العمل، وقت الدوام، مهلة التأخير، مدة التجربة، عدد أرقام الهوية |
| **استورد الموظفين** | من شاشة الاستيراد بعد تنزيل القالب |
| **انسخ النسخ الاحتياطية خارج الخادم** | إلى تخزين سحابي أو جهاز آخر — نسخة على نفس الجهاز لا تنجو من عطبه |

## استعادة نسخة

```bash
systemctl stop staff
cd /srv/staff/server
node tools/restore.js                      # يعرض النسخ
node tools/restore.js staff-2026….db       # يستعيد، ويحتفظ بالقاعدة الحالية
systemctl start staff
```
