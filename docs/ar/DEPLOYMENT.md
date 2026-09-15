# النشر الإنتاجي

[English](../DEPLOYMENT.md) | [العربية](DEPLOYMENT.md)

النشر المرفق مرجع لخادم Linux واحد. لا يوفر تلقائيًا تكرارًا بين مناطق أو نسخ ملفات خارج الخادم. لا تنشر CI أو عملية رفع المستودع أي خدمات إنتاجية.

## التجهيز

ثبّت Git وPython 3 وOpenSSL وDocker مع Compose، وراجع ميزانية الموارد والمنافذ. تتطلب التهيئة الأولى 40 GiB حرة على الأقل. تأكد من أن `/opt/astrafile` و`/srv/astrafile` والشبكة والمنافذ تخص هذا المشروع وحده. لا يثبت سكربت التهيئة Docker ولا يغير الجدار الناري أو SSH أو الوكيل المشترك.

من نسخة مصدر معتمدة على الخادم:

```sh
git clone https://github.com/gqn3/AstraFileHost.git
cd AstraFileHost
git checkout v1.0.0
sudo python3 scripts/provision.py --host files.example.com --release v1.0.0 --scope-reviewed
```

استبدل اسم المثال باسم تملكه. ترفض التهيئة تثبيتًا قائمًا، وتنشئ أسرارًا مستقلة تحت `/opt/astrafile/secrets` وإعدادات نشر غير سرية وإصدارًا منفصلًا. تختار منافذ متاحة بدءًا من 18443 و18444 وتنتج شهادة أولية ذاتية التوقيع. لا تشغّل التطبيق تلقائيًا.

ثبّت شهادة موثوقة ومفتاحها في المسارات المحددة داخل إعداد Nginx قبل فتح الخدمة للمستخدمين. احمِ المفتاح الخاص. مساعد شهادة IP اختياري ويتطلب عنوانًا تملكه والتحقق عبر المنفذ 80 ومراجعة مستقلة لوكيل المضيف؛ لا يحتاجه النشر المعتاد بشهادة نطاق.

## بدء الخدمات

```sh
cd /opt/astrafile/releases/v1.0.0
docker compose --env-file /opt/astrafile/deployment.env -f infra/compose/production.yml build
docker compose --env-file /opt/astrafile/deployment.env -f infra/compose/production.yml up -d astrafile-postgres astrafile-redis astrafile-storage
docker compose --env-file /opt/astrafile/deployment.env -f infra/compose/production.yml run --rm --no-deps astrafile-api node dist/migrate.mjs
docker compose --env-file /opt/astrafile/deployment.env -f infra/compose/production.yml run --rm --no-deps astrafile-api node dist/storage-init.mjs
docker compose --env-file /opt/astrafile/deployment.env -f infra/compose/production.yml up -d
```

انتظر جاهزية قاعدة البيانات وRedis والتخزين قبل أوامر الترحيل والتهيئة. أكمل `/setup` بالرمز الخاص وحساب المالك، ثم افحص `/health/ready` وصحة العامل ورفعًا صغيرًا وتنزيلًا مطابقًا للبصمة وطلبات Range عبر HTTPS موثوق.

يمر نقل S3 الموقّع عبر `/astrafile/` دون تخزين مؤقت للملفات في Nginx، ولا تمر البايتات عبر API. قاعدة البيانات وRedis ومنافذ إدارة التخزين خاصة، ومنفذ التخزين القديم محلي فقط.

## التحديث والاستعادة

تحقق من نظافة المستودع والإصدار المقصود. احتفظ بالأسرار ومجموعات المفاتيح ولا تعِد التهيئة الأولى. جهّز إصدارًا وصورًا منفصلة، وأنشئ نسخة وصفية مشفرة واختبر استعادتها مع التأكد من نسخ الملفات المستقلة قبل تغيير المخطط. أوقف API والعامل الخاصين بالمشروع عند الحاجة، وطبّق الترحيلات ثم أعد إنشاء الخدمات المتأثرة واختبر Nginx وأعد تحميله برفق.

قد تمنع ترحيلات قاعدة البيانات الرجوع إلى صورة أقدم؛ لا تتراجع عن الشيفرة عشوائيًا. تُبطل ترحيلات الخصوصية الروابط القديمة القصيرة دون حذف الملفات، ويجدد مالكوها روابطهم. احتفظ بالصور والنسخ المتوافقة.

هيّئ SMTP عند الحاجة، وراجع التفعيل والحصص والسياسات القانونية، واحفظ المفاتيح ونسخ الاستعادة في موقع محمي قابل للاسترجاع خارج الخادم. [النشر المفصل](../DEPLOYMENT.md) · [النسخ والاستعادة](../BACKUP_AND_RESTORE.md).
