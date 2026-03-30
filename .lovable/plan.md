

# إضافة انتقال تدريجي (Fade) عند عودة اللووب من المرحلة الأخيرة إلى الأولى

## المشكلة
حالياً عند تفعيل اللووب، الزمن يعود فجأة للصفر عبر `elapsed % cycleLength` مما يسبب قطع مفاجئ من المرحلة الأخيرة إلى الأولى.

## الحل
إضافة مرحلة fade افتراضية بين المرحلة الأخيرة والأولى، بنفس آلية الانتقالات الموجودة بين المراحل.

### التغييرات — ملف واحد: `src/game/renderer.ts`

**المنطق الجديد في `getPhaseBlend` (سطر 92-100):**

1. حساب `cycleLength` = نهاية آخر مرحلة + مدة fade العودة (نستخدم `fadeDuration` المرحلة الأولى)
2. بدل القطع المفاجئ (`%`)، نضيف منطقة انتقال:
   - إذا `elapsed` بين نهاية آخر مرحلة و `cycleLength` → نحسب fade من المرحلة الأخيرة إلى الأولى (blend ألوان + صور)
   - إذا `elapsed >= cycleLength` → نطبق `(elapsed - cycleLength) % cycleLength` لبدء الدورة التالية

```text
المراحل: [A] → fade → [B] → fade → [C] → fade(عودة) → [A] → ...
                                            ↑ جديد
```

3. الـ fade يستخدم نفس `applyEasing` و `lerpColor` الموجودين

### إضافة إعداد مدة انتقال العودة — `game_config`
- عمود جديد: `bg_loop_fade_duration` (real, default 60 ثانية)
- يُعرض في لوحة التحكم بجانب مفتاح اللووب كـ slider

### الملفات
1. **Migration**: عمود `bg_loop_fade_duration` في `game_config`
2. **`src/game/config.ts`**: إضافة `bgLoopFadeDuration` للواجهة والدوال
3. **`src/game/renderer.ts`**: تعديل منطق اللووب (سطر 92-100) لإضافة fade العودة
4. **`src/components/SkyfallGame.tsx`**: تمرير القيمة الجديدة
5. **`src/pages/Admin.tsx`**: slider لمدة انتقال العودة

