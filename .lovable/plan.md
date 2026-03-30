

# إضافة معاينة حية لانتقال الخلفيات في لوحة التحكم

## الفكرة
زر "▶ Preview" في تبويب Backgrounds يشغّل محاكاة مضغوطة (5 ثوان لكل مرحلة) تعرض كيف تنتقل الخلفيات بإعدادات الـ easing والألوان الحالية — بدون انتظار 90 ثانية.

## التنفيذ في `src/pages/Admin.tsx`

### 1. مكون `BackgroundPreviewPlayer`
- **Canvas** بعرض كامل ونسبة 16:9، يرسم الخلفيات بنفس منطق `renderer.ts` (mirror tiling + cross-fade + overlay gradient)
- **توقيت مضغوط**: يحسب `simulatedElapsed` بناءً على مراحل الـ config لكن بمدة 5 ثوان لكل مرحلة بدل القيم الحقيقية
- يستخدم `requestAnimationFrame` لتحريك الانتقال
- يطبّق نفس دوال `smoothstep`, `easeIn`, `easeOut` المستخدمة في المحرك

### 2. عناصر التحكم
- زر **▶ Preview / ⏹ Stop** فوق الـ Timeline
- شريط تقدم (progress bar) يعرض الوقت المحاكى
- مؤشر يبيّن أي مرحلة نشطة حالياً أثناء المعاينة

### 3. المنطق
```text
3 مراحل × 5 ثوان = 15 ثانية إجمالي المعاينة
المرحلة 1 (Day):    0s → 5s
المرحلة 2 (Sunset): 5s → 10s  (مع fade بناءً على easingType)
المرحلة 3 (Night):  10s → 15s (مع fade بناءً على easingType)
```
- يتم تحويل الـ `elapsed` المحاكى إلى الـ `elapsed` الحقيقي عبر mapping خطي
- هذا يضمن تطبيق نفس الإعدادات (easing, overlay colors, opacity) بالضبط

### ملف واحد فقط
- `src/pages/Admin.tsx` — إضافة مكون المعاينة + زر التشغيل داخل `BackgroundsPanel`

