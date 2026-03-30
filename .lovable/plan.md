

# إضافة خيارات نوع الانتقال ومدته إلى تبويب الخلفيات في لوحة التحكم

## الفكرة
نقل إعدادات نوع الانتقال (Easing) ومدة Cross-fade من الكود الثابت إلى لوحة التحكم، ليتمكن الأدمن من تعديلها مباشرة.

## التنفيذ

### 1. إضافة عمودين جديدين لجدول `background_config`
```sql
ALTER TABLE background_config 
  ADD COLUMN fade_duration FLOAT DEFAULT 60,
  ADD COLUMN easing_type TEXT DEFAULT 'smoothstep';
```
- `fade_duration`: مدة الانتقال بالثواني (افتراضي 60)
- `easing_type`: نوع المنحنى (`linear`, `smoothstep`, `ease-in`, `ease-out`)

### 2. `src/game/backgroundConfig.ts`
- إضافة `fadeDuration` و `easingType` إلى واجهة `BackgroundPhase`
- تحديث `fetchBackgroundConfig` و `updateBackgroundPhase` لتشمل الحقول الجديدة

### 3. `src/game/renderer.ts`
- إضافة دوال الـ easing: `smoothstep`, `easeIn`, `easeOut`
- تعديل `getPhaseBlend()`:
  - قراءة `fadeDuration` من الـ config بدل القيمة الثابتة `60`
  - تطبيق `easingType` من الـ config على قيمة الـ fade
  - تطبيق نفس الـ easing على ألوان الـ overlay

```text
linear:      ████████████████████  (خطي ثابت)
smoothstep:  ░░▒▒▓▓████████▓▓▒▒░░  (ناعم — الافتراضي)
ease-in:     ░░░░░▒▒▓▓██████████  (بطيء البداية)
ease-out:    ██████████▓▓▒▒░░░░░  (بطيء النهاية)
```

### 4. `src/pages/Admin.tsx` — تعديل `BackgroundsPanel`
إضافة قسم جديد **"Transition Settings"** أعلى بطاقات المراحل يحتوي:
- **Easing Type**: قائمة منسدلة (Linear / Smoothstep / Ease In / Ease Out)
- **Fade Duration**: slider من 10 إلى 180 ثانية
- هذه الإعدادات تُطبّق على كل مرحلة بشكل مستقل (كل بطاقة لها إعداداتها)

### الملفات المتأثرة
- Migration SQL جديد (عمودين)
- `src/game/backgroundConfig.ts` — حقول جديدة
- `src/game/renderer.ts` — دوال easing + قراءة من config
- `src/pages/Admin.tsx` — عناصر تحكم جديدة في BackgroundsPanel

