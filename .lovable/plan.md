

# تحسين شريحة تعليم الأزرار + إصلاح توقيت الموسيقى

## المشاكل

### 1. الموسيقى تبدأ قبل اللعب الفعلي
- **سطر 292** في `SkyfallGame.tsx`: `resumeAudio()` يُستدعى عند الضغط على آخر شريحة تعليمات → يشغّل `startAmbient()` فوراً (الموسيقى الخلفية)
- **سطر 441** في `engine.ts`: `startPeriodicAmbient()` يُستدعى عند انتهاء الـ intro → الأصوات الدورية تبدأ أثناء شريحة تعليم الأزرار
- النتيجة: اللاعب يسمع الموسيقى أثناء قراءة شرح الأزرار بدل أن تبدأ عند اللعب الفعلي

### 2. واجهة شريحة التعليم بسيطة
- الشريحة الحالية HTML overlay بسيط مع `rgba` backgrounds
- لا تتطابق مع أسلوب الـ glass cards والتوهج الذهبي المستخدم في شرائح التعليمات الأربع الأصلية

## الحل

### ملف 1: `src/game/engine.ts` (سطر 441)
- **إزالة** `startPeriodicAmbient()` من نهاية الـ intro
- إبقاء `sfxGameStart()` فقط (صوت بدء اللعبة مقبول)
- سيتم استدعاء `startPeriodicAmbient()` من `SkyfallGame.tsx` عند انتهاء شريحة تعليم الأزرار

### ملف 2: `src/components/SkyfallGame.tsx`

#### إصلاح الموسيقى:
- **سطر 292**: تغيير `resumeAudio()` إلى فقط `unmuteIOS()` + `audioCtx.resume()` بدون `startAmbient()` — أي استيراد دالة جديدة `resumeAudioContext` من audio.ts تفعل ذلك فقط
- **عند انتهاء التعليم** (controlTutorial > 3): استدعاء `resumeAudio()` + `startPeriodicAmbient()` لبدء كل الأصوات

#### تحسين UI/UX للشريحة:
| العنصر | الحالي | الجديد |
|--------|--------|--------|
| الخلفية | `rgba(0,0,0,0.75)` مسطحة | تدرج radial مع vignette + جسيمات شرارية خفيفة (CSS) |
| البطاقة | زجاج بسيط بحد ذهبي | زجاج متعدد الطبقات مع `box-shadow` ذهبي متوهج + حد مزدوج |
| الأيقونات | إيموجي نصية (◀ ▶ 🎯 🌀) | SVG مخصصة بتأثير توهج ذهبي + حركة pulse |
| النص | خط 22px عادي | خط 26px مع `text-shadow` متعددة الطبقات + لون ذهبي متدرج |
| الوصف | 14px باهت | 16px مع تباين أعلى + سطور متباعدة |
| زر "فهمت" | خلفية شبه شفافة | تدرج ذهبي واضح مع تأثير hover + pulse animation |
| مؤشر الخطوات | نقاط بسيطة | نقاط بتوهج + اسم الزر تحت كل نقطة |
| السهم | `▼` نصي | سهم SVG متوهج مع trail effect |
| الانتقال | فوري | `transition` ناعم 0.4s مع fade للمحتوى |

#### تأثيرات إضافية:
- إضافة `@keyframes` للنبض الذهبي على البطاقة
- شرارات CSS صغيرة (pseudo-elements) في الأركان
- تأثير صوتي `sfxSlideTransition()` عند التنقل بين الخطوات

### ملف 3: `src/game/audio.ts`
- إضافة دالة `resumeAudioContext()` تفعل فقط: `unmuteIOS()` + `audioCtx.resume()` بدون `startAmbient()`
- تصدير `startPeriodicAmbient` (موجود) + `resumeAudioContext` (جديد)

## تسلسل الصوت الصحيح بعد الإصلاح
```text
شرائح التعليمات → resumeAudioContext() فقط (بدون موسيقى)
                → intro سينمائي (sfxGameStart فقط)
                → شريحة تعليم الأزرار (صمت + sfxSlideTransition بين الخطوات)
                → "يلّا نبدأ!" → resumeAudio() + startPeriodicAmbient() → اللعب الفعلي مع كل الأصوات
```

## الملفات المتأثرة
- `src/game/audio.ts` — إضافة `resumeAudioContext()`
- `src/game/engine.ts` — إزالة `startPeriodicAmbient()` من نهاية intro
- `src/components/SkyfallGame.tsx` — إصلاح توقيت الصوت + تحسين UI الشريحة

