

# ترقية شاشة البداية إلى تجربة احترافية سينمائية

## ملخص
تحويل شاشة إدخال الاسم (NameEntry) إلى شاشة بداية سينمائية مع: شرار متحرك بالخلفية، تأثير زجاج بلوري (Glassmorphism) محسّن، شعار قابل للتحكم من لوحة الأدمن، اسم المطور، وموسيقى خاصة تتوقف عند الانتقال للعبة.

---

## التغييرات المطلوبة

### 1. قاعدة البيانات — إضافة حقول Branding لجدول `game_config`

إضافة أعمدة جديدة:
- `logo_url` (text, nullable) — رابط الشعار المخصص من Storage
- `game_title` (text, default 'SKYFALL') — اسم اللعبة
- `game_subtitle` (text, default 'SURVIVAL') — العنوان الفرعي
- `developer_name` (text, default 'CAILOR GG') — اسم المطور
- `developer_url` (text, nullable) — رابط المطور

إضافة صف في `audio_config` لصوت `menu_music` (فئة `ui`) للتحكم بموسيقى شاشة البداية.

### 2. `src/components/NameEntry.tsx` — إعادة تصميم كاملة

- **خلفية شرار (Spark Particles):** Canvas مخفي يرسم جزيئات شرار صغيرة متحركة بالخلفية (50-80 جزيء) بألوان برتقالية/ذهبية تتحرك للأعلى وتتلاشى
- **Glassmorphism محسّن:** تأثير زجاج بلوري أعمق مع حدود مضيئة خفيفة وظلال داخلية
- **الشعار:** يُجلب من `game_config` (إذا وُجد `logo_url` يعرض الصورة، وإلا يعرض النص)
- **اسم المطور:** يظهر أسفل الشاشة بخط صغير أنيق "Developed by CAILOR GG"
- **موسيقى البداية:** تشغيل `menu_music` من نظام الصوت عند عرض الشاشة، وإيقافها عند الضغط على "ابدأ المعركة"
- **Props جديدة:** `config` يحتوي على `logoUrl`, `gameTitle`, `gameSubtitle`, `developerName`

### 3. `src/game/config.ts` — توسيع `RemoteGameConfig`

إضافة الحقول الجديدة للـ interface وتحديث `fetchGameConfig` و `updateGameConfig` لقراءتها وكتابتها.

### 4. `src/game/audio.ts` — إضافة `sfxMenuMusic`

دالة تشغيل موسيقى القائمة (loop) مع دالة إيقاف `stopMenuMusic()`. تستخدم نظام الملفات المخصصة إن وُجد، وإلا تولّد نغمة ambient خفيفة.

### 5. `src/components/SkyfallGame.tsx` — تمرير Config للشاشة

تمرير بيانات Branding من `remoteConfig` إلى مكون `NameEntry`، واستدعاء `stopMenuMusic()` عند `handleNameSubmit`.

### 6. `src/pages/Admin.tsx` — قسم Branding في لوحة التحكم

إضافة قسم "العلامة التجارية" ضمن تبويب Config يتضمن:
- رفع/تغيير الشعار (من Storage bucket `game-audio` أو bucket جديد `game-assets`)
- تعديل اسم اللعبة والعنوان الفرعي
- تعديل اسم المطور ورابطه
- معاينة مباشرة للشعار

---

## ترتيب التنفيذ

1. Migration — إضافة أعمدة Branding + صف `menu_music`
2. `config.ts` — توسيع الـ interface والدوال
3. `audio.ts` — إضافة `sfxMenuMusic` / `stopMenuMusic`
4. `NameEntry.tsx` — إعادة التصميم الكامل (شرار + زجاج + شعار + مطور + موسيقى)
5. `SkyfallGame.tsx` — ربط Config وإيقاف الموسيقى
6. `Admin.tsx` — قسم Branding

