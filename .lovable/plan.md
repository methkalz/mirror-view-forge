

# إصلاح مشكلة عدم تشغيل الموسيقى على الحاسوب

## السبب الجذري

المتصفحات الحديثة (Chrome, Firefox, Edge) تمنع تشغيل الصوت تلقائياً بدون تفاعل المستخدم (Autoplay Policy). التسلسل الحالي:

```text
GameLoader يحمّل كل شيء (بدون نقرة من المستخدم)
    ↓
AudioContext يُنشأ أثناء preloadAllAudio() → حالته: "suspended"
    ↓
GameLoader ينتهي → NameEntry يظهر
    ↓
useEffect يستدعي startMenuMusic() فوراً
    ↓
AudioContext لا يزال suspended → لا صوت!
```

المشكلة: `startMenuMusic()` لا تستدعي `ctx.resume()` قبل التشغيل، والـ AudioContext يبقى معلقاً لأنه لم يحصل تفاعل (نقرة/لمسة) من المستخدم.

## الحل

### 1. `src/game/audio.ts` — إصلاح `startMenuMusic`
- إضافة `await ctx.resume()` في بداية `startMenuMusic` لضمان تفعيل الـ AudioContext
- تحويل الدالة إلى `async` لانتظار resume

### 2. `src/components/NameEntry.tsx` — تشغيل الموسيقى بعد تفاعل المستخدم
- إضافة مستمع أحداث (click/touchstart/keydown) على مستوى الصفحة
- عند أول تفاعل: استدعاء `startMenuMusic()`
- كحل احتياطي: محاولة التشغيل فوراً أيضاً (تنجح إذا كان المستخدم قد نقر سابقاً)
- هذا يضمن أن الموسيقى تبدأ فور أن ينقر المستخدم على حقل الاسم أو أي مكان

### الملفات المتأثرة
- `src/game/audio.ts` — تعديل `startMenuMusic` لتكون async + resume
- `src/components/NameEntry.tsx` — إضافة مستمع التفاعل الأول

