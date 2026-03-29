

# ضمان تحميل جميع الملفات الصوتية قبل الانتقال من شاشة اللودينغ

## المشكلة
في `loadAudioSettings()` بملف `src/game/audio.ts`، يتم استدعاء `preloadAllAudio()` **بدون `await`** (سطر 41). هذا يعني أن الدالة تنتهي قبل أن تُحمَّل الملفات الصوتية فعلياً، فينتقل التطبيق لشاشة إدخال الاسم والملفات لا تزال تُحمَّل في الخلفية.

## الحل

### 1. `src/game/audio.ts` — إضافة `await` قبل `preloadAllAudio()`
- السطر 41: تغيير `preloadAllAudio();` إلى `await preloadAllAudio();`
- هذا يضمن أن `loadAudioSettings` لا تنتهي إلا بعد تحميل وفك تشفير جميع ملفات الصوت

### 2. `src/components/SkyfallGame.tsx` — تحسين تتبع التقدم
- تقسيم التقدم بدقة أكبر: config+leaderboard = 40%، audio preload = 40%→95%، نهائي = 100%
- تمرير callback للتقدم إلى `loadAudioSettings` لتحديث شريط التقدم أثناء تحميل كل ملف صوتي

### 3. `src/game/audio.ts` — دعم callback للتقدم (اختياري لكن مفيد)
- تعديل `loadAudioSettings` لقبول `onProgress?: (pct: number) => void`
- داخل `preloadAllAudio`: حساب النسبة المئوية لكل ملف مُحمَّل وإرسالها عبر الـ callback

## الملفات المتأثرة
- `src/game/audio.ts` — إصلاح `await` + إضافة progress callback
- `src/components/SkyfallGame.tsx` — ربط progress callback بشريط التقدم

