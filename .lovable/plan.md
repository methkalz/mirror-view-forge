

# ترقية لوحة التحكم — تصميم Desktop-first احترافي (Elegant Minimal)

## المشكلة الحالية
- لوحة التحكم مصممة بـ `maxWidth: 600px` — مناسبة فقط للموبايل
- جميع الأنماط inline styles بدون responsive design
- لا يوجد sidebar أو تخطيط احترافي للحواسيب

## التصميم الجديد

```text
┌─────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────────────────────────────┐ │
│  │ SIDEBAR  │  │         MAIN CONTENT             │ │
│  │          │  │                                  │ │
│  │ ☄ Skyfall│  │  ┌────────┐ ┌────────┐ ┌──────┐ │ │
│  │          │  │  │ Card 1 │ │ Card 2 │ │Card 3│ │ │
│  │ 📊 Stats │  │  └────────┘ └────────┘ └──────┘ │ │
│  │ 🎮 Config│  │                                  │ │
│  │ 🎨 Brand │  │  ┌──────────────────────────────┐│ │
│  │ 🌊 Waves │  │  │     Section Content          ││ │
│  │ 🔊 Audio │  │  │     (Grid layout)            ││ │
│  │ 🏆 Board │  │  └──────────────────────────────┘│ │
│  │          │  │                                  │ │
│  │ ─────── │  │                                  │ │
│  │ 🚪Logout│  │                                  │ │
│  └──────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

على الموبايل: الـ sidebar يتحول لـ top navigation كما هو حالياً.

## التغييرات

### 1. `src/pages/Admin.tsx` — إعادة هيكلة كاملة

**Layout:**
- إزالة `maxWidth: 600px` — استخدام layout مرن full-width
- Desktop (`≥1024px`): Sidebar ثابت يسار (240px) + main content يمين
- Tablet (`768-1023px`): Sidebar مصغر (icons only 64px) + content
- Mobile (`<768px`): بدون sidebar، tabs أفقية كما هو

**Sidebar (Desktop):**
- شعار اللعبة + اسمها بالأعلى
- قائمة التبويبات عمودياً بأيقونات + نص
- التبويب النشط بخلفية خفيفة وخط جانبي ملون
- زر Logout بالأسفل
- تصميم minimal: خلفية `rgba(255,255,255,0.02)` مع حد يمين رفيع

**Main Content Area:**
- `max-width: 1200px` مع `margin: auto`
- Header بعنوان التبويب الحالي + زر Refresh
- Analytics cards في grid: 4 أعمدة على desktop، 2 على tablet
- Config sliders في grid عمودين على desktop
- جميع الأقسام بتصميم متسق: cards بـ `border-radius: 12px` وظلال خفيفة

**Typography & Colors (Elegant Minimal):**
- ألوان أساسية: slate-900 background، أبيض/رمادي للنصوص
- لون مميز واحد (blue-500) للعناصر النشطة
- خطوط أكبر للعناوين (24px بدل 16px)
- مسافات أوسع بين العناصر (padding 24-32px بدل 16-20px)

### 2. `src/pages/AdminLogin.tsx` — تحسين طفيف
- توسيع العرض على desktop إلى `max-width: 420px`
- إضافة شعار اللعبة فوق النموذج

### 3. `src/hooks/use-mobile.tsx` — موجود بالفعل، سيتم استخدامه

## الملفات المتأثرة
- `src/pages/Admin.tsx` — إعادة هيكلة التخطيط + responsive grid
- `src/pages/AdminLogin.tsx` — تحسينات بسيطة

## النهج التقني
- استخدام CSS media queries عبر inline styles + `useIsMobile` hook
- إضافة hook جديد `useIsDesktop` (≥1024px) للتفريق بين 3 أحجام
- الحفاظ على كل المنطق والوظائف كما هي — فقط تغيير التخطيط والأنماط

