

# إضافة صوت انتقال بين الشرائح التعليمية

## التغييرات

### 1. `src/game/audio.ts` — دالة `sfxSlideTransition()`
- إضافة دالة جديدة تولّد صوت "whoosh" خفيف وأنيق مناسب للانتقال
- صوت قصير (~150ms): نبضة بيضاء (white noise) مفلترة بـ bandpass filter مع sweep من تردد عالي لمنخفض
- مستوى صوت منخفض (gain ~0.08) حتى لا يزعج
- يتبع نفس نمط الدوال الموجودة: `isSoundEnabled` → `playCustomAudio` → fallback مُصنّع

### 2. `src/components/SkyfallGame.tsx` — استدعاء الصوت عند الانتقال
- عند كل تغيير لـ `tutorialPage` (نقر، سحب، أو تخطي): استدعاء `sfxSlideTransition()`
- 3 نقاط إدخال: النقر العادي، السحب (swipe)، وزر التخطي

