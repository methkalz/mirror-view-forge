

# جعل أزرار التحكم متوافقة مع جميع المتصفحات والأجهزة (Safe Area)

## المشكلة
جميع الأزرار الأربعة (L, R, FIRE, ROLL) تستخدم `bottom: 95px` ثابت. على الهواتف ذات الشريط السفلي (مثل iPhone مع Home Indicator أو متصفحات بشريط عنوان سفلي مثل Safari/Chrome)، يمكن أن تتداخل الأزرار مع المنطقة المحجوزة للنظام وتصبح غير قابلة للاستخدام.

## الحل

### 1. `index.html` — تفعيل Safe Area
- إضافة `viewport-fit=cover` لعنصر meta viewport ليسمح للتطبيق بالامتداد تحت المناطق المحجوزة

### 2. `src/index.css` — متغير CSS للمسافة الآمنة
- إضافة متغير CSS مخصص يحسب المسافة السفلية:
  - `--safe-bottom: env(safe-area-inset-bottom, 0px)`
- هذا يعمل تلقائياً: على الأجهزة بدون notch/bar يكون 0، وعلى iPhone مثلاً يكون ~34px

### 3. `src/components/SkyfallGame.tsx` — تعديل مواقع الأزرار
- استبدال `bottom: 95` الثابت بحساب ديناميكي يأخذ بالاعتبار Safe Area
- استخدام CSS `calc()` مع `env(safe-area-inset-bottom)`:
  - `bottom: calc(95px + env(safe-area-inset-bottom, 0px))`
- تطبيق هذا على جميع الأزرار الأربعة (L, R, FIRE, ROLL)

## التدفق
```text
جهاز عادي (بدون شريط سفلي):  bottom = 95px + 0 = 95px (كما هو)
iPhone مع Home Indicator:     bottom = 95px + 34px = 129px (مرفوع)
متصفح بشريط عنوان سفلي:      bottom = 95px + Xpx (مرفوع تلقائياً)
```

## الملفات المتأثرة
- `index.html` — إضافة `viewport-fit=cover`
- `src/index.css` — متغير safe area
- `src/components/SkyfallGame.tsx` — تحديث bottom لجميع الأزرار

