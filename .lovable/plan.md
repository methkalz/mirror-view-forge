

# إصلاح: موسيقى القائمة تستمر أثناء اللعب

## المشكلة الحقيقية
دالة `startPeriodicAmbient()` تمر على **جميع** الأصوات في `audioSettings` بما فيها `menuMusic`. إذا كان لـ menuMusic قيمة `intervalSeconds > 0` في قاعدة البيانات، فسيُعاد تشغيله دورياً أثناء اللعب عبر `playCustomAudio('menuMusic')` — وهذه عقد صوتية منفصلة عن `menuMusicNode` فلا تتأثر بـ `stopMenuMusic()`.

**ملاحظة**: موسيقى القائمة لها نظام إدارة مستقل (`startMenuMusic` / `stopMenuMusic`) ولا يجب أن تدخل في نظام الأصوات الدورية إطلاقاً.

## الحل — تغيير بسيط ونظيف

**ملف واحد**: `src/game/audio.ts`

في دالة `startPeriodicAmbient()` (سطر ~831)، إضافة سطر واحد لتخطي `menuMusic`:

```typescript
for (const [key, s] of audioSettings) {
  if (key === 'menuMusic') continue;  // ← هذا السطر فقط
  if (s.intervalSeconds && s.intervalSeconds > 0 && s.enabled) {
    // ...
  }
}
```

هذا يضمن:
- ✅ موسيقى القائمة تستمر بالتشغيل (loop) طالما اللاعب لم يبدأ اللعبة
- ✅ عند بدء اللعب، `stopMenuMusic()` توقفها نهائياً
- ✅ لا يتم إعادة تشغيلها من نظام الأصوات الدورية أثناء اللعب
- ✅ لا تعقيد إضافي، سطر واحد فقط

