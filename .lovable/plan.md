

# تحسين احترافية إعدادات الخلفية في لوحة التحكم

## الوضع الحالي
البانل الحالي يعمل لكنه بسيط: بطاقات متراصة مع sliders أساسية بدون تنظيم واضح أو معاينة حية.

## التحسينات المقترحة

### 1. إعادة هيكلة كل بطاقة مرحلة (Phase Card)
- تقسيم داخلي إلى **3 أقسام واضحة** بعناوين:
  - **📷 Image** — معاينة + رفع/حذف
  - **⏱ Timing** — Start / End / Fade Duration مع عرض رقمي واضح
  - **🎨 Overlay** — Opacity + ألوان RGB (top, mid, bottom) مع **color pickers**
  - **⚡ Easing** — قائمة منسدلة + **منحنى بصري** يوضح شكل الـ easing المختار (رسم SVG صغير)

### 2. معاينة حية للـ Overlay
- مربع صغير يعرض **gradient preview** بألوان الـ overlay الحالية فوق الصورة، ليرى الأدمن كيف ستبدو النتيجة النهائية

### 3. تحسين الـ Timeline Bar
- إضافة **thumbnails** مصغرة لكل مرحلة في شريط الجدول الزمني
- مؤشر "▶ NOW" يظهر أين سيكون اللاعب عند وقت معين (hover/drag)

### 4. التحكم في ألوان الـ Overlay بـ Color Pickers
- إضافة 3 حقول ألوان (Top, Mid, Bottom) لكل مرحلة باستخدام `<input type="color">`
- تحويل من/إلى صيغة `"R,G,B"` المخزنة في قاعدة البيانات

### 5. منحنى Easing بصري (SVG)
- رسم SVG صغير (80×40px) بجانب قائمة الـ easing يعرض شكل المنحنى المختار

## التعديلات التقنية

### `src/pages/Admin.tsx` — BackgroundsPanel
- إضافة دوال `handleUpdateOverlayColor` للألوان الثلاث
- مكون `EasingCurvePreview` — SVG يرسم المنحنى
- مكون `OverlayPreview` — div بـ gradient فوق الصورة المصغرة
- إعادة تنظيم البطاقة بأقسام منفصلة

### `src/game/backgroundConfig.ts`
- التأكد أن `updateBackgroundPhase` يدعم تحديث `overlayTop`, `overlayMid`, `overlayBottom` (موجود بالفعل)

### ملفات متأثرة
- `src/pages/Admin.tsx` فقط (تحسينات UI)

