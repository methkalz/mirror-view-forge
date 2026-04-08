

# إصلاح: شريحة تعليم الأزرار لا تظهر أبداً

## المشكلة

**خطأ منطقي في شرط التفعيل** (سطر 239):

```typescript
if (g.state === 'playing' && wasStart && !tutorialShownRef.current) {
```

تسلسل حالات اللعبة: `start` → `intro` → `playing`

عند الانتقال من `intro` إلى `playing`:
- `prevState` = `'intro'` (ليس `'start'`)
- `wasStart` = `false` ❌
- التعليم لا يُفعَّل أبداً!

## الحل — ملف واحد: `src/components/SkyfallGame.tsx` (سطر 239)

تغيير الشرط من `wasStart` إلى `prevState === 'intro'`:

```typescript
if (g.state === 'playing' && prevState === 'intro' && !tutorialShownRef.current) {
```

هذا لأن اللعبة تنتقل دائماً من `intro` إلى `playing` بعد انتهاء المقدمة السينمائية.

## النتيجة
شريحة تعليم الأزرار ستظهر فوراً بعد انتهاء مشهد الدراجة وقبل بدء الموجة الأولى.

