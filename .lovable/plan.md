
هدف التنفيذ: إصلاح تشغيل موسيقى شاشة الاسم بحيث تعمل تلقائياً عندما يسمح المتصفح، وتعمل فور أول تفاعل عندما يمنع autoplay (خصوصاً iPhone Safari/Chrome)، بدون أن تعلق في حالة صامتة.

## التشخيص (سبب الخلل الحالي)
1) بيانات الصوت سليمة: ملف `menuMusic` موجود ويتم تحميله من التخزين بنجاح.
2) الخلل منطقي في الواجهة:
- في `NameEntry.tsx` يوجد `setTimeout` بعد 500ms يستدعي `startMenuMusic()` ثم يضبط `musicStarted=true`.
- إذا كان المتصفح حظر التشغيل التلقائي، يصبح `musicStarted=true` رغم أن الصوت لم يعمل فعلياً.
- عند أول لمسة لاحقاً، `startOnGesture` لا ينفّذ `resumeAudio()` بسبب شرط `if (!musicStarted.current)`، فيبقى الصوت متوقفاً.
3) قيود المتصفح: “تشغيل تلقائي بصوت” غير مضمون على iOS/Chrome الحديثة بدون gesture.

## خطة التنفيذ
1) تعديل منطق بدء الموسيقى في `src/components/NameEntry.tsx`
- فصل “محاولة التشغيل التلقائي” عن “فتح الصوت بتفاعل المستخدم”.
- إلغاء الاعتماد على `musicStarted` بالشكل الحالي.
- إنشاء دالة موحّدة `ensureAudioStarted()`:
  - تستدعي `resumeAudio()` أولاً.
  - ثم تستدعي `startMenuMusic()`.
- محاولة auto-start عند mount (Desktop/المتصفحات المتساهلة) لكن **بدون** قفل مسار gesture.
- إبقاء listeners للتفاعل (touchstart/click/pointerdown/keydown) فعالة حتى نتأكد أن الصوت أصبح يعمل.

2) تقوية طبقة الصوت في `src/game/audio.ts`
- جعل `resumeAudio` دالة async وتنتظر فعلياً `audioCtx.resume()` عند الحاجة.
- إرجاع حالة واضحة (نجاح/فشل) ليستفيد منها `NameEntry`.
- إضافة helper صغيرة للتحقق من حالة الـ `AudioContext` (running/suspended) حتى لا نعتبر التشغيل نجح وهو محظور.

3) تحسين تجربة المستخدم عند حظر autoplay
- إذا فشلت محاولة auto-start خلال أول ثانية، إظهار تلميح بسيط جداً داخل شاشة الاسم (مثال: “انقر لتفعيل الصوت”) ثم يختفي تلقائياً بعد أول تفاعل.
- هذا يحافظ على UX احترافي ويعالج قيود iOS الواقعية.

4) تنظيف التحذيرات المرتبطة بالشاشة
- مراجعة تمرير props في `SkyfallGame` إلى `LoadingScreen` و`NameEntry` والتأكد عدم تمرير `ref` غير مقصود أثناء إعادة التنظيم (لإزالة warning الظاهر في console).

## التحقق بعد التنفيذ (End-to-End)
1) Desktop Chrome (تبويب جديد): الموسيقى تبدأ تلقائياً إذا مسموح، وإلا تعمل مباشرة بعد أول click.
2) iPhone Safari + Chrome: الموسيقى تبدأ فور أول لمسة على شاشة الاسم.
3) عند رفع `menuMusic` مخصص من لوحة التحكم: يتم تشغيل الملف المرفوع وليس fallback.
4) عند الانتقال من شاشة الاسم إلى اللعبة: تتوقف موسيقى القائمة بشكل صحيح بلا تكرار/تسريب.
5) لا تظهر warning جديدة في console تخص `Function components cannot be given refs`.

## الملفات المتأثرة
- `src/components/NameEntry.tsx`
- `src/game/audio.ts`
- (إن لزم لتنظيف التحذير) `src/components/SkyfallGame.tsx`
