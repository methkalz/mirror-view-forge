

# تحسينات احترافية شاملة — Game Feel, UI/UX, Logic

بناءً على بحث معمق في أفضل ممارسات تصميم الألعاب 2023-2026 (Game Juice, Hit Stop, Screen Shake, Feedback Systems)، إليك التحسينات المقترحة:

---

## 1. Hit Stop / Freeze Frame — تأثير التجمد اللحظي عند الإصابة

عند إصابة عدو أو تلقي ضربة، تتوقف اللعبة لـ 50-80ms (3-5 إطارات). هذا هو **أهم تقنية** لجعل اللعبة تشعر بالتأثير.

### `src/game/types.ts`
- إضافة `hitStopTimer: number` إلى `GameData`

### `src/game/engine.ts`
- عند بداية `update()`: إذا `hitStopTimer > 0`، خفضه بـ `dt` ثم `return` فوراً (تجميد كامل)
- تفعيله عند: إصابة عدو بالرصاص (`0.05s`)، تدمير طائرة (`0.08s`)، إصابة اللاعب (`0.06s`)، تدمير البوس (`0.15s`)

---

## 2. Chromatic Aberration عند الإصابة

### `src/game/renderer.ts`
- عند `damageFlash > 0`: رسم الإطار 3 مرات بإزاحة بكسل واحد أحمر/أخضر/أزرق — تأثير انزياح لوني سينمائي سريع

---

## 3. نظام Combo / تسلسل النقاط

### `src/game/types.ts`
- إضافة `comboCount: number`, `comboTimer: number`, `comboMultiplier: number`

### `src/game/engine.ts`
- عند كل إصابة ناجحة (رصاصة → عدو/صاروخ): `comboCount++`, `comboTimer = 3s`
- المضاعف: `1 + floor(comboCount / 3) * 0.5` (بحد أقصى ×3)
- النقاط المكتسبة × المضاعف
- إذا انتهى `comboTimer` بدون إصابة: إعادة الـ combo لصفر

### `src/game/renderer.ts` — HUD
- عرض عداد Combo بتأثير نابض (مثلاً "×2.5 COMBO" بلون ذهبي متدرج)

---

## 4. Time Dilation عند الإنجازات (Bullet Time مصغر)

### `src/game/engine.ts`
- عند close call أو تدمير طائرة بالرصاص: `slowMoFactor = 0.3` لمدة `0.2s` (بطء لحظي مختلف عن power-up)
- إضافة `microSlowTimer: number` يعمل بشكل مستقل عن `slowMoTimer`

---

## 5. تأثير الموت / Death Transition

### `src/game/types.ts`
- إضافة `deathTimer: number`, `deathPhase: 'alive' | 'dying' | 'dead'`

### `src/game/engine.ts`
- عند `health <= 0`: بدلاً من `gameover` فوراً:
  - `deathPhase = 'dying'`, `deathTimer = 1.5s`
  - `slowMoFactor = 0.15` (بطء شديد)
  - بعد انتهاء المؤقت: `state = 'gameover'`

### `src/game/renderer.ts`
- أثناء `dying`: vignette أبيض يتزايد + تشبع الألوان ينخفض تدريجياً

---

## 6. مؤشر اتجاه التهديدات خارج الشاشة

### `src/game/renderer.ts`
- إضافة دالة `renderOffscreenIndicators()`:
  - لكل طائرة أو صاروخ خارج حدود الشاشة: رسم سهم مثلثي أحمر صغير على الحافة الأقرب
  - حجم ولون السهم يعتمد على المسافة والنوع (أحمر للصواريخ، برتقالي للطائرات)

---

## 7. تحسين أزرار التحكم — Responsive Feedback

### `src/components/SkyfallGame.tsx`
- إضافة حالة `pressed` لكل زر مع تأثير بصري (scale down + لون أكثر و