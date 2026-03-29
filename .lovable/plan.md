

# إبقاء الموسيقى تعمل حتى بدء اللعبة الفعلي

## المشكلة
حالياً `stopMenuMusic()` تُستدعى في 3 أماكن:
1. `NameEntry.tsx` سطر 126 — عند الضغط على "ابدأ المعركة"
2. `NameEntry.tsx` سطر 61 — عند unmount المكوّن
3. `SkyfallGame.tsx` سطر 87 — في `handleNameSubmit`

الموسيقى تتوقف فور إدخال الاسم، بينما المطلوب أن تستمر خلال شاشة Start Screen (PRESS ENTER) وتتوقف فقط عند بدء اللعب الفعلي.

## الحل

### 1. `src/components/NameEntry.tsx`
- إزالة استدعاء `stopMenuMusic()` من `handleSubmit` (سطر 126)
- إزالة `stopMenuMusic()` من cleanup في useEffect (سطر 61)
- الموسيقى تبقى تعمل بعد إرسال الاسم

### 2. `src/components/SkyfallGame.tsx`
- إزالة `stopMenuMusic()` من `handleNameSubmit` (سطر 87)
- إضافة `stopMenuMusic()` عند انتقال حالة اللعبة من `start` إلى `intro` — داخل كتلة تتبع تغيير الحالة (سطر 189-196) عندما تصبح الحالة `intro`

```text
التدفق الجديد:
NameEntry → إدخال الاسم → Start Screen (الموسيقى مستمرة ♪)
→ PRESS ENTER → resetGame → state='intro' → stopMenuMusic() ✓
```

## الملفات المتأثرة
- `src/components/NameEntry.tsx` — إزالة استدعاءات stopMenuMusic
- `src/components/SkyfallGame.tsx` — نقل stopMenuMusic إلى لحظة بدء اللعبة

