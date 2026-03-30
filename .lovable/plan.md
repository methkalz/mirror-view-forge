

# إضافة خاصية اللووب (Loop) للخلفيات

## الفكرة
عند تفعيل اللووب، بعد انتهاء آخر مرحلة خلفية، تعود الخلفية تدريجياً إلى المرحلة الأولى وتتكرر الدورة بشكل لا نهائي.

## التغييرات

### 1. إضافة عمود `bg_loop` لجدول `game_config`
- عمود `boolean` افتراضي `false`

### 2. `src/game/config.ts`
- إضافة `bgLoop` لواجهة `RemoteGameConfig`
- تحديث `fetchGameConfig` و `updateGameConfig`

### 3. `src/game/renderer.ts` — تعديل `getPhaseBlend`
- عند تفعيل اللووب: حساب الدورة الكاملة = `transitionStart` لآخر مرحلة + `fadeDuration` لها
- عمل `elapsed % cycleLength` لتكرار الزمن
- المرحلة الأخيرة تنتقل تدريجياً (fade) إلى المرحلة الأولى بنفس نظام الانتقال الحالي

### 4. `src/pages/Admin.tsx` — تبويب Backgrounds
- إضافة Switch "تكرار الخلفيات (Loop)" في أعلى قسم الخلفيات
- عند التفعيل يُحفظ في `game_config`

### الملفات
1. Migration: عمود `bg_loop` في `game_config`
2. `src/game/config.ts`: واجهة + دوال
3. `src/game/renderer.ts`: منطق اللووب في `getPhaseBlend`
4. `src/pages/Admin.tsx`: مفتاح تشغيل

