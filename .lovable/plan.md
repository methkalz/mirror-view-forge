

# تحسين أصوات الاصطدام — جعلها واقعية وغير مزعجة

## المشكلة
- `sfxImpactLight()` يستخدم `square` wave بتردد عالي (800-1400Hz) — صوت إلكتروني مزعج لا يشبه سقوط شظية
- `sfxImpactHeavy()` يستخدم `sawtooth` بصوت عالٍ جداً (vol 0.14) ومدة طويلة — مبالغ فيه
- كلاهما لا يشبه صوت ارتطام حقيقي بالأرض

## الحل — أصوات ارتطام طبيعية

### التغييرات في `src/game/audio.ts`:

**`sfxImpactLight()` — شظية صغيرة تضرب الأرض:**
- استبدال square wave → نويز قصير جداً مع فلتر lowpass (صوت "طق" خفيف)
- تردد منخفض (200-400Hz)، مدة قصيرة (0.04s)، صوت خافت (vol 0.03)
- يشبه حصاة تسقط على إسفلت

**`sfxImpactHeavy()` — صاروخ يضرب الأرض:**
- تقليل الصوت من 0.14 → 0.06
- تقصير المدة من 0.5s → 0.2s
- استبدال sawtooth → sine منخفض (50Hz) + نويز lowpass قصير
- يشبه دوي ارتطام ثقيل بدون المبالغة

### الكود الجديد:
```typescript
export function sfxImpactLight() {
  // Small debris hitting ground — soft thud
  playNoise(0.04, 0.03, { type: 'lowpass', freq: 300 + Math.random() * 200 });
  playTone(150 + Math.random() * 100, 0.03, 'sine', 0.02);
}

export function sfxImpactHeavy() {
  // Heavy object hitting ground — deep thump
  playTone(50, 0.15, 'sine', 0.06);
  playNoise(0.12, 0.05, { type: 'lowpass', freq: 250 });
}
```

ملف واحد يتغير: `src/game/audio.ts` (سطور 116-130)

