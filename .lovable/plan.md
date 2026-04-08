
المشكلة الحقيقية أوضح الآن: الإصلاح السابق لم يعالج السبب الفعلي.

## ما الخطأ فعلاً
في `src/components/SkyfallGame.tsx` داخل كتلة تغيّر الحالة:

```ts
if (g.state !== prevState) {
  const wasStart = prevState === 'start';
  prevState = g.state;
  setShowButtons(g.state === 'playing');
  if (g.state === 'playing' && prevState === 'intro' && !tutorialShownRef.current) {
```

المشكلة أن `prevState` يتم استبداله بـ `g.state` قبل فحص الشرط.
يعني عند وصول اللعبة إلى `playing` يصبح:
- `prevState = 'playing'`
- ثم يتم فحص `prevState === 'intro'`
- النتيجة: مستحيل يتحقق الشرط

إذن الخلل ليس فقط في قيمة الشرط، بل في ترتيب التنفيذ نفسه.

## الحل الاحترافي
### 1) إصلاح منطق الانتقال بشكل صحيح
في نفس الملف:
- حفظ الحالة القديمة في متغير ثابت مثل `fromState`
- فحص الانتقال باستخدام `fromState === 'intro' && g.state === 'playing'`
- بعد ذلك فقط يتم تحديث `prevState = g.state`

الصيغة المطلوبة منطقياً:
```ts
if (g.state !== prevState) {
  const fromState = prevState;
  const wasStart = fromState === 'start';

  if (g.state === 'playing') setShowButtons(true);
  else setShowButtons(false);

  if (fromState === 'intro' && g.state === 'playing' && !tutorialShownRef.current) {
    tutorialShownRef.current = true;
    pauseRef.current = true;
    setControlTutorial(0);
  }

  prevState = g.state;
  ...
}
```

### 2) تقوية التفعيل حتى لا يعتمد على نقطة هشة واحدة
سأضيف حماية ثانية:
- إذا دخلت اللعبة `playing`
- والأزرار ظاهرة
- والتعليم لم يظهر بعد
- ولم تكن اللعبة في `gameover`
فيمكن تفعيل الشريحة مرة واحدة كـ fallback آمن

هذا يمنع تكرار مشكلة “الانتقال فات بين frame و frame”.

### 3) تنظيف حالة التعليم عند إعادة اللعب
لضمان السلوك الصحيح:
- عند الرجوع إلى `start` أو إعادة اللعبة:
  - `setControlTutorial(-1)`
  - `pauseRef.current = false`
- مع الإبقاء على `tutorialShownRef.current` حسب السلوك المطلوب:
  - إن كان المطلوب ظهورها مرة واحدة فقط لكل جلسة: تبقى `true`
  - إن كان المطلوب ظهورها في كل لعبة جديدة: تُصفّر عند restart

### 4) مراجعة التداخل مع الضغط على الشاشة
يوجد `startOrRestart()` مربوط بضغطات الـ canvas.
سأراجع أن طبقة التعليم:
- تكون أعلى من الـ canvas فعلاً
- تلتقط الضغطات بنفسها
- لا تسمح بمرور أي click للعبة تحتها
- وتمنع أي restart أو input أثناء الشريحة

### 5) تحسين بصري بسيط مع الإصلاح
بما أنك طلبت تصرف احترافي:
- سأجعل ظهور الشريحة مرتبطاً مباشرة بعد نهاية `intro`
- مع ضمان أن الأزرار السفلية تكون موجودة قبل عرض الإضاءة
- حتى لا تظهر الشريحة بدون العنصر المضيء أو مع layout غير جاهز

## الملفات المتأثرة
- `src/components/SkyfallGame.tsx`

## النتيجة المتوقعة
- الشريحة ستظهر فعلاً بعد انتهاء المقدمة
- لن تضيع بسبب خطأ transition logic
- لن تمر الضغطات إلى اللعبة أسفلها
- وسيصبح سلوكها ثابتاً وموثوقاً بدل كونه معتمداً على شرط مكسور

## التفاصيل التقنية
السبب الجذري هو:
```text
intro -> playing
لكن الكود يفقد قيمة intro قبل استخدامها
```

أي أن المشكلة كانت:
```text
Bug in state-transition bookkeeping, not just wrong condition text
```

وهذا يفسّر لماذا “الإصلاح السابق” لم ينجح رغم أنه بدا منطقياً ظاهرياً.
