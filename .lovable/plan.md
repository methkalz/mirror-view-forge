

# مهمتان: سهم تعليم الذخيرة + تغيير نص Close Call

## 1. سهم يشير لزر الذخيرة عند أول التقاط

**الفكرة**: عند التقاط ammo لأول مرة، يظهر سهم متحرك يشير لزر FIRE (بدون إيقاف اللعبة) + تشغيل صوت مخصص من لوحة التحكم.

### التغييرات:

**`src/game/types.ts`** — إضافة حقل:
- `firstAmmoPickedUp: boolean` في `GameData`

**`src/game/engine.ts`**:
- تهيئة `firstAmmoPickedUp = false` في `createGame` و `resetGame`
- عند التقاط ammo (سطر 2067): إضافة `g.firstAmmoPickedUp = true` (مرة واحدة فقط)

**`src/components/SkyfallGame.tsx`**:
- إضافة state: `ammoArrowVisible` + ref `ammoTutorialShownRef`
- في حلقة اللعب: مراقبة `g.firstAmmoPickedUp` — عند تحوله لـ true لأول مرة:
  - تفعيل `ammoArrowVisible = true`
  - تشغيل صوت `playCustomAudio('ammoTutorial')`
  - إخفاء السهم تلقائياً بعد ~4 ثوانٍ
- رسم سهم SVG متحرك (bouncing) فوق زر FIRE يشير للأسفل
- **اللعبة تستمر** — لا إيقاف مؤقت

**`src/game/audio.ts`**:
- إضافة `sfxAmmoTutorial()` تستخدم `playCustomAudio('ammoTutorial')`

**Migration**: إضافة صف في `audio_config`:
```sql
INSERT INTO audio_config (sound_key, category, label, label_ar, volume, enabled)
VALUES ('ammoTutorial', 'tutorial', 'Ammo Tutorial Voice', 'صوت تعليم الذخيرة', 1.0, true);
```

---

## 2. تغيير "Close Call" إلى "مَزَطنا"

**`src/game/engine.ts`** (سطر 1988):
```typescript
// من:
addFloatingText(g, `Close Call! +${bonus}`, ...)
// إلى:
addFloatingText(g, `مَزَطنا! +${bonus}`, ...)
```

## الملفات المتأثرة
- `src/game/types.ts`
- `src/game/engine.ts`
- `src/components/SkyfallGame.tsx`
- `src/game/audio.ts`
- migration جديدة

