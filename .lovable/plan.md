

# تحسين الدراجة + البطاقات + خط عربي احترافي

## التغييرات

### 1. خط عربي احترافي — `index.html`
- تحميل خط **Tajawal** (Google Fonts) — خط عربي عصري مناسب للألعاب
- `<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap">`

### 2. تقليل اهتزاز الدراجة — `src/game/engine.ts`
- مرحلة `idle`: تقليل الاهتزاز من `±1.3px` إلى `±0.3px` (اهتزاز خفيف جداً بالكاد ملحوظ)
- مرحلة الحركة: تقليل من `±0.4px` إلى `±0.15px`

### 3. لا تبدأ الموجة قبل مغادرة الدراجة — `src/game/engine.ts`
- تأكيد أن مرحلة `bike` لا تنتقل لـ `active` إلا عندما `!g.deliveryBike || !g.deliveryBike.active` (موجود حالياً — سليم، لكن نتحقق من عدم وجود shortcut آخر)

### 4. تكبير الدراجة — `src/game/renderer.ts`
- زيادة `ctx.scale` من `1.8` إلى `2.4`
- تعديل OTLOP text scaling بالتناسب

### 5. تبسيط بطاقات الترقية — `src/game/engine.ts` + `src/game/renderer.ts`
- إزالة `description` من البطاقات (مزدحم وغير مقروء)
- إبقاء فقط: أيقونة كبيرة + اسم إنجليزي + اسم عربي
- إزالة `── TAP ──` (غير ضروري)
- تكبير الأيقونة والنصوص لملء المساحة

### 6. استخدام خط Tajawal للعربية — `src/game/renderer.ts`
- استبدال كل `font: '...px Arial'` للنصوص العربية بـ `'...px Tajawal, Arial'`
- يشمل: بطاقات الترقية، عنوان "اختر ترقية"، وأي نص عربي آخر

## الملفات المتأثرة
1. **`index.html`** — تحميل خط Tajawal
2. **`src/game/engine.ts`** — اهتزاز أخف
3. **`src/game/renderer.ts`** — scale 2.4x للدراجة + بطاقات مبسطة + خط Tajawal

