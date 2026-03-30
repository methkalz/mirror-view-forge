

# تأثير انتقال بين الشرائح + زر تخطي

## التغييرات

### 1. `src/game/types.ts`
- إضافة `tutorialFade: number` (0→1 تأثير الانتقال) في `GameData`

### 2. `src/game/engine.ts`
- تهيئة `tutorialFade: 1` في `createGame`

### 3. `src/game/renderer.ts` — `renderStartScreen`

**تأثير انتقال:**
- عند تغيير الشريحة، `tutorialFade` يبدأ من 0 ويزيد تدريجياً إلى 1
- المحتوى يُرسم بـ `ctx.globalAlpha = tutorialFade` — الشريحة الجديدة تظهر بـ fade-in سريع (~300ms)
- يتم تحديث `tutorialFade` في كل frame: `tutorialFade = Math.min(1, tutorialFade + dt * 4)`
- تمرير `tutorialFade` كمعامل إضافي للدالة

**زر "تخطي الكل" (Skip All):**
- يظهر أسفل الشرائح (فقط في الصفحات 0-2) فوق النقاط
- نص: `تخطي ❯❯` بخط صغير رمادي فاتح (14px)
- موقعه: أسفل يسار الشاشة تقريباً `(w * 0.15, h * 0.87)`
- يُرسم كزر بسيط مع حدود خفيفة

### 4. `src/components/SkyfallGame.tsx`

**تأثير الانتقال:**
- عند `g.tutorialPage++`، ضبط `g.tutorialFade = 0` ليبدأ تأثير الظهور
- في حلقة الرسم (`loop`): تحديث `g.tutorialFade` كل frame عندما تكون أقل من 1

**زر التخطي:**
- عند النقر: فحص إذا كانت النقرة في منطقة زر "تخطي" → `g.tutorialPage = 3` مباشرة (ينتقل لشاشة البدء)
- حساب المنطقة: مستطيل حول النص في الموقع المحدد

