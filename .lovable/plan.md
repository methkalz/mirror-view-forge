

# تأخير رسالة "بداية الموجة" حتى انتهاء جميع التهديدات

## المشكلة
حالياً رسالة "بداية الموجة" تظهر أثناء الـ slow-mo (قبل مرحلة clearing)، بينما لا تزال التهديدات تسقط وتنفجر. المطلوب: الرسالة تظهر فقط بعد أن تختفي جميع التهديدات من السماء.

## الحل

### 1. إضافة مرحلة جديدة `announce` — `src/game/types.ts`
- إضافة `'announce'` لنوع `wavePhase`
- إضافة `waveAnnounceTimer: number` للعد التنازلي (3 ثوانٍ)

### 2. تعديل منطق الانتقال — `src/game/engine.ts`
- في مرحلة `clearing`: عندما يتأكد أن `activeHazardCount <= 0` و `activeDrones === 0`:
  - إذا كان نهاية مستوى (كل 3 موجات) → يذهب لـ `cards` كالعادة
  - **غير ذلك** → يذهب لـ `'announce'` بدل `startNextWave` مباشرة
- إضافة معالجة `'announce'`:
  - يعد تنازلياً `waveAnnounceTimer` (3 ثوانٍ)
  - عند انتهائه → `startNextWave(g)`

### 3. نقل الراية البصرية — `src/game/renderer.ts`
- إزالة راية "بداية الموجة" من قسم `waveEndSlowMo`
- رسمها في مرحلة `announce` فقط (تظليل + banner + نص)
- الأنيميشن: fade in أول 0.3 ثانية، ثبات، fade out آخر 0.5 ثانية

### النتيجة
```text
waveTimer=0 → slow-mo (2s) → clearing (انتظار سقوط كل شيء) → announce (3s مع الراية) → الموجة التالية
```

### ملفات: `types.ts`, `engine.ts`, `renderer.ts`

