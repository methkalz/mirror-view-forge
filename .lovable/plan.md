

# إصلاح توقيت تشغيل موسيقى الشاشة الأولى

## السبب الجذري — تحليل دقيق

المشكلة هي **سباق بين استدعاءين متزامنين** لـ `startMenuMusic()`:

```text
التسلسل الفعلي:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. التحميل: AudioContext يُنشأ (حالة: suspended)
2. GameLoader ينتهي تلقائياً (بدون نقرة!)
3. NameEntry يظهر → useEffect يستدعي startMenuMusic()
   ↳ Call 1: ctx.state='suspended' → await ctx.resume() → عالق ⏳
     (لا يوجد تفاعل من المستخدم = المتصفح يرفض التشغيل)
   ↳ menuMusicNode لا يزال null
4. المستخدم يكتب/ينقر → tryStart يستدعي startMenuMusic()
   ↳ Call 2: menuMusicNode=null → يدخل الدالة
   ↳ await ctx.resume() → ينجح (تفاعل مستخدم) ✓
   ↳ يُنشئ node ويشغّل الموسيقى ✓
   ↳ لكن Call 1 المعلّق يستيقظ أيضاً!
   ↳ Call 1 يُنشئ node ثاني ويكتب فوق menuMusicNode
   ↳ الآن يوجد عقدتان صوتيتان + واحدة يتيمة
5. المستخدم يضغط "ابدأ المعركة" → ينتقل لشاشة Start
6. Start screen → المستخدم يضغط Enter
   ↳ startOrRestart → resumeAudio()
   ↳ stopMenuMusic() يوقف node واحدة فقط
   ↳ العقدة اليتيمة تستمر أو تُعيد الأمور
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**السبب المحدد**: `startMenuMusic()` في useEffect (سطر 43) يعلق عند `await ctx.resume()` بدون تفاعل مستخدم. عندما يتفاعل المستخدم لاحقاً، يستيقظ الاستدعاء القديم ويتداخل مع الاستدعاء الجديد.

## الحل

### 1. `src/game/audio.ts` — إضافة حماية ضد التنفيذ المتزامن
- إضافة متغير `menuMusicStarting = false` كـ mutex
- في بداية `startMenuMusic()`: إذا `menuMusicStarting` أو `menuMusicNode` موجود → return
- تعيين `menuMusicStarting = true` قبل `await ctx.resume()`
- بعد إنشاء node: `menuMusicStarting = false`
- في حالة الخطأ: `menuMusicStarting = false`

```text
startMenuMusic() الجديدة:
├─ if (menuMusicNode || menuMusicStarting) → return
├─ menuMusicStarting = true
├─ await ctx.resume()
├─ if (menuMusicNode) → menuMusicStarting=false; return  ← فحص ثاني
├─ إنشاء node وتشغيل الموسيقى
└─ menuMusicStarting = false
```

### 2. `src/components/NameEntry.tsx` — عدم استدعاء startMenuMusic من useEffect مباشرة
- إزالة `startMenuMusic()` من السطر 43 (الاستدعاء المباشر في useEffect)
- الإبقاء فقط على مستمعات الأحداث (click/touchstart/keydown) كطريقة وحيدة لبدء الموسيقى
- هذا يضمن أن الموسيقى تبدأ فقط بتفاعل مستخدم حقيقي

## الملفات المتأثرة
- `src/game/audio.ts` — إضافة mutex لمنع التنفيذ المتزامن
- `src/components/NameEntry.tsx` — إزالة الاستدعاء المباشر في useEffect

