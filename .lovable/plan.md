# ✅ خطة نقل الرسائل للوحة التحكم — مكتملة

## ✓ المرحلة 1-3: قاعدة البيانات
- إضافة عمود `warnings` JSONB إلى `wave_configs`
- إنشاء جدول `dynamic_warnings` مع 4 أحداث (swarm, minefield, volley, airstrike_flyby)
- زرع جميع رسائل WAVE_WARNINGS (16 موجة) في DB
- W1: ربط `breakingNews`، W5: تحويل لـ `upgrade` أخضر

## ✓ المرحلة 4: المحرك
- `engine.ts`: قراءة `recipe.warnings[]` أولاً ثم fallback لـ WAVE_WARNINGS
- الرسائل الديناميكية تُقرأ من `g.dynamicWarnings`
- `SkyfallGame.tsx`: تحميل + Realtime sync

## ✓ المرحلة 5: محرر الرسائل المتعددة (WaveEditor)
- استبدال الحقل المفرد بقائمة `warnings[]` قابلة للإضافة/الحذف
- لكل رسالة: نص، نوع (تحذير/ترقية)، لون، dropdown صوت من فئة `warnings`

## ✓ المرحلة 6: تبويب "Messages" 
- تبويب جديد `💬 Messages` في `/admin`
- بطاقات لكل صف من `dynamic_warnings`
- تعديل: نص، لون، صوت، تفعيل + زر حفظ فردي

## 🛡️ الضمانات
- توافق عكسي: WAVE_WARNINGS يبقى كـ fallback إن كانت `warnings[]` فارغة
- Realtime: تغييرات اللوحة تطبَّق فوراً على اللاعبين الأحياء
