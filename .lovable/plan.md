

# إصلاح: زر شراء الكمامة لا يعمل

## المشكلة
في `src/components/SkyfallGame.tsx` سطر 327، `cardClick` يُسجَّل فقط عندما `wavePhase === 'cards'` (مرحلة بطاقات الترقية). بطاقة الكمامة تظهر أثناء `wavePhase === 'active'` (مرحلة اللعب)، لذلك النقر عليها لا يُسجَّل أبداً — الزر لا يعمل.

## الحل
**ملف واحد**: `src/components/SkyfallGame.tsx`

تعديل شرط `onPointerDown` (سطر 327) ليشمل حالة عرض بطاقة الكمامة:

```typescript
// قبل
if (g.wavePhase === 'cards' && g.upgradeCards.length > 0) {

// بعد
const hasGasMaskOffer = g.gasMaskOffer && g.gasMaskOffer.active;
if ((g.wavePhase === 'cards' && g.upgradeCards.length > 0) || hasGasMaskOffer) {
```

هذا يجعل النقر يُسجَّل كـ `cardClick` عند ظهور بطاقة الكمامة أيضاً، فيتمكن كود `engine.ts` (سطر 1351) من معالجة الشراء.

المؤقت 8 ثوان موجود بالفعل في الكود (engine سطر 1340 + renderer سطر 3386).

